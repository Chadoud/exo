"""Unit tests for sync E2E crypto."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(_ROOT / "sync" / "client" / "crypto"))

from exosites_crypto import (  # noqa: E402
    SCHEMA_V2,
    SCHEMA_V3,
    aad_bytes,
    build_envelope,
    content_hash,
    decrypt_record,
    derive_master_key,
    encrypt_record,
    new_record_key,
    unwrap_record_key,
    wrap_record_key,
)

_ACCOUNT = "550e8400-e29b-41d4-a716-446655440000"


def test_derive_master_key_deterministic() -> None:
    salt = b"exosites-test-salt-16b"
    a = derive_master_key("hunter2", salt)
    b = derive_master_key("hunter2", salt)
    assert a == b
    assert len(a) == 32


def test_encrypt_decrypt_roundtrip() -> None:
    key = new_record_key()
    plain = b'{"category":"notes","key":"foo","value":"bar"}'
    ct = encrypt_record(plain, key)
    assert decrypt_record(ct, key) == plain


def test_wrong_key_fails() -> None:
    key = new_record_key()
    ct = encrypt_record(b"secret", key)
    with pytest.raises(Exception):
        decrypt_record(ct, new_record_key())


def test_wrap_unwrap_record_key() -> None:
    master = derive_master_key("pw", b"salt-for-wrap-test!")
    record_key = new_record_key()
    wrapped = wrap_record_key(record_key, master)
    assert unwrap_record_key(wrapped, master) == record_key


def test_build_envelope_shape() -> None:
    key = new_record_key()
    env = build_envelope(
        collection="memory_entries",
        record_id="abc-123",
        device_id="device-1",
        logical_clock=1,
        updated_at="2026-06-11T12:00:00+00:00",
        plaintext=json.dumps({"id": 1}).encode(),
        record_key=key,
        account_id=_ACCOUNT,
    )
    assert env["schema_version"] == SCHEMA_V3
    assert env["collection"] == "memory_entries"
    assert env["ciphertext"]
    assert len(env["content_hash"]) == 64
    aad = aad_bytes(
        collection="memory_entries",
        record_id="abc-123",
        device_id="device-1",
        logical_clock=1,
        deleted=False,
        schema_version=SCHEMA_V3,
        account_id=_ACCOUNT,
    )
    assert decrypt_record(env["ciphertext"], key, aad=aad) == json.dumps({"id": 1}).encode()


def test_v2_aad_rejects_tombstone_flip() -> None:
    key = new_record_key()
    env = build_envelope(
        collection="tasks",
        record_id="t1",
        device_id="d1",
        logical_clock=2,
        updated_at="2026-06-11T12:00:00+00:00",
        plaintext=b"{}",
        record_key=key,
        deleted=False,
        schema_version=SCHEMA_V2,
    )
    bad_aad = aad_bytes(
        collection="tasks",
        record_id="t1",
        device_id="d1",
        logical_clock=2,
        deleted=True,
        schema_version=SCHEMA_V2,
    )
    with pytest.raises(Exception):
        decrypt_record(env["ciphertext"], key, aad=bad_aad)


def test_v3_aad_binds_account_id() -> None:
    key = new_record_key()
    env = build_envelope(
        collection="tasks",
        record_id="t1",
        device_id="d1",
        logical_clock=2,
        updated_at="2026-06-11T12:00:00+00:00",
        plaintext=b"{}",
        record_key=key,
        account_id=_ACCOUNT,
    )
    bad = aad_bytes(
        collection="tasks",
        record_id="t1",
        device_id="d1",
        logical_clock=2,
        deleted=False,
        schema_version=SCHEMA_V3,
        account_id="660e8400-e29b-41d4-a716-446655440099",
    )
    with pytest.raises(Exception):
        decrypt_record(env["ciphertext"], key, aad=bad)
