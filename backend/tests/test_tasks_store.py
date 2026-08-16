"""Tests for the task / action-item store."""

from __future__ import annotations

import importlib

import pytest


@pytest.fixture()
def store(tmp_path, monkeypatch):
    monkeypatch.setenv("EXOSITES_DATA_DIR", str(tmp_path))
    import tasks_store

    importlib.reload(tasks_store)
    return tasks_store


def test_create_and_list(store):
    task = store.create_task("Buy milk", priority="high")
    assert task["id"] > 0
    assert task["description"] == "Buy milk"
    assert task["priority"] == "high"
    assert task["completed"] is False

    tasks = store.list_tasks()
    assert len(tasks) == 1
    assert tasks[0]["description"] == "Buy milk"


def test_blank_description_rejected(store):
    with pytest.raises(ValueError):
        store.create_task("   ")


def test_invalid_priority_defaults_to_normal(store):
    task = store.create_task("Do thing", priority="urgent")
    assert task["priority"] == "normal"


def test_complete_and_reopen(store):
    task = store.create_task("Write report")
    done = store.set_completed(task["id"], True)
    assert done["completed"] is True
    assert done["completed_at"] is not None

    reopened = store.set_completed(task["id"], False)
    assert reopened["completed"] is False
    assert reopened["completed_at"] is None


def test_update_fields(store):
    task = store.create_task("Old text")
    updated = store.update_task(task["id"], description="New text", priority="low")
    assert updated["description"] == "New text"
    assert updated["priority"] == "low"


def test_delete(store):
    task = store.create_task("Temp")
    assert store.delete_task(task["id"]) is True
    gone = store.get_task(task["id"])
    assert gone is not None
    assert gone["dismissed"] is True
    assert store.list_tasks() == []
    assert store.delete_task(task["id"]) is False


def test_delete_keeps_external_id_so_sync_cannot_recreate(store):
    task = store.create_task(
        "Prepare for: Team standup",
        source="google-calendar",
        external_id="google-calendar:cal:evt-1",
    )
    assert store.delete_task(task["id"]) is True
    again = store.create_task(
        "Prepare for: Team standup",
        source="google-calendar",
        external_id="google-calendar:cal:evt-1",
    )
    assert again["id"] == task["id"]
    assert again["dismissed"] is True
    assert store.list_tasks() == []


def test_dedupe_check(store):
    store.create_task("Call the dentist")
    assert store.task_exists("call the dentist") is True
    assert store.task_exists("call the plumber") is False


def test_list_excludes_completed_when_requested(store):
    store.create_task("Open task")
    b = store.create_task("Closed task")
    store.set_completed(b["id"], True)
    open_only = store.list_tasks(include_completed=False)
    assert [t["description"] for t in open_only] == ["Open task"]


def test_due_before_filter(store):
    store.create_task("Soon", due_at="2026-01-01T00:00:00")
    store.create_task("Later", due_at="2030-01-01T00:00:00")
    store.create_task("No due date")
    due = store.list_tasks(only_due_before="2026-06-01T00:00:00")
    assert [t["description"] for t in due] == ["Soon"]


def test_exclude_manual(store):
    store.create_task("Typed by hand", source="manual")
    store.create_task("From chat", source="conversation")
    visible = store.list_tasks(exclude_manual=True)
    assert [t["description"] for t in visible] == ["From chat"]


def test_external_id_dedupe(store):
    first = store.create_task("Starred email", source="gmail", external_id="gmail:mail:abc")
    second = store.create_task("Starred email again", source="gmail", external_id="gmail:mail:abc")
    assert first["id"] == second["id"]
    assert len(store.list_tasks()) == 1


def test_gmail_promotional_task_rejected_at_create(store):
    with pytest.raises(ValueError, match="promotional"):
        store.create_task(
            "Shop now — 50% off. Unsubscribe",
            source="gmail",
            external_id="gmail:mail:promo1",
        )


def test_gmail_security_notification_rejected_at_create(store):
    with pytest.raises(ValueError, match="promotional"):
        store.create_task(
            "New sign-in to your OpenAI account",
            source="gmail",
            external_id="gmail:mail:openai-signin",
        )


def test_gmail_promotional_task_hidden_from_list(store):
    """Legacy junk in DB is filtered on read until cleanup runs."""
    now = "2026-06-12T12:00:00+00:00"
    with store._conn() as conn:
        conn.execute(
            """
            INSERT INTO tasks
                (description, due_at, priority, source, source_conversation_id,
                 external_id, created_at, updated_at)
            VALUES (?, NULL, 'normal', 'gmail', NULL, ?, ?, ?)
            """,
            ("Limited time offer — unsubscribe", "gmail:mail:legacy-promo", now, now),
        )
        conn.commit()
    assert store.list_tasks() == []


def test_cleanup_noise_tasks_removes_promotional_gmail(store):
    now = "2026-06-12T12:00:00+00:00"
    with store._conn() as conn:
        conn.execute(
            """
            INSERT INTO tasks
                (description, due_at, priority, source, source_conversation_id,
                 external_id, created_at, updated_at)
            VALUES (?, NULL, 'normal', 'gmail', NULL, ?, ?, ?)
            """,
            ("Flash sale ends tonight — unsubscribe", "gmail:mail:cleanup-promo", now, now),
        )
        conn.commit()
    result = store.cleanup_noise_tasks()
    assert result["removed"] == 1
    assert store.list_tasks() == []


def test_update_task_rejects_promotional_gmail_description(store):
    task = store.create_task(
        "Follow up with Alice",
        source="gmail",
        external_id="gmail:mail:ok",
    )
    with pytest.raises(ValueError, match="promotional"):
        store.update_task(task["id"], description="50% off sale — limited time only")
