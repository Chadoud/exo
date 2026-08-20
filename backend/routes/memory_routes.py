"""
REST endpoints for the persistent assistant memory store.

GET    /memory              — returns full memory dict
GET    /memory/export       — same payload as GET /memory (backup-friendly path)
GET    /memory/search       — relevance-ranked entry search (Memories tab)
POST   /memory              — upsert {category, key, value}
PUT    /memory/{id}         — edit an entry's value by row id
PATCH  /memory/{id}/reviewed — flip the reviewed flag on an auto-extracted entry
DELETE /memory/by-id/{id}   — remove one entry by row id
DELETE /memory/{cat}/{key}  — remove one entry
DELETE /memory              — wipe all entries (requires confirmed=true)
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from assistant_memory import (
    MEMORY_CATEGORIES,
    batch_memory_action,
    clear_all_memory,
    clear_conversation_memory,
    delete_memory,
    delete_memory_by_id,
    get_memory_entry_by_id,
    list_all_memory_scoped,
    memory_as_dict,
    restore_memory_snapshots,
    set_memory_reviewed,
    update_memory,
    update_memory_by_id,
)
from memory_origin import backfill_all_memory_origins, resolve_memory_open_target
from memory_search import search_memories
from second_brain_cleanup import cleanup_second_brain_noise
from signal_quality import is_hidden_internal_memory, strip_hidden_keys_from_memory_dict

router = APIRouter(prefix="/memory", tags=["memory"])


@router.get("")
def get_memory(
    conversation_id: str | None = Query(default=None, alias="conversation_id"),
    all_scopes: bool = Query(default=False),
) -> Any:
    """Return memory.

    - Default: merged global + conversation-scoped entries as category dict.
    - all_scopes=true: flat list of every entry including scoped rows (for Settings UI).
    """
    if all_scopes:
        return [e for e in list_all_memory_scoped() if not is_hidden_internal_memory(e)]
    return strip_hidden_keys_from_memory_dict(memory_as_dict(conversation_id))


class MemoryUpsertBody(BaseModel):
    category:        str       = Field(..., min_length=1, max_length=64)
    key:             str       = Field(..., min_length=1, max_length=256)
    value:           str       = Field(..., max_length=4096)
    conversation_id: str | None = Field(default=None, max_length=128)


class MemoryClearBody(BaseModel):
    confirmed: bool = False


class MemoryEditBody(BaseModel):
    value: str = Field(..., max_length=4096)


class MemoryReviewedBody(BaseModel):
    reviewed: bool = True


class MemoryCleanupBody(BaseModel):
    dry_run: bool = False
    delete: bool = True
    include_stale: bool = False
    include_conversations: bool = False


class MemoryBatchBody(BaseModel):
    action: str = Field(..., pattern="^(review|unreview|delete)$")
    ids: list[int] = Field(..., min_length=1, max_length=500)


class MemoryRestoreSnapshot(BaseModel):
    category: str
    key: str
    value: str
    conversation_id: str | None = None
    source: str = "manual"
    reviewed: bool = True
    provenance: str | None = None
    noise_score: float = 0
    origin_kind: str | None = None
    origin_ref: str | None = None
    origin_url: str | None = None
    origin_label: str | None = None
    linked_task_id: int | None = None


class MemoryBackfillOriginsBody(BaseModel):
    dry_run: bool = True


class MemoryBatchRestoreBody(BaseModel):
    snapshots: list[MemoryRestoreSnapshot] = Field(..., min_length=1, max_length=500)


@router.get("/{row_id}/open-target")
def memory_open_target(row_id: int) -> dict[str, Any]:
    """Resolve how to open a memory row (external URL or in-app conversation)."""
    entry = get_memory_entry_by_id(row_id)
    if not entry:
        raise HTTPException(status_code=404, detail="entry_not_found")
    target = resolve_memory_open_target(entry)
    if not target:
        raise HTTPException(status_code=404, detail="open_target_unavailable")
    return {"ok": True, **target.to_dict()}


@router.post("/backfill-origins")
def memory_backfill_origins(body: MemoryBackfillOriginsBody) -> dict[str, Any]:
    """Lazy-match memory rows to synced tasks / conversations."""
    return backfill_all_memory_origins(dry_run=body.dry_run)


@router.get("/export")
def export_memory_json() -> dict[str, Any]:
    """Same payload as GET /memory — handy for backup clients expecting /export."""
    return memory_as_dict()


@router.get("/search")
def search_memory_entries(
    q: str = Query(default="", max_length=512),
    limit: int = Query(default=8, ge=1, le=50),
    category: str | None = Query(default=None),
) -> list[dict[str, Any]]:
    """Relevance-ranked search across all memory entries."""
    if category and category not in MEMORY_CATEGORIES:
        raise HTTPException(status_code=422, detail="unknown_category")
    return search_memories(q, limit=limit, category=category)


@router.post("")
def upsert_memory(body: MemoryUpsertBody) -> dict[str, Any]:
    if body.category not in MEMORY_CATEGORIES:
        raise HTTPException(
            status_code=422,
            detail=f"Unknown category {body.category!r}. "
                   f"Valid: {sorted(MEMORY_CATEGORIES)}",
        )
    try:
        row_id = update_memory(body.category, body.key, body.value, body.conversation_id)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {"ok": "true", "id": row_id}


@router.put("/{row_id}")
def edit_memory(row_id: int, body: MemoryEditBody) -> dict[str, Any]:
    """Edit an existing entry's value by row id."""
    try:
        updated = update_memory_by_id(row_id, body.value)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    if not updated:
        raise HTTPException(status_code=404, detail="entry_not_found")
    return {"ok": "true"}


@router.post("/cleanup-noise")
def cleanup_noise(body: MemoryCleanupBody) -> dict[str, Any]:
    """Remove or preview promotional/spam auto-memories, optional stale memories, mail tasks, chats."""
    return cleanup_second_brain_noise(
        dry_run=body.dry_run,
        delete=body.delete,
        include_stale=body.include_stale,
        include_conversations=body.include_conversations,
    )


@router.post("/batch")
def batch_memory(body: MemoryBatchBody) -> dict[str, Any]:
    """Review, unreview, or delete many memory rows in one call."""
    try:
        return batch_memory_action(body.ids, body.action)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/batch/restore")
def restore_memory_batch(body: MemoryBatchRestoreBody) -> dict[str, Any]:
    """Restore rows removed by a batch delete (undo)."""
    restored = restore_memory_snapshots([s.model_dump() for s in body.snapshots])
    return {"ok": True, "restored": restored}


@router.patch("/{row_id}/reviewed")
def review_memory(row_id: int, body: MemoryReviewedBody) -> dict[str, Any]:
    """Mark an auto-extracted entry as reviewed (or unreview it)."""
    updated = set_memory_reviewed(row_id, body.reviewed)
    if not updated:
        raise HTTPException(status_code=404, detail="entry_not_found")
    return {"ok": "true", "reviewed": body.reviewed}


@router.delete("/by-id/{row_id}")
def remove_memory_by_id(row_id: int) -> dict[str, Any]:
    """Delete a single entry by its row id."""
    removed = delete_memory_by_id(row_id)
    return {"ok": "true", "removed": removed}


@router.delete("/conversation/{conversation_id}")
def clear_conversation_memory_entries(conversation_id: str) -> dict[str, str]:
    """Delete all memory entries scoped to a specific conversation."""
    if not conversation_id:
        raise HTTPException(status_code=422, detail="conversation_id is required")
    clear_conversation_memory(conversation_id)
    return {"ok": "true"}


@router.delete("/{category}/{key}")
def remove_memory_entry(
    category: str,
    key: str,
    conversation_id: str | None = Query(default=None),
) -> dict[str, Any]:
    if category not in MEMORY_CATEGORIES:
        raise HTTPException(status_code=404, detail="unknown_category")
    removed = delete_memory(category, key, conversation_id)
    return {"ok": "true", "removed": removed}


@router.delete("")
def clear_memory(body: MemoryClearBody) -> dict[str, str]:
    if not body.confirmed:
        raise HTTPException(status_code=422, detail="confirmed must be true")
    clear_all_memory()
    return {"ok": "true"}
