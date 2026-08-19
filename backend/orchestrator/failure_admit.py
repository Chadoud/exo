"""Admit only recoverable unfinished work onto Needs you."""

from __future__ import annotations

import re

_OUTCOME_RE = re.compile(r"\nOutcome:\s*([\s\S]*)$", re.IGNORECASE)
_UNPARSEABLE = re.compile(
    r"can'?t determine what you'?re asking|"
    r"doesn'?t state a complete request|"
    r"message .{0,40}is cut off|"
    r"resend the full (question|task)",
    re.IGNORECASE,
)
_WORD_RE = re.compile(r"[^\W_]+", re.UNICODE)


def outcome_from_failure_content(content: str) -> str:
    match = _OUTCOME_RE.search(content or "")
    return (match.group(1) or "").strip() if match else ""


def is_trash_inbox_failure(goal: str, outcome: str = "") -> bool:
    """True when the ask is not finishable work (cut-off STT, empty, unparseable)."""
    g = (goal or "").strip()
    if not g:
        return True
    if _UNPARSEABLE.search(outcome or ""):
        return True
    words = _WORD_RE.findall(g)
    if g.lstrip().startswith(".") and len(words) <= 4:
        return True
    return False
