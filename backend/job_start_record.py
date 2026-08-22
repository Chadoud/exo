"""Last analyze/import-sort outcome — no paths, tokens, or folder names."""

from __future__ import annotations

import json
import logging
import os
import time
from typing import Any

logger = logging.getLogger(__name__)

_FILENAME = "last_job_start.json"
_SAFE_CODES = frozenset(
    {
        "ok",
        "trial_expired",
        "no_files",
        "unsafe_output",
        "unauthorized",
        "validation",
        "error",
    }
)
_SAFE_ROUTES = frozenset({"analyze", "gmail_import_sort"})


def record_job_start(*, ok: bool, route: str, status: int, code: str) -> None:
    safe_route = route if route in _SAFE_ROUTES else "analyze"
    safe_code = code if code in _SAFE_CODES else "error"
    payload: dict[str, Any] = {
        "ok": bool(ok),
        "route": safe_route,
        "status": int(status),
        "code": safe_code,
        "at": time.time(),
    }
    logger.info(
        "job_start route=%s status=%s code=%s",
        payload["route"],
        payload["status"],
        payload["code"],
    )
    base = (os.environ.get("EXOSITES_USER_DATA") or "").strip()
    if not base:
        return
    path = os.path.join(base, _FILENAME)
    try:
        os.makedirs(base, exist_ok=True)
        tmp = path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(payload, f)
        os.replace(tmp, path)
    except OSError:
        logger.warning("Could not write last_job_start.json")
