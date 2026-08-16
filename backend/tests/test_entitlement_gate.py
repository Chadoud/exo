"""Entitlement gate + free trial integration (EXOSITES_USER_DATA)."""

import json
import pathlib
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from entitlement_constants import FREE_TRIAL_DAYS, LICENSE_PREFIX, PRODUCT_SLUG  # noqa: E402


def _write_trial(user_dir: pathlib.Path, *, active: bool) -> None:
    started = datetime.now(timezone.utc)
    ends = started + timedelta(days=FREE_TRIAL_DAYS if active else -1)
    payload = {
        "v": 1,
        "trialStartedAt": started.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z",
        "trialEndsAt": ends.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z",
        "source": "test",
    }
    (user_dir / "trial.json").write_text(json.dumps(payload), encoding="utf-8")


def _write_valid_license(user_dir: pathlib.Path) -> None:
    """Sign a throwaway key and point license_verify at that public key."""
    import base64

    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
    from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat

    import license_verify

    sk = Ed25519PrivateKey.generate()
    pk = sk.public_key().public_bytes(Encoding.Raw, PublicFormat.Raw)
    license_verify.EMBEDDED_LICENSE_PUBLIC_KEY_HEX = pk.hex()
    payload = {
        "iat": 1,
        "license_id": "11111111-1111-4111-8111-111111111111",
        "max_seats": 1,
        "product": PRODUCT_SLUG,
        "tier": "full",
    }
    message = license_verify._canonical_payload(payload).encode("utf-8")
    sig = sk.sign(message)

    def _b64url(raw: bytes) -> str:
        return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")

    key = f"{LICENSE_PREFIX}.{_b64url(message)}.{_b64url(sig)}"
    (user_dir / "entitlement.json").write_text(
        json.dumps({"v": 1, "licenseKey": key}),
        encoding="utf-8",
    )


class TestEntitlementGate(unittest.TestCase):
    def test_may_start_analyze_without_user_data_env(self):
        import os

        from entitlement_gate import may_start_analyze

        old = os.environ.pop("EXOSITES_USER_DATA", None)
        try:
            ok, detail = may_start_analyze()
            self.assertTrue(ok)
            self.assertIsNone(detail)
        finally:
            if old is not None:
                os.environ["EXOSITES_USER_DATA"] = old

    def test_trial_expired_blocks_new_analyze(self):
        import os

        from fastapi import HTTPException

        from entitlement_gate import assert_may_start_analyze, may_start_analyze

        prev = os.environ.get("EXOSITES_USER_DATA")
        try:
            with tempfile.TemporaryDirectory() as tmp:
                os.environ["EXOSITES_USER_DATA"] = tmp
                _write_trial(pathlib.Path(tmp), active=False)
                ok, detail = may_start_analyze()
                self.assertFalse(ok)
                self.assertEqual(detail, "trial_expired")
                with self.assertRaises(HTTPException) as ctx:
                    assert_may_start_analyze()
                self.assertEqual(ctx.exception.status_code, 402)
        finally:
            if prev is None:
                os.environ.pop("EXOSITES_USER_DATA", None)
            else:
                os.environ["EXOSITES_USER_DATA"] = prev

    def test_active_trial_allows_analyze(self):
        import os

        from entitlement_gate import may_start_analyze

        prev = os.environ.get("EXOSITES_USER_DATA")
        prev_cloud = os.environ.get("EXOSITES_CLOUD_URL")
        try:
            with tempfile.TemporaryDirectory() as tmp:
                os.environ["EXOSITES_USER_DATA"] = tmp
                os.environ.pop("EXOSITES_CLOUD_URL", None)
                _write_trial(pathlib.Path(tmp), active=True)
                ok, detail = may_start_analyze()
                self.assertTrue(ok)
                self.assertIsNone(detail)
        finally:
            if prev is None:
                os.environ.pop("EXOSITES_USER_DATA", None)
            else:
                os.environ["EXOSITES_USER_DATA"] = prev
            if prev_cloud is None:
                os.environ.pop("EXOSITES_CLOUD_URL", None)
            else:
                os.environ["EXOSITES_CLOUD_URL"] = prev_cloud

    def test_cloud_configured_blocks_local_only_trial(self):
        import os

        from entitlement_gate import may_start_analyze

        prev_ud = os.environ.get("EXOSITES_USER_DATA")
        prev_cloud = os.environ.get("EXOSITES_CLOUD_URL")
        try:
            with tempfile.TemporaryDirectory() as tmp:
                os.environ["EXOSITES_USER_DATA"] = tmp
                os.environ["EXOSITES_CLOUD_URL"] = "https://api.exosites.ch"
                started = datetime.now(timezone.utc)
                ends = started + timedelta(days=FREE_TRIAL_DAYS)
                payload = {
                    "v": 1,
                    "trialStartedAt": started.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z",
                    "trialEndsAt": ends.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z",
                    "source": "local_first_launch",
                }
                (pathlib.Path(tmp) / "trial.json").write_text(json.dumps(payload), encoding="utf-8")
                ok, detail = may_start_analyze()
                self.assertFalse(ok)
                self.assertEqual(detail, "trial_expired")
        finally:
            if prev_ud is None:
                os.environ.pop("EXOSITES_USER_DATA", None)
            else:
                os.environ["EXOSITES_USER_DATA"] = prev_ud
            if prev_cloud is None:
                os.environ.pop("EXOSITES_CLOUD_URL", None)
            else:
                os.environ["EXOSITES_CLOUD_URL"] = prev_cloud

    def test_cloud_configured_allows_synced_trial(self):
        import os

        from entitlement_gate import may_start_analyze

        prev_ud = os.environ.get("EXOSITES_USER_DATA")
        prev_cloud = os.environ.get("EXOSITES_CLOUD_URL")
        try:
            with tempfile.TemporaryDirectory() as tmp:
                os.environ["EXOSITES_USER_DATA"] = tmp
                os.environ["EXOSITES_CLOUD_URL"] = "https://api.exosites.ch"
                started = datetime.now(timezone.utc)
                ends = started + timedelta(days=FREE_TRIAL_DAYS)
                payload = {
                    "v": 1,
                    "trialStartedAt": started.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z",
                    "trialEndsAt": ends.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z",
                    "source": "cloud_account",
                }
                (pathlib.Path(tmp) / "trial.json").write_text(json.dumps(payload), encoding="utf-8")
                ok, detail = may_start_analyze()
                self.assertTrue(ok)
                self.assertIsNone(detail)
        finally:
            if prev_ud is None:
                os.environ.pop("EXOSITES_USER_DATA", None)
            else:
                os.environ["EXOSITES_USER_DATA"] = prev_ud
            if prev_cloud is None:
                os.environ.pop("EXOSITES_CLOUD_URL", None)
            else:
                os.environ["EXOSITES_CLOUD_URL"] = prev_cloud

    def test_dev_bypass_allows_analyze_after_trial(self):
        import os

        from entitlement_gate import get_entitlement_status, may_start_analyze

        prev_ud = os.environ.get("EXOSITES_USER_DATA")
        prev_bypass = os.environ.get("EXOSITES_DEV_BYPASS_ENTITLEMENT")
        try:
            with tempfile.TemporaryDirectory() as tmp:
                os.environ["EXOSITES_USER_DATA"] = tmp
                os.environ["EXOSITES_DEV_BYPASS_ENTITLEMENT"] = "1"
                _write_trial(pathlib.Path(tmp), active=False)
                ok, detail = may_start_analyze()
                self.assertTrue(ok)
                self.assertIsNone(detail)
                status = get_entitlement_status()
                self.assertTrue(status["canAnalyze"])
        finally:
            if prev_ud is None:
                os.environ.pop("EXOSITES_USER_DATA", None)
            else:
                os.environ["EXOSITES_USER_DATA"] = prev_ud
            if prev_bypass is None:
                os.environ.pop("EXOSITES_DEV_BYPASS_ENTITLEMENT", None)
            else:
                os.environ["EXOSITES_DEV_BYPASS_ENTITLEMENT"] = prev_bypass

    def test_valid_license_allows_analyze_after_trial_expired(self):
        import os

        from entitlement_gate import get_entitlement_status, may_start_analyze

        prev = os.environ.get("EXOSITES_USER_DATA")
        prev_bypass = os.environ.get("EXOSITES_DEV_BYPASS_ENTITLEMENT")
        prev_node = os.environ.get("NODE_ENV")
        try:
            with tempfile.TemporaryDirectory() as tmp:
                os.environ["EXOSITES_USER_DATA"] = tmp
                os.environ.pop("EXOSITES_DEV_BYPASS_ENTITLEMENT", None)
                os.environ.pop("NODE_ENV", None)
                _write_trial(pathlib.Path(tmp), active=False)
                _write_valid_license(pathlib.Path(tmp))
                ok, detail = may_start_analyze()
                self.assertTrue(ok)
                self.assertIsNone(detail)
                status = get_entitlement_status()
                self.assertTrue(status["licensed"])
                self.assertTrue(status["canAnalyze"])
                self.assertTrue(status["canUseSync"])
        finally:
            if prev is None:
                os.environ.pop("EXOSITES_USER_DATA", None)
            else:
                os.environ["EXOSITES_USER_DATA"] = prev
            if prev_bypass is None:
                os.environ.pop("EXOSITES_DEV_BYPASS_ENTITLEMENT", None)
            else:
                os.environ["EXOSITES_DEV_BYPASS_ENTITLEMENT"] = prev_bypass
            if prev_node is None:
                os.environ.pop("NODE_ENV", None)
            else:
                os.environ["NODE_ENV"] = prev_node

    def test_license_in_active_profile_when_user_data_is_device_root(self):
        import os

        from entitlement_gate import may_start_analyze

        prev = os.environ.get("EXOSITES_USER_DATA")
        prev_bypass = os.environ.get("EXOSITES_DEV_BYPASS_ENTITLEMENT")
        prev_node = os.environ.get("NODE_ENV")
        try:
            with tempfile.TemporaryDirectory() as tmp:
                root = pathlib.Path(tmp)
                profile = root / "profiles" / "acctA"
                profile.mkdir(parents=True)
                (root / "active_profile.json").write_text(
                    json.dumps({"v": 1, "activeId": "acctA"}),
                    encoding="utf-8",
                )
                _write_trial(root, active=False)
                _write_valid_license(profile)
                os.environ["EXOSITES_USER_DATA"] = tmp
                os.environ.pop("EXOSITES_DEV_BYPASS_ENTITLEMENT", None)
                os.environ.pop("NODE_ENV", None)
                ok, detail = may_start_analyze()
                self.assertTrue(ok)
                self.assertIsNone(detail)
        finally:
            if prev is None:
                os.environ.pop("EXOSITES_USER_DATA", None)
            else:
                os.environ["EXOSITES_USER_DATA"] = prev
            if prev_bypass is None:
                os.environ.pop("EXOSITES_DEV_BYPASS_ENTITLEMENT", None)
            else:
                os.environ["EXOSITES_DEV_BYPASS_ENTITLEMENT"] = prev_bypass
            if prev_node is None:
                os.environ.pop("NODE_ENV", None)
            else:
                os.environ["NODE_ENV"] = prev_node

    def test_node_env_development_bypasses_trial(self):
        import os

        from entitlement_gate import may_start_analyze

        prev_ud = os.environ.get("EXOSITES_USER_DATA")
        prev_node_env = os.environ.get("NODE_ENV")
        prev_bypass = os.environ.get("EXOSITES_DEV_BYPASS_ENTITLEMENT")
        try:
            with tempfile.TemporaryDirectory() as tmp:
                os.environ["EXOSITES_USER_DATA"] = tmp
                os.environ["NODE_ENV"] = "development"
                os.environ.pop("EXOSITES_DEV_BYPASS_ENTITLEMENT", None)
                _write_trial(pathlib.Path(tmp), active=False)
                ok, detail = may_start_analyze()
                self.assertTrue(ok)
                self.assertIsNone(detail)
        finally:
            if prev_ud is None:
                os.environ.pop("EXOSITES_USER_DATA", None)
            else:
                os.environ["EXOSITES_USER_DATA"] = prev_ud
            if prev_node_env is None:
                os.environ.pop("NODE_ENV", None)
            else:
                os.environ["NODE_ENV"] = prev_node_env
            if prev_bypass is None:
                os.environ.pop("EXOSITES_DEV_BYPASS_ENTITLEMENT", None)
            else:
                os.environ["EXOSITES_DEV_BYPASS_ENTITLEMENT"] = prev_bypass


if __name__ == "__main__":
    unittest.main()
