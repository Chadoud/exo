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
        live = [i for i in items if i["collection"] == "tasks"]
        self.assertEqual(len(live), 1)
        self.assertFalse(live[0].get("deleted"))

    def test_export_dismissed_task_as_tombstone(self) -> None:
        task = tasks_store.create_task("Not a real to-do", source="google-calendar")
        tasks_store.delete_task(task["id"])
        items = [i for i in sync_export.export_tasks() if i["record_id"] == str(task["id"])]
        self.assertEqual(len(items), 1)
        self.assertTrue(items[0]["deleted"])
        self.assertEqual(items[0]["payload"], {})
