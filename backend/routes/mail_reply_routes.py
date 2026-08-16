"""Dedicated ready-to-send Gmail reply API. Not registered as an assistant tool."""

from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from telemetry.rate_limit_memory import allow

router = APIRouter(tags=["mail-replies"])

GatedReason = Literal["pro", "toggle_off", "no_scope", "disabled"]


class MailReplyItem(BaseModel):
    id: int
    from_name: str
    from_local_part: str
    subject: str
    created_at: str


class MailReplyListResponse(BaseModel):
    items: list[MailReplyItem]
    enabled: bool
    can_send: bool
    gated_reason: GatedReason | None = None


class MailReplySettings(BaseModel):
    enabled: bool


class MailReplySettingsPatch(BaseModel):
    enabled: bool


class MailReplyDraftResponse(BaseModel):
    draft_token: str
    to_name: str
    to_email: str
    subject: str
    body: str


class MailReplySendBody(BaseModel):
    draft_token: str = Field(min_length=8, max_length=128)
    subject: str = Field(default="", max_length=200)
    body: str = Field(default="", max_length=8000)
    to: str | None = None
    cc: str | None = None
    bcc: str | None = None
    threadId: str | None = None
    thread_id: str | None = None


def _local_part(email_addr: str) -> str:
    if "@" not in email_addr:
        return email_addr
    return email_addr.split("@", 1)[0]


def _public_item(row: dict[str, Any]) -> MailReplyItem:
    return MailReplyItem(
        id=int(row["id"]),
        from_name=str(row.get("from_name") or ""),
        from_local_part=_local_part(str(row.get("from_email") or "")),
        subject=str(row.get("subject") or ""),
        created_at=str(row.get("created_at") or ""),
    )


@router.get("/mail/replies", response_model=MailReplyListResponse)
def list_mail_replies() -> MailReplyListResponse:
    from mail_initiative import store
    from mail_initiative.settings import gated_reason, has_send_scope, is_enabled

    reason = gated_reason()
    items = [] if reason else [_public_item(r) for r in store.list_candidates(limit=3)]
    return MailReplyListResponse(
        items=items,
        enabled=is_enabled(),
        can_send=reason is None and has_send_scope(),
        gated_reason=reason,
    )


@router.get("/mail/replies/settings", response_model=MailReplySettings)
def get_mail_reply_settings() -> MailReplySettings:
    from mail_initiative.settings import is_enabled

    return MailReplySettings(enabled=is_enabled())


@router.patch("/mail/replies/settings", response_model=MailReplySettings)
def patch_mail_reply_settings(body: MailReplySettingsPatch) -> MailReplySettings:
    from mail_initiative.settings import is_enabled, set_enabled

    set_enabled(body.enabled)
    return MailReplySettings(enabled=is_enabled())


@router.post("/mail/replies/clear")
def clear_mail_replies() -> dict[str, bool]:
    """Wipe ready-reply state after Gmail disconnect (not a public product toggle)."""
    from connector_credentials import clear_token
    from mail_initiative.store import clear_all

    clear_all()
    clear_token("google-gmail")
    return {"ok": True}


@router.post("/mail/replies/{candidate_id}/dismiss")
def dismiss_mail_reply(candidate_id: int) -> dict[str, bool]:
    from mail_initiative import store

    cand = store.get_candidate(candidate_id)
    if not cand:
        raise HTTPException(status_code=404, detail="not_found")
    store.dismiss_thread(str(cand["thread_id"]))
    store.revoke_tokens_for_candidate(candidate_id)
    store.delete_candidate(candidate_id)
    return {"ok": True}


@router.post("/mail/replies/{candidate_id}/draft", response_model=MailReplyDraftResponse)
def draft_mail_reply(candidate_id: int) -> MailReplyDraftResponse:
    from entitlement_gate import assert_may_use_proactive
    from mail_initiative.draft import create_draft
    from mail_initiative.settings import gated_reason

    assert_may_use_proactive()
    reason = gated_reason()
    if reason == "pro":
        raise HTTPException(status_code=402, detail="proactive_required")
    if reason:
        raise HTTPException(status_code=403, detail=reason)
    if not allow("mail_reply_draft", 20, 86400):
        raise HTTPException(status_code=429, detail="draft_rate_limited")
    try:
        data = create_draft(candidate_id)
    except LookupError as exc:
        code = str(exc) or "not_found"
        status = 409 if code in {"thread_gone", "thread_changed"} else 404
        raise HTTPException(status_code=status, detail=code) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return MailReplyDraftResponse(**data)


@router.post("/mail/replies/send")
def send_mail_reply(body: MailReplySendBody) -> dict[str, Any]:
    from entitlement_gate import assert_may_use_proactive
    from mail_initiative.reply import SendRejected, send_reply
    from mail_initiative.settings import gated_reason

    assert_may_use_proactive()
    reason = gated_reason()
    if reason == "pro":
        raise HTTPException(status_code=402, detail="proactive_required")
    if reason:
        raise HTTPException(status_code=403, detail=reason)
    if not allow("mail_reply_send", 20, 86400):
        raise HTTPException(status_code=429, detail="send_rate_limited")
    if any(v is not None for v in (body.to, body.cc, body.bcc, body.threadId, body.thread_id)):
        raise HTTPException(status_code=422, detail="recipient_locked")
    try:
        return send_reply(
            draft_token=body.draft_token,
            subject=body.subject,
            body=body.body,
        )
    except SendRejected as exc:
        raise HTTPException(status_code=exc.http_status, detail=exc.code) from exc
