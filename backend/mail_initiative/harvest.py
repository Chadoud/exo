"""Heuristic unanswered-thread harvest. Metadata only — no mail body, no LLM."""

from __future__ import annotations

import email.utils
import logging
import re
from datetime import UTC, datetime, timedelta
from typing import Any, Callable

from mail_initiative import store
from mail_initiative.gmail_api import HarvestRateLimited
from mail_initiative.settings import gated_reason
from signal_quality import GMAIL_NOISE_QUERY_EXCLUSIONS, SignalTier, evaluate_gmail_message

logger = logging.getLogger(__name__)

_WINDOW_DAYS = 7
_LIST_MAX = 8
_THREAD_GET_MAX = 5
_CARD_CAP = 3
_HARVEST_INTERVAL = timedelta(minutes=30)
_QUERY = f"in:inbox newer_than:{_WINDOW_DAYS}d {GMAIL_NOISE_QUERY_EXCLUSIONS}"
_NO_REPLY = re.compile(
    r"(^|\b)(no[-_.]?reply|noreply|donotreply|mailer-daemon)@",
    re.IGNORECASE,
)


def _header_map(message: dict[str, Any]) -> dict[str, str]:
    headers = (message.get("payload") or {}).get("headers") or []
    out: dict[str, str] = {}
    for item in headers:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or "")
        if name:
            out[name] = str(item.get("value") or "")
    return out


def _parse_from(raw: str) -> tuple[str, str]:
    name, addr = email.utils.parseaddr(raw or "")
    return name.strip(), addr.strip().lower()


def _is_self(addr: str, self_email: str) -> bool:
    return bool(addr) and bool(self_email) and addr.lower() == self_email.lower()


def _thread_to_candidate(thread: dict[str, Any], self_email: str) -> dict[str, Any] | None:
    messages = thread.get("messages") or []
    if not messages:
        return None
    last = messages[-1] if isinstance(messages[-1], dict) else None
    if not last:
        return None
    headers = _header_map(last)
    from_name, from_email = _parse_from(headers.get("From") or headers.get("from") or "")
    if _is_self(from_email, self_email):
        return None
    reply_to = _parse_from(headers.get("Reply-To") or headers.get("reply-to") or "")[1]
    to_email = reply_to or from_email
    if not to_email:
        return None
    if _NO_REPLY.search(from_email) or _NO_REPLY.search(to_email):
        return None
    labels = last.get("labelIds") if isinstance(last.get("labelIds"), list) else []
    verdict = evaluate_gmail_message(
        label_ids=[str(x) for x in labels],
        from_addr=from_email,
        subject=str(headers.get("Subject") or headers.get("subject") or ""),
        snippet="",
        headers=headers,
    )
    if verdict.tier != SignalTier.ALLOW:
        return None
    message_ids = [str(m.get("id") or "") for m in messages if isinstance(m, dict) and m.get("id")]
    last_id = str(last.get("id") or "")
    to_name = from_name
    if reply_to and reply_to != from_email:
        to_name, to_email = _parse_from(headers.get("Reply-To") or "")
        to_email = to_email or reply_to
    return {
        "thread_id": str(thread.get("id") or ""),
        "message_ids": [m for m in message_ids if m],
        "last_message_id": last_id,
        "from_name": to_name,
        "from_email": to_email,
        "subject": str(headers.get("Subject") or headers.get("subject") or ""),
    }


def run_harvest(
    *,
    now: datetime | None = None,
    list_ids: Callable[[str, int], list[str]] | None = None,
    get_meta: Callable[[str], dict[str, Any]] | None = None,
    profile: Callable[[], str] | None = None,
    force: bool = False,
) -> dict[str, Any]:
    """Scan recent inbox threads. Zero Gmail calls when gated."""
    from mail_initiative import gmail_api

    reason = gated_reason()
    if reason:
        if reason == "no_scope" and store.last_harvest_at() is not None:
            store.replace_candidates([])
        return {"ok": True, "created": 0, "skipped": reason}

    now = now or datetime.now(UTC)
    last = store.last_harvest_at()
    if not force and last is not None and (now - last) < _HARVEST_INTERVAL:
        return {"ok": True, "created": 0, "skipped": "interval"}

    list_fn = list_ids or gmail_api.list_thread_ids
    meta_fn = get_meta or gmail_api.get_thread_metadata
    profile_fn = profile or gmail_api.profile_email

    found: list[dict[str, Any]] = []
    try:
        self_email = profile_fn()
        ids = list_fn(_QUERY, _LIST_MAX)
        for thread_id in ids[:_THREAD_GET_MAX]:
            if len(found) >= _CARD_CAP:
                break
            if store.is_dismissed(thread_id, now=now):
                continue
            thread = meta_fn(thread_id)
            cand = _thread_to_candidate(thread, self_email)
            if cand and cand.get("thread_id"):
                found.append(cand)
    except HarvestRateLimited:
        store.set_last_harvest_at(now)
        return {"ok": True, "created": 0, "skipped": "rate_limited"}
    except Exception:
        logger.exception("gmail ready-reply harvest failed")
        store.set_last_harvest_at(now)
        return {"ok": False, "created": 0, "skipped": "error"}

    store.replace_candidates(found[:_CARD_CAP])
    store.set_last_harvest_at(now)
    return {"ok": True, "created": min(len(found), _CARD_CAP), "skipped": None}
