"""Persist and evaluate the free trial window (replaces byte-meter gating)."""

from __future__ import annotations

import json
import logging
import math
import os
import threading
import time
from datetime import datetime, timedelta, timezone
from typing import Any

from entitlement_constants import FREE_TRIAL_DAYS
from entitlement_paths import first_existing_entitlement_file

logger = logging.getLogger(__name__)

_lock = threading.Lock()
_FILENAME = "trial.json"


def _user_data_dir() -> str | None:
    return os.environ.get("EXOSITES_USER_DATA")


def trial_path() -> str | None:
    """Write target: USER_DATA/trial.json. Readers use first existing (profile fallback)."""
    base = _user_data_dir()
    if not base:
        return None
    return os.path.join(base, _FILENAME)


def trial_read_path() -> str | None:
    return first_existing_entitlement_file(_FILENAME) or trial_path()


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _parse_iso(value: str | None) -> datetime | None:
    if not value or not isinstance(value, str):
        return None
    text = value.strip()
    if not text:
        return None
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(text)
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _format_iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def read_trial_record() -> dict[str, Any] | None:
    """Return parsed trial.json or None when missing/unreadable."""
    p = trial_read_path()
    if not p or not os.path.isfile(p):
        return None
    try:
        with open(p, encoding="utf-8") as f:
            data: dict[str, Any] = json.load(f)
        if not isinstance(data, dict):
            return None
        return data
    except Exception as exc:  # noqa: BLE001 — corrupt file → treat as missing
        logger.warning("Could not read trial file %s: %s", p, exc)
        return None


def _write_trial_record(record: dict[str, Any]) -> None:
    p = trial_path()
    if not p:
        return
    payload = {"v": 1, **record, "updated_at": time.time()}
    os.makedirs(os.path.dirname(p), exist_ok=True)
    tmp = p + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)
    os.replace(tmp, p)


def _cloud_auth_configured() -> bool:
    """True when packaged/desktop builds expect Exosites cloud sign-in for trial."""
    return bool((os.environ.get("EXOSITES_CLOUD_URL") or "").strip())


def _trial_record_source() -> str | None:
    record = read_trial_record()
    if not record:
        return None
    source = record.get("source")
    return source if isinstance(source, str) else None


def _resolve_trial_record() -> dict[str, Any] | None:
    """
    Return the trial record used for entitlement, without auto-starting a local trial
    when cloud auth is configured (trial must come from sign-in sync).
    """
    record = read_trial_record()
    if not record:
        return None if _cloud_auth_configured() else ensure_local_trial_started()

    ends = _parse_iso(str(record.get("trialEndsAt") or ""))
    if not ends:
        return None if _cloud_auth_configured() else ensure_local_trial_started()

    if _cloud_auth_configured() and _trial_record_source() == "local_first_launch":
        return None

    return record


def ensure_local_trial_started() -> dict[str, Any]:
    """
    Idempotently start a local trial on first use.
    Returns the active trial record (existing or newly created).
    """
    with _lock:
        existing = read_trial_record()
        if existing and _parse_iso(str(existing.get("trialEndsAt") or "")):
            return existing
        started = _utc_now()
        ends = started + timedelta(days=FREE_TRIAL_DAYS)
        record = {
            "trialStartedAt": _format_iso(started),
            "trialEndsAt": _format_iso(ends),
            "source": "local_first_launch",
        }
        _write_trial_record(record)
        return record


def sync_cloud_trial_ends_at(trial_ends_at: str | None) -> dict[str, Any] | None:
    """
    Merge cloud account trial end into local trial.json.
    Cloud anchor wins when it extends access beyond the local window.
    """
    cloud_end = _parse_iso(trial_ends_at)
    if cloud_end is None:
        return read_trial_record()

    with _lock:
        existing = read_trial_record()
        local_end = _parse_iso(str(existing.get("trialEndsAt") or "")) if existing else None
        chosen_end = cloud_end if local_end is None or cloud_end > local_end else local_end
        started = _parse_iso(str(existing.get("trialStartedAt") or "")) if existing else None
        if started is None:
            started = chosen_end - timedelta(days=FREE_TRIAL_DAYS)
        record = {
            "trialStartedAt": _format_iso(started),
            "trialEndsAt": _format_iso(chosen_end),
            "source": "cloud_account",
        }
        _write_trial_record(record)
        return record


def get_trial_ends_at() -> datetime | None:
    record = read_trial_record()
    if not record:
        return None
    return _parse_iso(str(record.get("trialEndsAt") or ""))


def is_trial_active() -> bool:
    """True when a trial end timestamp exists and is still in the future."""
    if not _user_data_dir():
        return True
    record = _resolve_trial_record()
    ends = _parse_iso(str(record.get("trialEndsAt") or "")) if record else None
    if ends is None:
        return False
    return _utc_now() < ends


def trial_days_remaining() -> int:
    if not _user_data_dir():
        return FREE_TRIAL_DAYS
    record = _resolve_trial_record()
    ends = _parse_iso(str(record.get("trialEndsAt") or "")) if record else None
    if ends is None:
        return 0
    delta = ends - _utc_now()
    return max(0, math.ceil(delta.total_seconds() / 86400.0))


def get_trial_status() -> dict[str, Any]:
    """Trial fields for entitlement API (camelCase keys)."""
    if not _user_data_dir():
        return {
            "trialActive": True,
            "trialStartedAt": None,
            "trialEndsAt": None,
            "trialDaysRemaining": FREE_TRIAL_DAYS,
            "trialExpired": False,
        }

    record = _resolve_trial_record()
    if not record:
        return {
            "trialActive": False,
            "trialStartedAt": None,
            "trialEndsAt": None,
            "trialDaysRemaining": 0,
            "trialExpired": True,
        }

    started = _parse_iso(str(record.get("trialStartedAt") or ""))
    ends = _parse_iso(str(record.get("trialEndsAt") or ""))
    active = bool(ends and _utc_now() < ends)
    remaining = trial_days_remaining() if ends else 0
    return {
        "trialActive": active,
        "trialStartedAt": _format_iso(started) if started else None,
        "trialEndsAt": _format_iso(ends) if ends else None,
        "trialDaysRemaining": remaining,
        "trialExpired": bool(ends and not active),
    }
