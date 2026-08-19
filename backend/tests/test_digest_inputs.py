"""Briefing inputs are the user's day — not chats with Exo."""

from __future__ import annotations

import importlib
from datetime import UTC, datetime, timedelta

import pytest

from digest_inputs import _EMPTY_HEADLINE, fallback_digest


@pytest.fixture()
def env(tmp_path, monkeypatch):
    monkeypatch.setenv("EXOSITES_DATA_DIR", str(tmp_path))
    import conversation_store
    import digest_inputs
    import tasks_store

    for mod in (conversation_store, tasks_store, digest_inputs):
        importlib.reload(mod)
    return conversation_store, tasks_store, digest_inputs


def _iso_days(offset: int) -> str:
    return (datetime.now(UTC) + timedelta(days=offset)).isoformat()


def test_gather_uses_dated_work_not_chat(env):
    conversation_store, tasks_store, digest_inputs = env
    conversation_store.upsert_conversation(
        "c1",
        title="Briefing prefs",
        summary="User preferred to discontinue briefing proposals and asked to retry deploy.",
    )
    tasks_store.create_task("Prepare for: (no title)", source="google-calendar", due_at=_iso_days(0))
    tasks_store.create_task("Board pack", source="google-calendar", due_at=_iso_days(0))
    tasks_store.create_task("Call the landlord", due_at=_iso_days(-1))
    tasks_store.create_task("Someday undated")

    text, counts = digest_inputs.gather_digest_inputs()
    assert "Board pack" in text
    assert "Call the landlord" in text
    assert "Someday undated" not in text
    assert "(no title)" not in text
    assert "Conversations" not in text
    assert "briefing proposals" not in text
    assert "retry deploy" not in text
    assert counts["due_today"] == 1
    assert counts["overdue"] == 1
    assert counts["conversations"] == 0


def test_gather_empty_when_only_chat_exists(env):
    conversation_store, _, digest_inputs = env
    conversation_store.upsert_conversation("c2", title="Retries", summary="Retry check my last emails")
    text, counts = digest_inputs.gather_digest_inputs()
    assert text == ""
    assert counts["open_tasks"] == 0
    assert fallback_digest(counts)["headline"] == _EMPTY_HEADLINE


def test_fallback_headline_prefers_due_work():
    body = fallback_digest(
        {
            "overdue": 2,
            "due_today": 1,
            "mail": 0,
            "open_tasks": 8,
        }
    )
    assert body["headline"] == "2 overdue, 1 due today"
    assert body["llm"] is False


def test_fallback_ignores_undated_open_count():
    body = fallback_digest({"overdue": 0, "due_today": 0, "mail": 0, "open_tasks": 8})
    assert body["headline"] == _EMPTY_HEADLINE


def test_gather_skips_past_calendar_and_includes_mail(env, monkeypatch):
    _, tasks_store, digest_inputs = env
    tasks_store.create_task(
        "Prepare for: Old standup",
        source="google-calendar",
        due_at=_iso_days(-1),
    )
    monkeypatch.setattr(
        digest_inputs,
        "_mail_lines",
        lambda: ["- Alex: Invoice for August"],
    )
    text, counts = digest_inputs.gather_digest_inputs()
    assert "Old standup" not in text
    assert "Invoice for August" in text
    assert counts["overdue"] == 0
    assert counts["mail"] == 1
    assert digest_inputs.fallback_digest(counts)["headline"] == "1 mail waiting"


def test_needs_workday_rebuild_detects_chat_era_counts():
    from digest_inputs import needs_workday_rebuild

    assert needs_workday_rebuild({"counts": {"conversations": 3, "activity": 0}})
    assert needs_workday_rebuild({"counts": {"conversations": 0, "activity": 2}})
    assert needs_workday_rebuild({"headline": "old"})
    assert needs_workday_rebuild(
        {"counts": {"conversations": 0, "activity": 0, "open_tasks": 2}}
    )
    assert not needs_workday_rebuild(
        {"counts": {"conversations": 0, "activity": 0, "overdue": 0, "due_today": 0}}
    )
