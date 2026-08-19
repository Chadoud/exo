"""Incremental Live STT accumulation — mirrors frontend voiceTranscriptQuality."""

from __future__ import annotations

import re

_NOISE_TAG = re.compile(r"^<\s*noise\s*>$", re.IGNORECASE)


def is_voice_transcript_noise_placeholder(text: str) -> bool:
    """True for empty lines and explicit STT noise placeholders."""
    stripped = " ".join(text.split()).strip()
    if not stripped:
        return True
    if _NOISE_TAG.match(stripped) or stripped.lower() == "[noise]":
        return True
    return False


def _word_key(word: str) -> str:
    return word.casefold().strip(".,!?;:")


def _is_word_subsequence(shorter: list[str], longer: list[str]) -> bool:
    index = 0
    for word in shorter:
        key = _word_key(word)
        while index < len(longer) and _word_key(longer[index]) != key:
            index += 1
        if index >= len(longer):
            return False
        index += 1
    return True


def _looks_like_snapshot(previous: str, chunk: str) -> bool:
    """True when Gemini sent a full-utterance revision, not a one-word delta."""
    incoming = chunk.strip()
    previous_words = previous.strip().split()
    incoming_words = incoming.split()
    if len(incoming_words) < 4 or len(previous_words) < 3:
        return False
    return [_word_key(w) for w in incoming_words[:3]] == [_word_key(w) for w in previous_words[:3]]


def append_streaming_voice_input(previous: str, chunk: str) -> str:
    """Append one incremental Live STT chunk (Gemini often prefixes a space)."""
    if is_voice_transcript_noise_placeholder(chunk):
        return previous
    if _looks_like_snapshot(previous, chunk):
        previous_words = previous.strip().split()
        incoming_words = chunk.strip().split()
        if len(incoming_words) < len(previous_words) and _is_word_subsequence(
            incoming_words, previous_words
        ):
            return previous
        return chunk
    return previous + chunk
