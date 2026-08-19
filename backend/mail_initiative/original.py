"""On-demand last inbound plain text. Never persisted."""

from __future__ import annotations

from typing import Any

from mail_initiative import store
from mail_initiative.draft import _THREAD_TEXT_MAX, _walk_parts

_TEXT_CAP = _THREAD_TEXT_MAX


def last_inbound_plain(thread: dict[str, Any]) -> tuple[str, bool]:
    """First text/plain on the last message only. Never HTML. Cap at rest of the payload."""
    messages = [m for m in (thread.get("messages") or []) if isinstance(m, dict)]
    if not messages:
        return "", False
    last = messages[-1]
    payload = last.get("payload") if isinstance(last.get("payload"), dict) else {}
    texts = _walk_parts(payload)
    raw = texts[0].strip() if texts else ""
    if len(raw) > _TEXT_CAP:
        return raw[:_TEXT_CAP], True
    return raw, False


def read_original(candidate_id: int) -> dict[str, Any]:
    """Fetch last inbound text for one candidate. Raises LookupError / PermissionError."""
    from connector_credentials import CredentialUnavailableError
    from mail_initiative.gmail_api import HarvestRateLimited, get_thread_full

    cand = store.get_candidate(candidate_id)
    if not cand:
        raise LookupError("not_found")

    try:
        thread = get_thread_full(str(cand["thread_id"]))
    except HarvestRateLimited:
        raise
    except CredentialUnavailableError as exc:
        raise PermissionError("no_scope") from exc
    except Exception as exc:
        raise LookupError("thread_gone") from exc

    messages = [m for m in (thread.get("messages") or []) if isinstance(m, dict)]
    if not messages:
        raise LookupError("thread_gone")
    last_id = str(messages[-1].get("id") or "")
    stored = str(cand.get("last_message_id") or "")
    if last_id and stored and last_id != stored:
        raise LookupError("thread_changed")

    text, truncated = last_inbound_plain(thread)
    return {"text": text, "truncated": truncated}
