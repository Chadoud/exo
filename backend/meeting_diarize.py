"""Speaker diarization for meeting audio via Gemini 3.5 Transcribe (file).

Live STT cannot label speakers. This module turns buffered PCM into
``Speaker N`` / named turns, then maps ids to real names only when the
words introduce or address someone.
"""

from __future__ import annotations

import logging
import os
import re
import threading
import time
from typing import Any

logger = logging.getLogger(__name__)

TRANSCRIBE_MODEL_DEFAULT = "gemini-3.5-transcribe"
_MIN_LIVE_PCM_BYTES = 16_000 * 2 * 8
_LIVE_INTERVAL_S = 40.0
_SPEAKER_RE = re.compile(r"^(?:spk_|speaker[_\s-]?)(\d+)$", re.IGNORECASE)

_NAME_SYSTEM = (
    "You map speaker labels to real names. Output STRICT JSON only. "
    "Never invent a name that is not clearly in the transcript."
)
_NAME_INSTRUCTION = """Return a single JSON object:
{"speakers": {"spk_1": "Alex"}}
Include a name only when that speaker introduces themselves or is clearly
addressed as that person. Omit anyone you are not sure about.
Empty object if no names can be tied to a speaker.

Transcript:
"""

_lock = threading.Lock()
_last_live_at: dict[str, float] = {}
_live_inflight: set[str] = set()


def display_speaker(raw: str, name_map: dict[str, str] | None = None) -> str:
    label = (raw or "").strip()
    if not label:
        return "Speaker 1"
    mapped = (name_map or {}).get(label) or (name_map or {}).get(label.lower())
    if mapped:
        return mapped[:80]
    match = _SPEAKER_RE.match(label)
    if match:
        numbered = f"Speaker {int(match.group(1))}"
        mapped_num = (name_map or {}).get(numbered)
        if mapped_num:
            return mapped_num[:80]
        return numbered
    return label[:80]


def segments_from_response(response: Any) -> list[tuple[str, str]]:
    """Group diarized words into (speaker_id, text) turns."""
    segments: list[tuple[str, str]] = []
    for candidate in getattr(response, "candidates", None) or []:
        content = getattr(candidate, "content", None)
        for part in getattr(content, "parts", None) or []:
            transcription = getattr(part, "audio_transcription", None) or getattr(
                part, "audioTranscription", None
            )
            if not transcription:
                continue
            speaker = (
                getattr(transcription, "speaker_label", None)
                or getattr(transcription, "speakerLabel", None)
                or "spk_1"
            )
            words = [
                str(getattr(word, "word", "") or "").strip()
                for word in getattr(transcription, "words", None) or []
            ]
            text = " ".join(word for word in words if word).strip()
            if not text:
                text = str(getattr(part, "text", "") or "").strip()
            if text:
                segments.append((str(speaker), text))
    if segments:
        return _merge_adjacent(segments)
    return parse_speaker_text(getattr(response, "text", None) or "")


def parse_speaker_text(raw: str) -> list[tuple[str, str]]:
    """Parse ``spk_1: hello`` / ``Speaker 2: hi`` lines from model text."""
    segments: list[tuple[str, str]] = []
    pattern = re.compile(
        r"^(?:\[)?(?P<spk>spk_\d+|Speaker\s+\d+|speaker[_\s-]?\d+)(?:\])?\s*:\s*(?P<text>.+)$",
        re.IGNORECASE,
    )
    for line in str(raw).splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        match = pattern.match(stripped)
        if match:
            segments.append((match.group("spk"), match.group("text").strip()))
        elif segments:
            prev_spk, prev_text = segments[-1]
            segments[-1] = (prev_spk, f"{prev_text} {stripped}".strip())
    return _merge_adjacent(segments)


def format_labeled_lines(
    segments: list[tuple[str, str]],
    name_map: dict[str, str] | None = None,
) -> list[str]:
    lines: list[str] = []
    for speaker, text in segments:
        body = (text or "").strip()
        if not body:
            continue
        lines.append(f"{display_speaker(speaker, name_map)}: {body}")
    return lines


def resolve_speaker_names(labeled_transcript: str) -> dict[str, str]:
    """LLM map of speaker ids → names; empty when nothing is clearly named."""
    text = (labeled_transcript or "").strip()
    if len(text) < 20:
        return {}
    try:
        from llm.complete import complete
        from memory_extract import _parse_json_object

        raw = complete(_NAME_SYSTEM, _NAME_INSTRUCTION + text[-8000:])
        parsed = _parse_json_object(raw) if raw else None
    except Exception:
        logger.debug("speaker name resolve failed", exc_info=True)
        return {}
    speakers = (parsed or {}).get("speakers") if isinstance(parsed, dict) else None
    if not isinstance(speakers, dict):
        return {}
    cleaned: dict[str, str] = {}
    for key, value in speakers.items():
        name = str(value).strip()
        label = str(key).strip()
        if name and label and name.lower() not in {"speaker", "unknown", "spk"}:
            cleaned[label] = name[:80]
            cleaned[display_speaker(label)] = name[:80]
    return cleaned


def labeled_lines_from_wav(wav_bytes: bytes) -> list[str]:
    """Call Gemini file transcribe with diarization. Empty list on skip/failure."""
    if not wav_bytes:
        return []
    response = _transcribe_diarized(wav_bytes)
    if response is None:
        return []
    segments = segments_from_response(response)
    if not segments:
        return []
    draft = format_labeled_lines(segments)
    names = resolve_speaker_names("\n".join(draft))
    return format_labeled_lines(segments, names) if names else draft


def maybe_schedule_live_diarize(meeting_id: str) -> None:
    """Background pass so live notes pick up Speaker N / names without waiting for End."""
    if not meeting_id:
        return
    from meeting_audio import byte_count

    now = time.monotonic()
    with _lock:
        if meeting_id in _live_inflight:
            return
        last = _last_live_at.get(meeting_id, 0.0)
        if now - last < _LIVE_INTERVAL_S:
            return
        if byte_count(meeting_id) < _MIN_LIVE_PCM_BYTES:
            return
        _live_inflight.add(meeting_id)
        _last_live_at[meeting_id] = now
    thread = threading.Thread(
        target=_run_live_diarize,
        args=(meeting_id,),
        name=f"meeting-diarize-{meeting_id[:8]}",
        daemon=True,
    )
    thread.start()


def forget_live_state(meeting_id: str) -> None:
    with _lock:
        _last_live_at.pop(meeting_id, None)
        _live_inflight.discard(meeting_id)


def _run_live_diarize(meeting_id: str) -> None:
    try:
        from meeting_audio import pcm16_mono_to_wav, snapshot
        from meeting_store import has_active, replace_spoken_lines

        pcm = snapshot(meeting_id)
        if not pcm or not has_active(meeting_id):
            return
        lines = labeled_lines_from_wav(pcm16_mono_to_wav(pcm))
        if lines and has_active(meeting_id):
            replace_spoken_lines(meeting_id, lines)
    except Exception:
        logger.debug("live meeting diarize failed", exc_info=True)
    finally:
        with _lock:
            _live_inflight.discard(meeting_id)


def _merge_adjacent(segments: list[tuple[str, str]]) -> list[tuple[str, str]]:
    merged: list[tuple[str, str]] = []
    for speaker, text in segments:
        body = text.strip()
        if not body:
            continue
        if merged and merged[-1][0] == speaker:
            merged[-1] = (speaker, f"{merged[-1][1]} {body}".strip())
        else:
            merged.append((speaker, body))
    return merged


def _transcribe_diarized(wav_bytes: bytes) -> Any | None:
    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not api_key:
        return None
    model = os.environ.get("GEMINI_TRANSCRIBE_MODEL", TRANSCRIBE_MODEL_DEFAULT).strip()
    try:
        from google import genai  # type: ignore[import]
        from google.genai import types as genai_types  # type: ignore[import]

        client = genai.Client(api_key=api_key)
        audio_part = genai_types.Part.from_bytes(data=wav_bytes, mime_type="audio/wav")
        return client.models.generate_content(
            model=model,
            contents=[audio_part],
            config=genai_types.GenerateContentConfig(
                audio_transcription_config=genai_types.AudioTranscriptionConfig(
                    diarization=True,
                )
            ),
        )
    except Exception:
        logger.warning("meeting diarize request failed", exc_info=True)
        return None
