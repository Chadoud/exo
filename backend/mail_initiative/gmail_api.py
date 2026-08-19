"""Gmail HTTP helpers for ready-replies. Connector token only — never sort OAuth."""

from __future__ import annotations

import logging
from typing import Any

import httpx

from connector_credentials import try_get_token

logger = logging.getLogger(__name__)

GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me"
_TOKEN_IDS = ("google-gmail", "google")
_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send"
# List-* is how newsletters prove they are list mail. Without these, metadata
# harvest only sees the subject and drafts a "reply" to Super/Paléo blasts.
_META_HEADERS = (
    "From",
    "To",
    "Reply-To",
    "Subject",
    "Date",
    "Message-ID",
    "References",
    "In-Reply-To",
    "List-Unsubscribe",
    "List-Unsubscribe-Post",
    "List-Id",
    "Precedence",
)


class HarvestRateLimited(Exception):
    """Gmail returned HTTP 429 — abort the rest of this tick."""


def _headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {try_get_token(*_TOKEN_IDS)}"}


def token_has_send_scope() -> bool:
    """Inspect the access token. Unreachable tokeninfo → assume send (Electron grants it)."""
    try:
        token = try_get_token(*_TOKEN_IDS)
    except Exception:
        return False
    try:
        res = httpx.get(
            "https://oauth2.googleapis.com/tokeninfo",
            params={"access_token": token},
            timeout=8,
        )
        if res.status_code >= 400:
            return True
        scopes = str(res.json().get("scope") or "")
        return _SEND_SCOPE in scopes.split()
    except httpx.HTTPError:
        return True


def profile_email() -> str:
    res = httpx.get(f"{GMAIL_BASE}/profile", headers=_headers(), timeout=10)
    if res.status_code == 429:
        raise HarvestRateLimited()
    res.raise_for_status()
    return str(res.json().get("emailAddress") or "").strip()


def list_thread_ids(query: str, max_results: int = 8) -> list[str]:
    res = httpx.get(
        f"{GMAIL_BASE}/threads",
        headers=_headers(),
        params={"q": query, "maxResults": max_results},
        timeout=15,
    )
    if res.status_code == 429:
        raise HarvestRateLimited()
    res.raise_for_status()
    return [str(t["id"]) for t in res.json().get("threads") or [] if t.get("id")]


def get_thread_metadata(thread_id: str) -> dict[str, Any]:
    # Repeated keys: a single joined metadataHeaders value returns no headers.
    params: list[tuple[str, str]] = [("format", "metadata")]
    params.extend(("metadataHeaders", name) for name in _META_HEADERS)
    res = httpx.get(
        f"{GMAIL_BASE}/threads/{thread_id}",
        headers=_headers(),
        params=params,
        timeout=15,
    )
    if res.status_code == 429:
        raise HarvestRateLimited()
    res.raise_for_status()
    return res.json()


def get_thread_full(thread_id: str) -> dict[str, Any]:
    res = httpx.get(
        f"{GMAIL_BASE}/threads/{thread_id}",
        headers=_headers(),
        params={"format": "full"},
        timeout=20,
    )
    if res.status_code == 429:
        raise HarvestRateLimited()
    res.raise_for_status()
    return res.json()


def send_raw(raw: str, thread_id: str) -> str:
    res = httpx.post(
        f"{GMAIL_BASE}/messages/send",
        headers={**_headers(), "Content-Type": "application/json"},
        json={"raw": raw, "threadId": thread_id},
        timeout=20,
    )
    res.raise_for_status()
    return str(res.json().get("id") or "")
