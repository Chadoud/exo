"""Gemini Live session loop: connect, receive turns, reconnect."""

from __future__ import annotations

import asyncio
import base64
import logging
import time
from typing import Any, AsyncGenerator

from provider_context import ProviderContextHolder
from services.turn import ToolTurnMeta, get_turn_service
from tool_registry import build_live_tools
from voice.audio_pipeline import (
    AudioSendLoopState,
    drain_stale_pcm_preserve_text,
    resolve_turn_user_text_raw,
    run_incoming_audio_send_loop,
)
from voice.errors import (
    VOICE_AUDIO_CONFIG_USER_MESSAGE,
    is_api_key_error,
    is_live_audio_config_error,
    is_quota_exhausted_error,
    is_transient_connection_error,
)
from voice.frames import frame
from voice.history import (
    append_voice_turn,
    format_system_instruction_with_history,
)
from voice.history import (
    recent_assistant_lines as get_recent_assistant_lines,
)
from voice.mutating_ops import is_mutating_voice_tool
from voice.mutating_speech import resolve_mutating_tool_speech
from voice.pending_delete_sync import PendingDeleteSyncHolder, hydrate_dispatch_pending_delete
from voice.tool_dispatch import (
    ToolDispatchState,
    handle_voice_tool_calls,
    process_pending_calendar_confirm,
    process_pending_calendar_delete_confirm,
)
from voice.transport import ReconnectState
from voice.turn_buffer import TurnBuffer
from voice.turn_trace import VoiceTurnTraceEntry
from voice_promise_guard import (
    PROMISE_NUDGE,
    TOOL_FAILED_NUDGE,
    looks_like_unfulfilled_promise,
)
from voice_tool_approval import VoiceToolApprovalWaiter

logger = logging.getLogger(__name__)


def strip_tool(tools: list[Any], tool_name: str) -> list[Any]:
    """Return a copy of the tools list with the named function declaration removed."""
    from google.genai import types as _gt  # type: ignore[import]

    result = []
    for tool_obj in tools:
        decls = list(getattr(tool_obj, "function_declarations", None) or [])
        filtered = [d for d in decls if getattr(d, "name", None) != tool_name]
        if filtered:
            result.append(_gt.Tool(function_declarations=filtered))
    return result


def build_live_connect_config(
    genai_types: Any,
    *,
    system_instruction: str,
    voice_history: list[dict[str, str]],
    transcription_only: bool,
    memory_enabled: bool,
    resume_handle: str | None = None,
) -> Any:
    """Build a ``LiveConnectConfig`` for transcription-only or full voice mode."""
    if transcription_only:
        return genai_types.LiveConnectConfig(
            response_modalities=["TEXT"],
            input_audio_transcription=genai_types.AudioTranscriptionConfig(),
            system_instruction=system_instruction,
            session_resumption=genai_types.SessionResumptionConfig(
                handle=resume_handle,
            ),
            context_window_compression=genai_types.ContextWindowCompressionConfig(
                sliding_window=genai_types.SlidingWindow(),
            ),
        )
    tools = build_live_tools()
    if not memory_enabled:
        tools = strip_tool(tools, "save_memory")
    return genai_types.LiveConnectConfig(
        response_modalities=["AUDIO"],
        input_audio_transcription=genai_types.AudioTranscriptionConfig(),
        output_audio_transcription=genai_types.AudioTranscriptionConfig(),
        system_instruction=format_system_instruction_with_history(
            system_instruction, voice_history
        ),
        speech_config=genai_types.SpeechConfig(
            voice_config=genai_types.VoiceConfig(
                prebuilt_voice_config=genai_types.PrebuiltVoiceConfig(
                    voice_name="Charon"
                )
            )
        ),
        tools=tools,
        session_resumption=genai_types.SessionResumptionConfig(
            handle=resume_handle,
        ),
        context_window_compression=genai_types.ContextWindowCompressionConfig(
            sliding_window=genai_types.SlidingWindow(),
        ),
    )


async def run_gemini_live_session(
    client: Any,
    model: str,
    *,
    incoming_audio: asyncio.Queue[bytes | str | None],
    system_instruction: str,
    approval_waiter: VoiceToolApprovalWaiter | None = None,
    memory_enabled: bool = True,
    startup_message: str | None = None,
    turn_done: asyncio.Queue[None] | None = None,
    user_spoke: asyncio.Event | None = None,
    transcription_only: bool = False,
    meeting_id: str | None = None,
    provider_holder: ProviderContextHolder | None = None,
    pending_delete_holder: PendingDeleteSyncHolder | None = None,
    allow_sensitive: bool = False,
) -> AsyncGenerator[str, None]:
    """
    Drive a persistent Gemini Live voice session with automatic reconnect.

    Yields JSON string frames for the WebSocket client.
    """
    from google.genai import types as genai_types  # type: ignore[import]

    from voice.model import GEMINI_VOICE_MODEL_DEFAULT

    voice_history: list[dict[str, str]] = []
    pending_tool_results: list[str] = []
    tool_dispatch_state = ToolDispatchState()
    briefing_consent_persisted = False

    reconnect = ReconnectState()
    session_handle: str | None = None
    startup_injected = False
    audio_send_state = AudioSendLoopState()
    active_model = model
    audio_model_fallback_tried = False

    while True:
        audio_send_state.stopped_explicitly = False
        session_started_at = 0.0
        hydrate_dispatch_pending_delete(tool_dispatch_state, pending_delete_holder)

        try:
            config = build_live_connect_config(
                genai_types,
                system_instruction=system_instruction,
                voice_history=voice_history,
                transcription_only=transcription_only,
                memory_enabled=memory_enabled,
                resume_handle=session_handle,
            )
            async with client.aio.live.connect(model=active_model, config=config) as session:
                yield frame("session_start", model=active_model)
                session_started_at = time.monotonic()

                if startup_message and not startup_injected:
                    startup_injected = True
                    await incoming_audio.put(f"[STARTUP] {startup_message}")
                    # Offer prompt only — WORKING is reserved for the accepted briefing pipeline.

                speaking = False
                turn_buffer = TurnBuffer()
                turn_out_parts: list[str] = []
                canonical_at_turn_start = ""

                async def _send_loop() -> None:
                    await run_incoming_audio_send_loop(
                        incoming_audio,
                        session,
                        genai_types,
                        audio_send_state,
                        user_spoke=user_spoke,
                    )

                send_task = asyncio.create_task(_send_loop())

                try:
                    while not audio_send_state.stopped_explicitly:
                        turn_produced = False
                        tool_called_this_turn = False
                        tool_ok_this_turn: bool | None = None
                        promise_nudged_this_turn = False
                        tool_dispatch_state.last_tool_ok = None
                        async for response in session.receive():
                            turn_produced = True
                            if hasattr(response, "server_content") and response.server_content:
                                sc = response.server_content

                                if hasattr(sc, "input_transcription") and sc.input_transcription:
                                    text = getattr(sc.input_transcription, "text", None) or ""
                                    if text:
                                        from voice_echo_guard import looks_like_echo_of_any
                                        from voice_transcript_quality import (
                                            is_voice_transcript_noise_placeholder,
                                        )

                                        if is_voice_transcript_noise_placeholder(text):
                                            logger.info(
                                                "[voice] dropped noise input transcription: %.48r",
                                                text,
                                            )
                                        else:
                                            current_assistant = " ".join(turn_out_parts).strip()
                                            recent_assistant_lines = get_recent_assistant_lines(
                                                voice_history
                                            )
                                            from services.calendar.delete_confirm import (
                                                is_delete_followup_reply,
                                            )

                                            awaiting_delete = (
                                                tool_dispatch_state.calendar_awaiting_confirm
                                                or tool_dispatch_state.pending_calendar_delete
                                                is not None
                                            )
                                            if (
                                                not awaiting_delete
                                                and not is_delete_followup_reply(text)
                                                and looks_like_echo_of_any(
                                                    text,
                                                    current_assistant,
                                                    *recent_assistant_lines,
                                                )
                                            ):
                                                logger.info(
                                                    "[voice] dropped input transcription — "
                                                    "likely speaker echo: %.48r",
                                                    text,
                                                )
                                            else:
                                                turn_buffer.append_chunk(text)
                                                yield frame("transcript_in", text=text)
                                                if turn_buffer.canonical:
                                                    yield frame(
                                                        "transcript_user_full",
                                                        text=turn_buffer.canonical,
                                                    )
                                                # Echo/noise must not abort the briefing. Only kept STT
                                                # is a real barge-in.
                                                if user_spoke is not None:
                                                    user_spoke.set()
                                            partial = turn_buffer.canonical
                                            if partial:
                                                audio_send_state.last_user_text = partial[:4000]
                                            if not briefing_consent_persisted and partial:
                                                from voice_briefing_consent import (
                                                    looks_like_briefing_decline,
                                                    persist_briefing_consent,
                                                )

                                                if looks_like_briefing_decline(partial):
                                                    persist_briefing_consent("declined")
                                                    briefing_consent_persisted = True
                                                    logger.info(
                                                        "[voice] persisted briefing "
                                                        "decline from speech"
                                                    )

                                if hasattr(sc, "output_transcription") and sc.output_transcription:
                                    text = getattr(sc.output_transcription, "text", None) or ""
                                    if text:
                                        turn_out_parts.append(text)
                                        yield frame("transcript_out", text=text)

                                if hasattr(sc, "model_turn") and sc.model_turn:
                                    for part in (sc.model_turn.parts or []):
                                        if hasattr(part, "inline_data") and part.inline_data:
                                            if not speaking:
                                                speaking = True
                                                logger.info(
                                                    "[voice] audio_out  speaking=True "
                                                    "(first chunk this turn)"
                                                )
                                                yield frame("speaking_start")
                                            audio_b64 = base64.b64encode(
                                                part.inline_data.data
                                            ).decode("ascii")
                                            yield frame("audio_out", data=audio_b64)

                                if getattr(sc, "interrupted", False):
                                    if speaking:
                                        speaking = False
                                        yield frame("speaking_end")
                                    yield frame("interrupted")

                                if getattr(sc, "turn_complete", False):
                                    if speaking:
                                        speaking = False
                                        yield frame("speaking_end")

                                    user_text_raw = resolve_turn_user_text_raw(
                                        stt_canonical=turn_buffer.canonical,
                                        pending_typed_user_text=audio_send_state.pending_typed_user_text,
                                    )
                                    if audio_send_state.pending_typed_user_text.strip():
                                        audio_send_state.pending_typed_user_text = ""
                                    assistant_text = " ".join(turn_out_parts).strip()
                                    trace_tool = tool_dispatch_state.last_trace_at_tool
                                    tool_meta = (
                                        ToolTurnMeta(
                                            tool_name=trace_tool.tool_name,
                                            tool_operation=trace_tool.tool_operation,
                                            tool_ok=trace_tool.tool_ok,
                                        )
                                        if trace_tool
                                        else None
                                    )
                                    turn_result = get_turn_service().commit(
                                        raw_user_text=user_text_raw,
                                        assistant_text=assistant_text,
                                        recent_assistant_lines=get_recent_assistant_lines(
                                            voice_history
                                        ),
                                        tool_meta=tool_meta,
                                    )
                                    user_text = turn_result.user_text
                                    user_committed = turn_result.user_committed
                                    drop_reason = turn_result.drop_reason
                                    if drop_reason == "junk":
                                        logger.info(
                                            "[voice] dropped junk user turn at "
                                            "turn_complete: %.48r",
                                            user_text_raw,
                                        )
                                    elif drop_reason == "echo":
                                        logger.info(
                                            "[voice] dropped user turn at turn_complete — "
                                            "likely speaker echo: %.48r",
                                            user_text_raw,
                                        )
                                    if user_text:
                                        audio_send_state.last_user_text = user_text[:4000]
                                    hydrate_dispatch_pending_delete(
                                        tool_dispatch_state, pending_delete_holder
                                    )
                                    if (
                                        user_committed
                                        and user_text
                                        and not transcription_only
                                        and (
                                            process_pending_calendar_delete_confirm(
                                                user_text,
                                                tool_dispatch_state,
                                                pending_tool_results,
                                                sync_holder=pending_delete_holder,
                                            )
                                            or process_pending_calendar_confirm(
                                                user_text,
                                                tool_dispatch_state,
                                                pending_tool_results,
                                            )
                                        )
                                    ):
                                        logger.info(
                                            "[voice] calendar_confirm handled at turn_complete"
                                        )
                                    if transcription_only and meeting_id and user_text:
                                        try:
                                            import meeting_store

                                            meeting_store.append_line(meeting_id, user_text)
                                        except Exception:
                                            logger.debug(
                                                "meeting transcript append failed", exc_info=True
                                            )
                                    append_voice_turn(voice_history, user_text, assistant_text)
                                    trace_entry = VoiceTurnTraceEntry(
                                        commit_reason="turn_complete",
                                        stt_chunk_count=len(turn_buffer.chunks),
                                        canonical_at_tool=tool_dispatch_state.last_trace_at_tool.canonical_at_tool
                                        if tool_dispatch_state.last_trace_at_tool
                                        else "",
                                        canonical_at_turn_complete=user_text,
                                        stt_race=bool(
                                            tool_dispatch_state.last_trace_at_tool
                                            and user_text
                                            and len(user_text)
                                            > len(
                                                tool_dispatch_state.last_trace_at_tool.canonical_at_tool
                                            )
                                            + 8
                                        ),
                                        user_drop_reason=drop_reason,
                                    )
                                    tool_dispatch_state.turn_traces.push(trace_entry)
                                    yield frame(
                                        "turn_trace",
                                        traces=tool_dispatch_state.turn_traces.recent(3),
                                    )
                                    turn_buffer.clear()
                                    turn_out_parts.clear()

                                    if (
                                        not transcription_only
                                        and not promise_nudged_this_turn
                                        and looks_like_unfulfilled_promise(assistant_text)
                                    ):
                                        if not tool_called_this_turn:
                                            promise_nudged_this_turn = True
                                            logger.info(
                                                "[voice] promise_guard nudging — spoken "
                                                "commitment, no tool call"
                                            )
                                            incoming_audio.put_nowait(PROMISE_NUDGE)
                                        elif tool_ok_this_turn is False and not (
                                            tool_dispatch_state.calendar_awaiting_confirm
                                        ):
                                            promise_nudged_this_turn = True
                                            logger.info(
                                                "[voice] promise_guard nudging — tool failed "
                                                "but assistant claimed success"
                                            )
                                            incoming_audio.put_nowait(TOOL_FAILED_NUDGE)

                                    yield frame(
                                        "turn_complete",
                                        user_text=user_text,
                                        assistant_text=assistant_text,
                                        user_committed=user_committed,
                                        drop_reason=drop_reason,
                                        user_text_raw=turn_result.user_text_raw,
                                    )
                                    if turn_done is not None:
                                        turn_done.put_nowait(None)
                                    if not transcription_only and pending_tool_results:
                                        next_tool_result = pending_tool_results.pop(0)
                                        try:
                                            await incoming_audio.put(next_tool_result)
                                        except Exception:  # noqa: BLE001
                                            logger.debug(
                                                "[voice] pending tool result inject failed",
                                                exc_info=True,
                                            )

                            if hasattr(response, "tool_call") and response.tool_call:
                                tc = response.tool_call
                                calls = getattr(tc, "function_calls", None) or []
                                if calls:
                                    tool_called_this_turn = True
                                canonical_at_turn_start = turn_buffer.canonical
                                needs_quiescence = False
                                for call in calls:
                                    raw_args = getattr(call, "args", None) or {}
                                    args_dict = (
                                        dict(raw_args) if isinstance(raw_args, dict) else {}
                                    )
                                    if is_mutating_voice_tool(
                                        str(getattr(call, "name", "") or "").strip(),
                                        args_dict,
                                    ):
                                        needs_quiescence = True
                                        break
                                canonical_for_tools = turn_buffer.canonical
                                deferred_reason: str | None = None
                                if needs_quiescence:
                                    canonical_for_tools, deferred_reason = (
                                        await resolve_mutating_tool_speech(
                                            turn_buffer,
                                            voice_history,
                                        )
                                    )
                                if canonical_for_tools:
                                    audio_send_state.last_user_text = canonical_for_tools[:4000]
                                hydrate_dispatch_pending_delete(
                                    tool_dispatch_state, pending_delete_holder
                                )
                                context_texts = [
                                    text
                                    for turn in voice_history
                                    for text in (
                                        str(turn.get("user") or ""),
                                        str(turn.get("assistant") or ""),
                                    )
                                    if text
                                ]
                                async for tool_frame in handle_voice_tool_calls(
                                    session,
                                    genai_types,
                                    calls,
                                    last_user_text=audio_send_state.last_user_text,
                                    canonical_at_tool=canonical_for_tools,
                                    canonical_at_turn_start=canonical_at_turn_start,
                                    dispatch_state=tool_dispatch_state,
                                    pending_tool_results=pending_tool_results,
                                    approval_waiter=approval_waiter,
                                    deferred_tool_reason=deferred_reason,
                                    provider_holder=provider_holder,
                                    allow_sensitive=allow_sensitive,
                                    context_texts=context_texts,
                                ):
                                    yield tool_frame
                                tool_ok_this_turn = tool_dispatch_state.last_tool_ok

                            if hasattr(response, "session_resumption_update"):
                                upd = response.session_resumption_update
                                new_handle = getattr(upd, "handle", None) if upd else None
                                if new_handle:
                                    session_handle = new_handle

                            if audio_send_state.stopped_explicitly:
                                break

                        if not turn_produced:
                            break

                finally:
                    send_task.cancel()
                    try:
                        await send_task
                    except asyncio.CancelledError:
                        pass

        except Exception as exc:
            raw = str(exc)
            stable_s = (
                (time.monotonic() - session_started_at)
                if session_started_at
                else 0.0
            )

            if is_api_key_error(raw):
                yield frame(
                    "error",
                    message=(
                        "API key not valid. Please pass a valid API key in "
                        "Settings → AI Provider."
                    ),
                )
                return

            if is_quota_exhausted_error(exc):
                from orchestrator.quota_notice import maybe_emit_quota_notice

                maybe_emit_quota_notice(raw, provider="gemini")
                yield frame(
                    "error",
                    message=(
                        "Free Gemini API limit reached. Voice may not stay connected "
                        "until you add a paid API key."
                    ),
                )
                return

            if is_live_audio_config_error(exc):
                if (
                    not transcription_only
                    and not audio_model_fallback_tried
                    and active_model != GEMINI_VOICE_MODEL_DEFAULT
                ):
                    audio_model_fallback_tried = True
                    logger.warning(
                        "Live audio rejected for model %s; falling back to %s",
                        active_model,
                        GEMINI_VOICE_MODEL_DEFAULT,
                    )
                    active_model = GEMINI_VOICE_MODEL_DEFAULT
                    session_handle = None
                    continue
                logger.exception("Voice session audio config error")
                yield frame("error", message=VOICE_AUDIO_CONFIG_USER_MESSAGE)
                return

            transient = is_transient_connection_error(exc)

            reconnect.record_session_drop(stable_s)

            if transient:
                logger.warning(
                    "Voice session dropped (transient, stable %.1fs, attempt %d, "
                    "retry in %.1fs): %s",
                    stable_s,
                    reconnect.consecutive_failures,
                    reconnect.reconnect_delay_s,
                    exc,
                )
                if reconnect.should_signal_weak_connection():
                    reconnect.mark_weak_connection_signalled()
                    yield frame("connection_weak")
            else:
                logger.exception("Voice session error (non-transient)")
                yield frame("error", message=raw)
                return

        if audio_send_state.stopped_explicitly:
            yield frame("done")
            return

        if await drain_stale_pcm_preserve_text(incoming_audio):
            yield frame("done")
            return

        logger.info(
            "[voice] Session ended, reconnecting in %.1fs…", reconnect.reconnect_delay_s
        )
        yield frame("reconnecting", delay_s=reconnect.reconnect_delay_s)
        await asyncio.sleep(reconnect.reconnect_delay_s)
