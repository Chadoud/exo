"""Tests for GO SYNC client engine (encrypt + mock push)."""

from __future__ import annotations

import base64
import importlib
import os
import tempfile
import unittest
from unittest.mock import MagicMock, patch

import httpx

import assistant_memory
import sync_export


class TestSyncEngine(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.mkdtemp(prefix="sync-engine-")
        os.environ["EXOSITES_DATA_DIR"] = self.tmp
        importlib.reload(assistant_memory)
        importlib.reload(sync_export)
        import sync_engine

        self.sync_engine = importlib.reload(sync_engine)
        self.master_key = os.urandom(32)

    def test_export_encrypted_blobs(self) -> None:
        assistant_memory.update_memory("notes", "engine-test", "hello", conversation_id=None)
        blobs = self.sync_engine.export_encrypted_blobs(
            master_key=self.master_key,
            device_id="dev-test",
            account_id="550e8400-e29b-41d4-a716-446655440000",
        )
        self.assertTrue(blobs)
        self.assertIn("ciphertext", blobs[0])
        self.assertEqual(blobs[0]["collection"], "memory_entries")
        self.assertEqual(blobs[0]["schema_version"], 3)

    def test_decrypt_roundtrip(self) -> None:
        account = "550e8400-e29b-41d4-a716-446655440000"
        assistant_memory.update_memory("notes", "roundtrip", "value", conversation_id=None)
        blobs = self.sync_engine.export_encrypted_blobs(
            master_key=self.master_key,
            device_id="dev-test",
            account_id=account,
        )
        plain = self.sync_engine.decrypt_envelope(
            blobs[0], self.master_key, account_id=account
        )
        self.assertEqual(plain["collection"], "memory_entries")
        self.assertIn("payload", plain)

    @patch("sync_engine.httpx.Client")
    def test_run_sync_cycle_ok(self, client_cls: MagicMock) -> None:
        push_resp = MagicMock()
        push_resp.raise_for_status = MagicMock()
        push_resp.json.return_value = {"accepted": 1, "cursor": 1}
        pull_resp = MagicMock()
        pull_resp.raise_for_status = MagicMock()
        pull_resp.json.return_value = {"blobs": [], "cursor": 7, "has_more": False}
        mock_client = MagicMock()
        mock_client.__enter__ = MagicMock(return_value=mock_client)
        mock_client.__exit__ = MagicMock(return_value=False)
        mock_client.post.return_value = push_resp
        mock_client.get.return_value = pull_resp
        client_cls.return_value = mock_client

        assistant_memory.update_memory("notes", "push-test", "x", conversation_id=None)
        result = self.sync_engine.run_sync_cycle(
            cloud_url="https://relay.example.com",
            access_token="tok",
            master_key_b64=base64.b64encode(self.master_key).decode("ascii"),
            device_id="dev-1",
            account_id="550e8400-e29b-41d4-a716-446655440000",
            pull_cursor=3,
        )
        self.assertTrue(result["ok"])
        self.assertGreaterEqual(result.get("blob_count", 0), 1)
        self.assertEqual(result["next_pull_cursor"], 7)
        self.assertEqual(result["pull"]["applied"], 0)

    @patch("sync_engine.httpx.Client")
    def test_run_sync_cycle_pull_failure_degrades_to_push(
        self, client_cls: MagicMock
    ) -> None:
        push_resp = MagicMock()
        push_resp.raise_for_status = MagicMock()
        push_resp.json.return_value = {"accepted": 0, "cursor": 0}
        mock_client = MagicMock()
        mock_client.__enter__ = MagicMock(return_value=mock_client)
        mock_client.__exit__ = MagicMock(return_value=False)
        mock_client.post.return_value = push_resp
        mock_client.get.side_effect = RuntimeError("pull boom")
        client_cls.return_value = mock_client

        result = self.sync_engine.run_sync_cycle(
            cloud_url="https://relay.example.com",
            access_token="tok",
            master_key_b64=base64.b64encode(self.master_key).decode("ascii"),
            device_id="dev-1",
            account_id="550e8400-e29b-41d4-a716-446655440000",
            pull_cursor=9,
        )
        self.assertTrue(result["ok"], "push must proceed when pull fails")
        self.assertIn("error", result["pull"])
        self.assertEqual(result["next_pull_cursor"], 9)

    def test_pull_failure_info_maps_401_to_session_expired(self) -> None:
        req = httpx.Request("GET", "https://relay.example.com/v1/sync/blobs/pull")
        resp = httpx.Response(401, request=req)
        exc = httpx.HTTPStatusError("401", request=req, response=resp)
        self.assertEqual(self.sync_engine.pull_failure_info(exc)["error"], "session_expired")
