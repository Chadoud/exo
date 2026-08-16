"""Isolated send: capability token, locked To, MIME sanitize, complete thread tasks."""

from __future__ import annotations

from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from mail_initiative import store
from mail_initiative.draft import reply_subject
from mail_initiative.reply import sanitize_header
from telemetry.rate_limit_memory import reset


@pytest.fixture
def mail_dir(tmp_path, monkeypatch):
    monkeypatch.setenv("EXOSITES_DATA_DIR", str(tmp_path))
    monkeypatch.delenv("EXOSITES_DISABLE_GMAIL_READY_REPLIES", raising=False)
    reset()
    return tmp_path


@pytest.fixture
def client(mail_dir):
    from main import app

    return TestClient(app)


def _seed_token() -> tuple[int, str]:
    row = store.upsert_candidate(
        thread_id="thr-send",
        message_ids=["m1", "m2"],
        last_message_id="m2",
        from_name="Ada",
        from_email="ada@example.com",
        subject="Lunch?",
    )
    cid = int(row["id"])
    store.save_draft_token(
        token="cap-token-1",
        candidate_id=cid,
        thread_id="thr-send",
        in_reply_to="<mid@mail>",
        references_hdr="<mid@mail>",
        to_email="ada@example.com",
        to_name="Ada",
        last_message_id="m2",
        message_ids=["m1", "m2"],
    )
    return cid, "cap-token-1"


def _open_send(monkeypatch) -> None:
    monkeypatch.setattr("entitlement_gate.assert_may_use_proactive", lambda: None)
    monkeypatch.setattr("mail_initiative.settings.gated_reason", lambda: None)


def test_send_unknown_token_404(client, monkeypatch):
    _open_send(monkeypatch)
    res = client.post(
        "/mail/replies/send",
        json={"draft_token": "missing-token", "subject": "Re: Hi", "body": "Hello"},
    )
    assert res.status_code == 404


def test_send_rejects_client_to_cc_no_gmail(client, monkeypatch):
    _seed_token()
    _open_send(monkeypatch)
    with patch("mail_initiative.gmail_api.send_raw") as send_raw:
        res = client.post(
            "/mail/replies/send",
            json={
                "draft_token": "cap-token-1",
                "subject": "Re: Lunch?",
                "body": "See you.",
                "to": "attacker@evil.test",
                "cc": "cc@evil.test",
            },
        )
    assert res.status_code == 422
    send_raw.assert_not_called()


def test_send_rejects_crlf_subject(client, monkeypatch):
    _seed_token()
    _open_send(monkeypatch)
    with patch("mail_initiative.gmail_api.send_raw") as send_raw:
        res = client.post(
            "/mail/replies/send",
            json={
                "draft_token": "cap-token-1",
                "subject": "Hi\r\nBcc: evil@x.test",
                "body": "See you.",
            },
        )
    assert res.status_code == 422
    send_raw.assert_not_called()


def test_send_empty_body_422(client, monkeypatch):
    _seed_token()
    _open_send(monkeypatch)
    with patch("mail_initiative.gmail_api.send_raw") as send_raw:
        res = client.post(
            "/mail/replies/send",
            json={"draft_token": "cap-token-1", "subject": "Re: Lunch?", "body": "   "},
        )
    assert res.status_code == 422
    send_raw.assert_not_called()


def test_send_ok_deletes_candidate_and_completes_tasks(client, monkeypatch, tmp_path):
    _seed_token()
    _open_send(monkeypatch)
    monkeypatch.setenv("EXOSITES_DATA_DIR", str(tmp_path))

    import tasks_store

    t1 = tasks_store.create_task(
        "Reply to Ada",
        source="gmail",
        external_id="gmail:mail:m1",
    )
    t2 = tasks_store.create_task(
        "Follow up",
        source="gmail",
        external_id="gmail:mail:m2",
    )
    other = tasks_store.create_task(
        "Unrelated",
        source="gmail",
        external_id="gmail:mail:other",
    )
    assert t1 and t2 and other

    live = {
        "id": "thr-send",
        "messages": [{"id": "m1"}, {"id": "m2"}],
    }
    with (
        patch("mail_initiative.gmail_api.get_thread_metadata", return_value=live),
        patch("mail_initiative.gmail_api.send_raw", return_value="sent-1") as send_raw,
    ):
        res = client.post(
            "/mail/replies/send",
            json={"draft_token": "cap-token-1", "subject": "Re: Lunch?", "body": "See you then."},
        )
    assert res.status_code == 200, res.text
    assert res.json()["ok"] is True
    send_raw.assert_called_once()
    raw, thread_id = send_raw.call_args[0]
    assert thread_id == "thr-send"
    assert "ada@example.com" in __import__("base64").urlsafe_b64decode(raw + "==").decode()
    assert store.list_candidates() == []
    assert store.get_draft_token("cap-token-1") is None or store.get_draft_token("cap-token-1")["used"]
    assert tasks_store.get_task(int(t1["id"]))["completed"] is True
    assert tasks_store.get_task(int(t2["id"]))["completed"] is True
    assert tasks_store.get_task(int(other["id"]))["completed"] is False


def test_send_no_matching_tasks_is_noop(client, monkeypatch):
    _seed_token()
    _open_send(monkeypatch)
    live = {"id": "thr-send", "messages": [{"id": "m1"}, {"id": "m2"}]}
    with (
        patch("mail_initiative.gmail_api.get_thread_metadata", return_value=live),
        patch("mail_initiative.gmail_api.send_raw", return_value="sent-1"),
    ):
        res = client.post(
            "/mail/replies/send",
            json={"draft_token": "cap-token-1", "subject": "Re: Lunch?", "body": "Ok."},
        )
    assert res.status_code == 200
    assert res.json()["ok"] is True


def test_reused_token_409(client, monkeypatch):
    _seed_token()
    store.mark_token_used("cap-token-1")
    _open_send(monkeypatch)
    with patch("mail_initiative.gmail_api.send_raw") as send_raw:
        res = client.post(
            "/mail/replies/send",
            json={"draft_token": "cap-token-1", "subject": "Re: Lunch?", "body": "Ok."},
        )
    assert res.status_code == 409
    send_raw.assert_not_called()


def test_sanitize_header_strips_crlf():
    assert "\n" not in sanitize_header("Hi\r\nBcc: x")
    assert sanitize_header("Hi\0there") == "Hithere"


def test_reply_subject_helper():
    assert reply_subject("Lunch") == "Re: Lunch"
    assert reply_subject("Re: Lunch") == "Re: Lunch"
    assert reply_subject("AW: Hallo") == "AW: Hallo"
