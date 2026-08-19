"""Mailbox switch drops harvested tasks and keeps typed ones."""

from __future__ import annotations

import importlib

import pytest


@pytest.fixture()
def forget_mod(tmp_path, monkeypatch):
    monkeypatch.setenv("EXOSITES_DATA_DIR", str(tmp_path))
    import tasks_source_forget
    import tasks_store

    importlib.reload(tasks_store)
    return importlib.reload(tasks_source_forget)


def test_identity_change_drops_gmail_keeps_manual(forget_mod):
    import tasks_store

    assert forget_mod.remember_or_drop_if_identity_changed("gmail", "old@example.com") == 0
    old = tasks_store.create_task(
        "Follow up with Alice",
        source="gmail",
        external_id="gmail:mail:old",
    )
    typed = tasks_store.create_task("Buy milk", source="manual")
    dropped = forget_mod.remember_or_drop_if_identity_changed("gmail", "new@example.com")
    assert dropped == 1
    assert tasks_store.get_task(old["id"]) is None
    assert tasks_store.get_task(typed["id"]) is not None


def test_first_seen_mailbox_drops_existing_harvested_rows(forget_mod):
    """Upgrade path: leftovers exist before we ever stored a fingerprint."""
    import tasks_store

    old = tasks_store.create_task(
        "Follow up with Alice",
        source="gmail",
        external_id="gmail:mail:pre-fingerprint",
    )
    typed = tasks_store.create_task("Buy milk", source="manual")
    dropped = forget_mod.remember_or_drop_if_identity_changed("gmail", "new@example.com")
    assert dropped == 1
    assert tasks_store.get_task(old["id"]) is None
    assert tasks_store.get_task(typed["id"]) is not None


def test_same_mailbox_does_not_drop(forget_mod):
    import tasks_store

    assert forget_mod.remember_or_drop_if_identity_changed("gmail", "same@example.com") == 0
    task = tasks_store.create_task(
        "Follow up with Alice",
        source="gmail",
        external_id="gmail:mail:same",
    )
    assert forget_mod.remember_or_drop_if_identity_changed("gmail", "same@example.com") == 0
    assert tasks_store.get_task(task["id"]) is not None


def test_microsoft_identity_change_drops_outlook_and_calendar(forget_mod):
    import tasks_store

    forget_mod.remember_or_drop_if_identity_changed("outlook", "ada@contoso.com")
    mail = tasks_store.create_task(
        "Flagged mail",
        source="outlook",
        external_id="outlook:mail:old",
    )
    cal = tasks_store.create_task(
        "Prepare for: Standup",
        source="outlook-calendar",
        external_id="outlook-calendar:cal:old",
    )
    dropped = forget_mod.remember_or_drop_if_identity_changed("outlook", "chady@contoso.com")
    assert dropped == 2
    assert tasks_store.get_task(mail["id"]) is None
    assert tasks_store.get_task(cal["id"]) is None


def test_forget_disconnect_clears_identity_and_token(forget_mod, monkeypatch):
    import tasks_store

    evicted: list[str] = []
    monkeypatch.setattr(
        "connector_credentials.clear_token",
        lambda provider_id: evicted.append(provider_id),
    )
    forget_mod.remember_or_drop_if_identity_changed("gmail", "old@example.com")
    tasks_store.create_task(
        "Follow up with Alice",
        source="gmail",
        external_id="gmail:mail:gone",
    )
    dropped = forget_mod.forget_tasks_for_sources({"gmail"}, evict_tokens=True)
    assert dropped == 1
    assert evicted == ["google-gmail"]
    assert tasks_store.list_tasks() == []
    # Reconnect records the mailbox first, then harvest — same address must stay.
    assert forget_mod.remember_or_drop_if_identity_changed("gmail", "old@example.com") == 0
    tasks_store.create_task(
        "Follow up with Alice",
        source="gmail",
        external_id="gmail:mail:fresh",
    )
    assert forget_mod.remember_or_drop_if_identity_changed("gmail", "old@example.com") == 0
    assert len(tasks_store.list_tasks()) == 1


def test_forget_calendar_drops_auto_prep_memory(forget_mod, tmp_path, monkeypatch):
    import assistant_memory
    import tasks_store

    monkeypatch.setenv("EXOSITES_DATA_DIR", str(tmp_path))
    import importlib

    importlib.reload(assistant_memory)
    task = tasks_store.create_task(
        "Prepare for: Dentist",
        source="google-calendar",
        external_id="google-calendar:cal:evt-1",
    )
    row_id = assistant_memory.update_memory(
        "context",
        "Commitment: Prepare for: Dentist",
        "Prepare for: Dentist",
        source="auto",
        reviewed=False,
        origin_ref="google-calendar:cal:evt-1",
    )
    keep_id = assistant_memory.update_memory(
        "identity",
        "Name",
        "Chady",
        source="manual",
        skip_signal_check=True,
    )
    forget_mod.forget_tasks_for_sources({"google-calendar"})
    assert tasks_store.get_task(task["id"]) is None
    assert assistant_memory.get_memory_entry_by_id(row_id) is None
    assert assistant_memory.get_memory_entry_by_id(keep_id) is not None


def test_fingerprint_is_not_the_raw_email(forget_mod, tmp_path):
    forget_mod.remember_or_drop_if_identity_changed("gmail", "secret@example.com")
    raw = (tmp_path / "task_source_identity.json").read_text(encoding="utf-8")
    assert "secret@example.com" not in raw
    assert forget_mod.identity_fingerprint("secret@example.com") in raw
