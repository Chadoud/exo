"""Tests for local /sync/run route."""

from __future__ import annotations

import base64
import os
import tempfile
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

import main


class TestSyncRoutes(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.mkdtemp(prefix="sync-routes-")
        os.environ["EXOSITES_DATA_DIR"] = self.tmp
        os.environ["EXOSITES_DEV_BYPASS_ENTITLEMENT"] = "1"
        self.client = TestClient(main.app)

    @patch("sync_engine.run_sync_cycle")
    def test_run_sync_proxies_to_engine(self, run_cycle) -> None:
        run_cycle.return_value = {"ok": True, "blob_count": 3, "sync_run_id": "abc"}
        key = base64.b64encode(os.urandom(32)).decode("ascii")
        res = self.client.post(
            "/sync/run",
            json={
                "cloud_url": "https://relay.example.com",
                "access_token": "token",
                "master_key_b64": key,
                "device_id": "desktop-1",
                "account_id": "550e8400-e29b-41d4-a716-446655440000",
                "pull_cursor": 12,
            },
        )
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.json()["ok"])
        run_cycle.assert_called_once()
        self.assertEqual(run_cycle.call_args.kwargs["pull_cursor"], 12)

    @patch("sync_engine.run_sync_cycle")
    def test_run_sync_defaults_pull_cursor(self, run_cycle) -> None:
        run_cycle.return_value = {"ok": True}
        key = base64.b64encode(os.urandom(32)).decode("ascii")
        res = self.client.post(
            "/sync/run",
            json={
                "cloud_url": "https://relay.example.com",
                "access_token": "token",
                "master_key_b64": key,
                "device_id": "desktop-1",
                "account_id": "550e8400-e29b-41d4-a716-446655440000",
            },
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(run_cycle.call_args.kwargs["pull_cursor"], 0)

    def test_local_status(self) -> None:
        res = self.client.get("/sync/local/status")
        self.assertEqual(res.status_code, 200)
        self.assertIn("cloud_configured", res.json())
