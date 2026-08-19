"""BriefingOffer state machine — land ask, accept, always, never, preempt."""

from __future__ import annotations

import asyncio
import json

from voice.briefing.offer import BriefingOfferController, OfferPhase
from voice.pending_delete_sync import PendingDeleteSyncHolder


def _types(frames: list[dict]) -> list[str]:
    return [f["type"] for f in frames]


def _make_controller(monkeypatch, *, consent=None, routine="news and weather for Geneva"):
    frames: list[dict] = []
    started = {"n": 0}
    monkeypatch.setattr("voice.briefing.offer.get_startup_message", lambda: routine)
    monkeypatch.setattr("voice.briefing.offer.get_startup_briefing_consent", lambda: consent)

    async def _send(frame_json: str) -> bool:
        frames.append(json.loads(frame_json))
        return True

    async def _pipeline() -> None:
        started["n"] += 1
        await asyncio.sleep(0)

    ctrl = BriefingOfferController(
        send_frame=_send,
        run_pipeline=_pipeline,
        clear_barge_in=lambda: None,
    )
    return ctrl, frames, started


def test_begin_land_ask_emits_offer_not_pipeline(monkeypatch):
    ctrl, frames, started = _make_controller(monkeypatch)

    async def _run():
        msg = await ctrl.begin_land()
        assert ctrl.phase == OfferPhase.OFFERING
        assert msg is None
        assert "briefing_offer" in _types(frames)
        assert frames[0]["reason"] == "startup_ask"
        assert "briefing_loading" not in _types(frames)
        assert started["n"] == 0

    asyncio.run(_run())


def test_begin_land_auto_when_granted(monkeypatch):
    ctrl, frames, started = _make_controller(
        monkeypatch, consent="granted", routine="news headlines"
    )

    async def _run():
        msg = await ctrl.begin_land()
        await asyncio.sleep(0.05)
        assert "fetching" in (msg or "").lower()
        assert "briefing_offer" not in _types(frames)
        assert "briefing_loading" in _types(frames)
        assert started["n"] == 1
        await ctrl.cleanup()

    asyncio.run(_run())


def test_begin_land_skip_when_unpaid(monkeypatch):
    ctrl, frames, started = _make_controller(monkeypatch)
    monkeypatch.setattr("voice.briefing.offer._paid_features_allowed", lambda: False)

    async def _run():
        assert await ctrl.begin_land() is None
        assert ctrl.phase == OfferPhase.IDLE
        assert frames == []
        assert started["n"] == 0

    asyncio.run(_run())


def test_begin_land_skip_when_declined(monkeypatch):
    frames: list[dict] = []
    monkeypatch.setattr("voice.briefing.offer.get_startup_message", lambda: "news")
    monkeypatch.setattr("voice.briefing.offer.get_startup_briefing_consent", lambda: "declined")

    async def _send(frame_json: str) -> bool:
        frames.append(json.loads(frame_json))
        return True

    async def _pipeline() -> None:
        raise AssertionError("must not run")

    ctrl = BriefingOfferController(send_frame=_send, run_pipeline=_pipeline)

    async def _run():
        assert await ctrl.begin_land() is None
        assert frames == []

    asyncio.run(_run())


def test_accept_once_runs_without_persist(monkeypatch):
    ctrl, frames, started = _make_controller(monkeypatch)
    writes: list[tuple] = []
    monkeypatch.setattr(
        "voice.briefing.offer.persist_briefing_consent",
        lambda v: writes.append(("consent", v)) or True,
    )
    monkeypatch.setattr(
        "voice.briefing.offer.persist_briefing_always",
        lambda: writes.append(("always",)) or True,
    )

    async def _run():
        await ctrl.begin_land()
        frames.clear()
        await ctrl.handle_client_type("briefing_offer_accept")
        await asyncio.sleep(0.05)
        assert "briefing_loading" in _types(frames)
        assert "startup_routine_running" in _types(frames)
        assert writes == []
        assert started["n"] == 1
        await ctrl.cleanup()

    asyncio.run(_run())


def test_always_persists_and_runs(monkeypatch):
    ctrl, frames, _started = _make_controller(monkeypatch)
    writes: list[str] = []
    monkeypatch.setattr(
        "voice.briefing.offer.persist_briefing_always",
        lambda: writes.append("always") or True,
    )

    async def _run():
        await ctrl.begin_land()
        frames.clear()
        await ctrl.handle_client_type("briefing_offer_always")
        await asyncio.sleep(0.05)
        assert writes == ["always"]
        assert "briefing_loading" in _types(frames)
        await ctrl.cleanup()

    asyncio.run(_run())


def test_skip_session_clears_without_decline(monkeypatch):
    ctrl, frames, _started = _make_controller(monkeypatch)
    writes: list[str] = []
    monkeypatch.setattr(
        "voice.briefing.offer.persist_briefing_consent",
        lambda v: writes.append(v) or True,
    )

    async def _run():
        await ctrl.begin_land()
        frames.clear()
        await ctrl.handle_client_type("briefing_offer_skip_session")
        assert ctrl.phase == OfferPhase.SESSION_SKIPPED
        assert "briefing_offer_clear" in _types(frames)
        assert writes == []

    asyncio.run(_run())


def test_never_persists_declined(monkeypatch):
    ctrl, frames, _started = _make_controller(monkeypatch)
    writes: list[str] = []
    monkeypatch.setattr(
        "voice.briefing.offer.persist_briefing_consent",
        lambda v: writes.append(v) or True,
    )

    async def _run():
        await ctrl.begin_land()
        frames.clear()
        await ctrl.handle_client_type("briefing_offer_never")
        assert writes == ["declined"]
        assert "briefing_offer_clear" in _types(frames)

    asyncio.run(_run())


def test_accept_blocked_by_pending_delete(monkeypatch):
    ctrl, frames, started = _make_controller(monkeypatch)
    ctrl._pending_delete = PendingDeleteSyncHolder(draft={"awaitingConfirm": True})

    async def _run():
        await ctrl.begin_land()
        frames.clear()
        await ctrl.accept_once()
        assert "briefing_offer_error" in _types(frames)
        assert ctrl.phase == OfferPhase.OFFERING
        assert started["n"] == 0

    asyncio.run(_run())


def test_spoken_yes_accepts(monkeypatch):
    ctrl, frames, _started = _make_controller(monkeypatch)
    monkeypatch.setattr(
        "voice.briefing.offer.persist_briefing_always",
        lambda: (_ for _ in ()).throw(AssertionError("must not persist on yes")),
    )

    async def _run():
        await ctrl.begin_land()
        frames.clear()
        assert await ctrl.on_user_transcript("yes") is True
        await asyncio.sleep(0.05)
        assert "briefing_loading" in _types(frames)
        await ctrl.cleanup()

    asyncio.run(_run())


def test_spoken_not_now_skips(monkeypatch):
    ctrl, frames, _started = _make_controller(monkeypatch)
    writes: list[str] = []
    monkeypatch.setattr(
        "voice.briefing.offer.persist_briefing_consent",
        lambda v: writes.append(v) or True,
    )

    async def _run():
        await ctrl.begin_land()
        assert await ctrl.on_user_transcript("not now") is True
        assert ctrl.phase == OfferPhase.SESSION_SKIPPED
        assert writes == []

    asyncio.run(_run())


def test_non_consent_utterance_returns_false_for_preempt(monkeypatch):
    ctrl, _frames, _started = _make_controller(monkeypatch)

    async def _run():
        await ctrl.begin_land()
        assert await ctrl.on_user_transcript("what's on my calendar") is False
        assert ctrl.phase == OfferPhase.OFFERING

    asyncio.run(_run())


def test_preempt_clears_offer(monkeypatch):
    ctrl, frames, _started = _make_controller(monkeypatch)

    async def _run():
        await ctrl.begin_land()
        frames.clear()
        await ctrl.preempt(reason="non_consent_intent")
        assert ctrl.phase == OfferPhase.SESSION_SKIPPED
        assert "briefing_offer_clear" in _types(frames)

    asyncio.run(_run())


def test_cancel_frame_preempts(monkeypatch):
    ctrl, frames, _started = _make_controller(monkeypatch)

    async def _run():
        await ctrl.begin_land()
        frames.clear()
        await ctrl.handle_client_type("briefing_offer_cancel")
        assert "briefing_offer_clear" in _types(frames)

    asyncio.run(_run())


def test_consent_frames_ignored_when_not_offering(monkeypatch):
    ctrl, frames, started = _make_controller(monkeypatch)
    writes: list[str] = []
    monkeypatch.setattr(
        "voice.briefing.offer.persist_briefing_always",
        lambda: writes.append("always") or True,
    )
    monkeypatch.setattr(
        "voice.briefing.offer.persist_briefing_consent",
        lambda v: writes.append(v) or True,
    )

    async def _run():
        assert ctrl.phase == OfferPhase.IDLE
        await ctrl.handle_client_type("briefing_offer_always")
        await ctrl.handle_client_type("briefing_offer_never")
        await ctrl.handle_client_type("briefing_offer_accept")
        assert writes == []
        assert started["n"] == 0
        assert "briefing_loading" not in _types(frames)

    asyncio.run(_run())


def test_clear_barge_in_before_pipeline(monkeypatch):
    frames: list[dict] = []
    cleared = {"n": 0}
    monkeypatch.setattr("voice.briefing.offer.get_startup_message", lambda: "news")
    monkeypatch.setattr("voice.briefing.offer.get_startup_briefing_consent", lambda: None)

    async def _send(frame_json: str) -> bool:
        frames.append(json.loads(frame_json))
        return True

    async def _pipeline() -> None:
        pass

    ctrl = BriefingOfferController(
        send_frame=_send,
        run_pipeline=_pipeline,
        clear_barge_in=lambda: cleared.__setitem__("n", cleared["n"] + 1),
    )

    async def _run():
        await ctrl.begin_land()
        await ctrl.accept_once()
        assert cleared["n"] == 1
        await ctrl.cleanup()

    asyncio.run(_run())
