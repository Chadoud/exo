"""
Pull action items from connected integrations into the local task store.

Omi-style tasks are inferred — not typed by hand. This module harvests likely
action items from Gmail/Outlook (starred, flagged, subject cues) and upcoming
calendar events, deduping by ``external_id`` so repeated syncs stay idempotent.

Promotional / newsletter mail is filtered via ``signal_quality`` before tasks
or memories are created.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta
from typing import Any, Callable

import tasks_store
from connector_credentials import CredentialUnavailableError
from signal_quality import (
    GMAIL_NOISE_QUERY_EXCLUSIONS,
    SignalTier,
    evaluate_gmail_message,
    evaluate_outlook_message,
)

logger = logging.getLogger(__name__)

_GMAIL_ACTION_QUERY = (
    f"in:inbox {GMAIL_NOISE_QUERY_EXCLUSIONS} "
    "(is:starred OR is:important OR "
    'subject:(todo OR "to do" OR "follow up" OR follow-up OR deadline)) '
    "newer_than:14d"
)
_OUTLOOK_ACTION_QUERY = "action OR todo OR follow OR deadline"
_PLACEHOLDER_EVENT_TITLES = frozenset({"(no title)", "no title", "untitled", "(untitled)"})
_CALENDAR_SOURCES = frozenset({"google-calendar", "outlook-calendar"})

SyncStatus = str  # ok | not_connected | failed | skipped


def calendar_event_has_real_title(title: str | None) -> bool:
    """Untitled / placeholder events are calendar holds, not action items."""
    text = (title or "").strip()
    if not text:
        return False
    return text.casefold() not in _PLACEHOLDER_EVENT_TITLES


def is_placeholder_prepare_task(description: str) -> bool:
    """True when the task is only 'Prepare for:' plus an empty or placeholder title."""
    text = (description or "").strip()
    if not text.casefold().startswith("prepare for:"):
        return False
    rest = text.split(":", 1)[1].strip()
    return not calendar_event_has_real_title(rest)


def dismiss_placeholder_calendar_tasks() -> int:
    """Take existing untitled Prepare-for rows off the list (Calendar events stay)."""
    removed = 0
    for task in tasks_store.list_tasks(include_completed=True):
        if str(task.get("source") or "") not in _CALENDAR_SOURCES:
            continue
        if not is_placeholder_prepare_task(str(task.get("description") or "")):
            continue
        if tasks_store.purge_task(int(task["id"])):
            removed += 1
    return removed


def _safe_call(
    fn: Callable[[dict[str, Any]], dict[str, Any]],
    params: dict[str, Any],
) -> tuple[dict[str, Any] | None, SyncStatus]:
    try:
        return fn(params), "ok"
    except CredentialUnavailableError:
        return None, "not_connected"
    except Exception:
        logger.debug("integration task sync call failed", exc_info=True)
        return None, "failed"


def _ingest_mail_message(
    *,
    source: str,
    message_id: str,
    subject: str,
    snippet: str,
    stored: int,
    mail_verdict: SignalTier | None = None,
) -> int:
    if mail_verdict is not None and mail_verdict != SignalTier.ALLOW:
        return stored

    subject = (subject or "").strip()
    if not subject or subject == "(no subject)":
        return stored
    desc = subject
    preview = (snippet or "").strip()
    if preview and preview.lower() not in subject.lower():
        desc = f"{subject} — {preview[:120].rstrip()}"
    from signal_quality import task_map_eligible

    if not task_map_eligible(desc, source):
        return stored
    ext = f"{source}:mail:{message_id}"
    if tasks_store.get_task_by_external_id(ext):
        return stored
    try:
        from integration_memory_loop import maybe_remember_from_task

        task = tasks_store.create_task(
            desc[:500],
            source=source,
            external_id=ext,
            priority="normal",
        )
        maybe_remember_from_task(task)
        return stored + 1
    except Exception:
        logger.exception("failed to store %s mail task", source)
        return stored


def _sync_gmail() -> tuple[int, SyncStatus]:
    from actions.google_workspace_tool import _gmail_search

    result, status = _safe_call(_gmail_search, {"query": _GMAIL_ACTION_QUERY, "max_results": 25})
    if status != "ok" or not result or not result.get("ok"):
        return 0, status if status != "ok" else "failed"
    messages = (result.get("data") or {}).get("messages") or []
    stored = 0
    for msg in messages:
        if not isinstance(msg, dict):
            continue
        verdict = evaluate_gmail_message(
            label_ids=msg.get("labelIds") if isinstance(msg.get("labelIds"), list) else [],
            from_addr=str(msg.get("from", "")),
            subject=str(msg.get("subject", "")),
            snippet=str(msg.get("snippet", "")),
            headers=msg.get("headers") if isinstance(msg.get("headers"), dict) else {},
        )
        stored = _ingest_mail_message(
            source="gmail",
            message_id=str(msg.get("id", "")),
            subject=str(msg.get("subject", "")),
            snippet=str(msg.get("snippet", "")),
            stored=stored,
            mail_verdict=verdict.tier,
        )
    return stored, "ok"


def _sync_outlook() -> tuple[int, SyncStatus]:
    from actions.microsoft_graph_tool import _mail_search

    result, status = _safe_call(_mail_search, {"query": _OUTLOOK_ACTION_QUERY, "max_results": 25})
    if status != "ok" or not result or not result.get("ok"):
        return 0, status if status != "ok" else "failed"
    messages = (result.get("data") or {}).get("messages") or []
    stored = 0
    for msg in messages:
        if not isinstance(msg, dict):
            continue
        verdict = evaluate_outlook_message(
            from_addr=str(msg.get("from", "")),
            subject=str(msg.get("subject", "")),
            preview=str(msg.get("preview", "")),
            inference_classification=msg.get("inference_classification"),
            importance=str(msg.get("importance", "")),
            is_flagged=bool(msg.get("is_flagged")),
        )
        stored = _ingest_mail_message(
            source="outlook",
            message_id=str(msg.get("id", "")),
            subject=str(msg.get("subject", "")),
            snippet=str(msg.get("preview", "")),
            stored=stored,
            mail_verdict=verdict.tier,
        )
    return stored, "ok"


def _sync_calendar_events(
    source: str,
    list_fn: Callable[[dict[str, Any]], dict[str, Any]],
    *,
    label: str,
    param_style: str,
) -> tuple[int, SyncStatus]:
    now = datetime.now(UTC)
    end = now + timedelta(days=7)
    if param_style == "google":
        params = {
            "time_min": now.isoformat(),
            "time_max": end.isoformat(),
            "max_results": 20,
        }
    else:
        params = {
            "start_datetime": now.isoformat(),
            "end_datetime": end.isoformat(),
            "max_results": 20,
        }
    result, status = _safe_call(list_fn, params)
    if status != "ok" or not result or not result.get("ok"):
        return 0, status if status != "ok" else "failed"
    events = (result.get("data") or {}).get("events") or []
    stored = 0
    for ev in events:
        if not isinstance(ev, dict):
            continue
        title = str(ev.get("summary") or ev.get("subject") or ev.get("title") or "").strip()
        if not calendar_event_has_real_title(title):
            continue
        start = ev.get("start") or ev.get("startDateTime")
        due_at = str(start) if start else None
        event_id = str(ev.get("id") or title)
        ext = f"{source}:cal:{event_id}"
        source_url = str(ev.get("html_link") or ev.get("web_link") or "").strip() or None
        if tasks_store.get_task_by_external_id(ext):
            continue
        try:
            from integration_memory_loop import maybe_remember_from_task

            task = tasks_store.create_task(
                f"Prepare for: {title}"[:500],
                due_at=due_at,
                source=source,
                external_id=ext,
                source_url=source_url,
                priority="high" if str(ev.get("importance", "")).lower() == "high" else "normal",
            )
            maybe_remember_from_task(task)
            stored += 1
        except Exception:
            logger.exception("failed to store %s calendar task", label)
    return stored, "ok"


def _sync_google_calendar() -> tuple[int, SyncStatus]:
    from actions.google_workspace_tool import _calendar_list_events

    return _sync_calendar_events(
        "google-calendar", _calendar_list_events, label="Google Calendar", param_style="google"
    )


def _sync_outlook_calendar() -> tuple[int, SyncStatus]:
    from actions.microsoft_graph_tool import _calendar_list_events

    return _sync_calendar_events(
        "outlook-calendar", _calendar_list_events, label="Outlook Calendar", param_style="outlook"
    )


def _drop_stale_account_tasks() -> int:
    """Wipe harvested rows when the connected mailbox/calendar is a different account."""
    from tasks_source_forget import (
        peek_gmail_identity,
        peek_google_calendar_identity,
        peek_outlook_identity,
        remember_or_drop_if_identity_changed,
    )

    dropped = 0
    gmail_id = peek_gmail_identity()
    if gmail_id:
        dropped += remember_or_drop_if_identity_changed("gmail", gmail_id)
    outlook_id = peek_outlook_identity()
    if outlook_id:
        dropped += remember_or_drop_if_identity_changed("outlook", outlook_id)
    calendar_id = peek_google_calendar_identity()
    if calendar_id:
        dropped += remember_or_drop_if_identity_changed("google-calendar", calendar_id)
    return dropped


def sync_integration_tasks() -> dict[str, Any]:
    """Best-effort harvest from all connected integrations. Never raises."""
    dismissed_placeholders = dismiss_placeholder_calendar_tasks()
    _drop_stale_account_tasks()
    gmail_count, gmail_status = _sync_gmail()
    outlook_count, outlook_status = _sync_outlook()
    gcal_count, gcal_status = _sync_google_calendar()
    ocal_count, ocal_status = _sync_outlook_calendar()

    counts = {
        "gmail": gmail_count,
        "outlook": outlook_count,
        "google_calendar": gcal_count,
        "outlook_calendar": ocal_count,
    }
    statuses = {
        "gmail": gmail_status,
        "outlook": outlook_status,
        "google_calendar": gcal_status,
        "outlook_calendar": ocal_status,
    }
    return {
        "ok": True,
        "created": counts,
        "statuses": statuses,
        "total_created": sum(counts.values()),
        "dismissed_placeholders": dismissed_placeholders,
    }
