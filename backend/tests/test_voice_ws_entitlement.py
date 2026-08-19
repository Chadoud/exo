"""Voice HTTP/WS refuse unpaid sessions after the trial ends."""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from starlette.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

import main
from entitlement_constants import FREE_TRIAL_DAYS
from voice.ws_entitlement import VOICE_WS_PAYMENT_REQUIRED

TOKEN = "voice-ws-test-token"


def _write_expired_trial(user_data: Path) -> None:
    started = datetime.now(timezone.utc) - timedelta(days=FREE_TRIAL_DAYS + 1)
    ends = started + timedelta(days=FREE_TRIAL_DAYS)
    (user_data / "trial.json").write_text(
        json.dumps(
            {
                "v": 1,
                "trialStartedAt": started.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z",
                "trialEndsAt": ends.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z",
                "source": "test",
            }
        ),
        encoding="utf-8",
    )


@pytest.fixture
def unpaid_client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.delenv("EXOSITES_INSECURE_LOCAL", raising=False)
    monkeypatch.delenv("EXOSITES_DEV_BYPASS_ENTITLEMENT", raising=False)
    monkeypatch.setenv("NODE_ENV", "production")
    monkeypatch.setenv("EXOSITES_APP_TOKEN", TOKEN)
    monkeypatch.setenv("EXOSITES_USER_DATA", str(tmp_path))
    _write_expired_trial(tmp_path)
    return TestClient(main.app)


def test_voice_ws_closes_unpaid_after_auth(unpaid_client: TestClient) -> None:
    with unpaid_client.websocket_connect(
        "/ws/voice",
        headers={"X-App-Token": TOKEN},
    ) as ws:
        first = ws.receive_text()
        payload = json.loads(first)
        assert payload.get("type") == "error"
        assert payload.get("message") == "trial_expired"
        with pytest.raises(WebSocketDisconnect) as exc:
            ws.receive_text()
    assert exc.value.code == VOICE_WS_PAYMENT_REQUIRED


def test_voice_session_prime_returns_402(unpaid_client: TestClient) -> None:
    res = unpaid_client.post(
        "/voice/session-prime",
        headers={"X-App-Token": TOKEN, "Content-Type": "application/json"},
        json={"session_id": "sess-1"},
    )
    assert res.status_code == 402


def test_voice_ws_ticket_returns_402(unpaid_client: TestClient) -> None:
    res = unpaid_client.post("/voice/ws-ticket", headers={"X-App-Token": TOKEN})
    assert res.status_code == 402
