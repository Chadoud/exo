"""Restore after Inbox dismiss and Tasks Remove — undo must persist."""

from __future__ import annotations

import importlib

import pytest
from fastapi.testclient import TestClient


@pytest.fixture()
def env(tmp_path, monkeypatch):
    monkeypatch.setenv("EXOSITES_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("EXOSITES_DISABLE_SCHEDULER", "1")
    monkeypatch.delenv("EXOSITES_APP_TOKEN", None)
    import mail_initiative.store as mail_store
    import nudges
    import tasks_store
    from orchestrator import memory as orch_memory

    for mod in (nudges, tasks_store, mail_store, orch_memory):
        importlib.reload(mod)
    return nudges, tasks_store, mail_store, orch_memory


@pytest.fixture()
def client(env, tmp_path, monkeypatch):
    monkeypatch.setenv("EXOSITES_DATA_DIR", str(tmp_path))
    from main import app

    return TestClient(app)


def test_nudge_dismiss_then_restore(env, monkeypatch):
    nudges, _, _, _ = env
    monkeypatch.setattr(nudges, "_suggestion_candidates", lambda: [("suggestion", "One", "r", {})])
    monkeypatch.setattr(nudges, "_due_task_candidates", lambda: [])
    created = nudges.generate_nudges()
    assert created
    nid = created[0]["id"]
    assert nudges.dismiss_nudge(nid) is True
    assert nudges.list_nudges() == []
    assert nudges.restore_nudge(nid) is True
    assert any(n["id"] == nid for n in nudges.list_nudges())
    assert nudges.restore_nudge(999999) is False


def test_nudge_dismiss_all_returns_ids(env, monkeypatch):
    nudges, _, _, _ = env
    monkeypatch.setattr(
        nudges,
        "_suggestion_candidates",
        lambda: [("suggestion", "A", "r", {}), ("suggestion", "B", "r", {})],
    )
    monkeypatch.setattr(nudges, "_due_task_candidates", lambda: [])
    created = nudges.generate_nudges()
    ids = nudges.dismiss_all()
    assert sorted(ids) == sorted(c["id"] for c in created)
    assert nudges.list_nudges() == []
    for nid in ids:
        assert nudges.restore_nudge(nid) is True
    assert len(nudges.list_nudges()) == len(created)


def test_task_restore_after_remove(env):
    _, tasks_store, _, _ = env
    task = tasks_store.create_task("Call the landlord")
    assert tasks_store.delete_task(task["id"]) is True
    assert tasks_store.list_tasks() == []
    restored = tasks_store.restore_task(task["id"])
    assert restored is not None
    assert restored["dismissed"] is False
    assert tasks_store.list_tasks()[0]["id"] == task["id"]
    assert tasks_store.restore_task(task["id"]) is None


def test_failure_soft_dismiss_then_restore(env):
    _, _, _, orch_memory = env
    orch_memory.remember("Goal: deploy\nOutcome: timed out", kind=orch_memory.KIND_FAILURE)
    row = orch_memory.recent_open_failures(5)[0]
    assert orch_memory.dismiss_failure(row.id) is True
    assert orch_memory.recent_open_failures(5) == []
    assert orch_memory.restore_failure(row.id) is True
    assert orch_memory.recent_open_failures(5)[0].id == row.id


def test_mail_hide_keeps_candidate_for_restore(env):
    _, _, mail_store, _ = env
    row = mail_store.upsert_candidate(
        thread_id="thr-undo",
        message_ids=["m1"],
        last_message_id="m1",
        from_name="Ada",
        from_email="ada@example.com",
        subject="Lunch?",
    )
    cid = int(row["id"])
    mail_store.dismiss_thread("thr-undo")
    assert mail_store.get_candidate(cid) is None
    assert mail_store.list_candidates() == []
    restored = mail_store.restore_candidate(cid)
    assert restored is not None
    assert restored["id"] == cid
    assert mail_store.get_candidate(cid) is not None


def test_restore_routes_404(client):
    assert client.post("/nudges/999/restore").status_code == 404
    assert client.post("/tasks/999/restore").status_code == 404
    assert client.post("/proactive/failures/999/restore").status_code == 404
    assert client.post("/mail/replies/999/restore").status_code == 404


def test_task_restore_route(client, env):
    _, tasks_store, _, _ = env
    task = tasks_store.create_task("Ship the build")
    assert client.delete(f"/tasks/{task['id']}").status_code == 200
    assert client.get("/tasks").json() == []
    res = client.post(f"/tasks/{task['id']}/restore")
    assert res.status_code == 200
    assert res.json()["id"] == task["id"]
    assert any(row["id"] == task["id"] for row in client.get("/tasks").json())
