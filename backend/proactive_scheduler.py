"""
Background scheduler for the proactive second brain.

Keeps the second brain fresh without the user opening any tab: harvests tasks
from connected integrations, generates nudges, builds the daily digest, and
prunes the activity timeline on fixed intervals.

A single daemon thread (mirroring ``activity_capture``) runs a small job table.
Each job has an interval and a last-run timestamp held in memory; the loop wakes
periodically, runs whatever is due, and never lets one failing job kill the loop
or the others. LLM-touching jobs go through the same rate limiter the HTTP routes
use, so scheduled and user-triggered work share one budget (no double spend).

This is deliberately dependency-free (no APScheduler) and local-first: when no
integrations are connected, the sync job is a cheap no-op and costs zero API calls.
"""

from __future__ import annotations

import logging
import threading
import time
from datetime import UTC, datetime
from typing import Any, Callable

logger = logging.getLogger(__name__)

_TICK_SECONDS = 60  # how often the loop wakes to check for due jobs

_INTEGRATION_SYNC_INTERVAL = 30 * 60
_NUDGE_INTERVAL = 15 * 60
_DIGEST_INTERVAL = 6 * 60 * 60  # re-evaluate a few times/day; digest is idempotent per date
_ACTIVITY_PRUNE_INTERVAL = 24 * 60 * 60
_TELEMETRY_PRUNE_INTERVAL = 24 * 60 * 60

_ACTIVITY_RETENTION_DAYS = 14


class _Job:
    """A scheduled unit of work with its own interval and last-run clock."""

    def __init__(self, name: str, interval_sec: int, run: Callable[[], Any]) -> None:
        self.name = name
        self.interval_sec = interval_sec
        self.run = run
        self.last_run_monotonic: float | None = None
        self.last_run_at: str | None = None
        self.last_error: str | None = None

    def is_due(self, now: float) -> bool:
        if self.last_run_monotonic is None:
            return True
        return (now - self.last_run_monotonic) >= self.interval_sec

    def execute(self) -> None:
        try:
            self.run()
            self.last_error = None
        except Exception as exc:  # one bad job must never break the loop
            self.last_error = str(exc)
            logger.exception("scheduled job %s failed", self.name)
        finally:
            self.last_run_monotonic = time.monotonic()
            self.last_run_at = datetime.now(UTC).isoformat()


class _Scheduler:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._thread: threading.Thread | None = None
        self._stop = threading.Event()
        self._jobs: list[_Job] = []
        self.running = False

    def _build_jobs(self) -> list[_Job]:
        return [
            _Job("integration_task_sync", _INTEGRATION_SYNC_INTERVAL, _run_integration_sync),
            _Job("gmail_ready_replies", _INTEGRATION_SYNC_INTERVAL, _run_gmail_ready_replies),
            _Job("nudge_generation", _NUDGE_INTERVAL, _run_nudge_generation),
            _Job("digest_generation", _DIGEST_INTERVAL, _run_digest_generation),
            _Job("activity_prune", _ACTIVITY_PRUNE_INTERVAL, _run_activity_prune),
            _Job("telemetry_prune", _TELEMETRY_PRUNE_INTERVAL, _run_telemetry_prune),
        ]

    def start(self) -> None:
        with self._lock:
            if self.running:
                return
            self._jobs = self._build_jobs()
            self._stop.clear()
            self.running = True
            self._thread = threading.Thread(
                target=self._loop, name="proactive-scheduler", daemon=True
            )
            self._thread.start()
        logger.info("proactive scheduler started")

    def stop(self) -> None:
        with self._lock:
            self._stop.set()
            self.running = False
        logger.info("proactive scheduler stopped")

    def _loop(self) -> None:
        while not self._stop.is_set():
            now = time.monotonic()
            for job in list(self._jobs):
                if self._stop.is_set():
                    break
                if job.is_due(now):
                    job.execute()
            self._stop.wait(_TICK_SECONDS)

    def status(self) -> dict[str, Any]:
        with self._lock:
            jobs = list(self._jobs)
            running = self.running
        return {
            "running": running,
            "jobs": [
                {
                    "name": j.name,
                    "interval_sec": j.interval_sec,
                    "last_run_at": j.last_run_at,
                    "last_error": j.last_error,
                }
                for j in jobs
            ],
        }


def _proactive_allowed() -> bool:
    """Paid-tier gate: scheduled jobs share the same entitlement as the HTTP routes."""
    from entitlement_gate import may_use_proactive

    allowed, _reason = may_use_proactive()
    return allowed


def _run_integration_sync() -> None:
    """Harvest tasks from connected integrations; skip entirely when none connected."""
    if not _proactive_allowed():
        return  # unlicensed past trial — proactive sync is a paid feature
    from connector_credentials import list_connected_providers

    if not list_connected_providers():
        return  # idle users cost zero API calls
    import tasks_integration_sync

    tasks_integration_sync.sync_integration_tasks()


def _run_gmail_ready_replies() -> None:
    """Heuristic unanswered-Gmail harvest. Metadata only; no LLM, not a nudge."""
    if not _proactive_allowed():
        return
    from mail_initiative.harvest import run_harvest

    run_harvest()


def _run_nudge_generation() -> None:
    if not _proactive_allowed():
        return
    import nudges

    nudges.generate_nudges()  # already rate-limited internally


def _run_digest_generation() -> None:
    """Generate today's digest. Idempotent per date (upsert), so safe to re-run."""
    if not _proactive_allowed():
        return
    from telemetry.rate_limit_memory import allow

    if not allow("digest_generate", 6, 86400):
        return  # shared budget with the HTTP route
    import daily_digest

    daily_digest.generate_digest()


def _run_activity_prune() -> None:
    import activity_store

    activity_store.prune_older_than(_ACTIVITY_RETENTION_DAYS)


def _run_telemetry_prune() -> None:
    from telemetry.retention import prune_telemetry_older_than

    prune_telemetry_older_than()


_scheduler = _Scheduler()


def start_proactive_scheduler() -> None:
    """Start the background scheduler (idempotent)."""
    _scheduler.start()


def stop_proactive_scheduler() -> None:
    """Stop the background scheduler."""
    _scheduler.stop()


def scheduler_status() -> dict[str, Any]:
    """Per-job last-run timestamps for honest 'last synced' UX."""
    return _scheduler.status()
