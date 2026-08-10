"""Read the Stripe subscription cache Electron syncs to subscription.json.

Electron is the only writer (see electron/entitlement/subscriptionState.js);
this module only evaluates the cached state. The cache is trusted offline for
a bounded window so a paying user is never locked out by a flaky connection —
and a canceled one cannot stay entitled forever by going offline.
"""

from __future__ import annotations

import json
import logging
import os
import time
from typing import Any

logger = logging.getLogger(__name__)

_FILENAME = "subscription.json"

OFFLINE_TRUST_DAYS = 7
_ENTITLED_STATUSES = {"active", "trialing", "past_due"}


def _user_data_dir() -> str | None:
    return os.environ.get("EXOSITES_USER_DATA")


def subscription_path() -> str | None:
    base = _user_data_dir()
    if not base:
        return None
    return os.path.join(base, _FILENAME)


def read_subscription_record() -> dict[str, Any] | None:
    """Return parsed subscription.json or None when missing/unreadable."""
    p = subscription_path()
    if not p or not os.path.isfile(p):
        return None
    try:
        with open(p, encoding="utf-8") as f:
            data: dict[str, Any] = json.load(f)
        if not isinstance(data, dict):
            return None
        return data
    except Exception as exc:  # noqa: BLE001 — corrupt file → treat as missing
        logger.warning("Could not read subscription file %s: %s", p, exc)
        return None


def is_subscription_entitled(now: float | None = None) -> bool:
    """True when the cached subscription grants access and the cache is fresh enough."""
    record = read_subscription_record()
    if not record:
        return False
    status = record.get("subscriptionStatus")
    if not record.get("subscriptionActive") or status not in _ENTITLED_STATUSES:
        return False
    last_synced = record.get("lastSyncedAt")
    if not isinstance(last_synced, (int, float)) or last_synced <= 0:
        return False
    current = time.time() if now is None else now
    return current - float(last_synced) <= OFFLINE_TRUST_DAYS * 86400


def get_subscription_status() -> dict[str, Any]:
    """Subscription fields for entitlement API (camelCase keys, safe defaults)."""
    record = read_subscription_record() or {}
    status = record.get("subscriptionStatus")
    plan = record.get("plan")
    return {
        "subscriptionActive": bool(record.get("subscriptionActive")),
        "subscriptionStatus": status if isinstance(status, str) else None,
        "subscriptionCurrentPeriodEnd": record.get("subscriptionCurrentPeriodEnd") or None,
        "subscriptionCancelAtPeriodEnd": bool(record.get("subscriptionCancelAtPeriodEnd")),
        "subscriptionPlan": plan if isinstance(plan, str) else None,
        "subscriptionEntitled": is_subscription_entitled(),
    }
