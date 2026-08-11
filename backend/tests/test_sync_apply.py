"""Tests for sync_apply — remote task completion allowlist."""

from __future__ import annotations

import importlib
import os
import tempfile
import unittest
from datetime import UTC, datetime, timedelta
from unittest.mock import patch


def _future_clock(record_id: str, minutes: int = 5) -> int:
    from sync_engine import _logical_clock

    ts = (datetime.now(UTC) + timedelta(minutes=minutes)).isoformat()
    return _logical_clock(ts, record_id)


def _record(
    record_id: str,
    *,
    completed: object = True,
    device_id: str = "phone-1",
    collection: str = "tasks",
    deleted: bool = False,
    logical_clock: int | None = None,
) -> dict:
    return {
        "collection": collection,
        "record_id": record_id,
        "device_id": device_id,
        "deleted": deleted,
        "logical_clock": (
            logical_clock if logical_clock is not None else _future_clock(record_id)
        ),
        "payload": {"completed": completed},
    }


class TestApplyRemoteTaskCompletion(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.mkdtemp(prefix="sync-apply-")
        os.environ["EXOSITES_DATA_DIR"] = self.tmp
        import tasks_store

        self.tasks_store = importlib.reload(tasks_store)
        import sync_apply

        self.sync_apply = importlib.reload(sync_apply)
        self.task = self.tasks_store.create_task("Water the plants")
        self.tid = str(self.task["id"])

    def _apply(self, record: dict, *, own_device: str = "desktop-1") -> str:
        return self.sync_apply.apply_remote_task_completion(
            record, own_device_id=own_device
        )

    def test_applies_completion_from_other_device(self) -> None:
        self.assertEqual(self._apply(_record(self.tid)), "applied")
        self.assertTrue(self.tasks_store.get_task(int(self.tid))["completed"])

    def test_uncomplete_applies_too(self) -> None:
        self.tasks_store.set_completed(int(self.tid), True)
        rec = _record(self.tid, completed=False, logical_clock=_future_clock(self.tid, 10))
        self.assertEqual(self._apply(rec), "applied")
        task = self.tasks_store.get_task(int(self.tid))
        self.assertFalse(task["completed"])
        self.assertIsNone(task["completed_at"])

    def test_skips_own_device(self) -> None:
        rec = _record(self.tid, device_id="desktop-1")
        self.assertEqual(self._apply(rec), "skipped_own_device")
        self.assertFalse(self.tasks_store.get_task(int(self.tid))["completed"])

    def test_skips_other_collections_and_deleted(self) -> None:
        self.assertEqual(
            self._apply(_record(self.tid, collection="memory_entries")),
            "skipped_collection",
        )
        self.assertEqual(
            self._apply(_record(self.tid, deleted=True)), "skipped_deleted"
        )

    def test_skips_unknown_and_invalid_ids(self) -> None:
        self.assertEqual(self._apply(_record("999999")), "skipped_unknown")
        self.assertEqual(self._apply(_record("not-an-int")), "skipped_invalid")

    def test_skips_non_bool_completed(self) -> None:
        self.assertEqual(
            self._apply(_record(self.tid, completed="yes")), "skipped_invalid"
        )

    def test_skips_noop_same_state(self) -> None:
        rec = _record(self.tid, completed=False)
        self.assertEqual(self._apply(rec), "skipped_noop")

    def test_skips_stale_older_than_local(self) -> None:
        # Remote clock far in the past loses to the freshly created local row.
        rec = _record(self.tid, logical_clock=1)
        self.assertEqual(self._apply(rec), "skipped_stale")
        self.assertFalse(self.tasks_store.get_task(int(self.tid))["completed"])


class TestPullAndApplyChanges(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.mkdtemp(prefix="sync-pull-apply-")
        os.environ["EXOSITES_DATA_DIR"] = self.tmp
        import tasks_store

        self.tasks_store = importlib.reload(tasks_store)
        import sync_engine

        self.sync_engine = importlib.reload(sync_engine)
        self.master_key = os.urandom(32)
        self.account = "550e8400-e29b-41d4-a716-446655440000"

    def _envelope_for(self, task_id: str, *, completed: bool = True) -> dict:
        import json

        from exosites_crypto import SCHEMA_V3, build_envelope

        updated = (datetime.now(UTC) + timedelta(minutes=5)).isoformat()
        rkey = self.sync_engine._record_key(self.master_key, "tasks", task_id)
        return build_envelope(
            collection="tasks",
            record_id=task_id,
            device_id="phone-1",
            logical_clock=self.sync_engine._logical_clock(updated, task_id),
            updated_at=updated,
            plaintext=json.dumps({"completed": completed}).encode(),
            record_key=rkey,
            schema_version=SCHEMA_V3,
            account_id=self.account,
        )

    def test_applies_and_tolerates_undecryptable_rows(self) -> None:
        task = self.tasks_store.create_task("Buy stamps")
        tid = str(task["id"])
        good = self._envelope_for(tid)
        bad = dict(good, record_id="other", ciphertext="AAAA")

        with patch.object(self.sync_engine, "pull_blobs") as pull:
            pull.return_value = {"blobs": [bad, good], "cursor": 42, "has_more": False}
            stats = self.sync_engine.pull_and_apply_changes(
                cloud_url="https://relay.example.com",
                access_token="tok",
                master_key=self.master_key,
                account_id=self.account,
                device_id="desktop-1",
                cursor=0,
            )
        self.assertEqual(stats["applied"], 1)
        self.assertEqual(stats["undecryptable"], 1)
        self.assertEqual(stats["cursor"], 42)
        self.assertTrue(self.tasks_store.get_task(int(tid))["completed"])

    def test_resync_required_jumps_to_feed_head(self) -> None:
        with patch.object(self.sync_engine, "pull_blobs") as pull:
            pull.return_value = {
                "blobs": [],
                "cursor": 3,
                "has_more": True,
                "resync_required": True,
                "resume_cursor": 500,
            }
            stats = self.sync_engine.pull_and_apply_changes(
                cloud_url="https://relay.example.com",
                access_token="tok",
                master_key=self.master_key,
                account_id=self.account,
                device_id="desktop-1",
                cursor=3,
            )
        self.assertEqual(stats["cursor"], 500)
        self.assertEqual(stats["applied"], 0)


if __name__ == "__main__":
    unittest.main()
