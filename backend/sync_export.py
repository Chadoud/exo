"""
Read-only export of second-brain SQLite rows for GO SYNC push.

No network I/O — desktop sync worker calls these to build encrypted blobs.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any

# Keep in lockstep with cloud-node ALLOWED_COLLECTIONS + blob-envelope.json.
SYNC_COLLECTIONS = frozenset(
    {"memory_entries", "conversations", "tasks", "activity_entries"}
)


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
    import tasks_store

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
    return items


def serialize_payload(record: dict[str, Any]) -> bytes:
    """JSON-encode a record payload for encryption."""
    return json.dumps(record, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
