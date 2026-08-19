"""Tests for the orchestrator: health governor, capability routing, and relay."""

from __future__ import annotations

import json
from types import SimpleNamespace

import pytest

from llm.base import StreamError, TextDelta
from orchestrator import agents, capabilities, conductor
from orchestrator import chat as relay_chat
from orchestrator import complete as complete_mod
from orchestrator.blackboard import Blackboard, parse_plan
from orchestrator.capabilities import Capability
from orchestrator.complete import CompletionError, complete
from orchestrator.conductor import Candidate
from orchestrator.health import (
    HealthRegistry,
    is_transient_error,
    parse_retry_after,
)


class _Clock:
    def __init__(self) -> None:
        self.t = 1000.0

    def __call__(self) -> float:
        return self.t

    def advance(self, dt: float) -> None:
        self.t += dt


# ── parse_retry_after ─────────────────────────────────────────────────────────
@pytest.mark.parametrize(
    "message,expected",
    [
        ("You exceeded your quota. Please retry in 41.19s.", 41.19),
        ("RetryInfo retryDelay': '41s'", 41.0),
        ("retry-after: 12", 12.0),
        ("401 invalid api key", None),
        ("", None),
    ],
)
def test_parse_retry_after(message, expected):
    assert parse_retry_after(message) == expected


def test_parse_retry_after_clamps():
    assert parse_retry_after("retry in 9999s") == 120.0  # max cooldown
    assert parse_retry_after("retry in 0.1s") == 1.0     # min cooldown


# ── is_transient_error ──────────────────────────────────────────────────────────
@pytest.mark.parametrize(
    "message,transient",
    [
        ("429 RESOURCE_EXHAUSTED quota", True),
        ("503 Service Unavailable", True),
        ("Connection reset by peer", True),
        ("Server disconnected without sending a response.", True),
        ("Anthropic request failed: Server disconnected without sending a response.", True),
        ("keepalive ping timeout", True),
        ("model overloaded, please retry", True),
        ("404 model not found", False),
        ("401 invalid api key", False),
        ("400 invalid model name", False),
        ("", False),
    ],
)
def test_is_transient_error(message, transient):
    assert is_transient_error(message) is transient


# ── circuit breaker ─────────────────────────────────────────────────────────────
def test_breaker_opens_on_retry_after_and_recovers():
    clock = _Clock()
    reg = HealthRegistry(time_fn=clock)
    assert reg.check("gemini").ok

    reg.record_failure("gemini", retry_after=10.0)
    avail = reg.check("gemini")
    assert not avail.ok
    assert 9.0 <= avail.retry_after <= 10.0

    clock.advance(11.0)
    assert reg.check("gemini").ok


def test_breaker_tolerates_blips_then_opens():
    clock = _Clock()
    reg = HealthRegistry(time_fn=clock)
    # Below threshold (3) with no retry_after → stays available.
    reg.record_failure("openai")
    reg.record_failure("openai")
    assert reg.check("openai").ok
    # Crossing the threshold opens the breaker.
    reg.record_failure("openai")
    assert not reg.check("openai").ok


def test_success_resets_failures():
    clock = _Clock()
    reg = HealthRegistry(time_fn=clock)
    reg.record_failure("anthropic")
    reg.record_failure("anthropic")
    reg.record_success("anthropic")
    reg.record_failure("anthropic")
    # Only one failure since the reset → still tolerated.
    assert reg.check("anthropic").ok


# ── token bucket pacing ─────────────────────────────────────────────────────────
def test_peek_does_not_consume_tokens():
    clock = _Clock()
    reg = HealthRegistry(time_fn=clock)
    # Peeking many times must not drain the bucket or open the breaker.
    for _ in range(100):
        assert reg.peek("gemini").ok
    # A real check still has the full capacity available.
    allowed = sum(1 for _ in range(30) if reg.check("gemini").ok)
    assert allowed == 30


def test_peek_reflects_open_breaker():
    clock = _Clock()
    reg = HealthRegistry(time_fn=clock)
    reg.record_failure("gemini", retry_after=10.0)
    assert not reg.peek("gemini").ok


def test_token_bucket_paces_and_refills():
    clock = _Clock()
    reg = HealthRegistry(time_fn=clock)
    # Drain the default capacity (30) without advancing time.
    allowed = sum(1 for _ in range(30) if reg.check("gemini").ok)
    assert allowed == 30
    blocked = reg.check("gemini")
    assert not blocked.ok and blocked.retry_after > 0
    # Refill: ~0.5 tokens/sec, so 4s yields ~2 tokens.
    clock.advance(4.0)
    assert reg.check("gemini").ok


# ── capability chains ───────────────────────────────────────────────────────────
def test_chains_end_with_local_where_possible():
    assert capabilities.chain_for(Capability.REASONING)[0] == "anthropic"
    assert capabilities.chain_for(Capability.CHAT)[-1] == "ollama"
    assert capabilities.chain_for(Capability.REASONING)[-1] == "ollama"


# ── conductor candidate selection ───────────────────────────────────────────────
def test_candidates_filter_unconfigured_and_order_preferred_first(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "g-key")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "a-key")
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)

    cands = conductor.candidates_for(
        Capability.CHAT,
        preferred="anthropic",
        require_tools=True,
    )
    ids = [c.provider_id for c in cands]
    # Preferred first; OpenAI dropped (no key); Ollama dropped (no default model).
    assert ids == ["anthropic", "gemini"]
    assert all(c.api_key for c in cands)
    assert all(c.model for c in cands)


def test_candidates_use_preferred_overrides(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "g-key")
    cands = conductor.candidates_for(
        Capability.CHAT,
        preferred="gemini",
        preferred_model="gemini-2.5-pro",
        preferred_api_key="override-key",
    )
    assert cands[0].provider_id == "gemini"
    assert cands[0].model == "gemini-2.5-pro"
    assert cands[0].api_key == "override-key"


# ── relay runner ────────────────────────────────────────────────────────────────
@pytest.fixture(autouse=True)
def _fresh_relay_registry(monkeypatch):
    """Give each relay test a clean health registry (the module global is shared)."""
    monkeypatch.setattr(relay_chat, "REGISTRY", HealthRegistry())


def _candidate(provider_id: str) -> Candidate:
    return Candidate(
        provider_id=provider_id,
        provider=SimpleNamespace(id=provider_id, supports_tools=True),
        model="m",
        api_key="k",
        base_url=None,
    )


def test_relay_fails_over_on_transient_error(monkeypatch):
    def fake_stream(provider, messages, model, *, tools=None, api_key=None, base_url=None, allow_sensitive=False):
        if provider.id == "gemini":
            yield json.dumps({"error": "429 RESOURCE_EXHAUSTED, retry in 5s"})
        else:
            yield json.dumps({"delta": "hello"})
            yield json.dumps({"done": True, "full": "hello"})

    monkeypatch.setattr(relay_chat, "stream_chat_completion", fake_stream)

    out = list(relay_chat.stream_chat_with_relay(
        [_candidate("gemini"), _candidate("anthropic")],
        [{"role": "user", "content": "hi"}],
    ))
    parsed = [json.loads(p) for p in out]
    assert any("relay" in p for p in parsed)
    assert any(p.get("delta") == "hello" for p in parsed)
    assert parsed[-1].get("done") is True


def test_relay_surfaces_nontransient_error_without_failover(monkeypatch):
    calls: list[str] = []

    def fake_stream(provider, messages, model, *, tools=None, api_key=None, base_url=None, allow_sensitive=False):
        calls.append(provider.id)
        yield json.dumps({"error": "401 invalid api key"})

    monkeypatch.setattr(relay_chat, "stream_chat_completion", fake_stream)

    out = list(relay_chat.stream_chat_with_relay(
        [_candidate("gemini"), _candidate("anthropic")],
        [{"role": "user", "content": "hi"}],
    ))
    parsed = [json.loads(p) for p in out]
    # Auth error is not transient → no relay, surfaced immediately, second provider untouched.
    assert calls == ["gemini"]
    assert parsed[-1].get("error") == "401 invalid api key"


def test_relay_reports_when_no_candidates():
    out = list(relay_chat.stream_chat_with_relay([], [{"role": "user", "content": "hi"}]))
    assert "error" in json.loads(out[0])


# ── non-streaming complete() with relay ─────────────────────────────────────────
class _FakeProvider:
    def __init__(self, provider_id: str, events: list) -> None:
        self.id = provider_id
        self.supports_tools = True
        self._events = events

    def stream(self, messages, model, *, tools=None, api_key=None, base_url=None):
        yield from self._events


def _fake_candidate(provider_id: str, events: list) -> Candidate:
    return Candidate(provider_id, _FakeProvider(provider_id, events), "m", "k", None)


def test_complete_relays_on_transient_then_returns(monkeypatch):
    monkeypatch.setattr(complete_mod, "REGISTRY", HealthRegistry())
    cands = [
        _fake_candidate("gemini", [StreamError("429 RESOURCE_EXHAUSTED retry in 3s")]),
        _fake_candidate("anthropic", [TextDelta("the answer")]),
    ]
    assert complete(Capability.REASONING, "sys", "do it", candidates=cands) == "the answer"


def test_complete_raises_on_nontransient(monkeypatch):
    monkeypatch.setattr(complete_mod, "REGISTRY", HealthRegistry())
    cands = [_fake_candidate("gemini", [StreamError("401 invalid api key")])]
    with pytest.raises(CompletionError):
        complete(Capability.REASONING, "sys", "do it", candidates=cands)


def test_complete_raises_when_no_candidates():
    with pytest.raises(CompletionError):
        complete(Capability.CHAT, "sys", "u", candidates=[])


# ── blackboard ──────────────────────────────────────────────────────────────────
def test_parse_plan_coerces_steps():
    steps = parse_plan({"steps": [
        {"id": 1, "kind": "tool", "tool": "weather_report", "args": {"city": "Geneva"}},
        {"kind": "reason", "description": "think"},
        "garbage",
    ]})
    assert [s.id for s in steps] == [1, 2]
    assert steps[0].kind == "tool" and steps[0].tool == "weather_report"
    assert steps[1].kind == "reason"


def test_blackboard_context_and_summary():
    b = Blackboard("test goal")
    b.add_fact("city", "Geneva")
    ctx = b.render_context()
    assert "test goal" in ctx and "Geneva" in ctx
    assert b.summary()["goal"] == "test goal"


# ── planner/executor/critic orchestration ───────────────────────────────────────
def _fake_reason(capability, system, user):
    if "planner" in system:
        return json.dumps({"steps": [
            {"id": 1, "kind": "tool", "tool": "weather_report", "args": {"city": "Geneva"},
             "description": "get weather", "success_check": "weather returned"},
            {"id": 2, "kind": "reason", "description": "summarize",
             "success_check": "summary made"},
        ]})
    if "verify one step" in system:
        return '{"ok": true, "feedback": ""}'
    if "actual answer" in system:
        return "All done — weather fetched and summarized."
    return "reasoned output"


def test_orchestrate_runs_plan_executor_critic():
    calls: list[str] = []

    def dispatch(tool, args):
        calls.append(tool)
        return {"ok": True, "data": {"tool": tool, "args": args}}

    result = agents.orchestrate("what's the weather", reason_fn=_fake_reason, dispatch_fn=dispatch)
    assert result["ok"] is True
    assert result["summary"].startswith("All done")
    assert len(result["steps"]) == 2
    assert "weather_report" in calls


def test_orchestrate_marks_failure_when_tool_fails():
    def reason(capability, system, user):
        if "planner" in system:
            return json.dumps({"steps": [
                {"id": 1, "kind": "tool", "tool": "broken", "args": {},
                 "description": "do thing", "success_check": "it worked"},
            ]})
        if "verify one step" in system:
            return '{"ok": false, "feedback": "tool errored"}'
        if "Summarize" in system:
            return "Could not complete."
        return "x"

    def dispatch(tool, args):
        return {"ok": False, "error": "boom"}

    result = agents.orchestrate("do thing", reason_fn=reason, dispatch_fn=dispatch, max_steps=4)
    assert result["ok"] is False


def test_orchestrate_degrades_when_planner_returns_no_json():
    """An unparseable plan must not hard-fail — it falls back to a single reasoning
    step so the user still gets a grounded answer, and the fallback is logged."""

    def reason(capability, system, user):
        return "not json"

    result = agents.orchestrate("???", reason_fn=reason, dispatch_fn=lambda t, a: {"ok": True})
    assert result["ok"] is True
    assert len(result["steps"]) == 1
    assert any("single reasoning step" in line for line in result["log"])


# ── episodic memory ─────────────────────────────────────────────────────────────
@pytest.fixture
def _temp_memory(tmp_path, monkeypatch):
    """Point episodic memory at an isolated temp DB for each test."""
    monkeypatch.setenv("EXOSITES_DATA_DIR", str(tmp_path))
    from orchestrator import memory as memory_mod

    memory_mod.clear_all()
    yield memory_mod
    memory_mod.clear_all()


def test_recall_ranks_by_lexical_relevance(_temp_memory):
    _temp_memory.remember("Connected the Notion workspace for the user")
    _temp_memory.remember("Sent the quarterly invoice email to the accountant")
    _temp_memory.remember("Fetched the weather forecast for Geneva")

    hits = _temp_memory.recall("connect notion account", k=2)
    assert hits, "expected at least one relevant memory"
    assert "Notion" in hits[0].content


def test_recall_empty_query_returns_nothing(_temp_memory):
    _temp_memory.remember("some episode about files")
    assert _temp_memory.recall("   ") == []


def test_recall_filters_by_kind_and_recent(_temp_memory):
    _temp_memory.remember("a normal episode", kind=_temp_memory.KIND_EPISODE)
    _temp_memory.remember("a failure we should avoid", kind=_temp_memory.KIND_FAILURE)

    failures = _temp_memory.recall("avoid failure", kinds=[_temp_memory.KIND_FAILURE])
    assert len(failures) == 1 and failures[0].kind == _temp_memory.KIND_FAILURE

    recent = _temp_memory.recent(1)
    assert recent and recent[0].content == "a failure we should avoid"


def test_forget_removes_episode_by_id(_temp_memory):
    _temp_memory.remember("dismiss me", kind=_temp_memory.KIND_FAILURE)
    row = _temp_memory.recent(1, kinds=[_temp_memory.KIND_FAILURE])[0]
    assert _temp_memory.forget(row.id) is True
    assert _temp_memory.recent(5, kinds=[_temp_memory.KIND_FAILURE]) == []
    assert _temp_memory.forget(row.id) is False


def test_failure_upsert_one_open_card_per_goal(_temp_memory):
    adapter = _temp_memory.EpisodicAdapter()
    adapter.remember_outcome("find my latest invoices", "missing list_invoices", False)
    adapter.remember_outcome("find my latest invoices", "approval timed out", False)
    open_rows = _temp_memory.recent_open_failures(10)
    assert len(open_rows) == 1
    assert "approval timed out" in open_rows[0].content
    # Raw table may still briefly have only the latest after upsert.
    assert len(_temp_memory.recent(10, kinds=[_temp_memory.KIND_FAILURE])) == 1


def test_success_clears_open_failures_for_goal(_temp_memory):
    adapter = _temp_memory.EpisodicAdapter()
    adapter.remember_outcome("find my latest invoices", "blocked", False)
    adapter.remember_outcome("find my latest invoices", "Found 3 invoices.", True)
    assert _temp_memory.recent_open_failures(10) == []
    episodes = _temp_memory.recent(5, kinds=[_temp_memory.KIND_EPISODE])
    assert episodes and "Found 3 invoices" in episodes[0].content


def test_trash_cut_off_goal_is_not_an_open_failure(_temp_memory):
    adapter = _temp_memory.EpisodicAdapter()
    adapter.remember_outcome(
        ". Yeah, that's",
        "I can't determine what you're asking—your message is cut off.",
        False,
    )
    assert _temp_memory.recent_open_failures(10) == []


def test_recent_open_failures_hides_existing_trash(_temp_memory):
    _temp_memory.remember(
        "Goal: . Yeah, that's\nOutcome: I can't determine what you're asking.",
        kind=_temp_memory.KIND_FAILURE,
    )
    assert _temp_memory.recent_open_failures(10) == []
    assert _temp_memory.recent(5, kinds=[_temp_memory.KIND_FAILURE]) == []


def test_recent_open_failures_dedupes_legacy_duplicates(_temp_memory):
    _temp_memory.remember(
        "Goal: find my latest invoices\nOutcome: old",
        kind=_temp_memory.KIND_FAILURE,
    )
    _temp_memory.remember(
        "Goal: find my latest invoices\nOutcome: new",
        kind=_temp_memory.KIND_FAILURE,
    )
    _temp_memory.remember(
        "Goal: deploy demo\nOutcome: boom",
        kind=_temp_memory.KIND_FAILURE,
    )
    open_rows = _temp_memory.recent_open_failures(10)
    goals = {_temp_memory.goal_from_failure_content(r.content) for r in open_rows}
    assert goals == {"find my latest invoices", "deploy demo"}
    invoice = next(r for r in open_rows if "invoices" in r.content)
    assert "new" in invoice.content


def test_eviction_keeps_store_bounded(_temp_memory, monkeypatch):
    monkeypatch.setattr(_temp_memory, "_MAX_ENTRIES", 3)
    for index in range(6):
        _temp_memory.remember(f"episode number {index}")
    assert len(_temp_memory.recent(50)) == 3


def test_orchestrate_consults_and_stores_memory():
    """The loop seeds the plan from recall and records the outcome."""
    recalled_for: list[str] = []
    stored: list[tuple[str, bool]] = []

    class _FakeMemory:
        def recall(self, query, *, k=4):
            recalled_for.append(query)
            return ["Last time, weather_report needed a city arg."]

        def remember_outcome(self, goal, summary, ok):
            stored.append((goal, ok))

    seen_context: list[str] = []

    def reason(capability, system, user):
        seen_context.append(user)
        return _fake_reason(capability, system, user)

    result = agents.orchestrate(
        "what's the weather",
        reason_fn=reason,
        dispatch_fn=lambda t, a: {"ok": True, "data": {}},
        memory=_FakeMemory(),
    )
    assert result["ok"] is True
    assert recalled_for == ["what's the weather"]
    assert stored and stored[0][1] is True
    # The recalled fact reached the planner's context.
    assert any("weather_report needed a city" in ctx for ctx in seen_context)


# ── procedural skills ───────────────────────────────────────────────────────────
@pytest.fixture
def _temp_skills(tmp_path, monkeypatch):
    monkeypatch.setenv("EXOSITES_DATA_DIR", str(tmp_path))
    from orchestrator import skills as skills_mod

    skills_mod.clear_all()
    yield skills_mod
    skills_mod.clear_all()


def test_save_and_find_skill_by_goal_overlap(_temp_skills):
    from orchestrator.blackboard import Step

    plan = [Step(id=1, description="check weather", kind="tool", tool="weather_report",
                 args={"city": "Geneva"}, success_check="weather returned")]
    _temp_skills.save_skill("get me the weather in Geneva", plan, success=True)

    hit = _temp_skills.find_skill("what's the weather in Geneva today")
    assert hit is not None
    assert hit.plan[0]["tool"] == "weather_report"
    assert hit.successes == 1


def test_failed_run_is_not_cached(_temp_skills):
    from orchestrator.blackboard import Step

    plan = [Step(id=1, description="x", kind="reason")]
    _temp_skills.save_skill("do a thing", plan, success=False)
    assert _temp_skills.find_skill("do a thing") is None


def test_unrelated_goal_does_not_match(_temp_skills):
    from orchestrator.blackboard import Step

    plan = [Step(id=1, description="check weather", kind="tool", tool="weather_report",
                 args={"city": "Geneva"})]
    _temp_skills.save_skill("get the weather in Geneva", plan, success=True)
    assert _temp_skills.find_skill("send an invoice email to my accountant") is None


def test_reinforcing_skill_bumps_counters(_temp_skills):
    from orchestrator.blackboard import Step

    plan = [Step(id=1, description="check weather", kind="tool", tool="weather_report", args={})]
    _temp_skills.save_skill("weather in Geneva", plan, success=True)
    _temp_skills.save_skill("weather in Geneva", plan, success=True)
    hit = _temp_skills.find_skill("weather in Geneva")
    assert hit is not None and hit.successes == 2


def test_orchestrate_seeds_and_learns_skill():
    """A proven plan reaches the planner, and a successful run is cached."""
    from orchestrator.blackboard import Step

    learned: list[tuple[str, bool]] = []
    seen_context: list[str] = []

    class _FakeSkills:
        def recall_plan(self, goal):
            return [Step(id=1, description="get weather", kind="tool",
                         tool="weather_report", args={"city": "Geneva"},
                         success_check="weather returned")]

        def learn(self, goal, plan_steps, success):
            learned.append((goal, success))

    def reason(capability, system, user):
        seen_context.append(user)
        return _fake_reason(capability, system, user)

    result = agents.orchestrate(
        "what's the weather",
        reason_fn=reason,
        dispatch_fn=lambda t, a: {"ok": True, "data": {}},
        skills=_FakeSkills(),
    )
    assert result["ok"] is True
    assert learned and learned[0][1] is True
    # The proven plan was injected into the planner's context.
    assert any("known_good_plan" in ctx for ctx in seen_context)


# ── policy (autonomy gate) ────────────────────────────────────────────────────
def test_policy_classifies_risk_tiers():
    from orchestrator.policy import Risk, classify

    assert classify("weather_report") is Risk.SAFE
    assert classify("send_message", {"recipient": "x"}) is Risk.SENSITIVE
    assert classify("plan_and_execute") is Risk.BLOCKED
    # Connector verbs decide risk.
    assert classify("notion", {"operation": "search"}) is Risk.SAFE
    assert classify("notion", {"operation": "create_page"}) is Risk.SENSITIVE
    assert classify("notion", {}) is Risk.SENSITIVE  # ambiguous → fail closed
    # Unknown tool fails closed.
    assert classify("totally_new_tool") is Risk.SENSITIVE


def test_policy_gate_withholds_sensitive_unless_allowed():
    from orchestrator.policy import AutonomyPolicy

    guarded = AutonomyPolicy(allow_sensitive=False)
    assert guarded.check("weather_report").allowed is True
    assert guarded.check("send_message", {"recipient": "x"}).allowed is False
    assert guarded.check("plan_and_execute").allowed is False

    permissive = AutonomyPolicy(allow_sensitive=True)
    assert permissive.check("send_message", {"recipient": "x"}).allowed is True
    assert permissive.check("plan_and_execute").allowed is False  # blocked stays blocked


def test_orchestrate_blocks_sensitive_tool_without_dispatch():
    """A sensitive non-APPROVAL step is withheld (never dispatched) under a restrictive policy."""
    from orchestrator.policy import AutonomyPolicy

    dispatched: list[str] = []

    def reason(capability, system, user):
        if "planner" in system:
            # Unknown tools classify SENSITIVE and are not in APPROVAL_TOOLS.
            return json.dumps({"steps": [
                {"id": 1, "kind": "tool", "tool": "totally_new_tool",
                 "args": {"x": 1},
                 "description": "do something sensitive", "success_check": "done"},
            ]})
        if "verify one step" in system:
            return '{"ok": true, "feedback": ""}'
        if "Summarize" in system:
            return "Withheld a sensitive action."
        return "x"

    def dispatch(tool, args):
        dispatched.append(tool)
        return {"ok": True}

    result = agents.orchestrate(
        "do something sensitive",
        reason_fn=reason,
        dispatch_fn=dispatch,
        policy=AutonomyPolicy(allow_sensitive=False),
    )
    assert dispatched == []  # never ran the sensitive tool
    assert result["ok"] is False
    assert "blocked by policy" in result["steps"][0]["output"]


def test_orchestrate_lets_approval_tools_reach_dispatch():
    """APPROVAL-tier tools skip the hard gate so chat/voice can show consent at dispatch."""
    from orchestrator.policy import AutonomyPolicy

    dispatched: list[str] = []

    def reason(capability, system, user):
        if "planner" in system:
            return json.dumps({"steps": [
                {"id": 1, "kind": "tool", "tool": "send_message",
                 "args": {"recipient": "bob", "message_text": "hi"},
                 "description": "message bob", "success_check": "sent"},
            ]})
        if "verify one step" in system:
            return '{"ok": true, "feedback": ""}'
        if "Summarize" in system:
            return "Asked for approval."
        return "x"

    def dispatch(tool, args):
        dispatched.append(tool)
        return {"ok": False, "error": "User denied or approval unavailable"}

    result = agents.orchestrate(
        "message bob",
        reason_fn=reason,
        dispatch_fn=dispatch,
        policy=AutonomyPolicy(allow_sensitive=False),
    )
    assert dispatched[0] == "send_message"
    assert "send_message" in dispatched
    assert result["ok"] is False


# ── budget ────────────────────────────────────────────────────────────────────
def test_budget_caps_tool_calls():
    from orchestrator.budget import Budget

    budget = Budget(max_tool_calls=2, max_wall_clock_s=999)
    assert budget.exceeded() is None
    budget.charge_tool()
    budget.charge_tool()
    assert "tool-call budget" in (budget.exceeded() or "")


def test_budget_caps_wall_clock():
    from orchestrator.budget import Budget

    clock = _Clock()
    budget = Budget(max_tool_calls=99, max_wall_clock_s=10, _now=clock)
    assert budget.exceeded() is None
    clock.advance(11)
    assert "time budget" in (budget.exceeded() or "")


def test_orchestrate_stops_when_budget_exhausted():
    from orchestrator.budget import Budget

    calls: list[str] = []

    def reason(capability, system, user):
        if "planner" in system:
            return json.dumps({"steps": [
                {"id": 1, "kind": "tool", "tool": "weather_report", "args": {},
                 "description": "a", "success_check": "ok"},
                {"id": 2, "kind": "tool", "tool": "weather_report", "args": {},
                 "description": "b", "success_check": "ok"},
            ]})
        if "verify one step" in system:
            return '{"ok": true, "feedback": ""}'
        if "Summarize" in system:
            return "done"
        return "x"

    def dispatch(tool, args):
        calls.append(tool)
        return {"ok": True}

    budget = Budget(max_tool_calls=1, max_wall_clock_s=999)
    agents.orchestrate("two steps", reason_fn=reason, dispatch_fn=dispatch, budget=budget)
    # Second tool step is refused once the single-call budget is spent.
    assert len(calls) == 1


# ── audit ─────────────────────────────────────────────────────────────────────
@pytest.fixture
def _temp_audit(tmp_path, monkeypatch):
    monkeypatch.setenv("EXOSITES_DATA_DIR", str(tmp_path))
    from orchestrator import audit as audit_mod

    audit_mod.clear_all()
    yield audit_mod
    audit_mod.clear_all()


def test_audit_records_and_reads_back(_temp_audit):
    _temp_audit.record_action("send_message", goal="say hi", risk="sensitive",
                              args={"recipient": "bob"}, outcome="ok")
    entries = _temp_audit.recent_actions(10)
    assert len(entries) == 1
    assert entries[0].action == "send_message" and entries[0].outcome == "ok"
    assert "bob" in entries[0].args


def test_orchestrate_audits_tool_calls(_temp_audit):
    from orchestrator.audit import AuditAdapter

    def reason(capability, system, user):
        return _fake_reason(capability, system, user)

    agents.orchestrate(
        "what's the weather",
        reason_fn=reason,
        dispatch_fn=lambda t, a: {"ok": True, "data": {}},
        audit=AuditAdapter("what's the weather"),
    )
    actions = [e.action for e in _temp_audit.recent_actions(20)]
    assert "weather_report" in actions


# ── world model + initiative ────────────────────────────────────────────────────
def test_world_snapshot_isolates_failing_observer(monkeypatch):
    from orchestrator import world

    monkeypatch.setattr(world, "_observers", dict(world._observers))
    world.register_observer("boom", lambda: (_ for _ in ()).throw(RuntimeError("nope")))
    world.register_observer("good", lambda: {"k": "v"})
    snap = world.snapshot()
    assert snap["good"] == {"k": "v"}
    assert "error" in snap["boom"]


def test_initiative_gates_suggestions_by_policy():
    from orchestrator.initiative import suggest
    from orchestrator.policy import AutonomyPolicy

    world = {"memory": {"recent_failures": ["task X failed"]}}
    suggestions = suggest(world=world, policy=AutonomyPolicy(allow_sensitive=False))
    assert suggestions, "expected at least the failure-review suggestion"
    review = suggestions[0]
    assert review.tool is None and review.requires_confirmation is False


def test_initiative_marks_sensitive_candidate_for_confirmation(monkeypatch):
    from orchestrator import initiative
    from orchestrator.policy import AutonomyPolicy

    monkeypatch.setattr(initiative, "_proposers", list(initiative._proposers))
    initiative.register_proposer(lambda snap: [
        {"title": "Email the report", "tool": "send_message",
         "args": {"recipient": "boss", "message_text": "done"}},
        {"title": "Delete a Notion page", "tool": "plan_and_execute"},  # blocked → dropped
    ])
    suggestions = initiative.suggest(world={}, policy=AutonomyPolicy(allow_sensitive=False))
    titles = {s.title for s in suggestions}
    assert "Email the report" in titles
    assert "Delete a Notion page" not in titles  # blocked candidate dropped
    email = next(s for s in suggestions if s.title == "Email the report")
    assert email.requires_confirmation is True and email.risk == "sensitive"


# ── vision relay (perception failover) ──────────────────────────────────────────
def test_candidates_require_vision_excludes_non_vision(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "g-key")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "a-key")

    cands = conductor.candidates_for(Capability.VISION, require_vision=True)
    ids = [c.provider_id for c in cands]
    # Vision chain leads with Gemini when configured.
    assert ids and ids[0] == "gemini"
    assert "anthropic" in ids


def test_vision_relays_on_transient_then_returns(monkeypatch):
    from orchestrator import vision as vision_mod

    monkeypatch.setattr(vision_mod, "REGISTRY", HealthRegistry())
    relays: list[tuple[str, str]] = []
    cands = [
        _fake_candidate("gemini", [StreamError("429 RESOURCE_EXHAUSTED retry in 3s")]),
        _fake_candidate("anthropic", [TextDelta('{"type": "done"}')]),
    ]
    out = vision_mod.vision_complete(
        "what's the next action?",
        b"jpeg-bytes",
        candidates=cands,
        on_relay=lambda src, dst: relays.append((src, dst)),
    )
    assert out == '{"type": "done"}'
    assert relays == [("gemini", "anthropic")]


def test_vision_raises_on_nontransient(monkeypatch):
    from orchestrator import vision as vision_mod

    monkeypatch.setattr(vision_mod, "REGISTRY", HealthRegistry())
    cands = [_fake_candidate("gemini", [StreamError("401 invalid api key")])]
    with pytest.raises(vision_mod.VisionError):
        vision_mod.vision_complete("look", b"img", candidates=cands)


def test_vision_skips_bad_provider_key_when_more_candidates(monkeypatch):
    """A stale backup key must not block vision when another provider is configured."""
    from orchestrator import vision as vision_mod

    monkeypatch.setattr(vision_mod, "REGISTRY", HealthRegistry())
    relays: list[tuple[str, str]] = []
    cands = [
        _fake_candidate("gemini", [StreamError("429 RESOURCE_EXHAUSTED retry in 2s")]),
        _fake_candidate("anthropic", [StreamError("Anthropic API error (401): invalid x-api-key")]),
        _fake_candidate("openai", [TextDelta('{"type": "done"}')]),
    ]
    out = vision_mod.vision_complete(
        "next action",
        b"img",
        candidates=cands,
        on_relay=lambda src, dst: relays.append((src, dst)),
    )
    assert out == '{"type": "done"}'
    assert relays == [("gemini", "anthropic"), ("anthropic", "openai")]


def test_vision_relays_on_model_404(monkeypatch):
    from orchestrator import vision as vision_mod

    monkeypatch.setattr(vision_mod, "REGISTRY", HealthRegistry())
    cands = [
        _fake_candidate("anthropic", [StreamError("Anthropic API error (404): model not found")]),
        _fake_candidate("gemini", [TextDelta('{"type": "wait"}')]),
    ]
    out = vision_mod.vision_complete("look", b"img", candidates=cands)
    assert out == '{"type": "wait"}'


def test_vision_raises_when_no_candidates():
    from orchestrator import vision as vision_mod

    with pytest.raises(vision_mod.VisionError):
        vision_mod.vision_complete("look", b"img", candidates=[])


def test_chat_loop_streams_vision_relay_during_tool(monkeypatch):
    """A relay published inside a tool surfaces as a live `relay` event, before its result."""
    import tool_registry
    from llm.base import ToolCall, ToolCallRequest
    from llm.chat_loop import stream_chat_completion

    def fake_dispatch(name, args, approval_granted=False):
        from orchestrator.relay_events import publish

        publish({"from": "gemini", "to": "anthropic", "kind": "vision", "reason": "429"})
        return {"ok": True, "data": {}}

    monkeypatch.setattr(tool_registry, "dispatch_sync", fake_dispatch)

    class _ToolThenDone:
        id = "gemini"
        supports_tools = True

        def __init__(self) -> None:
            self._n = 0

        def stream(self, messages, model, *, tools=None, api_key=None, base_url=None):
            self._n += 1
            if self._n == 1:
                yield ToolCallRequest(
                    calls=[ToolCall(id="1", name="control_computer", arguments={})]
                )
            else:
                yield TextDelta("done")

    payloads = [
        json.loads(p)
        for p in stream_chat_completion(
            _ToolThenDone(), [{"role": "user", "content": "hi"}], "m",
            tools=[{"name": "control_computer"}],
            allow_sensitive=True,
        )
    ]
    relay = next(p["relay"] for p in payloads if "relay" in p)
    assert relay["kind"] == "vision" and relay["to"] == "anthropic"
    # Ordering: the relay arrives after the tool starts but before its result.
    i_call = next(i for i, p in enumerate(payloads) if "tool_call" in p)
    i_relay = next(i for i, p in enumerate(payloads) if "relay" in p)
    i_res = next(i for i, p in enumerate(payloads) if "tool_result" in p)
    assert i_call < i_relay < i_res


def test_chat_loop_emits_client_action_for_manage_connection(monkeypatch):
    """manage_connection success yields a client_action SSE event for the renderer."""
    import tool_registry
    from llm.base import ToolCall, ToolCallRequest
    from llm.chat_loop import stream_chat_completion

    def fake_dispatch(name, args, approval_granted=False):
        return {
            "ok": True,
            "data": {
                "action": "open_whatsapp_setup",
                "provider_id": "whatsapp",
                "provider_label": "WhatsApp",
            },
        }

    monkeypatch.setattr(tool_registry, "dispatch_sync", fake_dispatch)

    class _ToolThenDone:
        id = "gemini"
        supports_tools = True

        def __init__(self) -> None:
            self._n = 0

        def stream(self, messages, model, *, tools=None, api_key=None, base_url=None):
            self._n += 1
            if self._n == 1:
                yield ToolCallRequest(
                    calls=[ToolCall(id="1", name="manage_connection", arguments={})]
                )
            else:
                yield TextDelta("Opening setup.")

    payloads = [
        json.loads(p)
        for p in stream_chat_completion(
            _ToolThenDone(), [{"role": "user", "content": "connect whatsapp"}], "m",
            tools=[{"name": "manage_connection"}],
            allow_sensitive=True,
        )
    ]
    client_action = next(p["client_action"] for p in payloads if "client_action" in p)
    assert client_action["action"] == "open_whatsapp_setup"
    assert client_action["provider_id"] == "whatsapp"
    i_res = next(i for i, p in enumerate(payloads) if "tool_result" in p)
    i_action = next(i for i, p in enumerate(payloads) if "client_action" in p)
    assert i_res < i_action


def test_vision_relay_is_audited(_temp_audit, monkeypatch):
    """Each vision hand-off is written to the audit log via the relay callback."""
    from orchestrator import vision as vision_mod

    monkeypatch.setattr(vision_mod, "REGISTRY", HealthRegistry())
    cands = [
        _fake_candidate("gemini", [StreamError("429 RESOURCE_EXHAUSTED retry in 2s")]),
        _fake_candidate("openai", [TextDelta('{"type": "click"}')]),
    ]
    out = vision_mod.vision_complete(
        "next action",
        b"img",
        candidates=cands,
        on_relay=vision_mod.audit_relay_callback("connect notion"),
    )
    assert out == '{"type": "click"}'
    relays = [e for e in _temp_audit.recent_actions(10) if e.action == "vision_relay"]
    assert relays and "gemini" in relays[0].args and "openai" in relays[0].args
