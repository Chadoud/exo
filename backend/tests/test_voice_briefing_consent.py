"""Server-side briefing consent: phrase detection + persistence."""

from __future__ import annotations

import pytest

import voice_briefing_consent as bc


@pytest.mark.parametrize(
    "text",
    [
        "stop the briefing please",
        "don't run the briefing anymore",
        "no more briefing",
        "arrête le briefing",
        "pas de briefing",
        "kein briefing mehr",
        "disattiva il briefing",
    ],
)
def test_decline_phrases_detected(text):
    assert bc.looks_like_briefing_decline(text)


@pytest.mark.parametrize(
    "text",
    ["what's on my calendar", "run the news", "tell me a joke", ""],
)
def test_non_decline_phrases_ignored(text):
    assert not bc.looks_like_briefing_decline(text)


@pytest.mark.parametrize(
    "text",
    ["enable the briefing", "always run the briefing", "active le briefing"],
)
def test_enable_phrases_detected(text):
    assert bc.looks_like_briefing_enable(text)


@pytest.mark.parametrize(
    "text",
    ["yes", "yeah", "sure", "go ahead", "oui", "ok"],
)
def test_accept_phrases_detected(text):
    assert bc.looks_like_briefing_accept(text)


@pytest.mark.parametrize(
    "text",
    ["not now", "skip", "later", "no", "pas maintenant"],
)
def test_skip_session_phrases_detected(text):
    assert bc.looks_like_briefing_skip_session(text)


@pytest.mark.parametrize(
    "text",
    ["never again", "never ask", "plus jamais", "stop the briefing"],
)
def test_never_phrases_detected(text):
    assert bc.looks_like_briefing_never(text)


@pytest.mark.parametrize(
    "text",
    ["I never eat breakfast", "jamais de la vie ce film"],
)
def test_bare_never_not_sticky(text):
    assert not bc.looks_like_briefing_never(text)


@pytest.mark.parametrize(
    "text",
    ["always run the briefing", "every time i open", "chaque fois", "enable the briefing"],
)
def test_always_phrases_detected(text):
    assert bc.looks_like_briefing_always(text)


@pytest.mark.parametrize(
    "text",
    ["I always prefer dark mode", "toujours content"],
)
def test_bare_always_not_sticky(text):
    assert not bc.looks_like_briefing_always(text)


def test_persist_briefing_consent_writes_memory(monkeypatch):
    calls: list[tuple] = []

    def _fake_update(category, key, value):
        calls.append((category, key, value))
        return 1

    monkeypatch.setattr("assistant_memory.update_memory", _fake_update)
    assert bc.persist_briefing_consent("declined") is True
    assert calls == [("preferences", bc.STARTUP_BRIEFING_CONSENT_KEY, "declined")]


def test_persist_briefing_always_sets_granted_and_v2(monkeypatch):
    calls: list[tuple] = []

    def _fake_update(category, key, value):
        calls.append((category, key, value))
        return 1

    monkeypatch.setattr("assistant_memory.update_memory", _fake_update)
    assert bc.persist_briefing_always() is True
    assert ("preferences", bc.STARTUP_BRIEFING_CONSENT_KEY, "granted") in calls
    assert ("preferences", bc.STARTUP_BRIEFING_CONSENT_V2_KEY, "1") in calls


def test_persist_briefing_consent_rejects_bad_value():
    with pytest.raises(ValueError):
        bc.persist_briefing_consent("maybe")


def test_persist_briefing_consent_survives_storage_error(monkeypatch):
    def _boom(*_a, **_k):
        raise RuntimeError("db locked")

    monkeypatch.setattr("assistant_memory.update_memory", _boom)
    assert bc.persist_briefing_consent("granted") is False
