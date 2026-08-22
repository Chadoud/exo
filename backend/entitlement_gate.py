"""Gate sort and Pro features: active free trial or valid offline license."""

from __future__ import annotations

import json
import logging
import os
from typing import Any

from entitlement_paths import active_profile_dir
from license_verify import verify_license_key
from subscription_state import get_subscription_status, is_subscription_entitled
from trial_state import get_trial_status, is_trial_active

logger = logging.getLogger(__name__)

_ENT_FILENAME = "entitlement.json"
_TRIAL_EXPIRED = "trial_expired"


def _user_data_dir() -> str | None:
    return os.environ.get("EXOSITES_USER_DATA")


def _dev_entitlement_bypass_enabled() -> bool:
    explicit = str(os.environ.get("EXOSITES_DEV_BYPASS_ENTITLEMENT", "")).strip().lower()
    if explicit in {"1", "true", "yes", "on"}:
        return True
    node_env = str(os.environ.get("NODE_ENV", "")).strip().lower()
    return node_env == "development"


def _unlimited_entitlement_enabled() -> bool:
    """Packaged unlimited build — no trial day cap (see electron/buildProfile.js)."""
    explicit = str(os.environ.get("EXOSITES_UNLIMITED_ENTITLEMENT", "")).strip().lower()
    return explicit in {"1", "true", "yes", "on"}


def _entitlement_unrestricted() -> bool:
    return _dev_entitlement_bypass_enabled() or _unlimited_entitlement_enabled()


def _read_license_key_from_dir(folder: str) -> str | None:
    p = os.path.join(folder, _ENT_FILENAME)
    if not os.path.isfile(p):
        return None
    try:
        with open(p, encoding="utf-8") as f:
            data: dict[str, Any] = json.load(f)
        k = data.get("licenseKey")
        if isinstance(k, str) and k.strip():
            return k.strip()
    except Exception as exc:  # noqa: BLE001 — corrupt entitlement file → treat as unlicensed
        logger.warning("Could not read entitlement file %s: %s", p, exc)
    return None


def _read_saved_license_key() -> str | None:
    base = _user_data_dir()
    if not base:
        return None
    key = _read_license_key_from_dir(base)
    if key:
        return key
    profile = active_profile_dir(base)
    if profile:
        return _read_license_key_from_dir(profile)
    return None


def _has_valid_license() -> tuple[bool, str | None]:
    key = _read_saved_license_key()
    if not key:
        return False, None
    ok, reason, _ = verify_license_key(key)
    if ok:
        return True, None
    return False, (reason or "invalid")


def _may_use_paid_features() -> tuple[bool, str | None]:
    if _entitlement_unrestricted():
        return True, None
    if not _user_data_dir():
        return True, None
    licensed, _ = _has_valid_license()
    if licensed:
        return True, None
    if is_subscription_entitled():
        return True, None
    if is_trial_active():
        return True, None
    return False, _TRIAL_EXPIRED


def _sort_service_status() -> dict[str, Any]:
    """SaaS sort surface for entitlement UI — no secrets."""
    try:
        from llm.ollama_client import health_check, is_remote_mode
    except ImportError:
        return {"sortServiceMode": "local", "sortServiceConfigured": False, "sortCredentialsManaged": False}
    remote = is_remote_mode()
    managed = _env_bool("EXOSITES_SORT_CREDENTIALS_MANAGED", False)
    probe = health_check()
    return {
        "sortServiceMode": "cloud" if remote else "local",
        "sortServiceConfigured": bool(probe.get("ok")),
        "sortCredentialsManaged": remote and (managed or bool(os.environ.get("OLLAMA_API_KEY"))),
    }


def _env_bool(name: str, default: bool = False) -> bool:
    raw = str(os.environ.get(name, "")).strip().lower()
    if raw in {"1", "true", "yes", "on"}:
        return True
    if raw in {"0", "false", "no", "off"}:
        return False
    return default


def get_entitlement_status() -> dict[str, Any]:
    """UI + API: same shape as Electron `getEntitlementState` (camelCase keys)."""
    if _unlimited_entitlement_enabled():
        return {
            "trialActive": False,
            "trialStartedAt": None,
            "trialEndsAt": None,
            "trialDaysRemaining": 0,
            "trialExpired": False,
            **get_subscription_status(),
            "licensed": False,
            "licenseReason": None,
            "unlimitedBuild": True,
            "canAnalyze": True,
            "canUseProactive": True,
            "canUseSync": True,
            "hasLicenseKey": False,
            "cloudAuthRequired": False,
            "cloudLoggedIn": False,
            "cloudEmail": None,
            **_sort_service_status(),
        }
    trial = get_trial_status()
    subscription = get_subscription_status()
    licensed, license_reason = _has_valid_license()
    bypass = _dev_entitlement_bypass_enabled()
    paid_access = bypass or licensed or subscription["subscriptionEntitled"] or trial["trialActive"]
    can_analyze = paid_access
    can_use_proactive = paid_access
    can_use_sync = paid_access
    return {
        **trial,
        **subscription,
        "licensed": licensed,
        "licenseReason": license_reason,
        "canAnalyze": can_analyze,
        "canUseProactive": can_use_proactive,
        "canUseSync": can_use_sync,
        "hasLicenseKey": bool(_read_saved_license_key()),
        "cloudAuthRequired": False,
        "cloudLoggedIn": False,
        "cloudEmail": None,
        **_sort_service_status(),
    }


def may_start_analyze() -> tuple[bool, str | None]:
    """Returns (allowed, error_detail_for_user)."""
    return _may_use_paid_features()


def assert_may_start_analyze() -> None:
    from fastapi import HTTPException

    ok, code = may_start_analyze()
    if ok:
        return
    raise HTTPException(status_code=402, detail=code or _TRIAL_EXPIRED)


def may_use_proactive() -> tuple[bool, str | None]:
    """Gate proactive second brain (digest, meetings, activity, integration sync)."""
    return _may_use_paid_features()


def assert_may_use_proactive() -> None:
    from fastapi import HTTPException

    ok, code = may_use_proactive()
    if ok:
        return
    raise HTTPException(status_code=402, detail=code or _TRIAL_EXPIRED)


def may_use_sync() -> tuple[bool, str | None]:
    """Multi-device E2E sync — included during trial and with a license."""
    return _may_use_paid_features()


def assert_may_use_sync() -> None:
    from fastapi import HTTPException

    ok, code = may_use_sync()
    if ok:
        return
    raise HTTPException(status_code=402, detail=code or _TRIAL_EXPIRED)
