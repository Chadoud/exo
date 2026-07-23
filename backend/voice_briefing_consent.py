"""Startup-briefing consent: phrase detection + persistence.

The voice model is *instructed* to call ``save_memory`` when the user enables or
disables the startup briefing, but it does so unreliably — it often only speaks
the acknowledgement ("I won't run it anymore") without persisting anything, so the
briefing keeps auto-running next session.

This module lets the server enforce the user's spoken/typed intent directly:
detect the phrase, then write ``preferences.startup_briefing_consent`` itself. It
is dependency-light (only ``assistant_memory``) so both the WebSocket route and the
voice session loop can use it without import cycles.
"""

from __future__ import annotations

import logging
import re

logger = logging.getLogger(__name__)

STARTUP_BRIEFING_CONSENT_KEY = "startup_briefing_consent"
# Set when sticky always is confirmed via the BriefingOffer v2 UI/frames.
# Legacy ``granted`` without this flag is demoted to ask-each-session once.
STARTUP_BRIEFING_CONSENT_V2_KEY = "startup_briefing_consent_v2"

# Phrases that mean "stop auto-running the briefing". Matched case-insensitively as
# substrings against the user's utterance, in the languages the assistant supports.
_DECLINE_PHRASES = (
    "stop the briefing",
    "stop briefing",
    "no briefing",
    "don't run the briefing",
    "dont run the briefing",
    "don't run my briefing",
    "do not run the briefing",
    "no more briefing",
    "stop running the briefing",
    "disable the briefing",
    "disable briefing",
    "turn off the briefing",
    "no startup briefing",
    "don't brief me",
    # French
    "arrête le briefing",
    "arrete le briefing",
    "plus de briefing",
    "pas de briefing",
    "ne fais plus le briefing",
    "désactive le briefing",
    "desactive le briefing",
    # German
    "kein briefing",
    "briefing stoppen",
    "kein briefing mehr",
    "deaktiviere das briefing",
    # Italian
    "niente briefing",
    "ferma il briefing",
    "disattiva il briefing",
)

# Sticky always / re-enable auto-run.
_ENABLE_PHRASES = (
    "run the briefing on startup",
    "enable the briefing",
    "turn on the briefing",
    "always run the briefing",
    "run my briefing automatically",
    "active le briefing",
    "active mon briefing",
    "briefing aktivieren",
    "attiva il briefing",
)

# Sticky always — longer anchors only (bare "always"/"toujours" are too broad).
_ALWAYS_PHRASES = (
    "always run the briefing",
    "run the briefing every time",
    "every time i open",
    "every time i launch",
    "every session",
    "every morning",
    "chaque fois que j'ouvre",
    "chaque fois",
    "toujours le briefing",
    "jedes mal",
    "immer das briefing",
    "sempre il briefing",
    *_ENABLE_PHRASES,
)

# Sticky never — longer anchors only (bare "never"/"jamais" are too broad).
_NEVER_PHRASES = (
    "never again",
    "never ask",
    "don't ever",
    "dont ever",
    "do not ever",
    "plus jamais",
    "jamais plus",
    "niemals",
    "nie wieder",
    "mai più",
    "mai piu",
    *_DECLINE_PHRASES,
)

_SKIP_PHRASES = (
    "not now",
    "maybe later",
    "later",
    "skip",
    "skip it",
    "not today",
    "pas maintenant",
    "plus tard",
    "nicht jetzt",
    "später",
    "spaeter",
    "non ora",
    "più tardi",
    "piu tardi",
)

# Whole-utterance accept (avoid matching "yes" inside unrelated words).
_ACCEPT_EXACT = frozenset(
    {
        "yes",
        "yeah",
        "yep",
        "yup",
        "sure",
        "ok",
        "okay",
        "please",
        "go ahead",
        "do it",
        "oui",
        "ouais",
        "d'accord",
        "daccord",
        "ja",
        "si",
        "sì",
        "certo",
        "vas-y",
        "vas y",
    }
)

_ACCEPT_PREFIXES = (
    "yes ",
    "yeah ",
    "yep ",
    "sure ",
    "ok ",
    "okay ",
    "go ahead",
    "oui ",
    "ouais ",
    "ja ",
)


def _normalize(text: str) -> str:
    return (text or "").strip().lower()


def _utterance_core(text: str) -> str:
    """Strip trailing punctuation for exact accept matching."""
    return re.sub(r"[.!?,;:]+$", "", _normalize(text)).strip()


def looks_like_briefing_decline(text: str) -> bool:
    """True when the user asked to stop the auto-running startup briefing."""
    low = _normalize(text)
    if not low:
        return False
    return any(phrase in low for phrase in _DECLINE_PHRASES)


def looks_like_briefing_enable(text: str) -> bool:
    """True when the user asked to (re-)enable the auto-running startup briefing."""
    low = _normalize(text)
    if not low:
        return False
    return any(phrase in low for phrase in _ENABLE_PHRASES)


def looks_like_briefing_always(text: str) -> bool:
    """True when the user wants sticky always (land auto without ask)."""
    low = _normalize(text)
    if not low:
        return False
    return any(phrase in low for phrase in _ALWAYS_PHRASES)


def looks_like_briefing_never(text: str) -> bool:
    """True when the user wants never again (persist declined)."""
    low = _normalize(text)
    if not low:
        return False
    return any(phrase in low for phrase in _NEVER_PHRASES)


def looks_like_briefing_skip_session(text: str) -> bool:
    """True when the user declines for this session only (not now / skip / bare no)."""
    core = _utterance_core(text)
    if not core:
        return False
    if core in {"no", "nope", "nah", "non", "nein", "no thanks", "no thank you"}:
        return True
    return any(phrase in core for phrase in _SKIP_PHRASES)


def looks_like_briefing_accept(text: str) -> bool:
    """True when the user accepts the briefing for this session only."""
    core = _utterance_core(text)
    if not core:
        return False
    if core in _ACCEPT_EXACT:
        return True
    return any(core.startswith(prefix) for prefix in _ACCEPT_PREFIXES)


def persist_briefing_consent(value: str) -> bool:
    """Write ``startup_briefing_consent`` (``granted``/``declined``/``ask``). Never raises.

    :returns: True on success, False if persistence failed.
    """
    if value not in ("granted", "declined", "ask"):
        raise ValueError(f"invalid briefing consent value: {value!r}")
    try:
        from assistant_memory import update_memory

        update_memory("preferences", STARTUP_BRIEFING_CONSENT_KEY, value)
        return True
    except Exception:  # noqa: BLE001 — consent persistence must never break the session
        logger.debug("failed to persist briefing consent=%s", value, exc_info=True)
        return False


def persist_briefing_always() -> bool:
    """Persist sticky always (``granted``) and mark consent as v2-confirmed.

    :returns: True when both writes succeed.
    """
    try:
        from assistant_memory import update_memory

        update_memory("preferences", STARTUP_BRIEFING_CONSENT_KEY, "granted")
        update_memory("preferences", STARTUP_BRIEFING_CONSENT_V2_KEY, "1")
        return True
    except Exception:  # noqa: BLE001
        logger.debug("failed to persist briefing always consent", exc_info=True)
        return False
