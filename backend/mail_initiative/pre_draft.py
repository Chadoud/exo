"""Background compose after metadata harvest. No send token. No inbound body at rest."""

from __future__ import annotations

import email.utils
import logging
from typing import Any, Callable

from mail_initiative.draft import compose_reply, last_message_plain_text, thread_plain_text
from mail_initiative.gmail_api import HarvestRateLimited
from mail_initiative.reply_needed import skip_reason_for_draft
from signal_quality import SignalTier, evaluate_gmail_message

logger = logging.getLogger(__name__)

_SNIPPET_HEAD = 200
_SNIPPET_TAIL = 200
_MIN_THREAD_CHARS = 40


def _signal_snippet(text: str) -> str:
    """Head + footer — list-mail cues (unsubscribe) live at the bottom."""
    body = text.strip()
    if len(body) <= _SNIPPET_HEAD + _SNIPPET_TAIL:
        return body
    return f"{body[:_SNIPPET_HEAD]}\n{body[-_SNIPPET_TAIL:]}"


def _last_message(thread: dict[str, Any]) -> dict[str, Any] | None:
    messages = [m for m in (thread.get("messages") or []) if isinstance(m, dict)]
    return messages[-1] if messages else None


def _header_map(message: dict[str, Any]) -> dict[str, str]:
    headers = (message.get("payload") or {}).get("headers") or []
    out: dict[str, str] = {}
    for item in headers:
        if isinstance(item, dict) and item.get("name"):
            out[str(item["name"])] = str(item.get("value") or "")
    return out


def _addr(headers: dict[str, str], *names: str) -> str:
    for name in names:
        _, addr = email.utils.parseaddr(headers.get(name) or "")
        if addr.strip():
            return addr.strip().lower()
    return ""


def _drop_reason(
    cand: dict[str, Any], thread: dict[str, Any], snippet: str, last_text: str
) -> str | None:
    last = _last_message(thread)
    labels = last.get("labelIds") if last and isinstance(last.get("labelIds"), list) else []
    headers = _header_map(last) if last else {}
    from_addr = _addr(headers, "From", "from") or str(cand.get("from_email") or "")
    to_addr = _addr(headers, "Reply-To", "reply-to") or from_addr
    subject = str(cand.get("subject") or "")
    verdict = evaluate_gmail_message(
        label_ids=[str(x) for x in labels],
        from_addr=from_addr,
        subject=subject,
        snippet=snippet,
        headers=headers,
    )
    if verdict.tier != SignalTier.ALLOW:
        return "signal"
    return skip_reason_for_draft(
        from_addr=from_addr,
        to_addr=to_addr,
        subject=subject,
        text=last_text,
        headers=headers,
    )


def fill_drafts(
    found: list[dict[str, Any]],
    *,
    existing: dict[str, dict[str, Any]],
    get_full: Callable[[str], dict[str, Any]],
    compose: Callable[[str, str], tuple[str, str]] | None = None,
) -> tuple[list[dict[str, Any]], dict[str, int]]:
    """Attach a saved reply to each metadata candidate, or drop it."""
    compose_fn = compose or compose_reply
    ready: list[dict[str, Any]] = []
    drops: dict[str, int] = {}
    for cand in found:
        thread_id = str(cand.get("thread_id") or "")
        last_id = str(cand.get("last_message_id") or "")
        prior = existing.get(thread_id)
        if (
            prior
            and str(prior.get("last_message_id") or "") == last_id
            and str(prior.get("draft_body") or "").strip()
        ):
            meta = cand.get("_meta")
            if isinstance(meta, dict):
                last = _last_message(meta)
                snippet = str((last or {}).get("snippet") or meta.get("snippet") or "")
                reason = _drop_reason(cand, meta, snippet, snippet)
                if reason:
                    drops[reason] = drops.get(reason, 0) + 1
                    continue
            ready.append(_public_cand(cand, prior))
            continue
        try:
            thread = get_full(thread_id)
        except HarvestRateLimited:
            raise
        except Exception:
            logger.exception("mail reply pre-draft thread fetch failed")
            drops["fetch_fail"] = drops.get("fetch_fail", 0) + 1
            continue
        text = thread_plain_text(thread)
        if len(text.strip()) < _MIN_THREAD_CHARS:
            drops["too_short"] = drops.get("too_short", 0) + 1
            continue
        snippet = _signal_snippet(text)
        last_text = last_message_plain_text(thread) or snippet
        reason = _drop_reason(cand, thread, snippet, last_text)
        if reason:
            drops[reason] = drops.get(reason, 0) + 1
            continue
        subject, body = compose_fn(text, str(cand.get("subject") or ""))
        if not body.strip():
            drops["empty_body"] = drops.get("empty_body", 0) + 1
            continue
        ready.append(_public_cand({**cand, "draft_subject": subject, "draft_body": body}))
    return ready, drops


def _public_cand(cand: dict[str, Any], prior: dict[str, Any] | None = None) -> dict[str, Any]:
    out = {k: v for k, v in cand.items() if k != "_meta"}
    if prior:
        out["draft_subject"] = str(prior.get("draft_subject") or "")
        out["draft_body"] = str(prior.get("draft_body") or "")
    return out
