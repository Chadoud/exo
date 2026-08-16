"""Streaming startup briefing pipeline and queue helpers."""

from __future__ import annotations

import asyncio
import logging
from typing import Callable

from tool_registry import dispatch_sync
from voice.briefing.records import (
    briefing_outcome_injection,
    remaining_section_labels,
    requested_section_labels,
    routine_requests_tasks,
)
from voice.briefing.sections import SECTION_REGISTRY, _extract_city

logger = logging.getLogger(__name__)

# Max time to wait for a single section's network fetch to complete.
_SECTION_FETCH_TIMEOUT_S = 8.0

# Max time to wait for Gemini's turn_complete after injecting a section.
# If the signal never arrives (dropped session), pacing degrades to best-effort
# rather than hanging the pipeline.
_TURN_PACING_TIMEOUT_S = 15.0

# Max time to wait for OAuth tokens before starting token-gated fetches.
_TOKEN_RELAY_TIMEOUT_S = 8.0


def is_briefing_injection(text: str) -> bool:
    """True for server-queued briefing section turns (not user-typed chat)."""
    return text.strip().startswith("[BRIEFING:")


def drain_queued_briefing_injections(audio_queue: asyncio.Queue) -> int:
    """
    Remove pending [BRIEFING:…] strings from the shared audio queue.

    Preserves PCM blobs and user-typed text so a new task can run immediately
    after the briefing is aborted.

    @returns Number of briefing injections discarded.
    """
    preserved: list[object] = []
    dropped = 0
    while True:
        try:
            item = audio_queue.get_nowait()
        except asyncio.QueueEmpty:
            break
        if isinstance(item, str) and is_briefing_injection(item):
            dropped += 1
            continue
        preserved.append(item)
    for item in preserved:
        audio_queue.put_nowait(item)
    return dropped


def _briefing_skip_message(label: str, needs_reconnect: bool) -> str | None:
    """Spoken skip line when a requested section could not be fetched."""
    outcome = "skipped_reconnect" if needs_reconnect else "skipped_fail"
    return briefing_outcome_injection(label, outcome)


async def _wait_turn(
    turn_done: asyncio.Queue,
    timeout: float,
    *,
    drain_first: bool,
) -> None:
    """
    Wait for exactly one fresh turn_complete signal from the session.

    drain_first=True: discard any already-queued signals first (handles
    duplicate turn_complete events or barge-in turns) then await a fresh one.

    drain_first=False: await the queue directly — used for the greeting where
    the signal may already be queued by the time we get here.

    Always swallows TimeoutError so a missing signal never hangs the pipeline.
    """
    if drain_first:
        while not turn_done.empty():
            try:
                turn_done.get_nowait()
            except asyncio.QueueEmpty:
                break
    try:
        await asyncio.wait_for(turn_done.get(), timeout=timeout)
    except asyncio.TimeoutError:
        logger.debug(
            "[briefing] _wait_turn timed out after %.0fs — continuing best-effort",
            timeout,
        )


async def _emit_aborted_remaining(
    requested: list[str],
    from_label: str,
    send_section_record: Callable[[str, str], object],
) -> None:
    for label in remaining_section_labels(requested, from_label):
        await send_section_record(label, "aborted")


async def stream_briefing_sections(
    routine: str,
    audio_queue: asyncio.Queue,
    tokens_ready: asyncio.Event,
    turn_done: asyncio.Queue,
    user_spoke: asyncio.Event,
    send_progress: Callable[[str | None], None],
    send_section_record: Callable[[str, str], object] | None = None,
    send_tasks_honesty: Callable[[], object] | None = None,
) -> None:
    """
    Fetch all briefing sections concurrently, then speak them one-at-a-time
    paced by Gemini's real turn_complete signal.

    Architecture:
      - Token-free sections (news, weather) start fetching immediately.
      - Token-gated sections (calendar, mail) start once OAuth tokens arrive.
      - Sections are injected in SECTION_REGISTRY order (= spoken order).
      - Each injection waits for the previous section's turn_complete before
        proceeding, so sections never barge-in / cut each other off.
      - If the user speaks mid-briefing (user_spoke), the pipeline stops and
        yields the floor immediately.
    """
    lower = routine.lower()
    city = _extract_city(routine)

    # Build fetch spec split by token requirement.
    # token_free / token_gated: {sublabel: (tool, params)}
    # section_sublabels: {section_label: [sublabel, ...]}
    token_free: dict[str, tuple[str, dict]] = {}
    token_gated: dict[str, tuple[str, dict]] = {}
    section_sublabels: dict[str, list[str]] = {}

    for label, spec in SECTION_REGISTRY.items():
        if not any(k in lower for k in spec.keywords):
            continue
        fetches = spec.build(routine)
        if not fetches:
            continue
        sublabels: list[str] = []
        for sublabel, tool, params in fetches:
            target = token_gated if spec.needs_token else token_free
            target[sublabel] = (tool, params)
            sublabels.append(sublabel)
        section_sublabels[label] = sublabels

    async def _record(section: str, outcome: str) -> None:
        if send_section_record is None:
            return
        await send_section_record(section, outcome)

    async def _tasks_honesty() -> None:
        if send_tasks_honesty is None or not routine_requests_tasks(routine):
            return
        await send_tasks_honesty()

    if not section_sublabels:
        logger.debug("[briefing] no sections detected in routine: %.80r", routine)
        await _tasks_honesty()
        return

    requested = requested_section_labels(section_sublabels)

    # Launch token-free fetches immediately (no credentials needed).
    tasks: dict[str, asyncio.Task] = {
        sublabel: asyncio.create_task(
            asyncio.to_thread(dispatch_sync, tool, params, approval_granted=True),
            name=f"briefing_{sublabel}",
        )
        for sublabel, (tool, params) in token_free.items()
    }

    # Launch token-gated fetches once OAuth tokens are stored.
    async def _start_gated() -> None:
        try:
            await asyncio.wait_for(tokens_ready.wait(), timeout=_TOKEN_RELAY_TIMEOUT_S)
        except asyncio.TimeoutError:
            logger.info(
                "[briefing] token relay not received in %.0fs — "
                "skipping gated sections (calendar, mail)",
                _TOKEN_RELAY_TIMEOUT_S,
            )
            return
        for sublabel, (tool, params) in token_gated.items():
            tasks[sublabel] = asyncio.create_task(
                asyncio.to_thread(dispatch_sync, tool, params, approval_granted=True),
                name=f"briefing_{sublabel}",
            )

    gate_task = asyncio.create_task(_start_gated(), name="briefing_gate")

    try:
        # Wait for greeting's turn_complete BEFORE the first section.
        # drain_first=False: greeting signal may already be in the queue.
        await _wait_turn(turn_done, _TURN_PACING_TIMEOUT_S, drain_first=False)

        for label, spec in SECTION_REGISTRY.items():
            sublabels = section_sublabels.get(label)
            if not sublabels:
                continue  # section not in this user's routine

            # Abort if the user has spoken — yield the floor.
            if user_spoke.is_set():
                logger.info("[briefing] aborted by user barge-in before section '%s'", label)
                await _emit_aborted_remaining(requested, label, _record)
                await _tasks_honesty()
                return

            # Ensure token-gated tasks were started before we await them.
            if spec.needs_token:
                await gate_task

            # Await all sublabel tasks for this section (per-section timeout each).
            results: dict[str, dict] = {}
            needs_reconnect = False
            for sublabel in sublabels:
                task = tasks.get(sublabel)
                if task is None:
                    continue
                try:
                    result = await asyncio.wait_for(task, timeout=_SECTION_FETCH_TIMEOUT_S)
                    if isinstance(result, dict) and result.get("ok"):
                        results[sublabel] = result
                    else:
                        err = (
                            result.get("error", "no detail")
                            if isinstance(result, dict)
                            else result
                        )
                        if isinstance(result, dict) and result.get("needs_reconnect"):
                            needs_reconnect = True
                        logger.info("[briefing] %s failed: %s", sublabel, err)
                except asyncio.TimeoutError:
                    logger.info(
                        "[briefing] %s timed out after %.0fs — skipping",
                        sublabel,
                        _SECTION_FETCH_TIMEOUT_S,
                    )
                except asyncio.CancelledError:
                    raise
                except Exception as exc:
                    logger.info("[briefing] %s raised: %s", sublabel, exc)

            if user_spoke.is_set():
                logger.info("[briefing] aborted by user barge-in during '%s'", label)
                await _emit_aborted_remaining(requested, label, _record)
                await _tasks_honesty()
                return

            if not results:
                outcome = "skipped_reconnect" if needs_reconnect else "skipped_fail"
                await _record(label, outcome)
                skip_msg = _briefing_skip_message(label, needs_reconnect)
                if skip_msg and not user_spoke.is_set():
                    await audio_queue.put(skip_msg)
                    await send_progress(label)
                    await _wait_turn(turn_done, _TURN_PACING_TIMEOUT_S, drain_first=True)
                continue

            msg = spec.fmt(results, city, routine)
            if not msg:
                await _record(label, "nothing")
                nothing_msg = briefing_outcome_injection(label, "nothing")
                if nothing_msg and not user_spoke.is_set():
                    await audio_queue.put(nothing_msg)
                    await send_progress(label)
                    await _wait_turn(turn_done, _TURN_PACING_TIMEOUT_S, drain_first=True)
                continue

            # Final abort check immediately before injecting.
            if user_spoke.is_set():
                logger.info("[briefing] aborted by user barge-in before injecting '%s'", label)
                await _emit_aborted_remaining(requested, label, _record)
                await _tasks_honesty()
                return

            await audio_queue.put(msg)
            await send_progress(label)
            logger.debug("[briefing] section '%s' injected", label)

            # Pace: drain stale signals, then await one fresh turn_complete.
            await _wait_turn(turn_done, _TURN_PACING_TIMEOUT_S, drain_first=True)

        await _tasks_honesty()

    finally:
        # Cancel any tasks still running after the pipeline finishes/aborts.
        gate_task.cancel()
        for t in tasks.values():
            if not t.done():
                t.cancel()
        # Await cancellations so they don't become orphaned background threads.
        await asyncio.gather(gate_task, *tasks.values(), return_exceptions=True)
        # Briefing is over (all sections delivered, or aborted) — tell the UI to
        # hide the progress indicator. Guarded so a closing socket never raises.
        try:
            await send_progress(None)
        except Exception as exc:  # noqa: BLE001 — socket may already be closing
            logger.debug("voice briefing: hide-progress send failed: %s", exc)
