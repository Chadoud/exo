"""Heuristic unanswered-thread harvest, then background compose for ready cards."""

from __future__ import annotations

import email.utils
import logging
import re
from collections import Counter
from datetime import UTC, datetime, timedelta
from typing import Any, Callable

from mail_initiative import store
from mail_initiative.gmail_api import HarvestRateLimited
from mail_initiative.reply_needed import header_skip_reason
from mail_initiative.settings import gated_reason
from signal_quality import SignalTier, evaluate_gmail_message

logger = logging.getLogger(__name__)

_WINDOW_DAYS = 7
_LIST_MAX = 8
_THREAD_GET_MAX = 8
_CARD_CAP = 3
_HARVEST_INTERVAL = timedelta(minutes=30)
# Keep promo/social/forums/spam out. Do not exclude Updates — first-time
# personal senders often land there, and that is who ready-replies is for.
_QUERY = (
    f"in:inbox newer_than:{_WINDOW_DAYS}d "
    "-category:promotions -category:social -category:forums -in:spam"
)
_NO_REPLY = re.compile(
    r"(^|\b)(no[-_.]?reply|noreply|donotreply|mailer-daemon)@",
    re.IGNORECASE,
)
_LIST_HEADERS = frozenset(
    {"list-unsubscribe", "list-unsubscribe-post", "list-id"}
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


def _thread_to_candidate(
    thread: dict[str, Any], self_email: str
) -> tuple[dict[str, Any] | None, str | None]:
    messages = thread.get("messages") or []
    if not messages:
        return None, "empty"
    last = messages[-1] if isinstance(messages[-1], dict) else None
    if not last:
        return None, "empty"
    headers = _header_map(last)
    from_name, from_email = _parse_from(headers.get("From") or headers.get("from") or "")
    if _is_self(from_email, self_email):
        return None, "self"
    reply_to = _parse_from(headers.get("Reply-To") or headers.get("reply-to") or "")[1]
    to_email = reply_to or from_email
    if not to_email:
        return None, "no_to"
    if _NO_REPLY.search(from_email) or _NO_REPLY.search(to_email):
        return None, "noreply"
    header_keys = {name.lower() for name in headers}
    if header_keys & _LIST_HEADERS:
        return None, "list"
    labels = last.get("labelIds") if isinstance(last.get("labelIds"), list) else []
    snippet = str(last.get("snippet") or thread.get("snippet") or "")
    subject = str(headers.get("Subject") or headers.get("subject") or "")
    verdict = evaluate_gmail_message(
        label_ids=[str(x) for x in labels],
        from_addr=from_email,
        subject=subject,
        snippet=snippet,
        headers=headers,
    )
    if verdict.tier != SignalTier.ALLOW:
        return None, "signal"
    auto_skip = header_skip_reason(
        from_addr=from_email,
        to_addr=to_email,
        headers=headers,
    )
    if auto_skip:
        return None, auto_skip
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
        "subject": subject,
    }, None


def _safe_profile(profile_fn: Callable[[], str]) -> str:
    try:
        return (profile_fn() or "").strip()
    except Exception:
        return ""


def run_harvest(
    *,
    now: datetime | None = None,
    list_ids: Callable[[str, int], list[str]] | None = None,
    get_meta: Callable[[str], dict[str, Any]] | None = None,
    get_full: Callable[[str], dict[str, Any]] | None = None,
    compose: Callable[[str, str], tuple[str, str]] | None = None,
    profile: Callable[[], str] | None = None,
    force: bool = False,
) -> dict[str, Any]:
    """Scan recent inbox threads, then compose replies. Zero Gmail/LLM when gated."""
    from mail_initiative import gmail_api
    from mail_initiative.pre_draft import fill_drafts

    profile_fn = profile or gmail_api.profile_email
    if store.drop_stale_mailbox(_safe_profile(profile_fn)):
        logger.info("mail reply harvest dropped cards after mailbox change")

    reason = gated_reason()
    if reason:
        if reason == "no_scope" and store.last_harvest_at() is not None:
            store.replace_candidates([])
        return _harvest_result(0, reason)

    now = now or datetime.now(UTC)
    last = store.last_harvest_at()
    if not force and last is not None and (now - last) < _HARVEST_INTERVAL:
        return _harvest_result(0, "interval")

    list_fn = list_ids or gmail_api.list_thread_ids
    meta_fn = get_meta or gmail_api.get_thread_metadata
    full_fn = get_full or gmail_api.get_thread_full

    found: list[dict[str, Any]] = []
    drops: Counter[str] = Counter()
    listed = 0
    scanned_ids: set[str] = set()
    try:
        self_email = profile_fn()
        ids = list_fn(_QUERY, _LIST_MAX)
        listed = len(ids)
        for thread_id in ids[:_THREAD_GET_MAX]:
            if len(found) >= _CARD_CAP:
                break
            if store.is_dismissed(thread_id, now=now):
                drops["dismissed"] += 1
                continue
            thread = meta_fn(thread_id)
            scanned_ids.add(thread_id)
            cand, skip = _thread_to_candidate(thread, self_email)
            if skip or not cand or not cand.get("thread_id"):
                drops[skip or "empty"] += 1
                continue
            cand["_meta"] = thread
            found.append(cand)
    except HarvestRateLimited:
        store.set_last_harvest_at(now)
        return _harvest_result(0, "rate_limited", listed=listed, drops=drops)
    except Exception:
        logger.exception("gmail ready-reply harvest failed")
        store.set_last_harvest_at(now)
        return _harvest_result(0, "error", ok=False, listed=listed, drops=drops)

    existing = {str(c["thread_id"]): c for c in store.list_candidates(limit=20)}
    try:
        drafted, draft_drops = fill_drafts(
            found[:_CARD_CAP], existing=existing, get_full=full_fn, compose=compose
        )
        drops.update(draft_drops)
    except HarvestRateLimited:
        store.set_last_harvest_at(now)
        return _harvest_result(0, "rate_limited", listed=listed, found=len(found), drops=drops)
    except Exception:
        logger.exception("gmail ready-reply pre-draft failed")
        store.set_last_harvest_at(now)
        return _harvest_result(0, "error", ok=False, listed=listed, found=len(found), drops=drops)

    keep = _keep_with_unscanned(drafted[:_CARD_CAP], existing, scanned_ids)
    store.replace_candidates(keep)
    store.set_last_harvest_at(now)
    created = min(len(drafted), _CARD_CAP)
    logger.info(
        "mail reply harvest listed=%s scanned=%s found=%s drafted=%s created=%s skipped=%s drops=%s",
        listed,
        len(scanned_ids),
        len(found),
        len(drafted),
        created,
        None,
        dict(drops),
    )
    return _harvest_result(
        created, None, listed=listed, found=len(found), drafted=len(drafted), drops=drops
    )


def _keep_with_unscanned(
    drafted: list[dict[str, Any]],
    existing: dict[str, dict[str, Any]],
    scanned_ids: set[str],
) -> list[dict[str, Any]]:
    """Prefer this tick's drafts; keep earlier cards we did not re-check (list cap)."""
    keep = list(drafted)
    have = {str(c.get("thread_id") or "") for c in keep}
    for thread_id, row in existing.items():
        if len(keep) >= _CARD_CAP:
            break
        if thread_id in scanned_ids or thread_id in have:
            continue
        if not str(row.get("draft_body") or "").strip():
            continue
        keep.append(row)
        have.add(thread_id)
    return keep


def _harvest_result(
    created: int,
    skipped: str | None,
    *,
    ok: bool = True,
    listed: int = 0,
    found: int = 0,
    drafted: int = 0,
    drops: Counter[str] | None = None,
) -> dict[str, Any]:
    drop_map = dict(drops or {})
    if skipped:
        logger.info(
            "mail reply harvest listed=%s found=%s drafted=%s created=%s skipped=%s drops=%s",
            listed,
            found,
            drafted,
            created,
            skipped,
            drop_map,
        )
    return {
        "ok": ok,
        "created": created,
        "skipped": skipped,
        "listed": listed,
        "found": found,
        "drafted": drafted,
        "drops": drop_map,
    }
