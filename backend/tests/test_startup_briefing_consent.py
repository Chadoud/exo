"""Startup briefing consent: ask-each-session, sticky always (v2), legacy demote."""

from __future__ import annotations

from voice.briefing import (
    build_ask_startup_message,
    build_auto_startup_message,
    get_startup_briefing_consent,
    resolve_startup_briefing_mode,
)
from voice_briefing_consent import (
    STARTUP_BRIEFING_CONSENT_KEY,
    STARTUP_BRIEFING_CONSENT_V2_KEY,
)


def test_resolve_startup_briefing_mode_without_routine():
    assert resolve_startup_briefing_mode(None, None) == "skip"
    assert resolve_startup_briefing_mode("", "granted") == "skip"


def test_resolve_startup_briefing_mode_auto_when_granted():
    routine = "news headlines and weather for Geneva"
    assert resolve_startup_briefing_mode(routine, "granted") == "auto"


def test_resolve_startup_briefing_mode_skip_when_declined():
    routine = "news headlines"
    assert resolve_startup_briefing_mode(routine, "declined") == "skip"


def test_resolve_startup_briefing_mode_ask_when_unset():
    routine = "calendar for today"
    assert resolve_startup_briefing_mode(routine, None) == "ask"


def test_build_ask_startup_message_waits_for_consent():
    msg = build_ask_startup_message("news and weather for Geneva")
    assert "ask" in msg.lower()
    assert "do not fetch" in msg.lower() or "do not start" in msg.lower()
    assert "server" in msg.lower()


def test_build_auto_startup_message_fetches_immediately():
    msg = build_auto_startup_message("news and weather for Geneva")
    assert "fetching" in msg.lower()


def test_get_startup_briefing_consent_treats_ask_as_unset(monkeypatch):
    monkeypatch.setattr(
        "voice.briefing.startup.load_memory",
        lambda: {"preferences": {"startup_briefing_consent": "ask"}},
    )
    assert get_startup_briefing_consent() is None


def test_get_startup_briefing_consent_v2_granted_stays_granted(monkeypatch):
    monkeypatch.setattr(
        "voice.briefing.startup.load_memory",
        lambda: {
            "preferences": {
                STARTUP_BRIEFING_CONSENT_KEY: "granted",
                STARTUP_BRIEFING_CONSENT_V2_KEY: "1",
            }
        },
    )
    assert get_startup_briefing_consent() == "granted"


def test_legacy_granted_demoted_to_ask(monkeypatch):
    writes: list[tuple[str, str, str]] = []

    def _update(category: str, key: str, value: str, **_kwargs):
        writes.append((category, key, value))
        return 1

    monkeypatch.setattr(
        "voice.briefing.startup.load_memory",
        lambda: {"preferences": {STARTUP_BRIEFING_CONSENT_KEY: "granted"}},
    )
    monkeypatch.setattr("assistant_memory.update_memory", _update)
    assert get_startup_briefing_consent() is None
    assert ("preferences", STARTUP_BRIEFING_CONSENT_KEY, "ask") in writes
    assert ("preferences", STARTUP_BRIEFING_CONSENT_V2_KEY, "1") in writes
