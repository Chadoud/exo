"""
REST endpoints for the task / action-item store.

GET    /tasks            — list (filterable by status)
POST   /tasks            — create {description, due_at?, priority?}
PUT    /tasks/{id}       — patch description/due_at/priority
PATCH  /tasks/{id}/done  — mark complete / reopen
DELETE /tasks/{id}       — dismiss (stays gone on next account sync)
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

import tasks_store

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/tasks", tags=["tasks"])


def _schedule_due_notification(description: str, due_at: str | None) -> None:
    """Best-effort OS reminder at a task's due time (no-op if missing/past/fails)."""
    if not due_at:
        return
    try:
        when = datetime.fromisoformat(due_at.replace("Z", "+00:00"))
        local = when.astimezone()
        if local <= datetime.now(local.tzinfo):
            return
        from actions.reminder import schedule_reminder

        schedule_reminder(
            {
                "message": f"Task due: {description}",
                "date": local.strftime("%Y-%m-%d"),
                "time": local.strftime("%H:%M"),
            }
        )
    except Exception:
        logger.debug("Could not schedule due notification for task", exc_info=True)


class TaskCreateBody(BaseModel):
    description: str = Field(..., min_length=1, max_length=2000)
    due_at: str | None = Field(default=None, max_length=64)
    priority: str = Field(default="normal", max_length=16)
    source_conversation_id: str | None = Field(default=None, max_length=128)


class TaskUpdateBody(BaseModel):
    description: str | None = Field(default=None, max_length=2000)
    due_at: str | None = Field(default=None, max_length=64)
    priority: str | None = Field(default=None, max_length=16)


class TaskDoneBody(BaseModel):
    completed: bool = True


@router.get("")
def list_all_tasks(
    include_completed: bool = Query(default=True),
    exclude_manual: bool = Query(default=False),
    map_eligible: bool = Query(default=False),
) -> list[dict[str, Any]]:
    return tasks_store.list_tasks(
        include_completed=include_completed,
        exclude_manual=exclude_manual,
        map_eligible=map_eligible,
    )


@router.post("/sync")
def sync_tasks_from_integrations() -> dict[str, Any]:
    """Harvest action items from connected Gmail, Outlook, and calendars."""
    from entitlement_gate import assert_may_use_proactive

    assert_may_use_proactive()
    from tasks_integration_sync import sync_integration_tasks

    return sync_integration_tasks()


@router.post("")
def create_task_entry(body: TaskCreateBody) -> dict[str, Any]:
    try:
        task = tasks_store.create_task(
            body.description,
            due_at=body.due_at,
            priority=body.priority,
            source_conversation_id=body.source_conversation_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    _schedule_due_notification(task["description"], task["due_at"])
    return task


@router.get("/{task_id}/open-target")
def task_open_target(task_id: int) -> dict[str, Any]:
    """Resolve how to open a task's external source (mail, calendar, or chat)."""
    from memory_origin import resolve_task_open_target

    task = tasks_store.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="task_not_found")
    target = resolve_task_open_target(task)
    if not target:
        raise HTTPException(status_code=404, detail="open_target_unavailable")
    return {"ok": True, **target.to_dict()}


@router.put("/{task_id}")
def update_task_entry(task_id: int, body: TaskUpdateBody) -> dict[str, Any]:
    try:
        updated = tasks_store.update_task(
            task_id,
            description=body.description,
            due_at=body.due_at,
            priority=body.priority,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    if not updated:
        raise HTTPException(status_code=404, detail="task_not_found")
    if body.due_at:
        _schedule_due_notification(updated["description"], updated["due_at"])
    return updated


@router.patch("/{task_id}/done")
def complete_task_entry(task_id: int, body: TaskDoneBody) -> dict[str, Any]:
    updated = tasks_store.set_completed(task_id, body.completed)
    if not updated:
        raise HTTPException(status_code=404, detail="task_not_found")
    return updated


@router.delete("/{task_id}")
def delete_task_entry(task_id: int) -> dict[str, Any]:
    removed = tasks_store.delete_task(task_id)
    if not removed:
        raise HTTPException(status_code=404, detail="task_not_found")
    return {"ok": "true", "removed": removed}
