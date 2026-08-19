"""Safety: not a tool, not initiative/nudges; wipe + disconnect + sort-only token."""

from __future__ import annotations

from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from mail_initiative import store
from orchestrator.initiative import suggest
from orchestrator.policy import AutonomyPolicy
from privacy_wipe import wipe_local_user_data
from telemetry.rate_limit_memory import reset


@pytest.fixture
def mail_dir(tmp_path, monkeypatch):
    monkeypatch.setenv("EXOSITES_DATA_DIR", str(tmp_path))
    monkeypatch.delenv("EXOSITES_DISABLE_GMAIL_READY_REPLIES", raising=False)
    reset()
    return tmp_path


def test_no_reply_mail_tool() -> None:
    from tool_registry.declarations import integrations

    blob = str(integrations.__dict__)
    assert "reply_mail" not in blob
    from actions import google_workspace_tool

    assert "reply_mail" not in google_workspace_tool._OPERATIONS


def test_initiative_suggest_never_includes_mail_reply() -> None:
    items = suggest(world={"memory": {"recent_failures": []}}, policy=AutonomyPolicy())
    assert all("mail" not in (s.tool or "") for s in items)
    assert all("reply" not in s.title.lower() or "failed" in s.title.lower() for s in items)


def test_sort_only_token_is_noop(mail_dir, monkeypatch):
    monkeypatch.setattr("entitlement_gate.may_use_proactive", lambda: (True, None))
    monkeypatch.setattr("mail_initiative.settings._has_gmail_token", lambda: True)
    monkeypatch.setattr("mail_initiative.gmail_api.token_has_send_scope", lambda: False)
    called = {"n": 0}
    from mail_initiative.harvest import run_harvest

    out = run_harvest(
        list_ids=lambda *_a: called.__setitem__("n", called["n"] + 1) or [],
        get_meta=lambda _t: {},
        profile=lambda: "me@x.com",
        force=True,
    )
    assert out["skipped"] == "no_scope"
    assert called["n"] == 0


def test_wipe_clears_mail_replies(mail_dir):
    store.upsert_candidate(
        thread_id="thr-w",
        message_ids=["m1"],
        last_message_id="m1",
        from_name="Ada",
        from_email="ada@example.com",
        subject="Hi",
    )
    assert store.list_candidates()
    with (
        patch("assistant_memory.clear_all_memory"),
        patch("conversation_store.clear_all_conversations", return_value=0),
        patch("tasks_store.clear_all_tasks", return_value=0),
        patch("activity_store.clear_activity"),
        patch("orchestrator.audit.clear_all"),
        patch("orchestrator.memory.clear_all"),
        patch("orchestrator.skills.clear_all"),
        patch("meeting_store.clear_all_active_meetings", return_value=0),
        patch("whatsapp_event_store.clear_events_for_tests"),
        patch("connector_credentials.clear_all_tokens"),
    ):
        result = wipe_local_user_data()
    assert result["ok"] is True
    assert store.list_candidates() == []


def test_gmail_disconnect_clears_store(mail_dir):
    store.upsert_candidate(
        thread_id="thr-d",
        message_ids=["m1"],
        last_message_id="m1",
        from_name="Ada",
        from_email="ada@example.com",
        subject="Hi",
    )
    import tasks_store

    harvested = tasks_store.create_task(
        "Follow up with Alice",
        source="gmail",
        external_id="gmail:mail:disconnect-1",
    )
    typed = tasks_store.create_task("Buy milk", source="manual")
    from main import app

    client = TestClient(app)
    with patch("routes.gmail_routes.delete_gmail_token_file"):
        res = client.delete("/gmail/oauth")
    assert res.status_code == 200
    assert store.list_candidates() == []
    assert tasks_store.get_task(harvested["id"]) is None
    assert tasks_store.get_task(typed["id"]) is not None


def test_clear_endpoint_drops_token_and_store(mail_dir):
    from connector_credentials import CredentialUnavailableError, store_token, try_get_token

    store_token("google-gmail", "tok", 3600)
    store.upsert_candidate(
        thread_id="thr-c",
        message_ids=["m1"],
        last_message_id="m1",
        from_name="Ada",
        from_email="ada@example.com",
        subject="Hi",
    )
    from main import app

    res = TestClient(app).post("/mail/replies/clear")
    assert res.status_code == 200
    assert store.list_candidates() == []
    with pytest.raises(CredentialUnavailableError):
        try_get_token("google-gmail")
