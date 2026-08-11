"""
GO SYNC client engine — export local stores, encrypt, push/pull via cloud relay.

Uses deterministic per-record keys derived from master key so re-sync is idempotent.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import sys
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import httpx

logger = logging.getLogger(__name__)

def _ensure_sync_crypto_import_path() -> None:
    """Dev: repo layout. Packaged: exosites_crypto is a PyInstaller hiddenimport."""
    try:
        import exosites_crypto  # noqa: F401

        return
    except ImportError:
        pass
    candidates = [
        Path(__file__).resolve().parent.parent / "sync" / "client" / "crypto",
    ]
    meipass = getattr(sys, "_MEIPASS", None)
    if meipass:
        candidates.append(Path(meipass) / "sync" / "client" / "crypto")
        candidates.append(Path(meipass))
    for path in candidates:
        if path.is_dir() and str(path) not in sys.path:
            sys.path.insert(0, str(path))
            try:
                import exosites_crypto  # noqa: F401

                return
            except ImportError:
                continue
    raise ImportError(
        "exosites_crypto not found — rebuild backend with sync/client/crypto on pathex"
    )


_ensure_sync_crypto_import_path()

from exosites_crypto import (  # noqa: E402
    SCHEMA_V2,
    SCHEMA_V3,
    aad_bytes,
    build_envelope,
    content_hash,
    decrypt_record,
)

import sync_export  # noqa: E402


def _record_key(master_key: bytes, collection: str, record_id: str) -> bytes:
    """Stable 32-byte key per (collection, record_id)."""
    digest = hashlib.sha256(master_key + collection.encode() + record_id.encode()).digest()
    return digest


def _logical_clock(updated_at: str, record_id: str) -> int:
    """Best-effort monotonic clock from ISO timestamp + record id hash."""
    try:
        ts = datetime.fromisoformat(updated_at.replace("Z", "+00:00"))
        base = int(ts.timestamp())
    except ValueError:
        base = 0
    tail = int(hashlib.sha256(record_id.encode()).hexdigest()[:8], 16) % 1000
    return base * 1000 + tail


def export_encrypted_blobs(
    *,
    master_key: bytes,
    device_id: str,
    account_id: str,
    since_updated_at: str | None = None,
) -> list[dict[str, Any]]:
    """Export all sync collections as encrypted blob envelopes (schema v3)."""
    if len(master_key) != 32:
        raise ValueError("master_key must be 32 bytes")
    if not account_id:
        raise ValueError("account_id is required")
    blobs: list[dict[str, Any]] = []
    for item in sync_export.export_all(since_updated_at=since_updated_at):
        collection = str(item["collection"])
        record_id = str(item["record_id"])
        updated_at = str(item["updated_at"])
        plaintext = sync_export.serialize_payload(item["payload"])
        rkey = _record_key(master_key, collection, record_id)
        blobs.append(
            build_envelope(
                collection=collection,
                record_id=record_id,
                device_id=device_id,
                logical_clock=_logical_clock(updated_at, record_id),
                updated_at=updated_at,
                plaintext=plaintext,
                record_key=rkey,
                schema_version=SCHEMA_V3,
                account_id=account_id,
            )
        )
    return blobs


def push_blobs(
    *,
    cloud_url: str,
    access_token: str,
    blobs: list[dict[str, Any]],
    batch_size: int = 50,
) -> dict[str, Any]:
    """Push encrypted blobs to the cloud relay in batches."""
    base = cloud_url.rstrip("/")
    headers = {"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"}
    accepted = 0
    cursor = 0
    with httpx.Client(timeout=60.0) as client:
        for i in range(0, len(blobs), batch_size):
            batch = blobs[i : i + batch_size]
            resp = client.post(f"{base}/v1/sync/blobs/push", headers=headers, json={"blobs": batch})
            resp.raise_for_status()
            data = resp.json()
            accepted += int(data.get("accepted", len(batch)))
            cursor = int(data.get("cursor", cursor))
    return {"accepted": accepted, "cursor": cursor, "pushed": len(blobs)}


def pull_blobs(
    *,
    cloud_url: str,
    access_token: str,
    cursor: int = 0,
    limit: int = 200,
) -> dict[str, Any]:
    """Pull encrypted blobs since cursor."""
    base = cloud_url.rstrip("/")
    headers = {"Authorization": f"Bearer {access_token}"}
    with httpx.Client(timeout=60.0) as client:
        resp = client.get(
            f"{base}/v1/sync/blobs/pull",
            headers=headers,
            params={"cursor": cursor, "limit": limit},
        )
        resp.raise_for_status()
        return resp.json()


def decrypt_envelope(
    envelope: dict[str, Any],
    master_key: bytes,
    *,
    account_id: str | None = None,
) -> dict[str, Any]:
    """Decrypt a pulled blob envelope to payload dict (v2+/v3 verifies AAD metadata)."""
    collection = str(envelope["collection"])
    record_id = str(envelope["record_id"])
    device_id = str(envelope.get("device_id") or "")
    logical_clock = int(envelope.get("logical_clock") or 0)
    deleted = bool(envelope.get("deleted", False))
    schema_version = int(envelope.get("schema_version") or 1)
    rkey = _record_key(master_key, collection, record_id)
    aad = None
    if schema_version >= SCHEMA_V2:
        aad = aad_bytes(
            collection=collection,
            record_id=record_id,
            device_id=device_id,
            logical_clock=logical_clock,
            deleted=deleted,
            schema_version=schema_version,
            account_id=account_id,
        )
    plain = decrypt_record(str(envelope["ciphertext"]), rkey, aad=aad)
    payload = json.loads(plain.decode("utf-8")) if plain else {}
    if content_hash(plain) != envelope.get("content_hash"):
        logger.warning("content_hash mismatch for %s/%s", collection, record_id)
    return {
        "collection": collection,
        "record_id": record_id,
        "payload": payload,
        "deleted": deleted,
        "device_id": device_id,
        "logical_clock": logical_clock,
    }


def pull_and_apply_changes(
    *,
    cloud_url: str,
    access_token: str,
    master_key: bytes,
    account_id: str,
    device_id: str,
    cursor: int = 0,
) -> dict[str, Any]:
    """Pull the change feed since cursor and apply allowlisted remote edits.

    Tolerant per record — an undecryptable or unknown row is counted and
    skipped, never fatal (the desktop is the source of truth and must not
    brick on legacy ciphertext).
    """
    import sync_apply

    applied = 0
    skipped = 0
    undecryptable = 0
    guard = 0
    while True:
        guard += 1
        if guard > 200:
            break
        page = pull_blobs(cloud_url=cloud_url, access_token=access_token, cursor=cursor)
        if page.get("resync_required"):
            # History was compacted past our cursor. Desktop holds the truth,
            # so skip the snapshot replay and resume at the feed head.
            cursor = int(page.get("resume_cursor") or page.get("cursor") or cursor)
            break
        for env in page.get("blobs") or []:
            try:
                record = decrypt_envelope(env, master_key, account_id=account_id)
            except Exception:
                undecryptable += 1
                continue
            outcome = sync_apply.apply_remote_task_completion(record, own_device_id=device_id)
            if outcome == sync_apply.APPLIED:
                applied += 1
            else:
                skipped += 1
        cursor = int(page.get("cursor") or cursor)
        if not page.get("has_more"):
            break
    return {
        "applied": applied,
        "skipped": skipped,
        "undecryptable": undecryptable,
        "cursor": cursor,
    }


def run_sync_cycle(
    *,
    cloud_url: str,
    access_token: str,
    master_key_b64: str,
    device_id: str,
    account_id: str,
    since_updated_at: str | None = None,
    pull_cursor: int = 0,
) -> dict[str, Any]:
    """Full cycle: pull+apply remote edits, then export → encrypt → push.

    Pull runs first so a (re-)push can never overwrite a phone edit that is
    already on the relay. Pull failures degrade to push-only — backup must
    not stop because the apply phase had an issue.
    """
    import base64

    master_key = base64.b64decode(master_key_b64)
    sync_run_id = str(uuid.uuid4())
    started = datetime.now(UTC).isoformat()
    next_pull_cursor = pull_cursor
    pull_stats: dict[str, Any]
    try:
        pull_stats = pull_and_apply_changes(
            cloud_url=cloud_url,
            access_token=access_token,
            master_key=master_key,
            account_id=account_id,
            device_id=device_id,
            cursor=pull_cursor,
        )
        next_pull_cursor = int(pull_stats.get("cursor") or pull_cursor)
    except Exception as exc:
        logger.exception("sync pull/apply failed — continuing with push")
        pull_stats = {"error": str(exc)}
    try:
        blobs = export_encrypted_blobs(
            master_key=master_key,
            device_id=device_id,
            account_id=account_id,
            since_updated_at=since_updated_at,
        )
        result = push_blobs(cloud_url=cloud_url, access_token=access_token, blobs=blobs)
        return {
            "ok": True,
            "sync_run_id": sync_run_id,
            "started_at": started,
            "finished_at": datetime.now(UTC).isoformat(),
            "blob_count": len(blobs),
            "pull": pull_stats,
            "next_pull_cursor": next_pull_cursor,
            **result,
        }
    except Exception as exc:
        logger.exception("sync push failed")
        return {
            "ok": False,
            "sync_run_id": sync_run_id,
            "started_at": started,
            "error": str(exc),
            "pull": pull_stats,
            "next_pull_cursor": next_pull_cursor,
        }


def cloud_url_from_env() -> str:
    return (os.environ.get("EXOSITES_CLOUD_URL") or "").strip().rstrip("/")
