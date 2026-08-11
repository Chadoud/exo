"""Local GO SYNC endpoints — called by Electron sync worker."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel, Field

router = APIRouter(prefix="/sync", tags=["sync-local"])


class SyncRunBody(BaseModel):
    cloud_url: str = Field(min_length=1, max_length=512)
    access_token: str = Field(min_length=1, max_length=4096)
    master_key_b64: str = Field(min_length=1, max_length=256)
    device_id: str = Field(min_length=1, max_length=128)
    account_id: str = Field(min_length=1, max_length=64)
    since_updated_at: str | None = None
    pull_cursor: int = Field(default=0, ge=0)


@router.get("/local/status")
def local_status() -> dict[str, Any]:
    """Expose whether cloud URL is configured (no secrets)."""
    from sync_engine import cloud_url_from_env

    url = cloud_url_from_env()
    return {"cloud_configured": bool(url), "cloud_url_hint": url[:32] + "…" if url else None}


@router.post("/run")
def run_sync(body: SyncRunBody) -> dict[str, Any]:
    """Pull+apply remote edits, then export, encrypt, and push local blobs."""
    from entitlement_gate import assert_may_use_sync
    from sync_engine import run_sync_cycle

    assert_may_use_sync()
    return run_sync_cycle(
        cloud_url=body.cloud_url.rstrip("/"),
        access_token=body.access_token,
        master_key_b64=body.master_key_b64,
        device_id=body.device_id,
        account_id=body.account_id,
        since_updated_at=body.since_updated_at,
        pull_cursor=body.pull_cursor,
    )
