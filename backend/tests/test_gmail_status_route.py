"""Regression: GET /gmail/status must not raise (redirect_uri ordering)."""

from __future__ import annotations

from unittest.mock import MagicMock

import httpx
from fastapi import FastAPI
from fastapi.testclient import TestClient

from routes.gmail_routes import _gmail_profile_probe, create_gmail_router


def test_gmail_status_returns_json_without_error():
    app = FastAPI()
    app.include_router(create_gmail_router())
    client = TestClient(app)
    response = client.get("/gmail/status")
    assert response.status_code == 200
    data = response.json()
    assert "oauth_configured" in data
    assert "oauth_flow_active" in data
    assert data["oauth_flow_active"] is False
    assert "oauth_flow_error" in data
    assert "gmail_oauth_redirect_uri" in data
    assert isinstance(data.get("developer_setup_steps"), list)
    assert len(data["developer_setup_steps"]) == 5
    assert isinstance(data.get("gmail_import_max_messages"), int)
    assert data["gmail_import_max_messages"] >= 1
    assert data.get("email") is None


def test_gmail_status_includes_profile_email_when_connected(monkeypatch):
    from routes import gmail_routes

    monkeypatch.setattr(gmail_routes, "is_gmail_connected", lambda: True)
    monkeypatch.setattr(gmail_routes, "get_valid_access_token", lambda: "tok")
    monkeypatch.setattr(
        gmail_routes,
        "_gmail_profile_probe",
        lambda _token: (True, "you@gmail.com"),
    )

    app = FastAPI()
    app.include_router(create_gmail_router())
    client = TestClient(app)
    data = client.get("/gmail/status").json()
    assert data["connected"] is True
    assert data["email"] == "you@gmail.com"


def test_gmail_profile_probe_reads_email(monkeypatch):
    response = MagicMock()
    response.status_code = 200
    response.json.return_value = {"emailAddress": "you@gmail.com"}
    client = MagicMock()
    client.get.return_value = response
    client.__enter__.return_value = client
    client.__exit__.return_value = False
    monkeypatch.setattr(httpx, "Client", lambda **_kwargs: client)
    ok, email = _gmail_profile_probe("tok")
    assert ok is True
    assert email == "you@gmail.com"
