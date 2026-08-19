"""Tests for activity, meeting, digest, and nudge stores."""

from __future__ import annotations

import importlib

import pytest


@pytest.fixture()
def env(tmp_path, monkeypatch):
    monkeypatch.setenv("EXOSITES_DATA_DIR", str(tmp_path))
    import activity_store
    import conversation_store
    import daily_digest
    import meeting_store
    import nudges
    import tasks_store

    for mod in (activity_store, conversation_store, tasks_store, daily_digest, nudges, meeting_store):
        importlib.reload(mod)
    return activity_store, conversation_store, tasks_store, daily_digest, nudges, meeting_store


def test_activity_add_and_list(env):
    activity_store = env[0]
    activity_store.add_activity("Code", "main.py - Editor", "Editing the backend main module")
    entries = activity_store.list_activity()
    assert len(entries) == 1
    assert entries[0]["summary"].startswith("Editing")


def test_activity_prune(env):
    activity_store = env[0]
    activity_store.add_activity("x", "y", "recent")
    assert activity_store.prune_older_than(0) >= 1  # everything is "older than 0 days from now"


def test_digest_fallback_without_llm(env, monkeypatch):
    activity_store, conversation_store, tasks_store, daily_digest, _, _ = env
    conversation_store.upsert_conversation("c1", title="Sync", summary="Talked about the launch")
    from datetime import UTC, datetime

    tasks_store.create_task("Ship the build", due_at=datetime.now(UTC).isoformat())
    monkeypatch.setattr(daily_digest, "complete", lambda *a, **k: None)

    digest = daily_digest.generate_digest()
    assert digest["llm"] is False
    assert "due today" in digest["headline"]
    assert "conversation" not in digest["headline"].lower()
    assert daily_digest.latest_digest()["id"] == digest["id"]


def test_nudges_rate_limited(env, monkeypatch):
    nudges = env[4]
    # Force many candidate suggestions; budget caps creations.
    monkeypatch.setattr(
        nudges,
        "_suggestion_candidates",
        lambda: [("suggestion", f"Idea {i}", "because", {}) for i in range(20)],
    )
    monkeypatch.setattr(nudges, "_due_task_candidates", lambda: [])
    created = nudges.generate_nudges()
    assert len(created) <= nudges._MAX_PER_WINDOW
    # Second run within the window yields nothing new (budget consumed + dedupe).
    assert nudges.generate_nudges() == []


def test_nudge_dismiss(env, monkeypatch):
    nudges = env[4]
    monkeypatch.setattr(nudges, "_suggestion_candidates", lambda: [("suggestion", "One", "r", {})])
    monkeypatch.setattr(nudges, "_due_task_candidates", lambda: [])
    created = nudges.generate_nudges()
    assert created
    nid = created[0]["id"]
    assert nudges.dismiss_nudge(nid) is True
    assert all(n["id"] != nid for n in nudges.list_nudges())


def test_meeting_lifecycle(env, monkeypatch):
    meeting_store = env[5]
    monkeypatch.setattr(meeting_store, "complete", lambda *a, **k: None)
    meeting_store.start_meeting("m1", "Standup")
    meeting_store.append_line("m1", "We will ship Friday", speaker="Alex")
    meeting_store.append_line("m1", "I need to update the changelog and notify the team about the release")
    notes = meeting_store.get_live_notes("m1")
    assert notes["line_count"] == 2
    result = meeting_store.end_meeting("m1")
    assert result["ok"] is True
    # Ended meeting is removed from active sessions.
    assert meeting_store.get_live_notes("m1")["ok"] is False


def test_ensure_today_digest_rebuilds_chat_era_row(env, monkeypatch):
    _, _, tasks_store, daily_digest, _, _ = env
    from datetime import UTC, datetime

    monkeypatch.setattr(daily_digest, "complete", lambda *a, **k: None)
    today = datetime.now(UTC).strftime("%Y-%m-%d")
    stale = daily_digest._persist(
        today,
        {
            "headline": "Day Marked by Task Retries",
            "highlights": [],
            "decisions": [],
            "unresolved": [],
            "focus_tomorrow": [],
            "counts": {"conversations": 4, "activity": 1, "open_tasks": 0},
            "llm": True,
        },
    )
    tasks_store.create_task("Board pack", due_at=datetime.now(UTC).isoformat())
    rebuilt = daily_digest.ensure_today_digest(use_llm=False)
    assert rebuilt["id"] == stale["id"]
    assert "Retries" not in rebuilt["headline"]
    assert "due today" in rebuilt["headline"]


def test_ensure_today_digest_creates_once(env, monkeypatch):
    _, _, _, daily_digest, _, _ = env
    monkeypatch.setattr(daily_digest, "complete", lambda *a, **k: None)
    first = daily_digest.ensure_today_digest(use_llm=False)
    second = daily_digest.ensure_today_digest(use_llm=True)
    assert first["id"] == second["id"]
    assert first["llm"] is False
    assert daily_digest.digest_for_date(first["date"])["id"] == first["id"]


def test_digest_idempotent_per_day(env, monkeypatch):
    _, _, _, daily_digest, _, _ = env
    monkeypatch.setattr(daily_digest, "complete", lambda *a, **k: None)

    first = daily_digest.generate_digest()
    second = daily_digest.generate_digest()
    assert first["id"] == second["id"]
    assert daily_digest.list_digests(limit=5) == [
        {
            "id": first["id"],
            "date": first["date"],
            "headline": first["headline"],
            "created_at": second["created_at"],
        }
    ]


def test_meeting_extracts_memories(env, monkeypatch):
    meeting_store = env[5]
    import importlib

    import assistant_memory

    importlib.reload(assistant_memory)
    monkeypatch.setattr(
        meeting_store,
        "complete",
        lambda *a, **k: '{"title":"Sprint","overview":"Shipped v2","highlights":["API done"],"decisions":["Launch Friday"],"action_items":["Write changelog"]}',
    )
    meeting_store.start_meeting("m2", "Sprint")
    meeting_store.append_line("m2", "We decided to launch Friday and I will write the changelog before end of day")
    meeting_store.end_meeting("m2")

    entries = assistant_memory.list_all_memory_scoped()
    assert any("Shipped v2" in e["value"] for e in entries)
    assert any("API done" in e["value"] for e in entries)


def test_integration_sync_reports_status(monkeypatch):
    import tasks_integration_sync

    monkeypatch.setattr(
        tasks_integration_sync,
        "_sync_gmail",
        lambda: (2, "ok"),
    )
    monkeypatch.setattr(
        tasks_integration_sync,
        "_sync_outlook",
        lambda: (0, "not_connected"),
    )
    monkeypatch.setattr(
        tasks_integration_sync,
        "_sync_google_calendar",
        lambda: (0, "ok"),
    )
    monkeypatch.setattr(
        tasks_integration_sync,
        "_sync_outlook_calendar",
        lambda: (0, "failed"),
    )
    result = tasks_integration_sync.sync_integration_tasks()
    assert result["total_created"] == 2
    assert result["statuses"]["gmail"] == "ok"
    assert result["statuses"]["outlook"] == "not_connected"
    assert result["statuses"]["outlook_calendar"] == "failed"
