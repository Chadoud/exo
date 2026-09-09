"""PCM and text queue forwarding for Gemini Live voice sessions."""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from typing import Any

logger = logging.getLogger(__name__)


@dataclass
class AudioSendLoopState:
    """Mutable state shared between the audio send loop and the session orchestrator."""

    stopped_explicitly: bool = False
    last_user_text: str = ""
    # Typed composer text sent while voice is active — not echoed via STT.
    pending_typed_user_text: str = ""


async def run_incoming_audio_send_loop(
    incoming_audio: asyncio.Queue[bytes | str | None],
    session: Any,
    genai_types: Any,
    state: AudioSendLoopState,
    *,
    user_spoke: asyncio.Event | None = None,
    meeting_id: str | None = None,
) -> None:
    """Pull PCM blobs (or text commands) from the queue and forward to Gemini."""
    while True:
        chunk: bytes | str | None = await incoming_audio.get()
        if chunk is None:
            state.stopped_explicitly = True
            break
        if isinstance(chunk, str):
            stripped = chunk.strip()
            if stripped == "[PTT_END]":
                # Gemini Live enables automatic activity detection by default.
                # Explicit ActivityEnd conflicts with it (WS close 1007) and kills the
                # session. PTT turn boundaries are signaled by stopping PCM upstream.
                continue
            # Typed text from the UI, or a briefing section, injected directly into
            # the Live session. If the session is dropping, re-queue for reconnect.
            if (
                stripped.startswith("[BRIEFING:")
                and user_spoke is not None
                and user_spoke.is_set()
            ):
                continue
            is_system_injection = (
                stripped.startswith("[STARTUP]")
                or stripped.startswith("[BRIEFING:")
                or stripped.startswith("[TOOL_RESULT")
                or stripped.startswith("[SYSTEM CHECK]")
            )
            if stripped and not is_system_injection:
                state.last_user_text = stripped[:4000]
                state.pending_typed_user_text = stripped[:4000]
                if user_spoke is not None:
                    user_spoke.set()
            try:
                await session.send_client_content(
                    turns={"role": "user", "parts": [{"text": chunk}]},
                    turn_complete=True,
                )
            except Exception as send_exc:
                logger.warning(
                    "[voice] text send failed (%s) — re-queuing for next session",
                    send_exc,
                )
                incoming_audio.put_nowait(chunk)
                break
        else:
            if meeting_id:
                try:
                    from meeting_audio import append_pcm

                    append_pcm(meeting_id, chunk)
                except Exception:
                    logger.debug("meeting pcm buffer failed", exc_info=True)
            await session.send_realtime_input(
                audio=genai_types.Blob(
                    mime_type="audio/pcm;rate=16000",
                    data=chunk,
                )
            )


async def drain_stale_pcm_preserve_text(
    incoming_audio: asyncio.Queue[bytes | str | None],
) -> bool:
    """Discard stale mic PCM on reconnect; preserve text injections.

    Returns True when the queue contained an explicit stop sentinel.
    """
    preserved_text: list[str] = []
    try:
        while not incoming_audio.empty():
            item = incoming_audio.get_nowait()
            if item is None:
                return True
            if isinstance(item, str):
                preserved_text.append(item)
            # bytes (PCM audio) are discarded — stale mic audio is useless on reconnect
    except asyncio.QueueEmpty:
        pass
    for text_item in preserved_text:
        await incoming_audio.put(text_item)
    return False


def resolve_turn_user_text_raw(
    *,
    stt_canonical: str,
    pending_typed_user_text: str,
) -> str:
    """Prefer STT canonical text; fall back to typed composer input when STT is empty."""
    stt = (stt_canonical or "").strip()
    if stt:
        return stt_canonical
    typed = (pending_typed_user_text or "").strip()
    return typed
