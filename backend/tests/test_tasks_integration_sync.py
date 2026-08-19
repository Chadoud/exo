"""Untitled calendar events are not action items."""

from __future__ import annotations

import importlib

import pytest


@pytest.fixture()
def sync_mod(tmp_path, monkeypatch):
    monkeypatch.setenv("EXOSITES_DATA_DIR", str(tmp_path))
    import tasks_integration_sync
    import tasks_store

    importlib.reload(tasks_store)
    return importlib.reload(tasks_integration_sync)


def test_placeholder_titles_are_not_real(sync_mod):
    assert sync_mod.calendar_event_has_real_title("Team standup") is True
    assert sync_mod.calendar_event_has_real_title("") is False
    assert sync_mod.calendar_event_has_real_title("   ") is False
    assert sync_mod.calendar_event_has_real_title("(no title)") is False
    assert sync_mod.calendar_event_has_real_title("No title") is False
    assert sync_mod.calendar_event_has_real_title("untitled") is False
    assert sync_mod.calendar_event_has_real_title("(untitled)") is False
    assert sync_mod.is_placeholder_prepare_task("Prepare for: (no title)") is True
    assert sync_mod.is_placeholder_prepare_task("Prepare for: ") is True
    assert sync_mod.is_placeholder_prepare_task("Prepare for: untitled") is True
    assert sync_mod.is_placeholder_prepare_task("Prepare for: Team standup") is False


def test_calendar_sync_skips_untitled_events(sync_mod, monkeypatch):
    import tasks_store

    events = [
        {"id": "empty", "summary": "(no title)", "start": "2026-08-19T10:30:00+02:00"},
        {"id": "blank", "summary": "", "start": "2026-08-19T11:00:00+02:00"},
        {
            "id": "body-only",
            "summary": "(no title)",
            "description": "Bring the deck and dial in 5 minutes early",
            "start": "2026-08-19T11:30:00+02:00",
        },
        {"id": "real", "summary": "Dentist", "start": "2026-08-19T12:00:00+02:00"},
    ]

    def list_fn(_params):
        return {"ok": True, "data": {"events": events}}

    monkeypatch.setattr(sync_mod, "_safe_call", lambda fn, params: (fn(params), "ok"))
    stored, status = sync_mod._sync_calendar_events(
        "google-calendar", list_fn, label="Google Calendar", param_style="google"
    )
    assert status == "ok"
    assert stored == 1
    tasks = tasks_store.list_tasks()
    assert [t["description"] for t in tasks] == ["Prepare for: Dentist"]


def test_sync_dismisses_existing_placeholder_tasks(sync_mod, monkeypatch):
    import tasks_store

    junk = tasks_store.create_task(
        "Prepare for: (no title)",
        source="google-calendar",
        external_id="google-calendar:cal:empty-1",
    )
    keep = tasks_store.create_task(
        "Prepare for: Dentist",
        source="google-calendar",
        external_id="google-calendar:cal:real-1",
    )
    monkeypatch.setattr(sync_mod, "_sync_gmail", lambda: (0, "not_connected"))
    monkeypatch.setattr(sync_mod, "_sync_outlook", lambda: (0, "not_connected"))
    monkeypatch.setattr(sync_mod, "_sync_google_calendar", lambda: (0, "ok"))
    monkeypatch.setattr(sync_mod, "_sync_outlook_calendar", lambda: (0, "ok"))

    result = sync_mod.sync_integration_tasks()
    assert result["dismissed_placeholders"] == 1
    assert tasks_store.get_task(junk["id"]) is None
    assert tasks_store.list_tasks()[0]["id"] == keep["id"]


def test_sync_drops_gmail_tasks_when_mailbox_changes(sync_mod, monkeypatch):
    import tasks_source_forget
    import tasks_store

    tasks_source_forget.remember_or_drop_if_identity_changed("gmail", "old@example.com")
    old = tasks_store.create_task(
        "Follow up with Alice",
        source="gmail",
        external_id="gmail:mail:old-box",
    )
    typed = tasks_store.create_task("Buy milk", source="manual")

    monkeypatch.setattr(tasks_source_forget, "peek_gmail_identity", lambda: "new@example.com")
    monkeypatch.setattr(tasks_source_forget, "peek_outlook_identity", lambda: "")
    monkeypatch.setattr(tasks_source_forget, "peek_google_calendar_identity", lambda: "")
    monkeypatch.setattr(sync_mod, "_sync_gmail", lambda: (0, "ok"))
    monkeypatch.setattr(sync_mod, "_sync_outlook", lambda: (0, "not_connected"))
    monkeypatch.setattr(sync_mod, "_sync_google_calendar", lambda: (0, "not_connected"))
    monkeypatch.setattr(sync_mod, "_sync_outlook_calendar", lambda: (0, "not_connected"))

    sync_mod.sync_integration_tasks()
    assert tasks_store.get_task(old["id"]) is None
    assert tasks_store.get_task(typed["id"]) is not None
