"""JPEG screen grab via the Electron loopback bridge (macOS TCC → Exo)."""

from __future__ import annotations

import json
import logging
import os
import urllib.error
import urllib.request

from constants import APP_DISPLAY_NAME

logger = logging.getLogger(__name__)


def macos_screen_permission_hint() -> str:
    return (
        f"macOS blocked screen capture for {APP_DISPLAY_NAME}. Open System Settings → "
        f"Privacy & Security → Screen & System Audio Recording, turn on **{APP_DISPLAY_NAME}**, "
        "then ask me again."
    )


def capture_jpeg_via_electron() -> tuple[bytes | None, str | None]:
    """Return (jpeg_bytes, permission_hint). Hint set when macOS denied Exo."""
    url = os.environ.get("EXOSITES_ELECTRON_CAPTURE_URL", "").strip()
    token = os.environ.get("EXOSITES_APP_TOKEN", "").strip()
    if not url or not token:
        return None, None
    try:
        req = urllib.request.Request(
            url,
            data=b"{}",
            method="POST",
            headers={
                "Content-Type": "application/json",
                "X-App-Token": token,
            },
        )
        with urllib.request.urlopen(req, timeout=20) as resp:
            content_type = (resp.headers.get("Content-Type") or "").lower()
            if "image/jpeg" in content_type:
                return resp.read(), None
            body = resp.read().decode("utf-8", errors="replace")
            try:
                payload = json.loads(body)
            except json.JSONDecodeError:
                payload = {}
            if isinstance(payload, dict) and payload.get("error") == "screen_permission_denied":
                return None, macos_screen_permission_hint()
            logger.warning("[electron_capture] failed: %r", payload or body[:200])
            return None, None
    except urllib.error.HTTPError as exc:
        logger.warning("[electron_capture] http_%s", exc.code)
        return None, None
    except Exception as exc:  # noqa: BLE001 — capture is best-effort
        logger.warning("[electron_capture] error: %s", exc)
        return None, None
