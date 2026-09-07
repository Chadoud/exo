"""GO SYNC pending_actions for mail replies — no draft_token in the payload."""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any

from mail_initiative import action_acks, store
from mail_initiative.reply import SendRejected

logger = logging.getLogger(__name__)

COLLECTION = "pending_actions"
TYPE_MAIL_REPLY = "mail_reply"
RECORD_PREFIX = "mail_reply:"
ALLOWED_CONFIRM_FIELDS = frozenset(
    {"status", "subject", "body", "updated_at", "type", "source_id", "to_name", "to_email", "error_class"}
)

STATUS_READY = "ready"
STATUS_CONFIRMED = "confirmed"
STATUS_SENT = "sent"
STATUS_STALE = "stale_thread"
STATUS_NEEDS_DESKTOP = "needs_desktop"


def record_id_for(candidate_id: int) -> str:
    return f"{RECORD_PREFIX}{int(candidate_id)}"


def parse_candidate_id(record_id: str) -> int | None:
    raw = str(record_id or "")
    if not raw.startswith(RECORD_PREFIX):
        return None
    try:
        return int(raw[len(RECORD_PREFIX) :])
    except ValueError:
        return None


def _payload_from_candidate(row: dict[str, Any], status: str, *, error_class: str = "") -> dict[str, Any]:
    subject = str(row.get("draft_subject") or row.get("subject") or "")
    return {
        "type": TYPE_MAIL_REPLY,
        "status": status,
        "source_id": record_id_for(int(row["id"])),
        "to_name": str(row.get("from_name") or ""),
        "to_email": str(row.get("from_email") or ""),
        "subject": subject[:200],
        "body": str(row.get("draft_body") or "")[:8000],
        "error_class": error_class,
        "updated_at": str(row.get("created_at") or datetime.now(UTC).isoformat()),
    }


def export_pending_actions() -> list[dict[str, Any]]:
    """Ready drafts + acks. Never includes draft_token."""
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    for row in store.list_candidates(limit=20, drafted_only=True):
        rid = record_id_for(int(row["id"]))
        ack = action_acks.get_ack(rid)
        status = str(ack["status"]) if ack else STATUS_READY
        if status == STATUS_SENT:
            out.append(
                {
                    "collection": COLLECTION,
                    "record_id": rid,
                    "payload": {},
                    "updated_at": ack["updated_at"] if ack else datetime.now(UTC).isoformat(),
                    "deleted": True,
                }
            )
            seen.add(rid)
            continue
        payload = _payload_from_candidate(row, status, error_class=(ack or {}).get("error_class") or "")
        payload["updated_at"] = (ack or {}).get("updated_at") or payload["updated_at"]
        out.append(
            {
                "collection": COLLECTION,
                "record_id": rid,
                "payload": payload,
                "updated_at": payload["updated_at"],
                "deleted": False,
            }
        )
        seen.add(rid)
    for ack in action_acks.list_acks():
        if ack["record_id"] in seen:
            continue
        if ack["status"] == STATUS_SENT:
            out.append(
                {
                    "collection": COLLECTION,
                    "record_id": ack["record_id"],
                    "payload": {},
                    "updated_at": ack["updated_at"],
                    "deleted": True,
                }
            )
    return out


def apply_confirmed(*, record_id: str, subject: str, body: str) -> str:
    """Mint a local draft token and send. Token never leaves this process."""
    from mail_initiative.draft import create_draft
    from mail_initiative.reply import send_reply

    candidate_id = parse_candidate_id(record_id)
    if candidate_id is None:
        return "skipped_invalid"
    existing = action_acks.get_ack(record_id)
    if existing and existing.get("status") == STATUS_SENT:
        return "skipped_noop"
    action_acks.upsert_ack(record_id, STATUS_CONFIRMED)
    try:
        draft = create_draft(candidate_id)
    except LookupError as exc:
        code = str(exc) or STATUS_NEEDS_DESKTOP
        status = STATUS_STALE if code == "thread_changed" else STATUS_NEEDS_DESKTOP
        action_acks.upsert_ack(record_id, status, error_class=code)
        logger.info("pending_actions drain draft failed record=%s class=%s", record_id, code)
        return status
    except Exception:
        action_acks.upsert_ack(record_id, STATUS_NEEDS_DESKTOP, error_class="draft_failed")
        logger.exception("pending_actions create_draft failed")
        return STATUS_NEEDS_DESKTOP
    token = draft.get("draft_token")
    if not token:
        action_acks.upsert_ack(record_id, STATUS_NEEDS_DESKTOP, error_class="no_token")
        return STATUS_NEEDS_DESKTOP
    try:
        send_reply(draft_token=str(token), subject=subject, body=body)
    except SendRejected as exc:
        status = STATUS_STALE if exc.code in {"thread_changed", "thread_gone"} else STATUS_NEEDS_DESKTOP
        action_acks.upsert_ack(record_id, status, error_class=exc.code)
        logger.info("pending_actions send rejected record=%s class=%s", record_id, exc.code)
        return status
    action_acks.upsert_ack(record_id, STATUS_SENT)
    return "applied"


def apply_remote_pending_action(record: dict[str, Any], *, own_device_id: str) -> str:
    if record.get("collection") != COLLECTION:
        return "skipped_collection"
    if str(record.get("device_id") or "") == own_device_id:
        return "skipped_own_device"
    payload = record.get("payload") or {}
    if not isinstance(payload, dict):
        return "skipped_invalid"
    extra = set(payload) - ALLOWED_CONFIRM_FIELDS
    if extra:
        logger.warning("pending_actions rejected extra payload keys")
        return "skipped_invalid"
    if payload.get("type") not in (None, TYPE_MAIL_REPLY):
        return "skipped_invalid"
    if payload.get("status") != STATUS_CONFIRMED:
        return "skipped_noop"
    subject = str(payload.get("subject") or "").strip()
    body = str(payload.get("body") or "").strip()
    if not body:
        return "skipped_invalid"
    return apply_confirmed(
        record_id=str(record.get("record_id") or ""),
        subject=subject,
        body=body,
    )
