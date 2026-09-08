"""Inbox GO SYNC — nudges and agent_failures, no meta on the wire."""

from __future__ import annotations

import inbox_sync
import nudges
from orchestrator import memory as orch_memory


def test_export_nudge_omits_meta(tmp_path, monkeypatch):
    monkeypatch.setenv("EXOSITES_DATA_DIR", str(tmp_path))
    with nudges._conn() as conn:
        nudges._add(conn, "suggestion", "Try a recap", "You asked for one.", {"tool": "secret"})
        conn.commit()
    items = inbox_sync.export_nudges()
    assert len(items) == 1
    payload = items[0]["payload"]
    assert payload["title"] == "Try a recap"
    assert payload["body"] == "You asked for one."
    assert payload["kind"] == "suggestion"
    assert "meta" not in payload
    assert "tool" not in payload
    assert items[0]["deleted"] is False


def test_export_collapses_failed_tasks_pointer(tmp_path, monkeypatch):
    monkeypatch.setenv("EXOSITES_DATA_DIR", str(tmp_path))
    with nudges._conn() as conn:
        nudges._add(conn, "suggestion", nudges.FAILED_TASKS_NUDGE_TITLE, "1 failed.", {})
        conn.commit()
    items = inbox_sync.export_nudges()
    assert len(items) == 1
    assert items[0]["deleted"] is True
    assert nudges.list_nudges() == []


def test_export_dismissed_nudge_is_tombstone(tmp_path, monkeypatch):
    monkeypatch.setenv("EXOSITES_DATA_DIR", str(tmp_path))
    with nudges._conn() as conn:
        row = nudges._add(conn, "suggestion", "Hide me", "Later.", {})
        conn.commit()
    assert row is not None
    assert nudges.dismiss_nudge(int(row["id"]))
    items = inbox_sync.export_nudges()
    assert items[0]["deleted"] is True
    assert items[0]["payload"] == {}


def test_apply_nudge_dismiss(tmp_path, monkeypatch):
    monkeypatch.setenv("EXOSITES_DATA_DIR", str(tmp_path))
    with nudges._conn() as conn:
        row = nudges._add(conn, "suggestion", "Hide me", "Later.", {})
        conn.commit()
    rid = str(row["id"])
    out = inbox_sync.apply_remote_nudge(
        {
            "collection": "nudges",
            "record_id": rid,
            "device_id": "phone",
            "deleted": True,
            "payload": {},
        },
        own_device_id="desktop",
    )
    assert out == "applied"
    assert nudges.list_nudges() == []


def test_apply_nudge_rejects_extra_keys(tmp_path, monkeypatch):
    monkeypatch.setenv("EXOSITES_DATA_DIR", str(tmp_path))
    out = inbox_sync.apply_remote_nudge(
        {
            "collection": "nudges",
            "record_id": "1",
            "device_id": "phone",
            "deleted": True,
            "payload": {"status": "dismissed", "meta": {"tool": "x"}},
        },
        own_device_id="desktop",
    )
    assert out == "skipped_invalid"


def test_export_failure_uses_parsed_goal_outcome(tmp_path, monkeypatch):
    monkeypatch.setenv("EXOSITES_DATA_DIR", str(tmp_path))
    orch_memory.remember(
        "Goal: book the flight\nOutcome: calendar was closed",
        kind=orch_memory.KIND_FAILURE,
    )
    items = inbox_sync.export_agent_failures()
    open_items = [i for i in items if not i["deleted"]]
    assert len(open_items) == 1
    payload = open_items[0]["payload"]
    assert payload["goal"] == "book the flight"
    assert payload["outcome"] == "calendar was closed"
    assert "content" not in payload


def test_apply_failure_dismiss(tmp_path, monkeypatch):
    monkeypatch.setenv("EXOSITES_DATA_DIR", str(tmp_path))
    orch_memory.remember(
        "Goal: book the flight\nOutcome: calendar was closed",
        kind=orch_memory.KIND_FAILURE,
    )
    row = orch_memory.recent_open_failures(5)[0]
    out = inbox_sync.apply_remote_failure(
        {
            "collection": "agent_failures",
            "record_id": str(row.id),
            "device_id": "phone",
            "deleted": True,
            "payload": {},
        },
        own_device_id="desktop",
    )
    assert out == "applied"
    assert orch_memory.recent_open_failures(5) == []
