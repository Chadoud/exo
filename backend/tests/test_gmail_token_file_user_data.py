"""Gmail token file resolution under Electron userData."""

from __future__ import annotations

from pathlib import Path

import pytest

import gmail_google_oauth as g


def test_gmail_token_file_prefers_exosites_user_data(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("EXOSITES_USER_DATA", str(tmp_path))
    assert g.gmail_token_file() == tmp_path / "gmail_oauth.json"


def test_gmail_token_file_falls_back_to_app_state_dir(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("EXOSITES_USER_DATA", raising=False)
    monkeypatch.setattr(g, "APP_STATE_DIR", tmp_path)
    assert g.gmail_token_file() == tmp_path / "gmail_oauth.json"


def test_is_gmail_connected_reads_materialized_file(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("EXOSITES_USER_DATA", str(tmp_path))
    (tmp_path / "gmail_oauth.json").write_text('{"refresh_token": "rt"}', encoding="utf-8")
    assert g.is_gmail_connected() is True
    assert (tmp_path / "gmail_oauth.json").is_file()


def test_module_does_not_register_atexit_token_wipe() -> None:
    assert not hasattr(g, "_register_gmail_mirror_atexit")


def test_get_valid_access_token_uses_relay_cache_when_file_missing(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("EXOSITES_USER_DATA", str(tmp_path))
    import connector_credentials as creds

    creds.clear_all_tokens()
    creds.store_token("google-gmail", "relayed-access", expires_in=3600)
    try:
        assert g.get_valid_access_token() == "relayed-access"
    finally:
        creds.clear_all_tokens()


def test_is_gmail_connected_when_only_relay_cache_has_token(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("EXOSITES_USER_DATA", str(tmp_path))
    import connector_credentials as creds

    creds.clear_all_tokens()
    creds.store_token("google-gmail", "relayed-access", expires_in=3600)
    try:
        assert g.is_gmail_connected() is True
    finally:
        creds.clear_all_tokens()
