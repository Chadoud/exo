"""Apply pulled GO SYNC records to local stores — strict field allowlist.

v1 scope: task completion and dismiss (tombstone). A phone may flip
`completed`/`completed_at` or mark a task deleted. No other payload writes
(docs/MOBILE_DEFERRED.md: no blind remote field writes).
"""

from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)

TASKS_COLLECTION = "tasks"

APPLIED = "applied"


def _parse_task_id(record_id: str) -> int | None:
    try:
        return int(record_id.strip())
    except (TypeError, ValueError):
        return None


def apply_remote_task_completion(
    record: dict[str, Any],
    *,
    own_device_id: str,
) -> str:
    """Apply one decrypted record; returns an outcome label for counters.

    Flips completion or dismisses an existing local task when the remote
    edit is not older than the local row (last-writer-wins).
    """
    import tasks_store

    if record.get("collection") != TASKS_COLLECTION:
        return "skipped_collection"
    if str(record.get("device_id") or "") == own_device_id:
        return "skipped_own_device"
    task_id = _parse_task_id(str(record.get("record_id") or ""))
    if task_id is None:
        return "skipped_invalid"
    task = tasks_store.get_task(task_id)
    if task is None:
        return "skipped_unknown"
    from sync_engine import _logical_clock

    local_clock = _logical_clock(str(task.get("updated_at") or ""), str(task_id))
    if int(record.get("logical_clock") or 0) < local_clock:
        return "skipped_stale"
    if record.get("deleted"):
        if task.get("dismissed"):
            return "skipped_noop"
        tasks_store.delete_task(task_id)
        logger.info("sync apply: task %s dismissed (remote)", task_id)
        return APPLIED
    payload = record.get("payload") or {}
    completed = payload.get("completed")
    if not isinstance(completed, bool):
        return "skipped_invalid"
    if task.get("dismissed"):
        return "skipped_unknown"
    if bool(task.get("completed")) == completed:
        return "skipped_noop"
    tasks_store.set_completed(task_id, completed)
    logger.info("sync apply: task %s completed=%s (remote)", task_id, completed)
    return APPLIED
