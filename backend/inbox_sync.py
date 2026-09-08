"""GO SYNC for Inbox advisory rows — dismiss only from the phone. No meta."""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any

logger = logging.getLogger(__name__)

NUDGES_COLLECTION = "nudges"
FAILURES_COLLECTION = "agent_failures"
ALLOWED_DISMISS_FIELDS = frozenset({"status", "updated_at"})


def _now() -> str:
    return datetime.now(UTC).isoformat()


def export_nudges() -> list[dict[str, Any]]:
    import nudges

    nudges.collapse_failed_tasks_nudges()
    out: list[dict[str, Any]] = []
    for row in nudges.list_nudges(include_dismissed=True, limit=50):
        rid = str(row.get("id") or "")
        if not rid:
            continue
        updated = str(row.get("updated_at") or row.get("created_at") or _now())
        if row.get("dismissed"):
            out.append(
                {
                    "collection": NUDGES_COLLECTION,
                    "record_id": rid,
                    "payload": {},
                    "updated_at": updated,
                    "deleted": True,
                }
            )
            continue
        out.append(
            {
                "collection": NUDGES_COLLECTION,
                "record_id": rid,
                "payload": {
                    "kind": str(row.get("kind") or "")[:64],
                    "title": str(row.get("title") or "")[:200],
                    "body": str(row.get("body") or "")[:600],
                },
                "updated_at": updated,
                "deleted": False,
            }
        )
    return out


def export_agent_failures() -> list[dict[str, Any]]:
    from orchestrator import memory as orch
    from orchestrator.failure_admit import is_trash_inbox_failure, outcome_from_failure_content

    out: list[dict[str, Any]] = []
    for row in orch.list_failures_for_sync(limit=30):
        goal = orch.goal_from_failure_content(str(row.get("content") or ""))
        outcome = outcome_from_failure_content(str(row.get("content") or ""))
        if is_trash_inbox_failure(goal, outcome):
            continue
        rid = str(row.get("id") or "")
        if not rid:
            continue
        updated = str(row.get("updated_at") or row.get("created_at") or _now())
        if row.get("dismissed"):
            out.append(
                {
                    "collection": FAILURES_COLLECTION,
                    "record_id": rid,
                    "payload": {},
                    "updated_at": updated,
                    "deleted": True,
                }
            )
            continue
        out.append(
            {
                "collection": FAILURES_COLLECTION,
                "record_id": rid,
                "payload": {
                    "goal": goal[:200],
                    "outcome": outcome[:400],
                },
                "updated_at": updated,
                "deleted": False,
            }
        )
    return out


def _parse_int_id(record_id: str) -> int | None:
    try:
        return int(str(record_id).strip())
    except (TypeError, ValueError):
        return None


def _apply_dismiss(
    record: dict[str, Any],
    *,
    own_device_id: str,
    collection: str,
    dismiss,
) -> str:
    if record.get("collection") != collection:
        return "skipped_collection"
    if str(record.get("device_id") or "") == own_device_id:
        return "skipped_own_device"
    payload = record.get("payload") or {}
    if not isinstance(payload, dict):
        return "skipped_invalid"
    extra = set(payload) - ALLOWED_DISMISS_FIELDS
    if extra:
        logger.warning("%s rejected extra payload keys", collection)
        return "skipped_invalid"
    record_id = _parse_int_id(str(record.get("record_id") or ""))
    if record_id is None:
        return "skipped_invalid"
    if not record.get("deleted") and payload.get("status") != "dismissed":
        return "skipped_noop"
    if dismiss(record_id):
        return "applied"
    return "skipped_unknown"


def apply_remote_nudge(record: dict[str, Any], *, own_device_id: str) -> str:
    import nudges

    return _apply_dismiss(
        record,
        own_device_id=own_device_id,
        collection=NUDGES_COLLECTION,
        dismiss=nudges.dismiss_nudge,
    )


def apply_remote_failure(record: dict[str, Any], *, own_device_id: str) -> str:
    from orchestrator import memory as orch

    return _apply_dismiss(
        record,
        own_device_id=own_device_id,
        collection=FAILURES_COLLECTION,
        dismiss=orch.dismiss_failure,
    )
