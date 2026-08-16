"""Isolated in-thread send. Server-locked To/thread. Not a tool."""

from __future__ import annotations

import base64
import email.mime.text
import logging
from datetime import UTC, datetime
from typing import Any

from mail_initiative import store

logger = logging.getLogger(__name__)

_SUBJECT_MAX = 200
_BODY_MAX = 8000


class SendRejected(Exception):
    def __init__(self, code: str, http_status: int) -> None:
        super().__init__(code)
        self.code = code
        self.http_status = http_status


def sanitize_header(value: str) -> str:
    return (value or "").replace("\r", "").replace("\n", "").replace("\0", "").strip()


def _token_expired(row: dict[str, Any]) -> bool:
    try:
        expires = datetime.fromisoformat(str(row["expires_at"]).replace("Z", "+00:00"))
    except ValueError:
        return True
    return expires <= datetime.now(UTC)


def _complete_thread_tasks(message_ids: list[str]) -> int:
    import tasks_store

    done = 0
    for mid in message_ids:
        ext = f"gmail:mail:{mid}"
        task = tasks_store.get_task_by_external_id(ext)
        if not task or task.get("completed") or task.get("dismissed"):
            continue
        updated = tasks_store.set_completed(int(task["id"]), True)
        if updated:
            done += 1
    return done


def send_reply(*, draft_token: str, subject: str, body: str) -> dict[str, Any]:
    from mail_initiative.gmail_api import get_thread_metadata, send_raw

    row = store.get_draft_token(draft_token)
    if not row:
        raise SendRejected("token_unknown", 404)
    if row["used"]:
        raise SendRejected("token_used", 409)
    if _token_expired(row):
        raise SendRejected("token_expired", 409)

    clean_subject = sanitize_header(subject)[:_SUBJECT_MAX]
    clean_body = (body or "").replace("\0", "").strip()[:_BODY_MAX]
    if not clean_body:
        raise SendRejected("empty_body", 422)
    if clean_subject != subject.strip() or "\r" in subject or "\n" in subject:
        raise SendRejected("bad_subject", 422)

    live_ids: list[str] = []
    try:
        live = get_thread_metadata(row["thread_id"])
        messages = [m for m in (live.get("messages") or []) if isinstance(m, dict)]
        if not messages:
            raise SendRejected("thread_gone", 409)
        last_id = str(messages[-1].get("id") or "")
        if row["last_message_id"] and last_id and last_id != row["last_message_id"]:
            raise SendRejected("thread_changed", 409)
        live_ids = [str(m.get("id") or "") for m in messages if m.get("id")]
    except SendRejected:
        raise
    except Exception:
        logger.exception("mail reply pre-send thread check failed")

    msg = email.mime.text.MIMEText(clean_body, _charset="utf-8")
    msg["To"] = sanitize_header(row["to_email"])
    msg["Subject"] = clean_subject
    if row["in_reply_to"]:
        msg["In-Reply-To"] = sanitize_header(row["in_reply_to"])
    if row["references_hdr"]:
        msg["References"] = sanitize_header(row["references_hdr"])

    raw = base64.urlsafe_b64encode(msg.as_bytes()).decode()
    send_raw(raw, row["thread_id"])
    store.mark_token_used(draft_token)
    completed = _complete_thread_tasks(live_ids or row["message_ids"])
    store.delete_candidate(int(row["candidate_id"]))
    store.revoke_tokens_for_candidate(int(row["candidate_id"]))
    return {"ok": True, "tasks_completed": completed}
