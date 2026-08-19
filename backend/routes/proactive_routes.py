"""
REST endpoints for the proactive layer: daily digest + notification center.

POST /digest/generate      — build today's digest (LLM or deterministic fallback)
GET  /digest/latest        — today's digest (created on first read)
GET  /digest               — recent digest headlines
POST /nudges/generate      — generate rate-limited nudges; returns newly created
GET  /nudges               — list nudges (notification center)
POST /nudges/{id}/dismiss  — dismiss one
POST /nudges/dismiss-all   — dismiss all
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Query

import daily_digest
import nudges
from telemetry.rate_limit_memory import allow

router = APIRouter(tags=["proactive"])


@router.post("/digest/generate")
def generate_digest() -> dict[str, Any]:
    from entitlement_gate import assert_may_use_proactive

    assert_may_use_proactive()
    if not allow("digest_generate", 6, 86400):
        raise HTTPException(status_code=429, detail="digest_rate_limited")
    return daily_digest.generate_digest()


@router.get("/digest/latest")
def latest_digest() -> dict[str, Any]:
    """Today's digest — built on first read so Tasks never waits for Generate."""
    from entitlement_gate import may_use_proactive

    allowed, _reason = may_use_proactive()
    return daily_digest.ensure_today_digest(use_llm=allowed)


@router.get("/digest")
def list_digests(limit: int = Query(default=14, ge=1, le=60)) -> list[dict[str, Any]]:
    return daily_digest.list_digests(limit=limit)


@router.post("/nudges/generate")
def generate_nudges() -> dict[str, Any]:
    created = nudges.generate_nudges()
    return {"created": created, "count": len(created)}


@router.get("/nudges")
def list_nudges(
    include_dismissed: bool = Query(default=False),
    limit: int = Query(default=50, ge=1, le=200),
) -> list[dict[str, Any]]:
    return nudges.list_nudges(include_dismissed=include_dismissed, limit=limit)


@router.post("/nudges/{nudge_id}/dismiss")
def dismiss_nudge(nudge_id: int) -> dict[str, Any]:
    removed = nudges.dismiss_nudge(nudge_id)
    if not removed:
        raise HTTPException(status_code=404, detail="nudge_not_found")
    return {"ok": "true"}


@router.post("/nudges/{nudge_id}/restore")
def restore_nudge(nudge_id: int) -> dict[str, Any]:
    restored = nudges.restore_nudge(nudge_id)
    if not restored:
        raise HTTPException(status_code=404, detail="nudge_not_found")
    return {"ok": True}


@router.post("/nudges/dismiss-all")
def dismiss_all() -> dict[str, Any]:
    ids = nudges.dismiss_all()
    return {"ok": "true", "dismissed": len(ids), "ids": ids}


@router.get("/proactive/scheduler/status")
def scheduler_status() -> dict[str, Any]:
    """Per-job last-run timestamps so the UI can show scheduler-driven freshness."""
    from proactive_scheduler import scheduler_status as _status

    return _status()


@router.get("/proactive/failures")
def recent_agent_failures(limit: int = Query(default=10, ge=1, le=50)) -> list[dict[str, Any]]:
    """Open agent failures for To Do → Inbox (one card per normalized goal)."""
    from orchestrator import memory as orch_memory

    rows = orch_memory.recent_open_failures(limit)
    return [
        {
            "id": row.id,
            "content": row.content,
            "created_at": row.created_at,
        }
        for row in rows
    ]


@router.post("/proactive/failures/{failure_id}/dismiss")
def dismiss_agent_failure(failure_id: int) -> dict[str, Any]:
    """Hide one agent failure from the inbox (undoable)."""
    from orchestrator import memory as orch_memory

    removed = orch_memory.dismiss_failure(failure_id)
    if not removed:
        raise HTTPException(status_code=404, detail="failure_not_found")
    return {"ok": True}


@router.post("/proactive/failures/{failure_id}/restore")
def restore_agent_failure(failure_id: int) -> dict[str, Any]:
    from orchestrator import memory as orch_memory

    restored = orch_memory.restore_failure(failure_id)
    if not restored:
        raise HTTPException(status_code=404, detail="failure_not_found")
    return {"ok": True}
