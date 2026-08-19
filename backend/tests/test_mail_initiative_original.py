"""Last-inbound extract: last message plain only, cap, no HTML fallback."""

from __future__ import annotations

import base64

from mail_initiative.original import last_inbound_plain, read_original


def _plain(text: str) -> str:
    return base64.urlsafe_b64encode(text.encode()).decode().rstrip("=")


def test_last_inbound_uses_last_message_plain_only():
    thread = {
        "messages": [
            {
                "id": "old",
                "payload": {
                    "mimeType": "text/plain",
                    "body": {"data": _plain("Earlier note that must not appear.")},
                },
            },
            {
                "id": "new",
                "payload": {
                    "mimeType": "multipart/alternative",
                    "parts": [
                        {
                            "mimeType": "text/plain",
                            "body": {"data": _plain("Are you free Thursday at 3?")},
                        },
                        {
                            "mimeType": "text/html",
                            "body": {"data": _plain("<b>HTML must not win</b>")},
                        },
                    ],
                },
            },
        ]
    }
    text, truncated = last_inbound_plain(thread)
    assert text == "Are you free Thursday at 3?"
    assert truncated is False
    assert "Earlier" not in text
    assert "HTML" not in text


def test_last_inbound_empty_when_html_only():
    thread = {
        "messages": [
            {
                "id": "m1",
                "payload": {
                    "mimeType": "text/html",
                    "body": {"data": _plain("<p>no plain</p>")},
                },
            }
        ]
    }
    text, truncated = last_inbound_plain(thread)
    assert text == ""
    assert truncated is False


def test_read_original_not_found(tmp_path, monkeypatch):
    monkeypatch.setenv("EXOSITES_DATA_DIR", str(tmp_path))
    try:
        read_original(999)
    except LookupError as exc:
        assert str(exc) == "not_found"
    else:
        raise AssertionError("expected not_found")
