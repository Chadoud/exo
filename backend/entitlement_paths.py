"""Resolve entitlement files under EXOSITES_USER_DATA or profiles/<active>/."""

from __future__ import annotations

import json
import logging
import os
import re
from typing import Any

logger = logging.getLogger(__name__)

_ACTIVE_PROFILE_FILE = "active_profile.json"
_PROFILES_DIR = "profiles"
_PROFILE_ID_RE = re.compile(r"^[a-zA-Z0-9_-]{1,128}$")


def user_data_dir() -> str | None:
    raw = (os.environ.get("EXOSITES_USER_DATA") or "").strip()
    return raw or None


def active_profile_dir(base: str) -> str | None:
    """If USER_DATA is the device root, profile files live under profiles/<active>/."""
    marker = os.path.join(base, _ACTIVE_PROFILE_FILE)
    if not os.path.isfile(marker):
        return None
    try:
        with open(marker, encoding="utf-8") as f:
            data: dict[str, Any] = json.load(f)
        raw = data.get("activeId") if isinstance(data, dict) else None
        if not isinstance(raw, str):
            return None
        ident = raw.strip()
        if ident != "guest" and not _PROFILE_ID_RE.fullmatch(ident):
            return None
        profile = os.path.join(base, _PROFILES_DIR, ident)
        return profile if os.path.isdir(profile) else None
    except Exception as exc:  # noqa: BLE001 — corrupt marker → skip fallback
        logger.warning("Could not read active profile marker %s: %s", marker, exc)
        return None


def entitlement_dirs() -> list[str]:
    base = user_data_dir()
    if not base:
        return []
    dirs = [base]
    profile = active_profile_dir(base)
    if profile and profile not in dirs:
        dirs.append(profile)
    return dirs


def first_existing_entitlement_file(name: str) -> str | None:
    """Prefer USER_DATA/<name>, then the active profile copy (same as license)."""
    for folder in entitlement_dirs():
        path = os.path.join(folder, name)
        if os.path.isfile(path):
            return path
    return None
