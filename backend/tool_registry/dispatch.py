"""Synchronous tool dispatch with approval gating and structured logging."""

from __future__ import annotations

import logging
import time
from typing import Any

from .handlers import HANDLERS, TOOLS_NEEDING_APPROVAL

logger = logging.getLogger(__name__)

_MAIL_SEND_TOOLS = frozenset({"google_workspace", "microsoft_graph", "infomaniak_services"})


def _unpaid_mail_send_block(name: str, params: dict[str, Any]) -> dict[str, Any] | None:
    if name not in _MAIL_SEND_TOOLS:
        return None
    if str(params.get("operation", "")).strip() != "send_mail":
        return None
    from entitlement_gate import may_use_proactive

    ok, _ = may_use_proactive()
    if ok:
        return None
    return {"ok": False, "error": "Sending mail is paused until you subscribe."}


def _safe_repr(obj: Any, max_len: int = 200) -> str:
    """Return a truncated repr of obj, safe to include in log lines."""
    try:
        s = repr(obj)
    except Exception:
        s = "<unrepresentable>"
    return s if len(s) <= max_len else s[:max_len] + "…"


def dispatch_sync(
    tool_name: str,
    parameters: dict[str, Any],
    *,
    approval_granted: bool = False,
) -> dict[str, Any]:
    """
    Run a tool synchronously. Used by the agent executor (approval_granted=False).

    Tools in TOOLS_NEEDING_APPROVAL return an error unless approval_granted True (voice flow).
    """
    name = tool_name.strip()
    if name not in HANDLERS:
        logger.warning("[tool] UNKNOWN  %s", name)
        return {"ok": False, "error": f"Unknown tool: {name!r}"}

    if name in TOOLS_NEEDING_APPROVAL and not approval_granted:
        logger.warning("[tool] DENIED   %s (approval required)", name)
        return {
            "ok": False,
            "error": "This action requires explicit user approval.",
        }

    raw_params = parameters if isinstance(parameters, dict) else {}
    unpaid = _unpaid_mail_send_block(name, raw_params)
    if unpaid is not None:
        return unpaid
    if approval_granted:
        raw_params = {**raw_params, "_approval_granted": True}
    logger.debug("[tool] START    %s | args=%s", name, _safe_repr(raw_params))
    t0 = time.perf_counter()

    try:
        result = HANDLERS[name](raw_params)
    except Exception as exc:
        elapsed = time.perf_counter() - t0
        logger.exception("[tool] CRASH    %s | %.3fs", name, elapsed)
        return {"ok": False, "error": str(exc)}

    elapsed = time.perf_counter() - t0
    ok = result.get("ok", False) if isinstance(result, dict) else True
    if ok:
        logger.debug("[tool] OK       %s | %.3fs", name, elapsed)
    else:
        detail = "no detail"
        if isinstance(result, dict):
            detail = (
                str(result.get("error") or "").strip()
                or str(result.get("summary") or "").strip()
                or "no detail"
            )
        else:
            detail = result
        logger.warning(
            "[tool] FAIL     %s | %.3fs | %s",
            name,
            elapsed,
            detail,
        )
    return result
