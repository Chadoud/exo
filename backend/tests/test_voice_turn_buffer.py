"""Tests for voice turn buffer and STT accumulation."""

from __future__ import annotations

import asyncio

from voice.transcript_accumulate import append_streaming_voice_input
from voice.turn_buffer import TurnBuffer, wait_for_stt_quiescence


def test_append_streaming_matches_incremental_chunks():
    text = ""
    for chunk in (" pour", " que", " j'aille", " faire du paddle"):
        text = append_streaming_voice_input(text, chunk)
    assert text.strip() == "pour que j'aille faire du paddle"


def test_append_streaming_keeps_richer_snapshot():
    richer = "start sorting the files within Hilal files."
    degraded = "start sorting the files within files."
    assert append_streaming_voice_input(richer, degraded) == richer


def test_turn_buffer_tracks_canonical_line():
    buffer = TurnBuffer()
    buffer.append_chunk(" Crée")
    buffer.append_chunk(" un événement")
    assert buffer.canonical == "Crée un événement"
    assert len(buffer.chunks) == 2


def test_wait_for_stt_quiescence_returns_latest_text():
    async def run() -> str:
        buffer = TurnBuffer()
        buffer.append_chunk("paddle avec Alexandre")
        return await wait_for_stt_quiescence(
            buffer,
            quiescence_s=0.05,
            max_wait_s=0.2,
        )

    result = asyncio.run(run())
    assert "paddle" in result
