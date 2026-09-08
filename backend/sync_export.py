"""
Read-only export of second-brain SQLite rows for GO SYNC push.

No network I/O — desktop sync worker calls these to build encrypted blobs.
"""

from __future__ import annotations

import json
import os
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

# Keep in lockstep with cloud-node ALLOWED_COLLECTIONS + blob-envelope.json.
SYNC_COLLECTIONS = frozenset(
    {
        "memory_entries",
        "conversations",
        "tasks",
        "activity_entries",
        "pending_actions",
        "nudges",
        "agent_failures",
    }
)
INBOX_COLLECTIONS = frozenset({"pending_actions", "nudges", "agent_failures"})
_INBOX_BACKFILL_MARKER = "inbox_sync_backfill.json"


def export_memory_entries(*, since_updated_at: str | None = None) -> list[dict[str, Any]]:
    """Export memory rows as sync-ready dicts with stable string record_id."""
    from assistant_memory import list_all_memory_scoped

    rows = list_all_memory_scoped()
    out: list[dict[str, Any]] = []
    for row in rows:
        updated = str(row.get("updated_at") or "")
        if since_updated_at and updated <= since_updated_at:
            continue
        rid = str(row.get("id") or "")
        if not rid:
            continue
        out.append(
            {
                "collection": "memory_entries",
                "record_id": rid,
                "payload": row,
                "updated_at": updated or datetime.now(UTC).isoformat(),
            }
        )
    return out


def export_conversations(*, since_updated_at: str | None = None) -> list[dict[str, Any]]:
    from conversation_store import list_conversations

    rows = list_conversations(limit=500)
    out: list[dict[str, Any]] = []
    for row in rows:
        updated = str(row.get("updated_at") or "")
        if since_updated_at and updated <= since_updated_at:
            continue
        cid = str(row.get("id") or "")
        if not cid:
            continue
        out.append(
            {
                "collection": "conversations",
                "record_id": cid,
                "payload": row,
                "updated_at": updated or datetime.now(UTC).isoformat(),
            }
        )
    return out


def export_tasks(*, since_updated_at: str | None = None) -> list[dict[str, Any]]:
    import tasks_source_forget
    import tasks_store

    tasks_source_forget.ensure_disconnected_source_forgets()
    rows = tasks_store.list_tasks(include_completed=True, include_dismissed=True)
    out: list[dict[str, Any]] = []
    for row in rows:
        updated = str(row.get("updated_at") or "")
        if since_updated_at and updated <= since_updated_at:
            continue
        tid = str(row.get("id") or "")
        if not tid:
            continue
        dismissed = bool(row.get("dismissed"))
        out.append(
            {
                "collection": "tasks",
                "record_id": tid,
                "payload": {} if dismissed else row,
                "updated_at": updated or datetime.now(UTC).isoformat(),
                "deleted": dismissed,
            }
        )
    for marker in tasks_source_forget.export_source_forget_markers():
        updated = str(marker.get("updated_at") or "")
        if since_updated_at and updated <= since_updated_at:
            continue
        out.append(marker)
    capability = tasks_source_forget.export_capability_marker()
    cap_updated = str(capability.get("updated_at") or "")
    if not since_updated_at or cap_updated > since_updated_at:
        out.append(capability)
    return out


def export_activity_entries(*, since_updated_at: str | None = None) -> list[dict[str, Any]]:
    import activity_store

    rows = activity_store.list_activity(limit=500)
    out: list[dict[str, Any]] = []
    for row in rows:
        updated = str(row.get("captured_at") or "")
        if since_updated_at and updated <= since_updated_at:
            continue
        rid = str(row.get("id") or "")
        if not rid:
            continue
        out.append(
            {
                "collection": "activity_entries",
                "record_id": rid,
                "payload": row,
                "updated_at": updated or datetime.now(UTC).isoformat(),
            }
        )
    return out


def export_all(*, since_updated_at: str | None = None) -> list[dict[str, Any]]:
    """Export all v1 sync collections."""
    items: list[dict[str, Any]] = []
    items.extend(export_memory_entries(since_updated_at=since_updated_at))
    items.extend(export_conversations(since_updated_at=since_updated_at))
    items.extend(export_tasks(since_updated_at=since_updated_at))
    items.extend(export_activity_entries(since_updated_at=since_updated_at))
    items.extend(export_pending_actions(since_updated_at=since_updated_at))
    items.extend(export_nudges(since_updated_at=since_updated_at))
    items.extend(export_agent_failures(since_updated_at=since_updated_at))
    return items


def _inbox_backfill_path() -> Path | None:
    base = os.environ.get("EXOSITES_DATA_DIR", "").strip()
    if not base:
        return None
    return Path(base) / _INBOX_BACKFILL_MARKER


def inbox_backfill_pending() -> bool:
    """True until the first successful push after inbox collections shipped."""
    path = _inbox_backfill_path()
    return path is None or not path.is_file()


def mark_inbox_backfill_done() -> None:
    """Flip after a successful push so later cycles honor lastSyncedAt again."""
    path = _inbox_backfill_path()
    if path is None:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps({"done": True, "at": datetime.now(UTC).isoformat()}),
        encoding="utf-8",
    )


def _inbox_since(since_updated_at: str | None) -> str | None:
    if inbox_backfill_pending():
        return None
    return since_updated_at


def export_pending_actions(*, since_updated_at: str | None = None) -> list[dict[str, Any]]:
    from mail_initiative.pending_sync import export_pending_actions as export_mail_actions

    return _filter_since(list(export_mail_actions()), _inbox_since(since_updated_at))


def export_nudges(*, since_updated_at: str | None = None) -> list[dict[str, Any]]:
    from inbox_sync import export_nudges as export_inbox_nudges

    return _filter_since(export_inbox_nudges(), _inbox_since(since_updated_at))


def export_agent_failures(*, since_updated_at: str | None = None) -> list[dict[str, Any]]:
    from inbox_sync import export_agent_failures as export_inbox_failures

    return _filter_since(export_inbox_failures(), _inbox_since(since_updated_at))


def _filter_since(
    rows: list[dict[str, Any]], since_updated_at: str | None
) -> list[dict[str, Any]]:
    if not since_updated_at:
        return rows
    out: list[dict[str, Any]] = []
    for row in rows:
        updated = str(row.get("updated_at") or "")
        if updated <= since_updated_at:
            continue
        out.append(row)
    return out


def serialize_payload(record: dict[str, Any]) -> bytes:
    """JSON-encode a record payload for encryption."""
    return json.dumps(record, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
