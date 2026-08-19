"""Paid-feature gate for the voice WebSocket (after app-token auth)."""

from __future__ import annotations

import json
import logging

from fastapi import WebSocket

logger = logging.getLogger(__name__)

VOICE_WS_PAYMENT_REQUIRED = 4402


async def reject_unpaid_voice_ws(ws: WebSocket) -> bool:
    """Close unpaid sessions. Returns True when the socket was rejected."""
    from entitlement_gate import may_use_proactive

    ok, code = may_use_proactive()
    if ok:
        return False
    detail = code or "trial_expired"
    try:
        await ws.send_text(json.dumps({"type": "error", "message": detail}))
    except Exception as exc:  # noqa: BLE001 — still close
        logger.debug("voice WS: unpaid error frame failed: %s", exc)
    await ws.close(code=VOICE_WS_PAYMENT_REQUIRED, reason="Payment required")
    return True
