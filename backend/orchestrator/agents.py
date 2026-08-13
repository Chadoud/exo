"""Planner → Executor → Critic loop over a shared blackboard.

This is the agent's "cortex": decompose a goal into steps (planner), carry each
out (executor — either reasoning or a real tool call), and verify each result
against its success check (critic), retrying once on a failed check before moving
on. Engine selection for every reasoning call goes through the Conductor, so the
loop inherits provider failover for free.

The LLM call (``reason_fn``) and tool dispatch (``dispatch_fn``) are injected, so
the whole loop is unit-testable with fakes and never hard-codes a provider.
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import asdict
from typing import Any, Callable

from .blackboard import Blackboard, Step, StepResult, parse_plan
from .capabilities import Capability

logger = logging.getLogger(__name__)

DEFAULT_MAX_STEPS = 8
_PLAN_BUDGET = 12

ReasonFn = Callable[[Capability, str, str], str]
DispatchFn = Callable[[str, dict[str, Any]], dict[str, Any]]
ProgressFn = Callable[[str, dict[str, Any]], None]

_PLANNER_SYSTEM_PREFIX = (
    "You are the planner of an autonomous assistant. Break the user's goal into the "
    "SMALLEST sequence of concrete steps. Each step is either:\n"
    "- kind 'tool': a single tool call (give 'tool' name and 'args' object), or\n"
    "- kind 'reason': a thinking/synthesis step (no tool).\n"
    "Give each step a one-line 'description' and a 'success_check' (how to tell it "
    "worked). Prefer the fewest steps. Respond with ONLY JSON: "
    '{"steps": [{"id": 1, "kind": "tool"|"reason", "tool": <name|null>, '
    '"args": {...}, "description": "...", "success_check": "..."}]}'
)

_PLANNER_INVOICE_HINT = (
    "For invoices, bills, receipts, or payments in email: use google_workspace with "
    'operation="search_mail" and query like '
    '"(invoice OR receipt OR facture OR rechnung) newer_than:30d" '
    "(or microsoft_graph / infomaniak_services search_mail). "
    "There is NO list_invoices tool — never invent tool names."
)


def _planner_system() -> str:
    """Planner prompt with the live tool catalog so models cannot invent tools."""
    try:
        from tool_registry import ALL_TOOL_NAMES

        catalog = ", ".join(sorted(ALL_TOOL_NAMES))
    except Exception:  # noqa: BLE001
        catalog = "(tool catalog unavailable)"
    return (
        f"{_PLANNER_SYSTEM_PREFIX}\n"
        f"ALLOWED tool names only (never invent others): {catalog}.\n"
        f"{_PLANNER_INVOICE_HINT}"
    )


_CRITIC_SYSTEM = (
    "You verify one step's result against its success check. Be strict but fair. "
    'Respond with ONLY JSON: {"ok": true|false, "feedback": "<one line: what to fix '
    'if not ok, else empty>"}'
)

_SUMMARY_SYSTEM = (
    "Give the user the actual answer to their goal, using the step results above — "
    "not a narration of what you did. If the goal asks to filter, extract, count, or "
    "compute something, do that computation yourself from the data in the results and "
    "state the concrete answer (e.g. the number, the list, the names). Only fall back "
    "to describing what was accomplished when the goal has no concrete answer to give. "
    "1-3 plain sentences. No preamble."
)


def _extract_json(text: str) -> Any:
    text = (text or "").strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"[\[{].*[\]}]", text, re.DOTALL)
        if not match:
            return None
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            return None


def _make_plan(goal: str, board: Blackboard, reason_fn: ReasonFn) -> list[Step]:
    raw = reason_fn(
        Capability.REASONING,
        _planner_system(),
        f"Goal: {goal}\n\n{board.render_context()}",
    )
    steps = parse_plan(_extract_json(raw))
    if not steps:
        # The local model sometimes answers in prose instead of strict JSON. Rather
        # than fail the whole task with "could not produce a plan", log the raw output
        # for debugging and degrade to a single reasoning step so the user still gets
        # a grounded answer toward their goal.
        snippet = (raw or "").strip().replace("\n", " ")[:500]
        logger.warning("[planner] no parseable plan from model; raw=%r", snippet)
        board.note("planner output was not parseable JSON — using a single reasoning step")
        return [
            Step(
                id=1,
                description=f"Work toward the goal: {goal}"[:300],
                kind="reason",
                success_check="",
            )
        ]
    return steps[:_PLAN_BUDGET]


def _criticize(step: Step, output: str, reason_fn: ReasonFn) -> tuple[bool, str]:
    if not step.success_check:
        return True, ""
    user = (
        f"Step: {step.description}\n"
        f"Success check: {step.success_check}\n"
        f"Result:\n{output[:1500]}"
    )
    verdict = _extract_json(reason_fn(Capability.CHAT, _CRITIC_SYSTEM, user))
    if not isinstance(verdict, dict):
        return True, ""  # un-parseable critique shouldn't block progress
    return bool(verdict.get("ok", True)), str(verdict.get("feedback") or "")


def _run_step(
    step: Step, board: Blackboard, reason_fn: ReasonFn, dispatch_fn: DispatchFn
) -> StepResult:
    if step.kind == "tool" and step.tool:
        result = dispatch_fn(step.tool, step.args)
        ok = bool(result.get("ok", False)) if isinstance(result, dict) else False
        output = json.dumps(result, ensure_ascii=False, default=str)[:1500]
        return StepResult(step.id, ok, output)
    # reasoning step
    prompt = f"{board.render_context()}\n\nDo this step: {step.description}"
    try:
        text = reason_fn(
            Capability.REASONING,
            "You execute one reasoning step. Be concise and concrete.",
            prompt,
        )
        return StepResult(step.id, True, text[:1500])
    except Exception as exc:  # noqa: BLE001
        return StepResult(step.id, False, f"reasoning failed: {exc}")


def _blocked_result(step: Step, reason: str) -> StepResult:
    result = StepResult(step.id, False, f"blocked by policy: {reason}")
    result.critic_ok = False
    result.critic_feedback = reason
    return result


def _gate_tool_step(step: Step, policy: Any | None, audit: Any | None) -> StepResult | None:
    """Return a blocked result if a sensitive tool step is disallowed, else ``None``.

    Tools in ``TOOLS_NEEDING_APPROVAL`` are not hard-blocked here — they reach
    dispatch so voice/chat can show the same consent UI (then
    ``policy_block_result`` / ``approval_granted`` apply).
    """
    if policy is None or step.kind != "tool" or not step.tool:
        return None
    from tool_registry import TOOLS_NEEDING_APPROVAL

    if step.tool in TOOLS_NEEDING_APPROVAL:
        return None
    decision = policy.check(step.tool, step.args)
    if decision.allowed:
        return None
    if audit is not None:
        try:
            audit.record(step.tool, risk=str(decision.risk.value), args=step.args,
                         outcome="blocked", detail=decision.reason)
        except Exception:  # noqa: BLE001, S110
            pass
    return _blocked_result(step, decision.reason)


def _audit_tool_result(audit: Any | None, step: Step, result: StepResult) -> None:
    if audit is None or step.kind != "tool" or not step.tool:
        return
    try:
        audit.record(step.tool, args=step.args,
                     outcome="ok" if result.ok else "failed", detail=result.output[:300])
    except Exception:  # noqa: BLE001, S110
        pass


def orchestrate(
    goal: str,
    *,
    reason_fn: ReasonFn | None = None,
    dispatch_fn: DispatchFn | None = None,
    max_steps: int = DEFAULT_MAX_STEPS,
    memory: Any | None = None,
    skills: Any | None = None,
    policy: Any | None = None,
    budget: Any | None = None,
    audit: Any | None = None,
    progress: ProgressFn | None = None,
    cancel_check: Callable[[], bool] | None = None,
) -> dict[str, Any]:
    """Run the planner→executor→critic loop for ``goal`` and return a summary dict.

    :param reason_fn: capability-routed completion (defaults to ``complete.complete``).
    :param dispatch_fn: tool runner (defaults to ``tool_registry.dispatch_sync``).
    :param max_steps: hard ceiling on executed steps (bounds cost/latency).
    :param memory: optional episodic-memory adapter (``recall``/``remember_outcome``).
        When provided, relevant past episodes seed the plan and the outcome is stored.
    :param skills: optional procedural-skill adapter (``recall_plan``/``learn``).
        When provided, a proven plan for a similar goal seeds the planner and a
        successful run is cached as a reusable skill.
    :param policy: optional ``AutonomyPolicy`` gating sensitive tool calls.
    :param budget: optional ``Budget`` bounding tool calls and wall-clock time.
    :param audit: optional audit adapter (``record``) logging every tool call.
    """
    reason_fn = reason_fn or _default_reason_fn()
    dispatch_fn = dispatch_fn or _default_dispatch_fn()
    board = Blackboard(goal)

    if memory is not None:
        try:
            for index, recalled in enumerate(memory.recall(goal)):
                board.add_fact(f"recalled_{index + 1}", recalled[:300])
        except Exception as exc:  # noqa: BLE001
            board.note(f"recall failed: {exc}")

    if skills is not None:
        try:
            prior = skills.recall_plan(goal)
            if prior:
                board.add_fact(
                    "known_good_plan",
                    json.dumps([asdict(s) for s in prior], ensure_ascii=False)[:800],
                )
                board.note("seeded planner with a proven plan for a similar goal")
        except Exception as exc:  # noqa: BLE001
            board.note(f"skill recall failed: {exc}")

    try:
        if progress:
            progress("planning", {"message": "Planning steps…"})
        plan = _make_plan(goal, board, reason_fn)
    except Exception as exc:  # noqa: BLE001
        board.note(f"planning failed: {exc}")
        return {"ok": False, "error": f"planning failed: {exc}", **board.summary()}
    if not plan:
        return {"ok": False, "error": "could not produce a plan for this goal", **board.summary()}
    board.set_plan(plan)
    if progress:
        from agent.plan_mirror import orchestrator_steps_to_tree

        progress(
            "plan_ready",
            {"step_count": len(plan), "steps": orchestrator_steps_to_tree(plan)},
        )

    executed = 0
    for step in plan:
        if cancel_check is not None and cancel_check():
            board.note("cancelled by user")
            if progress:
                progress("task_cancelled", {})
            return {
                "ok": False,
                "error": "cancelled",
                "summary": "Task cancelled.",
                **board.summary(),
            }
        if executed >= max_steps:
            board.note("step limit reached")
            break
        if budget is not None and (over := budget.exceeded()):
            board.note(f"stopping early: {over}")
            break

        blocked = _gate_tool_step(step, policy, audit)
        if blocked is not None:
            board.note(f"step {step.id} withheld: {blocked.critic_feedback}")
            board.record(blocked)
            executed += 1
            continue

        if step.kind == "tool" and budget is not None:
            budget.charge_tool()
        if progress:
            progress(
                "step_start",
                {
                    "step": step.id,
                    "description": step.description,
                    "command_id": step.tool,
                    "subtask_count": 0,
                },
            )
        result = _run_step(step, board, reason_fn, dispatch_fn)
        critic_ok, feedback = _criticize(step, result.output, reason_fn)
        result.critic_ok = critic_ok
        result.critic_feedback = feedback
        # One bounded retry when the step ran but failed its success check.
        if (not result.ok or not critic_ok) and executed + 1 < max_steps:
            board.note(f"retrying step {step.id}: {feedback or 'failed check'}")
            if step.kind == "tool" and budget is not None:
                budget.charge_tool()
            retry = _run_step(step, board, reason_fn, dispatch_fn)
            r_ok, r_feedback = _criticize(step, retry.output, reason_fn)
            retry.critic_ok = r_ok
            retry.critic_feedback = r_feedback
            result = retry
            executed += 1
        _audit_tool_result(audit, step, result)
        board.record(result)
        if progress:
            progress(
                "step_done",
                {
                    "step": step.id,
                    "ok": bool(result.ok and (result.critic_ok is not False)),
                    "data": None,
                    "error": None if result.ok else result.output[:300],
                },
            )
        executed += 1

    try:
        summary_text = reason_fn(Capability.CHAT, _SUMMARY_SYSTEM, board.render_context())
    except Exception as exc:  # noqa: BLE001
        summary_text = f"(summary unavailable: {exc})"
    out = board.summary()
    all_ok = all(r.ok and (r.critic_ok is not False) for r in board.results) and bool(board.results)
    if progress:
        progress(
            "task_complete" if all_ok else "task_error",
            {"result": summary_text} if all_ok else {"error": summary_text},
        )
    if memory is not None:
        try:
            memory.remember_outcome(goal, summary_text, all_ok)
        except Exception as exc:  # noqa: BLE001
            board.note(f"remember failed: {exc}")
    if skills is not None:
        try:
            skills.learn(goal, board.plan, all_ok)
        except Exception as exc:  # noqa: BLE001
            board.note(f"skill learn failed: {exc}")
    payload: dict[str, Any] = {"ok": all_ok, "summary": summary_text, **out}
    if not all_ok:
        # Ensure tool_registry / voice speakable paths have a top-level error
        # (summary alone used to log as "no detail" and speak "it didn't work").
        payload["error"] = (summary_text or "one or more steps failed").strip()
    return payload


def _default_reason_fn() -> ReasonFn:
    from .complete import complete

    def _fn(capability: Capability, system: str, user: str) -> str:
        return complete(capability, system, user)

    return _fn


# Tools the planner must never invoke, to prevent unbounded self-recursion.
_REENTRANT_TOOLS = frozenset({"plan_and_execute"})


def make_dispatch_fn(*, approval_granted: bool = False) -> DispatchFn:
    """Build an orchestrator tool runner with a fixed consent flag for this run.

    When the user approved the outer ``plan_and_execute`` (or autonomous mode is
    on), pass ``approval_granted=True`` so nested ``TOOLS_NEEDING_APPROVAL``
    calls match chat-loop semantics. The grant is bounded to this callable —
    not a global session flag.
    """
    from tool_registry import dispatch_sync

    def _fn(tool: str, args: dict[str, Any]) -> dict[str, Any]:
        if tool in _REENTRANT_TOOLS:
            return {"ok": False, "error": "nested planning is not allowed"}
        return dispatch_sync(tool, args, approval_granted=approval_granted)

    return _fn


def _default_dispatch_fn() -> DispatchFn:
    return make_dispatch_fn(approval_granted=False)
