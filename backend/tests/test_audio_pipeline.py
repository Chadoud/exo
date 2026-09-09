"""Tests for Gemini Live audio queue forwarding."""

import asyncio
from unittest.mock import AsyncMock, MagicMock

from voice.audio_pipeline import AudioSendLoopState, run_incoming_audio_send_loop


def test_ptt_end_does_not_send_activity_end():
    """PTT must not send ActivityEnd — it breaks automatic activity detection (WS 1007)."""

    async def _run() -> None:
        queue: asyncio.Queue[bytes | str | None] = asyncio.Queue()
        await queue.put("[PTT_END]")
        await queue.put(None)

        session = MagicMock()
        session.send_realtime_input = AsyncMock()
        session.send_client_content = AsyncMock()
        genai_types = MagicMock()

        state = AudioSendLoopState()
        await run_incoming_audio_send_loop(queue, session, genai_types, state)

        session.send_realtime_input.assert_not_called()
        assert state.stopped_explicitly is True

    asyncio.run(_run())


def test_pcm_is_copied_into_meeting_buffer():
    import meeting_audio

    async def _run() -> None:
        meeting_audio.discard("pipe-meet")
        queue: asyncio.Queue[bytes | str | None] = asyncio.Queue()
        await queue.put(b"\x01\x00\x02\x00")
        await queue.put(None)

        session = MagicMock()
        session.send_realtime_input = AsyncMock()
        session.send_client_content = AsyncMock()
        genai_types = MagicMock()
        genai_types.Blob = MagicMock(return_value="blob")

        state = AudioSendLoopState()
        await run_incoming_audio_send_loop(
            queue, session, genai_types, state, meeting_id="pipe-meet"
        )
        assert meeting_audio.byte_count("pipe-meet") == 4
        meeting_audio.discard("pipe-meet")

    asyncio.run(_run())
