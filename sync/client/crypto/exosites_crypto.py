"""
E2E sync crypto — random master key + ChaCha20-Poly1305 record encryption.

Canonical contract (GA): see docs/adr/001-sync-crypto.md.
Keys never leave the client; relay stores ciphertext only.
"""

from __future__ import annotations

import base64
import hashlib
import os
from typing import Any

from cryptography.hazmat.primitives.ciphers.aead import ChaCha20Poly1305
from cryptography.hazmat.primitives.kdf.scrypt import Scrypt

_NONCE_LEN = 12
_KEY_LEN = 32
SCHEMA_V1 = 1
SCHEMA_V2 = 2  # AEAD binds envelope metadata (no account_id)
SCHEMA_V3 = 3  # AEAD also binds account_id


def derive_master_key(password: str, salt: bytes, *, n: int = 2**15, r: int = 8, p: int = 1) -> bytes:
    """Legacy password KDF (unused by desktop random-key path; kept for tests)."""
    if not password:
        raise ValueError("password is required")
    if len(salt) < 16:
        raise ValueError("salt must be at least 16 bytes")
    kdf = Scrypt(salt=salt, length=_KEY_LEN, n=n, r=r, p=p)
    return kdf.derive(password.encode("utf-8"))


def aad_bytes(
    *,
    collection: str,
    record_id: str,
    device_id: str,
    logical_clock: int,
    deleted: bool,
    schema_version: int,
    account_id: str | None = None,
) -> bytes:
    """Canonical associated data for schema v2+ envelopes."""
    deleted_flag = "1" if deleted else "0"
    ver = int(schema_version)
    if ver >= SCHEMA_V3:
        if not account_id:
            raise ValueError("account_id required for schema v3 AAD")
        return (
            f"exo-sync-aad-v1|{account_id}|{collection}|{record_id}|{device_id}|"
            f"{int(logical_clock)}|{deleted_flag}|{ver}"
        ).encode("utf-8")
    return (
        f"exo-sync-aad-v1|{collection}|{record_id}|{device_id}|"
        f"{int(logical_clock)}|{deleted_flag}|{ver}"
    ).encode("utf-8")


def encrypt_record(
    plaintext: bytes,
    record_key: bytes,
    *,
    aad: bytes | None = None,
    nonce: bytes | None = None,
) -> str:
    """Encrypt plaintext; returns base64(nonce || ciphertext+tag)."""
    if len(record_key) != _KEY_LEN:
        raise ValueError("record_key must be 32 bytes")
    if nonce is None:
        nonce = os.urandom(_NONCE_LEN)
    elif len(nonce) != _NONCE_LEN:
        raise ValueError("nonce must be 12 bytes")
    aead = ChaCha20Poly1305(record_key)
    ct = aead.encrypt(nonce, plaintext, aad)
    return base64.b64encode(nonce + ct).decode("ascii")


def decrypt_record(ciphertext_b64: str, record_key: bytes, *, aad: bytes | None = None) -> bytes:
    """Decrypt base64 envelope from encrypt_record."""
    if len(record_key) != _KEY_LEN:
        raise ValueError("record_key must be 32 bytes")
    raw = base64.b64decode(ciphertext_b64)
    if len(raw) < _NONCE_LEN + 16:
        raise ValueError("ciphertext too short")
    nonce, ct = raw[:_NONCE_LEN], raw[_NONCE_LEN:]
    aead = ChaCha20Poly1305(record_key)
    return aead.decrypt(nonce, ct, aad)


def wrap_record_key(record_key: bytes, master_key: bytes) -> str:
    """Wrap a record key with the master key."""
    return encrypt_record(record_key, master_key)


def unwrap_record_key(wrapped_b64: str, master_key: bytes) -> bytes:
    """Unwrap a record key."""
    key = decrypt_record(wrapped_b64, master_key)
    if len(key) != _KEY_LEN:
        raise ValueError("unwrapped key has wrong length")
    return key


def content_hash(plaintext: bytes) -> str:
    """SHA-256 hex digest for debug/compare (not a security boundary)."""
    return hashlib.sha256(plaintext).hexdigest()


def new_record_key() -> bytes:
    """Generate a random 32-byte record encryption key."""
    return os.urandom(_KEY_LEN)


def build_envelope(
    *,
    collection: str,
    record_id: str,
    device_id: str,
    logical_clock: int,
    updated_at: str,
    plaintext: bytes,
    record_key: bytes,
    deleted: bool = False,
    schema_version: int = SCHEMA_V3,
    account_id: str | None = None,
    nonce: bytes | None = None,
) -> dict[str, Any]:
    """Build a sync blob envelope with encrypted payload (v2+/v3 AAD)."""
    aad = None
    ver = int(schema_version)
    if ver >= SCHEMA_V2:
        aad = aad_bytes(
            collection=collection,
            record_id=record_id,
            device_id=device_id,
            logical_clock=logical_clock,
            deleted=deleted,
            schema_version=ver,
            account_id=account_id,
        )
    return {
        "schema_version": ver,
        "collection": collection,
        "record_id": record_id,
        "device_id": device_id,
        "logical_clock": logical_clock,
        "updated_at": updated_at,
        "deleted": deleted,
        "ciphertext": encrypt_record(plaintext, record_key, aad=aad, nonce=nonce),
        "content_hash": content_hash(plaintext),
    }
