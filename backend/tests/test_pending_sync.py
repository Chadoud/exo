"""pending_actions export/apply — no draft_token on the wire."""

from __future__ import annotations

from unittest.mock import patch

import pytest

from mail_initiative import pending_sync, store
from mail_initiative.reply import SendRejected


@pytest.fixture
def mail_dir(tmp_path, monkeypatch):
    monkeypatch.setenv("EXOSITES_DATA_DIR", str(tmp_path))
    store.clear_all()
    return tmp_path


def _candidate() -> dict:
    return store.upsert_candidate(
        thread_id="t1",
        message_ids=["m1"],
        last_message_id="m1",
        from_name="Ada",
        from_email="ada@example.com",
        subject="Lunch",
        draft_subject="Re: Lunch",
        draft_body="See you at noon.",
    )


def test_export_ready_has_no_draft_token(mail_dir):
    row = _candidate()
    items = pending_sync.export_pending_actions()
    assert len(items) == 1
    payload = items[0]["payload"]
    assert items[0]["record_id"] == pending_sync.record_id_for(int(row["id"]))
    assert payload["status"] == "ready"
    assert payload["to_email"] == "ada@example.com"
    assert payload["inbound_subject"] == "Lunch"
    assert payload["subject"] == "Re: Lunch"
    assert payload["body"] == "See you at noon."
    assert "draft_token" not in payload
    assert "token" not in payload


def test_export_joins_task_record_id_after_task_freeze(mail_dir):
    """Draft created after the last task edit still carries the join."""
    import tasks_store

    task = tasks_store.create_task(
        "Reply to Ada",
        source="manual",
        external_id="gmail:mail:m1",
    )
    _candidate()
    payload = pending_sync.export_pending_actions()[0]["payload"]
    assert payload["task_record_id"] == str(task["id"])


def test_dismiss_pending_for_task_drops_draft_without_sending(mail_dir):
    import tasks_store

    row = _candidate()
    task = tasks_store.create_task(
        "Reply to Ada",
        source="manual",
        external_id="gmail:mail:m1",
    )
    rid = pending_sync.record_id_for(int(row["id"]))
    sent = {}

    def _send(*, draft_token: str, subject: str, body: str) -> dict:
        sent["called"] = True
        return {"ok": True}

    with patch("mail_initiative.reply.send_reply", _send):
        assert pending_sync.dismiss_pending_for_task(int(task["id"])) == "applied"
    assert sent == {}
    exported = pending_sync.export_pending_actions()
    tomb = [i for i in exported if i["record_id"] == rid]
    assert tomb and tomb[0]["deleted"] is True
    assert pending_sync.dismiss_pending_for_task(int(task["id"])) == "skipped_noop"


def test_apply_deleted_pending_action_does_not_send(mail_dir):
    row = _candidate()
    rid = pending_sync.record_id_for(int(row["id"]))
    outcome = pending_sync.apply_remote_pending_action(
        {
            "collection": "pending_actions",
            "record_id": rid,
            "device_id": "phone",
            "deleted": True,
            "payload": {},
        },
        own_device_id="desktop",
    )
    assert outcome == "applied"
    exported = pending_sync.export_pending_actions()
    tomb = [i for i in exported if i["record_id"] == rid]
    assert tomb and tomb[0]["deleted"] is True


def test_export_omits_task_record_id_without_mail_task(mail_dir):
    _candidate()
    payload = pending_sync.export_pending_actions()[0]["payload"]
    assert "task_record_id" not in payload


def test_apply_allows_readonly_task_record_id_echo(mail_dir):
    row = _candidate()
    rid = pending_sync.record_id_for(int(row["id"]))

    def _draft(_cid: int) -> dict:
        return {"draft_token": "local-only"}

    def _send(*, draft_token: str, subject: str, body: str) -> dict:
        return {"ok": True}

    with (
        patch("mail_initiative.draft.create_draft", _draft),
        patch("mail_initiative.reply.send_reply", _send),
    ):
        outcome = pending_sync.apply_remote_pending_action(
            {
                "collection": "pending_actions",
                "record_id": rid,
                "device_id": "phone",
                "payload": {
                    "type": "mail_reply",
                    "status": "confirmed",
                    "subject": "Re: Lunch",
                    "body": "On my way.",
                    "task_record_id": "42",
                },
            },
            own_device_id="desktop",
        )
    assert outcome == "applied"


def test_export_includes_inbound_snippet(mail_dir):
    store.upsert_candidate(
        thread_id="t2",
        message_ids=["m2"],
        last_message_id="m2",
        from_name="Ada",
        from_email="ada@example.com",
        subject="Lunch",
        draft_subject="Re: Lunch",
        draft_body="See you at noon.",
        inbound_snippet="Are you free Thursday?",
    )
    payload = pending_sync.export_pending_actions()[0]["payload"]
    assert payload["inbound_snippet"] == "Are you free Thursday?"


def test_apply_allows_readonly_inbound_echo(mail_dir):
    row = _candidate()
    rid = pending_sync.record_id_for(int(row["id"]))

    def _draft(_cid: int) -> dict:
        return {"draft_token": "local-only"}

    def _send(*, draft_token: str, subject: str, body: str) -> dict:
        return {"ok": True}

    with (
        patch("mail_initiative.draft.create_draft", _draft),
        patch("mail_initiative.reply.send_reply", _send),
    ):
        outcome = pending_sync.apply_remote_pending_action(
            {
                "collection": "pending_actions",
                "record_id": rid,
                "device_id": "phone",
                "payload": {
                    "type": "mail_reply",
                    "status": "confirmed",
                    "subject": "Re: Lunch",
                    "body": "On my way.",
                    "inbound_subject": "Lunch",
                    "inbound_snippet": "Are you free?",
                },
            },
            own_device_id="desktop",
        )
    assert outcome == "applied"


def test_apply_rejects_unknown_payload_keys(mail_dir):
    outcome = pending_sync.apply_remote_pending_action(
        {
            "collection": "pending_actions",
            "record_id": "mail_reply:1",
            "device_id": "phone",
            "payload": {"status": "confirmed", "body": "Hi", "draft_token": "leak"},
        },
        own_device_id="desktop",
    )
    assert outcome == "skipped_invalid"
    outcome = pending_sync.apply_remote_pending_action(
        {
            "collection": "pending_actions",
            "record_id": "mail_reply:1",
            "device_id": "phone",
            "payload": {"status": "confirmed", "body": "Hi", "smtp_password": "x"},
        },
        own_device_id="desktop",
    )
    assert outcome == "skipped_invalid"


def test_apply_rejects_token_in_payload(mail_dir):
    outcome = pending_sync.apply_remote_pending_action(
        {
            "collection": "pending_actions",
            "record_id": "mail_reply:1",
            "device_id": "phone",
            "payload": {"status": "confirmed", "body": "Hi", "draft_token": "leak"},
        },
        own_device_id="desktop",
    )
    assert outcome == "skipped_invalid"


def test_apply_confirmed_drains_and_marks_sent(mail_dir):
    row = _candidate()
    rid = pending_sync.record_id_for(int(row["id"]))
    sent = {}

    def _draft(cid: int) -> dict:
        return {"draft_token": "local-only"}

    def _send(*, draft_token: str, subject: str, body: str) -> dict:
        sent["token"] = draft_token
        sent["body"] = body
        return {"ok": True}

    with (
        patch("mail_initiative.draft.create_draft", _draft),
        patch("mail_initiative.reply.send_reply", _send),
    ):
        outcome = pending_sync.apply_remote_pending_action(
            {
                "collection": "pending_actions",
                "record_id": rid,
                "device_id": "phone",
                "payload": {
                    "type": "mail_reply",
                    "status": "confirmed",
                    "subject": "Re: Lunch",
                    "body": "On my way.",
                },
            },
            own_device_id="desktop",
        )
    assert outcome == "applied"
    assert sent["token"] == "local-only"
    assert sent["body"] == "On my way."
    exported = pending_sync.export_pending_actions()
    tomb = [i for i in exported if i["record_id"] == rid]
    assert tomb and tomb[0]["deleted"] is True


def test_apply_thread_changed_sets_stale(mail_dir):
    row = _candidate()
    rid = pending_sync.record_id_for(int(row["id"]))

    def _draft(_cid: int) -> dict:
        return {"draft_token": "tok"}

    def _send(**_kwargs):
        raise SendRejected("thread_changed", 409)

    with (
        patch("mail_initiative.draft.create_draft", _draft),
        patch("mail_initiative.reply.send_reply", _send),
    ):
        outcome = pending_sync.apply_confirmed(record_id=rid, subject="Re: Lunch", body="Hi")
    assert outcome == "stale_thread"
    items = pending_sync.export_pending_actions()
    match = next(i for i in items if i["record_id"] == rid)
    assert match["payload"]["status"] == "stale_thread"
    assert match["payload"]["error_class"] == "thread_changed"


def test_apply_confirmed_is_idempotent_after_sent(mail_dir):
    row = _candidate()
    rid = pending_sync.record_id_for(int(row["id"]))
    sends = {"n": 0}

    def _draft(_cid: int) -> dict:
        return {"draft_token": "tok"}

    def _send(**_kwargs):
        sends["n"] += 1
        return {"ok": True}

    with (
        patch("mail_initiative.draft.create_draft", _draft),
        patch("mail_initiative.reply.send_reply", _send),
    ):
        first = pending_sync.apply_confirmed(record_id=rid, subject="Re: Lunch", body="Hi")
        second = pending_sync.apply_confirmed(record_id=rid, subject="Re: Lunch", body="Hi")
    assert first == "applied"
    assert second == "skipped_noop"
    assert sends["n"] == 1


def test_tombstone_then_clear_keeps_sent_acks(mail_dir):
    from mail_initiative import action_acks
    from mail_initiative.tombstone_clear import tombstone_then_clear_mail_replies

    row = _candidate()
    rid = pending_sync.record_id_for(int(row["id"]))
    tombstone_then_clear_mail_replies()
    assert store.list_candidates(limit=10, drafted_only=False) == []
    ack = action_acks.get_ack(rid)
    assert ack is not None
    assert ack["status"] == pending_sync.STATUS_SENT
    exported = pending_sync.export_pending_actions()
    assert any(item["record_id"] == rid and item.get("deleted") for item in exported)
