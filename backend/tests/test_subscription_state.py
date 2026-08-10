"""Subscription cache evaluation + entitlement gate integration (subscription.json)."""

import json
import pathlib
import sys
import tempfile
import time
import unittest
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))


def _write_subscription(
    user_dir: pathlib.Path,
    *,
    status: str = "active",
    active: bool = True,
    synced_seconds_ago: float = 60.0,
) -> None:
    payload = {
        "v": 1,
        "subscriptionActive": active,
        "subscriptionStatus": status,
        "subscriptionCurrentPeriodEnd": "2027-01-01T00:00:00.000Z",
        "subscriptionCancelAtPeriodEnd": False,
        "plan": "pro",
        "lastSyncedAt": time.time() - synced_seconds_ago,
    }
    (user_dir / "subscription.json").write_text(json.dumps(payload), encoding="utf-8")


def _write_expired_trial(user_dir: pathlib.Path) -> None:
    started = datetime.now(timezone.utc) - timedelta(days=40)
    ends = datetime.now(timezone.utc) - timedelta(days=10)
    payload = {
        "v": 1,
        "trialStartedAt": started.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z",
        "trialEndsAt": ends.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z",
        "source": "cloud_account",
    }
    (user_dir / "trial.json").write_text(json.dumps(payload), encoding="utf-8")


@contextmanager
def _user_data_env():
    import os

    prev = os.environ.get("EXOSITES_USER_DATA")
    prev_bypass = os.environ.get("EXOSITES_DEV_BYPASS_ENTITLEMENT")
    prev_node_env = os.environ.get("NODE_ENV")
    try:
        with tempfile.TemporaryDirectory() as tmp:
            os.environ["EXOSITES_USER_DATA"] = tmp
            os.environ.pop("EXOSITES_DEV_BYPASS_ENTITLEMENT", None)
            os.environ.pop("NODE_ENV", None)
            yield pathlib.Path(tmp)
    finally:
        for name, value in (
            ("EXOSITES_USER_DATA", prev),
            ("EXOSITES_DEV_BYPASS_ENTITLEMENT", prev_bypass),
            ("NODE_ENV", prev_node_env),
        ):
            if value is None:
                os.environ.pop(name, None)
            else:
                os.environ[name] = value


class TestSubscriptionState(unittest.TestCase):
    def test_missing_file_is_not_entitled(self):
        from subscription_state import get_subscription_status, is_subscription_entitled

        with _user_data_env():
            self.assertFalse(is_subscription_entitled())
            status = get_subscription_status()
            self.assertFalse(status["subscriptionActive"])
            self.assertIsNone(status["subscriptionStatus"])

    def test_active_subscription_is_entitled(self):
        from subscription_state import get_subscription_status, is_subscription_entitled

        with _user_data_env() as tmp:
            _write_subscription(tmp, status="active")
            self.assertTrue(is_subscription_entitled())
            status = get_subscription_status()
            self.assertTrue(status["subscriptionEntitled"])
            self.assertEqual(status["subscriptionPlan"], "pro")

    def test_past_due_keeps_access(self):
        from subscription_state import is_subscription_entitled

        with _user_data_env() as tmp:
            _write_subscription(tmp, status="past_due")
            self.assertTrue(is_subscription_entitled())

    def test_canceled_subscription_is_not_entitled(self):
        from subscription_state import is_subscription_entitled

        with _user_data_env() as tmp:
            _write_subscription(tmp, status="canceled", active=False)
            self.assertFalse(is_subscription_entitled())

    def test_stale_cache_beyond_offline_trust_window_loses_access(self):
        from subscription_state import OFFLINE_TRUST_DAYS, is_subscription_entitled

        with _user_data_env() as tmp:
            _write_subscription(
                tmp, status="active", synced_seconds_ago=(OFFLINE_TRUST_DAYS + 1) * 86400
            )
            self.assertFalse(is_subscription_entitled())

    def test_corrupt_file_is_not_entitled(self):
        from subscription_state import is_subscription_entitled

        with _user_data_env() as tmp:
            (tmp / "subscription.json").write_text("{not json", encoding="utf-8")
            self.assertFalse(is_subscription_entitled())


class TestEntitlementGateWithSubscription(unittest.TestCase):
    def test_subscription_allows_analyze_after_trial_expired(self):
        from entitlement_gate import get_entitlement_status, may_start_analyze

        with _user_data_env() as tmp:
            _write_expired_trial(tmp)
            _write_subscription(tmp, status="active")
            ok, detail = may_start_analyze()
            self.assertTrue(ok)
            self.assertIsNone(detail)
            status = get_entitlement_status()
            self.assertTrue(status["canAnalyze"])
            self.assertTrue(status["subscriptionEntitled"])
            self.assertFalse(status["trialActive"])

    def test_canceled_subscription_and_expired_trial_blocks(self):
        from entitlement_gate import may_start_analyze

        with _user_data_env() as tmp:
            _write_expired_trial(tmp)
            _write_subscription(tmp, status="canceled", active=False)
            ok, detail = may_start_analyze()
            self.assertFalse(ok)
            self.assertEqual(detail, "trial_expired")


if __name__ == "__main__":
    unittest.main()
