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
    assert tasks_store.get_task(old["id"])["dismissed"] is True
    assert tasks_store.get_task(typed["id"])["dismissed"] is False


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
    assert tasks_store.get_task(old["id"])["dismissed"] is True
    assert tasks_store.get_task(typed["id"])["dismissed"] is False


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
    assert tasks_store.get_task(mail["id"])["dismissed"] is True
    assert tasks_store.get_task(cal["id"])["dismissed"] is True


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
    assert tasks_store.get_task(task["id"])["dismissed"] is True
    assert assistant_memory.get_memory_entry_by_id(row_id) is None
    assert assistant_memory.get_memory_entry_by_id(keep_id) is not None


def test_forget_writes_source_marker_even_when_desktop_already_empty(forget_mod):
    import tasks_store

    markers = forget_mod.export_source_forget_markers()
    assert markers == []
    dropped = forget_mod.forget_tasks_for_sources({"gmail"})
    assert dropped == 0
    markers = forget_mod.export_source_forget_markers()
    assert len(markers) == 1
    assert markers[0]["record_id"] == "source_forget:gmail"
    assert markers[0]["payload"]["forget_source"] == "gmail"
    assert markers[0]["deleted"] is True
    assert tasks_store.list_tasks() == []


def test_fresh_profile_does_not_invent_forget_markers(forget_mod):
    forget_mod.ensure_disconnected_source_forgets()
    assert forget_mod.export_source_forget_markers() == []


def test_disconnected_source_backfills_forget_marker(forget_mod, tmp_path):
    """Upgrade path: mailbox already forgotten, rows already gone, phone still has leftovers."""
    forget_mod.remember_or_drop_if_identity_changed("gmail", "old@example.com")
    forget_mod.forget_tasks_for_sources({"gmail"})
    (tmp_path / "task_source_forgets.json").unlink(missing_ok=True)
    forget_mod.ensure_disconnected_source_forgets()
    first = {row["record_id"]: row["updated_at"] for row in forget_mod.export_source_forget_markers()}
    assert "source_forget:gmail" in first
    assert "source_forget:outlook" not in first
    forget_mod.ensure_disconnected_source_forgets()
    again = {row["record_id"]: row["updated_at"] for row in forget_mod.export_source_forget_markers()}
    assert again == first


def test_harvest_paused_until_explicit_resume(forget_mod):
    assert forget_mod.harvest_paused("gmail") is False
    forget_mod.record_source_forgets({"gmail"})
    assert forget_mod.harvest_paused("gmail") is True
    forget_mod.clear_source_forgets({"gmail"})
    assert forget_mod.harvest_paused("gmail") is False


def test_parse_source_forget_record_requires_matching_payload(forget_mod):
    assert (
        forget_mod.parse_source_forget_record(
            {
                "collection": "tasks",
                "record_id": "source_forget:gmail",
                "deleted": True,
                "payload": {"forget_source": "gmail"},
            }
        )
        == "gmail"
    )
    assert (
        forget_mod.parse_source_forget_record(
            {
                "collection": "tasks",
                "record_id": "source_forget:gmail",
                "deleted": True,
                "payload": {"completed": True},
            }
        )
        is None
    )


def test_fingerprint_is_not_the_raw_email(forget_mod, tmp_path):
    forget_mod.remember_or_drop_if_identity_changed("gmail", "secret@example.com")
    raw = (tmp_path / "task_source_identity.json").read_text(encoding="utf-8")
    assert "secret@example.com" not in raw
    assert forget_mod.identity_fingerprint("secret@example.com") in raw
