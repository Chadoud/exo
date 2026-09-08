"""Tests for sync export hooks."""

from __future__ import annotations

import importlib
import os
import tempfile
import unittest

import assistant_memory
import sync_export
import tasks_store


class TestSyncExport(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.mkdtemp(prefix="sync-export-")
        os.environ["EXOSITES_DATA_DIR"] = self.tmp
        importlib.reload(assistant_memory)
        importlib.reload(tasks_store)
        importlib.reload(sync_export)

    def test_export_memory_and_tasks(self) -> None:
        assistant_memory.update_memory("notes", "sync-test", "value", conversation_id=None)
        tasks_store.create_task("Sync me", source="manual")
        items = sync_export.export_all()
        collections = {i["collection"] for i in items}
        self.assertIn("memory_entries", collections)
        self.assertIn("tasks", collections)
        live = [
            i
            for i in items
            if i["collection"] == "tasks"
            and not i.get("deleted")
            and not str(i.get("record_id") or "").startswith("capability:")
        ]
        self.assertEqual(len(live), 1)
        self.assertFalse(live[0].get("deleted"))

    def test_export_source_forget_marker(self) -> None:
        import tasks_source_forget

        importlib.reload(tasks_source_forget)
        tasks_source_forget.record_source_forgets({"gmail"})
        items = [
            i
            for i in sync_export.export_tasks()
            if i["record_id"] == "source_forget:gmail"
        ]
        self.assertEqual(len(items), 1)
        self.assertTrue(items[0]["deleted"])
        self.assertEqual(items[0]["payload"]["forget_source"], "gmail")

    def test_export_source_forget_capability_once(self) -> None:
        first = [
            i
            for i in sync_export.export_tasks()
            if i["record_id"] == "capability:source_forget_v1"
        ]
        self.assertEqual(len(first), 1)
        self.assertFalse(first[0]["deleted"])
        self.assertEqual(first[0]["payload"]["capability"], "source_forget_v1")
        again = [
            i
            for i in sync_export.export_tasks()
            if i["record_id"] == "capability:source_forget_v1"
        ]
        self.assertEqual(first[0]["updated_at"], again[0]["updated_at"])
        older = first[0]["updated_at"]
        skipped = [
            i
            for i in sync_export.export_tasks(since_updated_at=older)
            if i["record_id"] == "capability:source_forget_v1"
        ]
        self.assertEqual(skipped, [])

    def test_export_dismissed_task_as_tombstone(self) -> None:
        task = tasks_store.create_task("Not a real to-do", source="google-calendar")
        tasks_store.delete_task(task["id"])
        items = [i for i in sync_export.export_tasks() if i["record_id"] == str(task["id"])]
        self.assertEqual(len(items), 1)
        self.assertTrue(items[0]["deleted"])
        self.assertEqual(items[0]["payload"], {})

    def _seed_inbox_rows(self) -> None:
        import nudges
        from mail_initiative import store as mail_store
        from orchestrator import memory as orch_memory

        importlib.reload(nudges)
        with nudges._conn() as conn:
            nudges._add(conn, "suggestion", "Old nudge", "Still on Inbox.", {})
            conn.commit()
        orch_memory.remember(
            "Goal: book the flight\nOutcome: calendar was closed",
            kind=orch_memory.KIND_FAILURE,
        )
        mail_store.upsert_candidate(
            thread_id="t-inbox-sync",
            message_ids=["m1"],
            last_message_id="m1",
            from_name="Ada",
            from_email="ada@example.com",
            subject="Lunch",
            draft_subject="Re: Lunch",
            draft_body="See you at noon.",
        )

    def test_inbox_export_ignores_since_until_backfill_marked(self) -> None:
        self._seed_inbox_rows()
        future = "2099-01-01T00:00:00+00:00"
        self.assertTrue(sync_export.inbox_backfill_pending())
        self.assertEqual(len(sync_export.export_nudges(since_updated_at=future)), 1)
        self.assertEqual(len(sync_export.export_pending_actions(since_updated_at=future)), 1)
        self.assertEqual(len(sync_export.export_agent_failures(since_updated_at=future)), 1)
        collections = {i["collection"] for i in sync_export.export_all(since_updated_at=future)}
        self.assertTrue(sync_export.INBOX_COLLECTIONS.issubset(collections))

    def test_inbox_export_honors_since_after_backfill_marked(self) -> None:
        self._seed_inbox_rows()
        sync_export.mark_inbox_backfill_done()
        self.assertFalse(sync_export.inbox_backfill_pending())
        future = "2099-01-01T00:00:00+00:00"
        self.assertEqual(sync_export.export_nudges(since_updated_at=future), [])
        self.assertEqual(sync_export.export_pending_actions(since_updated_at=future), [])
        self.assertEqual(sync_export.export_agent_failures(since_updated_at=future), [])
        collections = {i["collection"] for i in sync_export.export_all(since_updated_at=future)}
        self.assertFalse(collections & sync_export.INBOX_COLLECTIONS)
