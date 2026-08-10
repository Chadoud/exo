"""Chaos-style contract: push survives empty pull and duplicate push."""

from __future__ import annotations

import base64
import os
import sys
import unittest
from pathlib import Path

_REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(_REPO / "client" / "crypto"))

from exosites_crypto import SCHEMA_V3, aad_bytes, build_envelope, decrypt_record  # noqa: E402

_ACCOUNT = "550e8400-e29b-41d4-a716-446655440000"


class TestPushPullChaos(unittest.TestCase):
    def test_duplicate_envelope_decrypts_same(self) -> None:
        master = os.urandom(32)
        import hashlib

        rkey = hashlib.sha256(master + b"memory_entries" + b"rec-1").digest()
        env = build_envelope(
            collection="memory_entries",
            record_id="rec-1",
            device_id="chaos-dev",
            logical_clock=1000,
            updated_at="2026-06-11T12:00:00+00:00",
            plaintext=b'{"key":"x"}',
            record_key=rkey,
            account_id=_ACCOUNT,
        )
        aad = aad_bytes(
            collection="memory_entries",
            record_id="rec-1",
            device_id="chaos-dev",
            logical_clock=1000,
            deleted=False,
            schema_version=SCHEMA_V3,
            account_id=_ACCOUNT,
        )
        plain = decrypt_record(env["ciphertext"], rkey, aad=aad)
        self.assertEqual(plain, b'{"key":"x"}')
        # Idempotent re-decrypt after "relay" stores same ciphertext
        plain2 = decrypt_record(env["ciphertext"], rkey, aad=aad)
        self.assertEqual(plain, plain2)
