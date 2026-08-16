"""CapabilityRouter — redirect misrouted voice tool calls before dispatch.

Calendar list/delete/create and other single-integration ops must not go through
``plan_and_execute``. Multi-domain or explicit multi-step goals keep the orchestrator.

Controlled by ``ASSISTANT_CAPABILITY_ROUTER`` (on by default; set to ``0`` to disable).
"""

from __future__ import annotations

import os
import re
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any

from services.calendar.draft import (
    infer_calendar_create_args,
    user_speech_implies_calendar_event,
)
from services.routing.artifact_admit import LastRefusal, admit_proposed_tool

_CALENDAR_TOOLS = frozenset({"google_workspace", "microsoft_graph", "infomaniak_services"})
_LIST_OPS = frozenset({"list_calendar_events", "list_events"})
_DELETE_OPS = frozenset({"delete_calendar_event", "delete_event"})
_CREATE_OPS = frozenset({"create_calendar_event", "create_event"})

_CALENDAR_INTENT_RE = re.compile(
    r"\b(?:calendar|calendrier|agenda|event|events|événement|événements|meeting|"
    r"meetings|appointment|appointments|rendez-vous|réunion|réunions)\b",
    re.IGNORECASE,
)
_DELETE_INTENT_RE = re.compile(
    r"\b(?:delete|remove|cancel|clear|drop|supprim|effac|annul|lösch|entfern)\b",
    re.IGNORECASE,
)
_LIST_INTENT_RE = re.compile(
    r"\b(?:list|show|what(?:'s| is)|whats|display|see|get|fetch|"
    r"affiche|montre|liste|zeig|mostra)\b",
    re.IGNORECASE,
)
_CREATE_INTENT_RE = re.compile(
    r"\b(?:create|add|schedule|book|set|put|plan|cr[eé]er?|planifier|"
    r"ajoute|programme|réserve)\b",
    re.IGNORECASE,
)
_MULTI_STEP_RE = re.compile(
    r"\b(?:then|and then|after that|afterwards|first\b.+\bthen|"
    r"research|summar(?:y|ise|ize)|draft|email|message|write.+and)\b",
    re.IGNORECASE,
)
_DOMAIN_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("calendar", _CALENDAR_INTENT_RE),
    (
        "mail",
        re.compile(
            r"\b(?:email|e-mail|mail|gmail|inbox|message|messages|courriel)\b",
            re.IGNORECASE,
        ),
    ),
    (
        "drive",
        re.compile(r"\b(?:drive|onedrive|dropbox|file|files|document|documents)\b", re.IGNORECASE),
    ),
    (
        "notion",
        re.compile(r"\b(?:notion|notes?|page|pages|database)\b", re.IGNORECASE),
    ),
    (
        "slack",
        re.compile(r"\b(?:slack|channel|channels)\b", re.IGNORECASE),
    ),
    (
        "web",
        re.compile(r"\b(?:website|browse|browser|search the web|look up)\b", re.IGNORECASE),
    ),
)
def capability_router_enabled() -> bool:
    """Feature flag for CapabilityRouter (on by default)."""
    val = os.environ.get("ASSISTANT_CAPABILITY_ROUTER", "").strip().lower()
    if val in ("0", "false", "no", "off"):
        return False
    return True


@dataclass
class RouteContext:
    """Session state and user speech for routing decisions."""

    user_speech: str = ""
    pending_calendar_create: Any | None = None
    last_listed_calendar_events: list[dict[str, Any]] = field(default_factory=list)
    last_calendar_list_tool: str = "google_workspace"
    last_refusal: LastRefusal | None = None


@dataclass
class RouteResult:
    """Output of a routing decision."""

    name: str
    args: dict[str, Any]
    redirected: bool = False
    reason: str | None = None
    bulk_delete_event_ids: list[str] | None = None
    bulk_delete_tool_name: str = "google_workspace"
    refused: bool = False
    refuse_hint: str | None = None
    last_refusal: LastRefusal | None = None


def _normalize_text(text: str) -> str:
    return " ".join(text.split()).strip()


def _goal_text(name: str, args: dict[str, Any], user_speech: str) -> str:
    if name == "plan_and_execute":
        goal = str(args.get("goal", "")).strip()
        if goal:
            return goal
    return _normalize_text(user_speech)


def _count_domains(text: str) -> int:
    return sum(1 for _label, pattern in _DOMAIN_PATTERNS if pattern.search(text))


def _is_explicit_multi_step_goal(text: str) -> bool:
    if _count_domains(text) >= 2:
        return True
    return bool(_MULTI_STEP_RE.search(text))


def _has_calendar_intent(text: str) -> bool:
    return bool(_CALENDAR_INTENT_RE.search(text))


def _is_calendar_list_goal(text: str) -> bool:
    if not _has_calendar_intent(text):
        return False
    if _DELETE_INTENT_RE.search(text):
        return False
    if _CREATE_INTENT_RE.search(text) and not _LIST_INTENT_RE.search(text):
        return False
    return bool(
        _LIST_INTENT_RE.search(text)
        or re.search(r"\b(?:today|tomorrow|demain|aujourd)\b", text, re.I)
    )


def _is_calendar_delete_goal(text: str) -> bool:
    return bool(_DELETE_INTENT_RE.search(text) and _has_calendar_intent(text))


def _is_calendar_create_goal(text: str) -> bool:
    return bool(
        _CREATE_INTENT_RE.search(text)
        and (_has_calendar_intent(text) or user_speech_implies_calendar_event(text))
    )


from services.calendar.delete_needle import (
    extract_calendar_delete_needle,
    match_calendar_events_for_delete,
)
from services.calendar.list_for_delete import build_delete_list_params

_extract_delete_needle = extract_calendar_delete_needle
_match_events_for_delete = match_calendar_events_for_delete


def _default_list_window() -> tuple[str, str]:
    now = datetime.now(timezone.utc)
    end = now + timedelta(days=14)
    return now.isoformat(), end.isoformat()


def _redirect_schedule_reminder(
    name: str,
    args: dict[str, Any],
    user_speech: str,
) -> RouteResult | None:
    if name != "schedule_reminder":
        return None
    if not user_speech_implies_calendar_event(user_speech):
        return None
    calendar_args: dict[str, Any] = {"operation": "create_calendar_event"}
    calendar_args = infer_calendar_create_args(
        calendar_args,
        user_speech,
        title_field="summary",
    )
    return RouteResult(
        "google_workspace",
        calendar_args,
        redirected=True,
        reason="schedule_reminder_calendar_event",
    )


def _redirect_plan_and_execute(
    args: dict[str, Any],
    goal: str,
    ctx: RouteContext,
) -> RouteResult | None:
    if _is_explicit_multi_step_goal(goal):
        return None

    if _is_calendar_create_goal(goal):
        calendar_args: dict[str, Any] = {"operation": "create_calendar_event"}
        calendar_args = infer_calendar_create_args(calendar_args, goal, title_field="summary")
        return RouteResult(
            "google_workspace",
            calendar_args,
            redirected=True,
            reason="plan_to_calendar_create",
        )

    if _is_calendar_delete_goal(goal):
        needle = _extract_delete_needle(goal)
        event_ids = _match_events_for_delete(ctx.last_listed_calendar_events, needle)
        if event_ids:
            tool_name = (
                ctx.last_calendar_list_tool
                if ctx.last_calendar_list_tool in _CALENDAR_TOOLS
                else "google_workspace"
            )
            return RouteResult(
                tool_name,
                {"operation": "delete_calendar_event", "_router_bulk_delete": True},
                redirected=True,
                reason="plan_to_calendar_bulk_delete",
                bulk_delete_event_ids=event_ids,
                bulk_delete_tool_name=tool_name,
            )
        time_min, time_max = _default_list_window()
        list_params: dict[str, Any] = {
            "operation": "list_calendar_events",
            "time_min": time_min,
            "time_max": time_max,
            "max_results": 50,
        }
        if needle:
            list_params = build_delete_list_params(needle=needle)
        return RouteResult(
            "google_workspace",
            list_params,
            redirected=True,
            reason="plan_to_calendar_list_before_delete",
        )

    if _is_calendar_list_goal(goal):
        time_min, time_max = _default_list_window()
        return RouteResult(
            "google_workspace",
            {
                "operation": "list_calendar_events",
                "time_min": time_min,
                "time_max": time_max,
                "max_results": 25,
            },
            redirected=True,
            reason="plan_to_calendar_list",
        )

    return None


def _block_plan_for_direct_calendar_op(name: str, args: dict[str, Any]) -> RouteResult | None:
    """When the model picked the right integration tool, never upgrade to orchestrator."""
    if name == "plan_and_execute":
        return None
    operation = str(args.get("operation", "")).strip()
    if name in _CALENDAR_TOOLS and operation in _LIST_OPS | _DELETE_OPS | _CREATE_OPS:
        return RouteResult(name, args, redirected=False)
    return None


class CapabilityRouter:
    """Code-enforced routing for voice tool calls."""

    def route(self, name: str, args: dict[str, Any], ctx: RouteContext) -> RouteResult:
        """
        Return the tool name and args that should actually run.

        When ``bulk_delete_event_ids`` is set, dispatch must call
        ``CalendarService.bulk_delete`` instead of a single delete op.
        """
        speech = _normalize_text(ctx.user_speech)
        merged_args = dict(args)
        decision = admit_proposed_tool(
            name,
            merged_args,
            user_speech=speech,
            last_refusal=ctx.last_refusal,
        )
        if decision.action == "refuse":
            return RouteResult(
                name,
                merged_args,
                refused=True,
                reason=decision.reason,
                refuse_hint=decision.model_hint,
                last_refusal=decision.as_last_refusal(),
            )
        if decision.action == "redirect":
            return RouteResult(
                decision.name,
                decision.args,
                redirected=True,
                reason=decision.reason,
            )

        if not capability_router_enabled():
            return RouteResult(name, merged_args)

        reminder = _redirect_schedule_reminder(name, merged_args, speech)
        if reminder is not None:
            return reminder

        if name == "plan_and_execute":
            goal = _goal_text(name, merged_args, speech)
            redirect = _redirect_plan_and_execute(merged_args, goal, ctx)
            if redirect is not None:
                return redirect

        direct = _block_plan_for_direct_calendar_op(name, merged_args)
        if direct is not None:
            return direct

        return RouteResult(name, merged_args)


_default_router = CapabilityRouter()


def get_capability_router() -> CapabilityRouter:
    """Return the process-wide CapabilityRouter singleton."""
    return _default_router
