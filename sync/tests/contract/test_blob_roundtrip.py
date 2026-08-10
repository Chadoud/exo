"""Contract test: blob envelope roundtrip through crypto layer."""

from __future__ import annotations

import json
import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(_ROOT / "client" / "crypto"))

from exosites_crypto import (  # noqa: E402
    SCHEMA_V3,
    aad_bytes,
    build_envelope,
    decrypt_record,
    new_record_key,
)

_ACCOUNT = "550e8400-e29b-41d4-a716-446655440000"


def test_golden_envelope_roundtrip() -> None:
    key = new_record_key()
    plain = json.dumps({"category": "notes", "key": "test", "value": "hello"}).encode()
    env = build_envelope(
        collection="memory_entries",
        record_id="1",
        device_id="desktop-test",
        logical_clock=1,
        updated_at="2026-06-11T12:00:00+00:00",
        plaintext=plain,
        record_key=key,
        account_id=_ACCOUNT,
    )
    assert env["schema_version"] == SCHEMA_V3
    aad = aad_bytes(
        collection="memory_entries",
        record_id="1",
        device_id="desktop-test",
        logical_clock=1,
        deleted=False,
        schema_version=SCHEMA_V3,
        account_id=_ACCOUNT,
    )
    restored = decrypt_record(env["ciphertext"], key, aad=aad)
    assert restored == plain
