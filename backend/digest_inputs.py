"""Inputs for the daily briefing: the user's day, not chats with Exo."""

from __future__ import annotations

import logging
from datetime import UTC, date, datetime, timedelta
from typing import Any

from signal_quality import SignalTier, evaluate_text
from tasks_integration_sync import _CALENDAR_SOURCES, is_placeholder_prepare_task

logger = logging.getLogger(__name__)

_EMPTY_HEADLINE = "Nothing due on your calendar or task list today."


def _parse_due(due_at: str | None) -> datetime | None:
    if not due_at:
        return None
    try:
        raw = due_at.replace("Z", "+00:00")
        dt = datetime.fromisoformat(raw)
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    return dt.astimezone(UTC)


def _due_bucket(due_at: str | None, *, today: date) -> str | None:
    """Bucket by UTC calendar date (no stored local timezone)."""
    due = _parse_due(due_at)
    if due is None:
        return None
    day = due.date()
    if day < today:
        return "overdue"
    if day == today:
        return "today"
    if day <= today + timedelta(days=7):
        return "upcoming"
    return None


def _usable_task(task: dict[str, Any]) -> bool:
    desc = str(task.get("description") or "")
    if not desc.strip() or is_placeholder_prepare_task(desc):
        return False
    return evaluate_text(desc).tier != SignalTier.REJECT


def _is_calendar(task: dict[str, Any]) -> bool:
    return str(task.get("source") or "") in _CALENDAR_SOURCES


def _task_line(task: dict[str, Any]) -> str:
    desc = str(task["description"]).strip()
    source = str(task.get("source") or "")
    prefix = "Event — " if source in _CALENDAR_SOURCES else ""
    return f"- {prefix}{desc}"


def _mail_lines() -> list[str]:
    try:
        from mail_initiative import store as mail_store

        rows = mail_store.list_candidates(limit=5, drafted_only=True)
    except Exception:
        logger.exception("digest mail inputs failed")
        return []
    lines: list[str] = []
    for row in rows:
        who = str(row.get("from_name") or "").strip() or "Mail"
        subject = str(row.get("subject") or "").strip() or "(no subject)"
        lines.append(f"- {who}: {subject}")
    return lines


def _section(title: str, lines: list[str]) -> list[str]:
    if not lines:
        return []
    return [title, *lines]


def _bucket_open_tasks(
    open_tasks: list[dict[str, Any]], today: date
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
    overdue: list[dict[str, Any]] = []
    due_today: list[dict[str, Any]] = []
    upcoming: list[dict[str, Any]] = []
    for task in open_tasks:
        bucket = _due_bucket(task.get("due_at"), today=today)
        if bucket == "overdue" and not _is_calendar(task):
            overdue.append(task)
        elif bucket == "today":
            due_today.append(task)
        elif bucket == "upcoming":
            upcoming.append(task)
    return overdue, due_today, upcoming


def gather_digest_inputs() -> tuple[str, dict[str, Any]]:
    """Build the briefing prompt from calendar, due work, and mail — not chat."""
    import tasks_store

    now = datetime.now(UTC)
    since = (now - timedelta(hours=24)).isoformat()
    today = now.date()
    open_tasks = [t for t in tasks_store.list_tasks(include_completed=False) if _usable_task(t)]
    done_today = [
        t
        for t in tasks_store.list_tasks(include_completed=True)
        if t["completed"] and (t.get("completed_at") or "") >= since and _usable_task(t)
    ]
    overdue, due_today, upcoming = _bucket_open_tasks(open_tasks, today)
    mail_lines = _mail_lines()

    lines: list[str] = []
    lines.extend(_section("Overdue:", [_task_line(t) for t in overdue[:15]]))
    lines.extend(_section("Due today:", [_task_line(t) for t in due_today[:15]]))
    lines.extend(_section("Upcoming (7 days):", [_task_line(t) for t in upcoming[:10]]))
    lines.extend(_section("Mail waiting:", mail_lines))
    lines.extend(_section("Completed today:", [_task_line(t) for t in done_today[:15]]))

    counts = {
        "conversations": 0,
        "activity": 0,
        "open_tasks": len(open_tasks),
        "completed_today": len(done_today),
        "overdue": len(overdue),
        "due_today": len(due_today),
        "upcoming": len(upcoming),
        "mail": len(mail_lines),
    }
    return "\n".join(lines).strip(), counts


def fallback_digest(counts: dict[str, Any]) -> dict[str, Any]:
    """Deterministic briefing when no LLM — counts, not invented prose."""
    parts: list[str] = []
    if counts.get("overdue"):
        parts.append(f"{counts['overdue']} overdue")
    if counts.get("due_today"):
        parts.append(f"{counts['due_today']} due today")
    if counts.get("mail"):
        parts.append(f"{counts['mail']} mail waiting")
    headline = ", ".join(parts) if parts else _EMPTY_HEADLINE
    return {
        "headline": headline,
        "highlights": [],
        "decisions": [],
        "unresolved": [],
        "focus_tomorrow": [],
        "counts": counts,
        "llm": False,
    }


def empty_digest_body(counts: dict[str, Any]) -> dict[str, Any]:
    body = fallback_digest(counts)
    body["headline"] = _EMPTY_HEADLINE
    return body


def needs_workday_rebuild(digest: dict[str, Any]) -> bool:
    """True when a stored row predates the work-day briefing contract."""
    counts = digest.get("counts")
    if not isinstance(counts, dict):
        return True
    if "overdue" not in counts or "due_today" not in counts:
        return True
    return int(counts.get("conversations") or 0) > 0 or int(counts.get("activity") or 0) > 0
