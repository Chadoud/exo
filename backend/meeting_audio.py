"""In-memory PCM buffer for an active meeting (16 kHz signed-16 mono).

Audio stays in RAM and is discarded on end or privacy wipe. Used to run
file-based speaker diarization — Live STT does not label speakers.
"""

from __future__ import annotations

import io
import threading
import wave

SAMPLE_RATE_HZ = 16_000
SAMPLE_WIDTH = 2
# Gemini file diarization caps around 30 minutes.
_MAX_SECONDS = 30 * 60
_MAX_BYTES = SAMPLE_RATE_HZ * SAMPLE_WIDTH * _MAX_SECONDS

_lock = threading.Lock()
_buffers: dict[str, bytearray] = {}


def append_pcm(meeting_id: str, chunk: bytes) -> None:
    if not meeting_id or not chunk:
        return
    with _lock:
        buf = _buffers.setdefault(meeting_id, bytearray())
        buf.extend(chunk)
        if len(buf) > _MAX_BYTES:
            del buf[: len(buf) - _MAX_BYTES]


def byte_count(meeting_id: str) -> int:
    with _lock:
        return len(_buffers.get(meeting_id, b""))


def snapshot(meeting_id: str) -> bytes:
    """Copy current PCM without clearing (live diarize pass)."""
    with _lock:
        return bytes(_buffers.get(meeting_id, b""))


def snapshot_and_clear(meeting_id: str) -> bytes:
    with _lock:
        raw = bytes(_buffers.pop(meeting_id, b""))
    return raw


def discard(meeting_id: str) -> None:
    with _lock:
        _buffers.pop(meeting_id, None)


def discard_all() -> None:
    with _lock:
        _buffers.clear()


def pcm16_mono_to_wav(pcm: bytes, sample_rate: int = SAMPLE_RATE_HZ) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(SAMPLE_WIDTH)
        wav.setframerate(sample_rate)
        wav.writeframes(pcm)
    return buf.getvalue()
