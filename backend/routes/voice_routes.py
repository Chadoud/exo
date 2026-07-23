"""
WebSocket endpoint: /ws/voice

Protocol:
  - Client sends binary PCM frames (int16, 16 kHz, mono) OR JSON text:
      {"type":"tool_approved","call_id":"<id>","scope":"once"|"session"}
      | {"type":"tool_denied","call_id":"<id>"}
      | {"type":"abort_briefing"} | {"type":"text_input","text":"..."}
      | {"type":"ptt_end"}
      | briefing_offer_accept | briefing_offer_skip_session | briefing_offer_never
      | briefing_offer_always | briefing_offer_cancel | briefing_offer_retry
  - Server sends JSON text frames: session_start | transcript_* | audio_out |
      tool_approval_required | tool_running | tool_idle | tool_result |
      turn_complete | briefing_progress | briefing_offer | briefing_loading |
      briefing_offer_error | briefing_offer_clear | voice_session_end | done | error
  - Client may send {"type":"provider_relay","provider":"gemini","model":"...","api_key":"..."}
    so plan_and_execute uses the same engine as text chat.
  - Zero-length binary frame stops the session.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
from datetime import datetime

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from assistant_memory import format_memory_for_prompt
from provider_context import ProviderContextHolder, provider_context_from_payload
from voice.briefing import (
    CLIENT_OFFER_TYPES,
    BriefingOfferController,
    drain_queued_briefing_injections,
    get_startup_briefing_consent,
    get_startup_message,
    stream_briefing_sections,
)
from voice.model import GEMINI_VOICE_MODEL_DEFAULT, resolve_gemini_voice_model
from voice.observability import log_voice_event
from voice.pending_delete_sync import PendingDeleteSyncHolder, pending_delete_blocks_briefing
from voice_briefing_consent import (
    looks_like_briefing_decline,
    looks_like_briefing_enable,
    persist_briefing_always,
    persist_briefing_consent,
)
from voice_briefing_gate import (
    VoiceBriefingGate,
    bind_voice_briefing_gate,
    clear_voice_briefing_gate,
)
from voice_instructions import CORE_PROTOCOL
from voice_session import run_voice_session
from voice_session_bootstrap import consume_voice_session_provider, prime_voice_session_provider
from voice_tool_approval import VoiceToolApprovalWaiter
from voice_ws_auth import authenticate_voice_websocket
from voice_ws_rate_limit import record_voice_ws_auth_failure, voice_ws_auth_allowed

logger = logging.getLogger(__name__)

router = APIRouter(tags=["voice"])


def _build_system_instruction(include_memory: bool = True) -> str:
    """Build the full system instruction with live date/time + memory + protocol."""
    now = datetime.now()
    time_block = (
        f"[CURRENT DATE & TIME]\n"
        f"{now.strftime('%A, %B %d, %Y — %I:%M %p')}\n"
        "Use this for any time-sensitive tasks (reminders, schedules, countdowns).\n"
    )
    parts = [time_block]
    if include_memory:
        memory = format_memory_for_prompt()
        if memory:
            parts.append(memory)
    parts.append(CORE_PROTOCOL)
    return "\n\n".join(parts)


@router.get("/voice/status")
async def voice_status() -> JSONResponse:
    """Returns whether voice is ready to use (API key present)."""
    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    model = resolve_gemini_voice_model()
    return JSONResponse({
        "ready": bool(api_key),
        "model": model,
        "default_model": GEMINI_VOICE_MODEL_DEFAULT,
        "missing": [] if api_key else ["GEMINI_API_KEY"],
    })


class VoiceSessionPrimeBody(BaseModel):
    session_id: str = Field(..., min_length=1)
    provider: str = "gemini"
    model: str = ""
    api_key: str = ""
    base_url: str = ""


@router.post("/voice/session-prime")
async def voice_session_prime(body: VoiceSessionPrimeBody) -> JSONResponse:
    """
    Prime provider context for an upcoming voice WebSocket (main process only).

    OAuth tokens are relayed separately via POST /integration/token-relay.
    """
    prime_voice_session_provider(
        body.session_id,
        {
            "provider": body.provider,
            "model": body.model,
            "api_key": body.api_key,
            "base_url": body.base_url,
        },
    )
    return JSONResponse({"ok": True})


@router.post("/voice/ws-ticket")
async def voice_ws_ticket() -> JSONResponse:
    """Mint a one-shot short-lived ticket for voice WebSocket app_auth (M2.3)."""
    from voice_ws_tickets import mint_voice_ws_ticket

    return JSONResponse({"ok": True, "ticket": mint_voice_ws_ticket()})


_MEETING_TRANSCRIBE_INSTRUCTION = (
    "You are silently transcribing a meeting. Do not respond, do not speak, do not "
    "call any tools. Only listen."
)


@router.websocket("/ws/voice")
async def voice_ws(
    ws: WebSocket,
    memory: bool = True,
    startup: bool = True,
    mode: str = "assistant",
    meeting_id: str | None = None,
    session_id: str | None = None,
    autonomous_mode: bool = False,
) -> None:
    client_host = ws.client.host if ws.client else None
    await ws.accept()
    if not voice_ws_auth_allowed(client_host):
        await ws.close(code=4429, reason="Too many auth failures")
        return

    # Auth after accept so browsers can send first-frame app_auth (no reliable WS headers).
    # Query ?token= is not accepted (M2.5) — header or app_auth frame only.
    if not await authenticate_voice_websocket(ws):
        record_voice_ws_auth_failure(client_host)
        await ws.close(code=4401, reason="Unauthorized")
        return

    log_voice_event(session_id, "connect", mode=mode)

    transcribe_mode = mode == "transcribe"
    if transcribe_mode:
        from meeting_store import has_active as _meeting_has_active

        # Validate the meeting exists so we never transcribe into the void.
        if not meeting_id or not _meeting_has_active(meeting_id):
            await ws.send_text(json.dumps({"type": "error", "message": "meeting_not_found"}))
            await ws.close()
            return
        startup = False

    system_instruction = (
        _MEETING_TRANSCRIBE_INSTRUCTION
        if transcribe_mode
        else _build_system_instruction(include_memory=memory)
    )

    audio_queue: asyncio.Queue[bytes | str | None] = asyncio.Queue(maxsize=512)
    approval_waiter = VoiceToolApprovalWaiter()
    provider_holder = ProviderContextHolder()
    pending_delete_holder = PendingDeleteSyncHolder()

    primed_provider = consume_voice_session_provider(session_id)
    if primed_provider is not None:
        provider_holder.update(primed_provider)
        logger.info(
            "[voice] session-prime consumed: preferred=%r model=%.48r",
            primed_provider.preferred,
            primed_provider.preferred_model or "",
        )

    # Persist across Gemini reconnects: tokens, turn pacing, barge-in, send lock.
    _tokens_ready = asyncio.Event()
    _turn_done: asyncio.Queue[None] = asyncio.Queue()
    _user_spoke = asyncio.Event()
    _ws_lock = asyncio.Lock()
    # Repeated barge-ins → persist declined (model save_memory is unreliable).
    _BRIEFING_ABORT_DECLINE_THRESHOLD = 2
    _briefing_abort_count = 0

    from connector_credentials import list_connected_providers

    if list_connected_providers():
        _tokens_ready.set()

    async def _send_frame(frame_json: str) -> bool:
        """Send a WS frame under the lock. Returns False if the connection is gone."""
        async with _ws_lock:
            try:
                await ws.send_text(frame_json)
                return True
            except Exception as exc:
                logger.warning("voice WS: send_text failed: %s", exc)
                return False

    async def _send_progress(section_label: str | None) -> None:
        # section=None signals the briefing is over so the UI hides the indicator.
        await _send_frame(json.dumps({"type": "briefing_progress", "section": section_label}))

    # Late-bound so the receive loop can forward offer frames once ready.
    offer_ref: dict[str, BriefingOfferController | None] = {"ctrl": None}

    async def _abort_briefing(*, reason: str) -> None:
        """Stop the briefing pipeline / land offer and drop queued sections."""
        nonlocal _briefing_abort_count
        _user_spoke.set()
        ctrl = offer_ref["ctrl"]
        if ctrl is not None and ctrl.is_active:
            await ctrl.preempt(reason=reason)
        dropped = drain_queued_briefing_injections(audio_queue)
        await _send_progress(None)
        if dropped:
            logger.info("[briefing] aborted (%s) — dropped %d queued section(s)", reason, dropped)
        else:
            logger.info("[briefing] aborted (%s)", reason)

        # Only barge-ins that interrupted a briefing that was actually mid-flight
        # count toward auto-decline (dropped sections means it was still running).
        if dropped:
            _briefing_abort_count += 1
            if (
                _briefing_abort_count >= _BRIEFING_ABORT_DECLINE_THRESHOLD
                and get_startup_briefing_consent() != "declined"
            ):
                if persist_briefing_consent("declined"):
                    logger.info(
                        "[briefing] auto-declined after %d barge-ins this session",
                        _briefing_abort_count,
                    )

    def _maybe_persist_briefing_consent(text: str) -> None:
        if pending_delete_blocks_briefing(pending_delete_holder):
            return
        if looks_like_briefing_decline(text):
            if get_startup_briefing_consent() != "declined":
                persist_briefing_consent("declined")
        elif looks_like_briefing_enable(text):
            if get_startup_briefing_consent() != "granted":
                persist_briefing_always()

    # ── Receive loop ──────────────────────────────────────────────────────────
    async def _receive_loop() -> None:
        try:
            while True:
                raw = await ws.receive()
                if raw["type"] == "websocket.disconnect":
                    await audio_queue.put(None)
                    break
                if raw["type"] != "websocket.receive":
                    continue
                if "bytes" in raw and raw["bytes"] is not None:
                    data = raw["bytes"]
                    if len(data) == 0:
                        await audio_queue.put(None)
                        break
                    await audio_queue.put(data)
                    continue
                if "text" in raw and raw["text"]:
                    try:
                        payload = json.loads(raw["text"])
                    except json.JSONDecodeError as exc:
                        logger.debug("voice WS: ignoring malformed JSON frame: %s", exc)
                        continue
                    msg_type = payload.get("type")

                    if msg_type == "provider_relay":
                        ctx = provider_context_from_payload(payload)
                        if ctx is not None:
                            provider_holder.update(ctx)
                            logger.info(
                                "[voice] provider_relay: preferred=%r model=%.48r",
                                ctx.preferred,
                                ctx.preferred_model or "",
                            )
                        continue

                    if msg_type == "token_relay":
                        from connector_credentials import store_token
                        tokens = payload.get("tokens", {})
                        if isinstance(tokens, dict):
                            for pid, tok_info in tokens.items():
                                if isinstance(tok_info, dict) and tok_info.get("token"):
                                    store_token(
                                        str(pid),
                                        str(tok_info["token"]),
                                        int(tok_info.get("expires_in") or 0),
                                    )
                                    logger.info(
                                        "[voice] token_relay: stored token for provider=%r",
                                        pid,
                                    )
                            # The generic "google" token backs briefing fetches; prefer
                            # the calendar grant first since the briefing's calendar
                            # section is the most reconnect-sensitive read.
                            for google_pid in ("google-calendar", "google-gmail", "google-drive"):
                                info = tokens.get(google_pid)
                                if isinstance(info, dict) and info.get("token"):
                                    store_token(
                                        "google",
                                        str(info["token"]),
                                        int(info.get("expires_in") or 0),
                                    )
                                    break
                            for ms_pid in ("microsoft", "onedrive", "outlook"):
                                info = tokens.get(ms_pid)
                                if isinstance(info, dict) and info.get("token"):
                                    store_token(
                                        "microsoft",
                                        str(info["token"]),
                                        int(info.get("expires_in") or 0),
                                    )
                                    break
                        _tokens_ready.set()
                        continue

                    if msg_type in CLIENT_OFFER_TYPES:
                        ctrl = offer_ref["ctrl"]
                        if ctrl is not None:
                            await ctrl.handle_client_type(str(msg_type))
                        continue

                    if msg_type == "abort_briefing":
                        await _abort_briefing(reason="client_abort")
                        continue

                    if msg_type == "pending_calendar_delete_sync":
                        draft = payload.get("draft")
                        if isinstance(draft, dict) and draft.get("awaitingConfirm"):
                            if pending_delete_holder.draft != draft:
                                logger.debug(
                                    "[voice] pending_calendar_delete synced from client"
                                )
                            pending_delete_holder.draft = draft
                        else:
                            if pending_delete_holder.draft is not None:
                                logger.debug(
                                    "[voice] pending_calendar_delete cleared from client"
                                )
                            pending_delete_holder.draft = None
                        continue

                    if msg_type == "text_input":
                        text_payload = str(payload.get("text", "")).strip()
                        if text_payload:
                            _maybe_persist_briefing_consent(text_payload)
                            await _abort_briefing(reason="typed_task")
                            await audio_queue.put(text_payload)
                        continue

                    if msg_type == "ptt_end":
                        await audio_queue.put("[PTT_END]")
                        continue

                    call_id = str(payload.get("call_id", "")).strip()
                    if not call_id:
                        continue
                    if msg_type == "tool_approved":
                        scope = str(payload.get("scope", "once")).strip().lower()
                        if scope == "session":
                            approval_waiter.grant_screen_capture_session()
                        approval_waiter.resolve(call_id, True)
                    elif msg_type == "tool_denied":
                        approval_waiter.resolve(call_id, False)
        except WebSocketDisconnect:
            await audio_queue.put(None)

    receive_task = asyncio.create_task(_receive_loop())

    # Bridge free-tier 429s from background threads onto this WS.
    from orchestrator.quota_notice import register_quota_listener

    _quota_loop = asyncio.get_running_loop()

    def _on_quota_notice(event: dict[str, str]) -> None:
        frame = json.dumps({"type": "quota_hint", **event})

        def _enqueue() -> None:
            asyncio.create_task(_send_frame(frame))

        try:
            _quota_loop.call_soon_threadsafe(_enqueue)
        except RuntimeError:
            logger.debug("[voice] loop closed; dropped quota hint", exc_info=True)

    _unregister_quota = register_quota_listener(_on_quota_notice)

    briefing_gate = VoiceBriefingGate()
    bind_voice_briefing_gate(briefing_gate)

    async def _run_briefing_pipeline() -> None:
        routine = get_startup_message()
        if not routine:
            return
        await stream_briefing_sections(
            routine=routine,
            audio_queue=audio_queue,
            tokens_ready=_tokens_ready,
            turn_done=_turn_done,
            user_spoke=_user_spoke,
            send_progress=_send_progress,
        )

    offer = BriefingOfferController(
        send_frame=_send_frame,
        run_pipeline=_run_briefing_pipeline,
        pending_delete_holder=pending_delete_holder,
        clear_barge_in=_user_spoke.clear,
    )
    offer_ref["ctrl"] = offer

    async def _start_briefing_after_consent() -> None:
        await offer.start_from_gate()

    briefing_gate.configure(_start_briefing_after_consent)

    startup_message: str | None = await offer.begin_land() if startup else None

    try:
        async for frame_json in run_voice_session(
            audio_queue,
            system_instruction,
            approval_waiter,
            memory_enabled=memory,
            startup_message=startup_message,
            turn_done=_turn_done,
            user_spoke=_user_spoke,
            transcription_only=transcribe_mode,
            meeting_id=meeting_id if transcribe_mode else None,
            provider_holder=provider_holder,
            pending_delete_holder=pending_delete_holder,
            allow_sensitive=autonomous_mode,
        ):
            if offer.is_offering:
                try:
                    parsed = json.loads(frame_json)
                except json.JSONDecodeError:
                    parsed = None
                if isinstance(parsed, dict) and parsed.get("type") == "transcript_user_full":
                    spoken = str(parsed.get("text") or "").strip()
                    if spoken and not await offer.on_user_transcript(spoken):
                        await offer.preempt(reason="non_consent_intent")
            if not await _send_frame(frame_json):
                break
    except Exception:
        logger.exception("Error in voice WebSocket handler")
    finally:
        log_voice_event(session_id, "disconnect")
        await offer.cleanup()
        _unregister_quota()
        briefing_gate.clear()
        clear_voice_briefing_gate()
        receive_task.cancel()
        try:
            await receive_task
        except asyncio.CancelledError:
            pass
        try:
            await ws.close()
        except Exception as exc:
            logger.debug("voice WS: close() raised (already disconnected?): %s", exc)
