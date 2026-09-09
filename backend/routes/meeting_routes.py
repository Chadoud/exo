"""
REST endpoints for meeting mode.

POST /meetings/start          — begin a session {id, title?}
POST /meetings/{id}/note      — append a transcript line {text, speaker?}
GET  /meetings/{id}/notes     — running notes (recent transcript lines)
POST /meetings/{id}/end       — summarize, persist, extract tasks/memories
GET  /meetings                — list active sessions
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

import meeting_store

router = APIRouter(prefix="/meetings", tags=["meetings"])


class StartBody(BaseModel):
    id: str = Field(..., min_length=1, max_length=128)
    title: str = Field(default="", max_length=200)


class NoteBody(BaseModel):
    text: str = Field(..., min_length=1, max_length=8000)
    speaker: str | None = Field(default=None, max_length=80)


@router.get("")
def list_active() -> list[dict[str, Any]]:
    return meeting_store.list_active()


@router.post("/start")
def start(body: StartBody) -> dict[str, Any]:
    from entitlement_gate import assert_may_use_proactive

    assert_may_use_proactive()
    return meeting_store.start_meeting(body.id, body.title)


@router.post("/{meeting_id}/note")
def add_note(meeting_id: str, body: NoteBody) -> dict[str, Any]:
    result = meeting_store.append_line(
        meeting_id, body.text, body.speaker, source="manual"
    )
    if not result.get("ok"):
        raise HTTPException(status_code=404, detail=result.get("error", "error"))
    return result


@router.get("/{meeting_id}/notes")
def notes(meeting_id: str, tail: int = Query(default=50, ge=1, le=500)) -> dict[str, Any]:
    result = meeting_store.get_live_notes(meeting_id, tail)
    if not result.get("ok"):
        raise HTTPException(status_code=404, detail=result.get("error", "error"))
    return result


@router.post("/{meeting_id}/end")
def end(meeting_id: str) -> dict[str, Any]:
    result = meeting_store.end_meeting(meeting_id)
    if not result.get("ok"):
        raise HTTPException(status_code=404, detail=result.get("error", "error"))
    return result
