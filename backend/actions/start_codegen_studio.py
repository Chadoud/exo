"""``start_codegen_studio`` — hand an app-build request to Codegen Studio.

This is a thin, fast ACK tool. It validates the goal and returns immediately so the
realtime voice turn never blocks. The renderer reacts to the ``tool_result`` by
launching a real Codegen Studio session (file generation → install → dev server →
live preview) — the only path that can actually build a multi-file web app. The
generic ``plan_and_execute`` orchestrator cannot build apps (its tools are
mail/calendar/web/files), so app requests must route here instead.
"""

from __future__ import annotations

import logging
from typing import Any

from services.routing.artifact_admit import admit_proposed_tool, refusal_tool_result

logger = logging.getLogger(__name__)

_MAX_GOAL_CHARS = 4000


def start_codegen_studio(parameters: dict[str, Any]) -> dict[str, Any]:
    """Acknowledge an app-build request so the renderer opens Codegen Studio.

    :param parameters: ``goal`` — the full app spec in plain language (required).
    :returns: ``{ok, data: {action, goal}}`` on success, else ``{ok: False, error}``.
    """
    goal = str(parameters.get("goal", "")).strip()
    if not goal:
        return {"ok": False, "error": "goal is required (describe the app to build)."}
    decision = admit_proposed_tool("start_codegen_studio", {"goal": goal}, user_speech=goal)
    if decision.action == "refuse":
        logger.info("[start_codegen_studio] refused reason=%s", decision.reason)
        return refusal_tool_result(decision)
    logger.info("[start_codegen_studio] admitted goal_chars=%s", len(goal))
    return {"ok": True, "data": {"action": "open_codegen_studio", "goal": goal[:_MAX_GOAL_CHARS]}}
