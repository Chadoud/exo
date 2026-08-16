"""Dedicated mail-reply HTTP: list, settings, draft, dismiss, auth."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from mail_initiative import store
from telemetry.rate_limit_memory import reset

TOKEN = "mail-reply-auth-token"


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


def _seed() -> int:
    row = store.upsert_candidate(
        thread_id="thr-1",
        message_ids=["mid-a", "mid-b"],
        last_message_id="mid-b",
        from_name="Ada",
        from_email="ada@example.com",
        subject="Lunch?",
    )
    return int(row["id"])


def test_list_quiet_when_gated(client, monkeypatch):
    _seed()
    monkeypatch.setattr("mail_initiative.settings.gated_reason", lambda: "pro")
    res = client.get("/mail/replies")
    assert res.status_code == 200
    body = res.json()
    assert body["items"] == []
    assert body["gated_reason"] == "pro"
    assert "thread_id" not in res.text
    assert "thr-1" not in res.text


def test_list_returns_opaque_ids(client, monkeypatch):
    cid = _seed()
    monkeypatch.setattr("mail_initiative.settings.gated_reason", lambda: None)
    monkeypatch.setattr("mail_initiative.settings.has_send_scope", lambda: True)
    monkeypatch.setattr("mail_initiative.settings.is_enabled", lambda: True)
    res = client.get("/mail/replies")
    assert res.status_code == 200
    items = res.json()["items"]
    assert len(items) == 1
    assert items[0]["id"] == cid
    assert items[0]["from_local_part"] == "ada"
    assert items[0]["from_name"] == "Ada"
    assert "thread" not in items[0]


def test_settings_unset_is_on(client):
    res = client.get("/mail/replies/settings")
    assert res.status_code == 200
    assert res.json()["enabled"] is True
    off = client.patch("/mail/replies/settings", json={"enabled": False})
    assert off.json()["enabled"] is False
    assert client.get("/mail/replies/settings").json()["enabled"] is False


def test_dismiss_revokes_token(client):
    cid = _seed()
    store.save_draft_token(
        token="live-tok",
        candidate_id=cid,
        thread_id="thr-1",
        in_reply_to="",
        references_hdr="",
        to_email="ada@example.com",
        to_name="Ada",
        last_message_id="mid-b",
        message_ids=["mid-a", "mid-b"],
    )
    res = client.post(f"/mail/replies/{cid}/dismiss")
    assert res.status_code == 200
    assert store.get_candidate(cid) is None
    assert store.get_draft_token("live-tok") is None
    assert store.is_dismissed("thr-1")


def test_draft_requires_pro(client, monkeypatch):
    cid = _seed()
    monkeypatch.setattr(
        "entitlement_gate.assert_may_use_proactive",
        lambda: (_ for _ in ()).throw(
            __import__("fastapi").HTTPException(status_code=402, detail="trial_expired")
        ),
    )
    res = client.post(f"/mail/replies/{cid}/draft")
    assert res.status_code == 402


def test_draft_issues_token(client, monkeypatch):
    cid = _seed()
    monkeypatch.setattr("entitlement_gate.assert_may_use_proactive", lambda: None)
    monkeypatch.setattr("mail_initiative.settings.gated_reason", lambda: None)
    monkeypatch.setattr(
        "mail_initiative.draft.create_draft",
        lambda _id: {
            "draft_token": "tok-abc",
            "to_name": "Ada",
            "to_email": "ada@example.com",
            "subject": "Re: Lunch?",
            "body": "See you then.",
        },
    )
    res = client.post(f"/mail/replies/{cid}/draft")
    assert res.status_code == 200
    assert res.json()["draft_token"] == "tok-abc"
    assert res.json()["body"] == "See you then."


def test_mail_replies_require_app_token(mail_dir, monkeypatch):
    monkeypatch.setenv("EXOSITES_APP_TOKEN", TOKEN)
    monkeypatch.delenv("EXOSITES_INSECURE_LOCAL", raising=False)
    from main import app

    raw = TestClient(app, raise_server_exceptions=False)
    assert raw.get("/mail/replies").status_code == 401
    ok = raw.get("/mail/replies", headers={"X-App-Token": TOKEN})
    assert ok.status_code != 401
