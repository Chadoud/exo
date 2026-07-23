"""Startup briefing pipeline extracted from ``routes.voice_routes``."""

from voice.briefing.offer import CLIENT_OFFER_TYPES, BriefingOfferController, OfferPhase
from voice.briefing.pipeline import (
    drain_queued_briefing_injections,
    is_briefing_injection,
    stream_briefing_sections,
)
from voice.briefing.sections import SECTION_REGISTRY
from voice.briefing.startup import (
    build_ask_startup_message,
    build_auto_startup_message,
    get_startup_briefing_consent,
    get_startup_message,
    resolve_startup_briefing_mode,
)

__all__ = [
    "BriefingOfferController",
    "CLIENT_OFFER_TYPES",
    "OfferPhase",
    "SECTION_REGISTRY",
    "build_ask_startup_message",
    "build_auto_startup_message",
    "drain_queued_briefing_injections",
    "get_startup_briefing_consent",
    "get_startup_message",
    "is_briefing_injection",
    "resolve_startup_briefing_mode",
    "stream_briefing_sections",
]
