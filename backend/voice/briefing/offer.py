"""BriefingOffer state machine — server-owned land ask / accept / always / never.

The client may send JSON frames or the user may speak yes/no while Offering.
Gemini must not own consent; this module does.
"""

from __future__ import annotations

import asyncio
import json
import logging
from enum import Enum
from typing import Awaitable, Callable

from voice.briefing.startup import (
    build_auto_startup_message,
    get_startup_briefing_consent,
    get_startup_message,
    resolve_startup_briefing_mode,
)
from voice.pending_delete_sync import PendingDeleteSyncHolder, pending_delete_blocks_briefing
from voice_briefing_consent import (
    looks_like_briefing_accept,
    looks_like_briefing_always,
    looks_like_briefing_never,
    looks_like_briefing_skip_session,
    persist_briefing_always,
    persist_briefing_consent,
)

logger = logging.getLogger(__name__)

SendFrame = Callable[[str], Awaitable[bool]]
RunPipeline = Callable[[], Awaitable[None]]
ClearBargeIn = Callable[[], None]

CLIENT_OFFER_TYPES = frozenset(
    {
        "briefing_offer_accept",
        "briefing_offer_skip_session",
        "briefing_offer_never",
        "briefing_offer_always",
        "briefing_offer_cancel",
        "briefing_offer_retry",
    }
)

_PENDING_DELETE_MSG = "Finish the calendar delete first, then I can run your briefing."
_NO_ROUTINE_MSG = "No startup briefing is set up yet."
_GENERIC_ERROR_MSG = "Couldn't start your briefing. Try again in a moment."


def _paid_features_allowed() -> bool:
    from entitlement_gate import may_use_proactive

    ok, _ = may_use_proactive()
    return ok


class OfferPhase(str, Enum):
    IDLE = "idle"
    OFFERING = "offering"
    RUNNING = "running"
    SESSION_SKIPPED = "session_skipped"
    DONE = "done"


def _frame(type_: str, **extra: object) -> str:
    return json.dumps({"type": type_, **extra})


class BriefingOfferController:
    """Per voice-WS land offer + consent transitions."""

    def __init__(
        self,
        *,
        send_frame: SendFrame,
        run_pipeline: RunPipeline,
        pending_delete_holder: PendingDeleteSyncHolder | None = None,
        clear_barge_in: ClearBargeIn | None = None,
    ) -> None:
        self._send = send_frame
        self._run_pipeline = run_pipeline
        self._pending_delete = pending_delete_holder
        self._clear_barge_in = clear_barge_in
        self.phase = OfferPhase.IDLE
        self.task: asyncio.Task[None] | None = None

    @property
    def is_offering(self) -> bool:
        return self.phase == OfferPhase.OFFERING

    @property
    def is_active(self) -> bool:
        return self.phase in (OfferPhase.OFFERING, OfferPhase.RUNNING)

    async def begin_land(self) -> str | None:
        """Resolve land mode. Returns Gemini startup inject message, or None."""
        if not _paid_features_allowed():
            self.phase = OfferPhase.IDLE
            return None
        routine = get_startup_message()
        mode = resolve_startup_briefing_mode(routine, get_startup_briefing_consent())
        if mode == "skip" or not routine:
            self.phase = OfferPhase.IDLE
            return None
        if mode == "auto":
            await self._start_pipeline(announce_loading=True)
            return build_auto_startup_message(routine)
        self.phase = OfferPhase.OFFERING
        await self._send(_frame("briefing_offer", reason="startup_ask"))
        # HUD is the ask. A spoken [STARTUP] prompt echo-gates the mic so
        # "yes" / the next utterance never reaches STT.
        return None

    async def handle_client_type(self, msg_type: str) -> bool:
        """Handle a client JSON ``type``. Returns True when consumed."""
        if msg_type not in CLIENT_OFFER_TYPES:
            return False
        # Cancel/retry are valid outside Offering; consent mutations are not.
        if msg_type == "briefing_offer_cancel":
            await self.preempt(reason="client_cancel")
            return True
        if msg_type == "briefing_offer_retry":
            await self.retry()
            return True
        if self.phase != OfferPhase.OFFERING:
            return True
        if msg_type == "briefing_offer_accept":
            await self.accept_once()
        elif msg_type == "briefing_offer_always":
            await self.accept_always()
        elif msg_type == "briefing_offer_skip_session":
            await self.skip_session()
        elif msg_type == "briefing_offer_never":
            await self.decline_forever()
        return True

    async def on_user_transcript(self, text: str) -> bool:
        """
        While Offering, classify spoken intent.

        Returns True when the utterance was a consent answer (consumed).
        Returns False when not offering, or when the utterance is unrelated
        (caller should preempt).
        """
        if self.phase != OfferPhase.OFFERING:
            return False
        low = (text or "").strip()
        if not low:
            return False
        if looks_like_briefing_always(low):
            await self.accept_always()
            return True
        if looks_like_briefing_never(low):
            await self.decline_forever()
            return True
        if looks_like_briefing_skip_session(low):
            await self.skip_session()
            return True
        if looks_like_briefing_accept(low):
            await self.accept_once()
            return True
        return False

    async def accept_once(self) -> None:
        """Run briefing this session only — do not persist granted."""
        if self.phase == OfferPhase.RUNNING:
            return
        if pending_delete_blocks_briefing(self._pending_delete):
            await self._send(_frame("briefing_offer_error", message=_PENDING_DELETE_MSG))
            return
        await self._start_pipeline(announce_loading=True)

    async def accept_always(self) -> None:
        """Persist granted (sticky always) and run this session."""
        if self.phase == OfferPhase.RUNNING:
            return
        if pending_delete_blocks_briefing(self._pending_delete):
            await self._send(_frame("briefing_offer_error", message=_PENDING_DELETE_MSG))
            return
        persist_briefing_always()
        await self._start_pipeline(announce_loading=True)

    async def skip_session(self) -> None:
        """Session skip — no declined write."""
        if self.phase == OfferPhase.RUNNING:
            await self.preempt(reason="skip_while_running")
            return
        self.phase = OfferPhase.SESSION_SKIPPED
        await self._send(_frame("briefing_offer_clear"))

    async def decline_forever(self) -> None:
        """Persist declined and clear the offer."""
        if get_startup_briefing_consent() != "declined":
            persist_briefing_consent("declined")
        if self.phase == OfferPhase.RUNNING:
            await self._cancel_task()
        self.phase = OfferPhase.DONE
        await self._send(_frame("briefing_offer_clear"))

    async def retry(self) -> None:
        """Re-offer (ask) or restart after skip/error/done when a routine exists."""
        if self.phase == OfferPhase.RUNNING:
            return
        routine = get_startup_message()
        if not routine:
            await self._send(_frame("briefing_offer_error", message=_NO_ROUTINE_MSG))
            return
        if get_startup_briefing_consent() == "declined":
            await self._send(
                _frame(
                    "briefing_offer_error",
                    message="Startup briefing is turned off. Say you want it always to re-enable.",
                )
            )
            return
        self.phase = OfferPhase.OFFERING
        await self._send(_frame("briefing_offer", reason="startup_ask"))

    async def preempt(self, *, reason: str) -> None:
        """Cancel offer UI and/or running pipeline (non-briefing intent / abort)."""
        was_running = self.phase == OfferPhase.RUNNING
        was_offering = self.phase == OfferPhase.OFFERING
        if not was_running and not was_offering:
            return
        if was_running:
            await self._cancel_task()
        self.phase = OfferPhase.DONE if was_running else OfferPhase.SESSION_SKIPPED
        await self._send(_frame("briefing_offer_clear"))
        logger.info("[briefing_offer] preempted (%s)", reason)

    async def start_from_gate(self) -> None:
        """Tool-triggered run_startup_briefing — start pipeline if not already running."""
        if self.phase == OfferPhase.RUNNING and self.task and not self.task.done():
            return
        if pending_delete_blocks_briefing(self._pending_delete):
            await self._send(_frame("briefing_offer_error", message=_PENDING_DELETE_MSG))
            return
        await self._start_pipeline(announce_loading=True)

    async def cleanup(self) -> None:
        """Cancel in-flight pipeline on WS close."""
        await self._cancel_task()
        self.phase = OfferPhase.IDLE

    async def _start_pipeline(self, *, announce_loading: bool) -> None:
        if not _paid_features_allowed():
            self.phase = OfferPhase.IDLE
            await self._send(_frame("briefing_offer_clear"))
            return
        routine = get_startup_message()
        if not routine:
            await self._send(_frame("briefing_offer_error", message=_NO_ROUTINE_MSG))
            self.phase = OfferPhase.DONE
            await self._send(_frame("briefing_offer_clear"))
            return
        if self.task is not None and not self.task.done():
            return
        # Accept/yes STT sets the barge-in event; clear it so the new run is not
        # aborted by the consent utterance that started it.
        if self._clear_barge_in is not None:
            self._clear_barge_in()
        self.phase = OfferPhase.RUNNING
        if announce_loading:
            await self._send(_frame("briefing_loading"))
        await self._send(_frame("startup_routine_running"))

        async def _run() -> None:
            try:
                await self._run_pipeline()
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("[briefing_offer] pipeline failed")
                await self._send(_frame("briefing_offer_error", message=_GENERIC_ERROR_MSG))
            finally:
                if self.phase == OfferPhase.RUNNING:
                    self.phase = OfferPhase.DONE
                await self._send(_frame("briefing_offer_clear"))

        self.task = asyncio.create_task(_run(), name="briefing_pipeline")

    async def _cancel_task(self) -> None:
        task = self.task
        self.task = None
        if task is None or task.done():
            return
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
        except Exception as exc:  # noqa: BLE001
            logger.debug("[briefing_offer] task ended with error during cancel: %s", exc)
