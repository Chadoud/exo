"""Shared Py↔Dart golden vectors — ciphertext must match sync/testdata/golden_envelopes.json."""

from __future__ import annotations

import base64
import hashlib
import json
import sys
from pathlib import Path

_SYNC = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_SYNC / "client" / "crypto"))

from exosites_crypto import aad_bytes, decrypt_record, encrypt_record  # noqa: E402

_VECTORS = _SYNC / "testdata" / "golden_envelopes.json"


def test_golden_envelopes_match_python() -> None:
    data = json.loads(_VECTORS.read_text(encoding="utf-8"))
    for vec in data["vectors"]:
        master = base64.b64decode(vec["master_key_b64"])
        rkey = hashlib.sha256(
            master + vec["collection"].encode() + vec["record_id"].encode()
        ).digest()
        assert base64.b64encode(rkey).decode() == vec["record_key_b64"]
        aad = aad_bytes(
            collection=vec["collection"],
            record_id=vec["record_id"],
            device_id=vec["device_id"],
            logical_clock=vec["logical_clock"],
            deleted=bool(vec["deleted"]),
            schema_version=int(vec["schema_version"]),
            account_id=vec.get("account_id"),
        )
        assert aad.decode("utf-8") == vec["aad_utf8"]
        plain = decrypt_record(vec["ciphertext_b64"], rkey, aad=aad)
        assert plain.decode("utf-8") == vec["plaintext_utf8"]
        # Re-encrypt with fixed nonce must reproduce ciphertext.
        nonce = base64.b64decode(vec["nonce_b64"])
        ct = encrypt_record(plain, rkey, aad=aad, nonce=nonce)
        assert ct == vec["ciphertext_b64"]
