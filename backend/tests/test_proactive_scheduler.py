"""Tests for the proactive background scheduler job registry."""

from __future__ import annotations

import importlib

import pytest


@pytest.fixture()
def scheduler(tmp_path, monkeypatch):
    monkeypatch.setenv("EXOSITES_DATA_DIR", str(tmp_path))
    import proactive_scheduler

    importlib.reload(proactive_scheduler)
    return proactive_scheduler


def test_job_runs_when_due(scheduler):
    calls: list[str] = []
    job = scheduler._Job("noop", 60, lambda: calls.append("ran"))
    assert job.is_due(0.0) is True  # never run → due
    job.execute()
    assert calls == ["ran"]
    assert job.last_run_at is not None


def test_job_not_due_within_interval(scheduler):
    import time

    job = scheduler._Job("noop", 600, lambda: None)
    job.execute()
    now = time.monotonic()
    assert job.is_due(now) is False  # just ran, interval not elapsed


def test_failing_job_is_isolated(scheduler):
    def boom() -> None:
        raise RuntimeError("kaboom")

    job = scheduler._Job("boom", 60, boom)
    job.execute()  # must not raise
    assert job.last_error is not None
    assert "kaboom" in job.last_error


def test_integration_sync_skips_without_credentials(scheduler, monkeypatch):
    called = {"sync": False}

    monkeypatch.setattr(
        "connector_credentials.list_connected_providers", lambda: []
    )

    def fail_sync() -> None:
        called["sync"] = True

    import tasks_integration_sync

    monkeypatch.setattr(tasks_integration_sync, "sync_integration_tasks", fail_sync)
    scheduler._run_integration_sync()
    assert called["sync"] is False  # no credentials → no API calls


def test_integration_sync_runs_with_credentials(scheduler, monkeypatch):
    called = {"sync": False}

    monkeypatch.setattr(
        "connector_credentials.list_connected_providers", lambda: ["gmail"]
    )

    import tasks_integration_sync

    monkeypatch.setattr(
        tasks_integration_sync,
        "sync_integration_tasks",
        lambda: called.__setitem__("sync", True),
    )
    scheduler._run_integration_sync()
    assert called["sync"] is True


def test_status_reports_jobs(scheduler):
    scheduler._scheduler._jobs = scheduler._scheduler._build_jobs()
    status = scheduler.scheduler_status()
    names = {j["name"] for j in status["jobs"]}
    assert names == {
        "integration_task_sync",
        "gmail_ready_replies",
        "nudge_generation",
        "digest_generation",
        "activity_prune",
        "telemetry_prune",
    }
