"""Offline license sign/verify round trip + machine-fingerprint arch parity.

Regression coverage for three bugs found when first wiring up an admin license
signing flow: (1) `LICENSE_PREFIX` had a trailing "." in the Electron constant
but not the backend one, producing a malformed key that always failed the
format check; (2) `PRODUCT_SLUG` differed between Electron and backend, so a
correctly-formatted key still failed the product check; (3) `platform.machine()`
returns "x86_64" on Intel, which `_norm_arch()` didn't map to Node's "x64",
so the backend and Electron computed different fingerprints for the same
machine.

The signed payload carries no `machine_id` — device binding moved to
first-activation, enforced server-side by cloud-node (see
cloud-node/lib/licenseActivations.js and tools/license-keygen/README.md).
`machine_fingerprint()` itself is kept and tested here since it's still used
by the desktop app's online activation call (electron/entitlement/machineId.js
is the Node counterpart) and for manual support-ticket troubleshooting.
"""

from __future__ import annotations

import json

import pytest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from entitlement_constants import LICENSE_PREFIX, PRODUCT_SLUG
from license_verify import _canonical_payload, verify_license_key
from machine_fingerprint import _norm_arch, machine_fingerprint


def _sign_test_license(private_key: Ed25519PrivateKey, **overrides) -> str:
    import base64

    payload = {
        "iat": 1700000000,
        "license_id": "test-license-id",
        "max_seats": 1,
        "product": PRODUCT_SLUG,
        "tier": "full",
        **overrides,
    }
    canonical = _canonical_payload(payload)
    sig = private_key.sign(canonical.encode("utf-8"))

    def b64url(raw: bytes) -> str:
        return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")

    return f"{LICENSE_PREFIX}.{b64url(canonical.encode('utf-8'))}.{b64url(sig)}"


@pytest.fixture()
def signing_key(monkeypatch: pytest.MonkeyPatch):
    private_key = Ed25519PrivateKey.generate()
    public_hex = private_key.public_key().public_bytes_raw().hex()
    monkeypatch.setattr("license_verify.EMBEDDED_LICENSE_PUBLIC_KEY_HEX", public_hex)
    return private_key


def test_valid_license_round_trips(signing_key: Ed25519PrivateKey) -> None:
    key = _sign_test_license(signing_key)

    # A trailing "." in LICENSE_PREFIX would produce a stray 4th "."-separated
    # segment here and fail this assertion before it ever reaches verify_license_key.
    assert len(key.split(".")) == 3, key

    ok, reason, payload = verify_license_key(key)
    assert ok is True, reason
    assert payload["product"] == PRODUCT_SLUG
    assert "machine_id" not in payload


def test_missing_license_id_is_rejected(signing_key: Ed25519PrivateKey) -> None:
    key = _sign_test_license(signing_key, license_id="")
    ok, reason, _ = verify_license_key(key)
    assert (ok, reason) == (False, "license_id")


def test_non_positive_max_seats_is_rejected(signing_key: Ed25519PrivateKey) -> None:
    key = _sign_test_license(signing_key, max_seats=0)
    ok, reason, _ = verify_license_key(key)
    assert (ok, reason) == (False, "max_seats")


def test_wrong_product_is_rejected(signing_key: Ed25519PrivateKey) -> None:
    key = _sign_test_license(signing_key, product="not-exo")
    ok, reason, _ = verify_license_key(key)
    assert (ok, reason) == (False, "product")


def test_tampered_signature_is_rejected(signing_key: Ed25519PrivateKey) -> None:
    key = _sign_test_license(signing_key)
    prefix, payload_b64, sig_b64 = key.split(".")
    tampered_sig = ("A" if sig_b64[0] != "A" else "B") + sig_b64[1:]
    ok, reason, _ = verify_license_key(f"{prefix}.{payload_b64}.{tampered_sig}")
    assert (ok, reason) == (False, "sig_verify")


def test_license_prefix_has_no_trailing_dot() -> None:
    """`f"{LICENSE_PREFIX}.{payload}.{sig}"` already inserts the dot."""
    assert not LICENSE_PREFIX.endswith(".")


@pytest.mark.parametrize(
    ("machine_str", "expected"),
    [
        ("x86_64", "x64"),
        ("amd64", "x64"),
        ("AMD64", "x64"),
        ("aarch64", "arm64"),
        ("arm64", "arm64"),
        ("i686", "ia32"),
    ],
)
def test_norm_arch_matches_node_os_arch_spelling(
    machine_str: str, expected: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr("platform.machine", lambda: machine_str)
    assert _norm_arch() == expected


def test_machine_fingerprint_matches_known_node_output(monkeypatch: pytest.MonkeyPatch) -> None:
    """Pinned against a real `getMachineFingerprint()` run (see machineId.js)."""
    monkeypatch.setattr("platform.machine", lambda: "x86_64")
    monkeypatch.setattr("platform.system", lambda: "Darwin")
    monkeypatch.setattr("socket.gethostname", lambda: "macbook-pro-de-chady.home")
    assert machine_fingerprint() == "458a0d514f3c1171ef32cb6d0cd606824ec0bc7b80dab418187180c07341b072"


def test_canonical_payload_matches_electron_json_key_order() -> None:
    """Electron's `JSON.stringify` after `Object.keys(obj).sort()` == Python's sort_keys."""
    payload = {"b": 2, "a": 1, "c": 3}
    assert _canonical_payload(payload) == json.dumps({"a": 1, "b": 2, "c": 3}, separators=(",", ":"))
