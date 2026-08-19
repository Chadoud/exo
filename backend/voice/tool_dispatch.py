"""Voice tool dispatch: timeouts, background spawning, and Live API tool responses."""

from __future__ import annotations

import asyncio
import base64
import json
import logging
import threading
from dataclasses import dataclass, field
from datetime import date, datetime
from enum import Enum
from pathlib import Path
from typing import Any, AsyncGenerator, Callable

from orchestrator.policy import policy_block_result
from provider_context import ProviderContextHolder, inject_provider_tool_args
from services.calendar import (
    CalendarConfirmActionKind,
    CalendarCreateDraft,
    CalendarDeleteActionKind,
    CalendarDeleteDraft,
    apply_calendar_draft_patch,
    calendar_delete_confirm_enabled,
    calendar_service_enabled,
    draft_from_payload,
    execute_confirmed_calendar_draft,
    format_calendar_create_completion,
    format_calendar_recap,
    format_delete_completion,
    format_delete_recap,
    get_calendar_service,
    is_calendar_create_call,
    needs_delete_scope_tool_result,
    parse_calendar_confirm_response,
    parse_delete_confirm_response,
    tool_result_blocks_promise_nudge,
)
from services.calendar.delete_confirm import is_delete_followup_reply
from services.calendar.delete_draft import resolve_delete_draft_from_events
from services.routing import LastRefusal, RouteContext, RouteResult, get_capability_router
from services.routing.artifact_admit import AdmitDecision, refusal_tool_result
from services.routing.capability_router import match_calendar_events_for_delete
from tool_registry import TOOLS_NEEDING_APPROVAL, dispatch_sync
from voice.frames import frame
from voice.mutating_ops import is_mutating_voice_tool
from voice.tool_args import attach_plan_visualizer, derive_tool_source, enrich_voice_tool_args
from voice.turn_trace import VoiceTurnTraceEntry, VoiceTurnTraceRing
from voice_tool_approval import VoiceToolApprovalWaiter

logger = logging.getLogger(__name__)

STARTUP_BRIEFING_CONSENT_KEY = "startup_briefing_consent"


def _policy_block_result(
    name: str,
    args: dict[str, Any],
    *,
    allow_sensitive: bool,
    approved_tool: bool,
) -> dict[str, Any] | None:
    """Block sensitive tools unless autonomous mode is on or the user approved this call."""
    return policy_block_result(
        name, args, allow_sensitive=allow_sensitive, approved_tool=approved_tool
    )


def _briefing_tool_block_result(
    dispatch_state: ToolDispatchState,
    name: str,
    args: dict[str, Any],
) -> dict[str, Any] | None:
    """Block briefing tools while a calendar delete awaits user confirmation."""
    pending = (
        dispatch_state.pending_calendar_delete is not None
        or dispatch_state.calendar_awaiting_confirm
    )
    if not pending:
        return None
    if name == "run_startup_briefing":
        return {
            "ok": False,
            "error": (
                "A calendar delete is awaiting confirmation — handle the user's delete "
                "reply first. Do NOT run the startup briefing."
            ),
        }
    if name == "save_memory":
        category = str(args.get("category") or "").strip()
        key = str(args.get("key") or "").strip()
        if category == "preferences" and key == STARTUP_BRIEFING_CONSENT_KEY:
            return {
                "ok": False,
                "error": (
                    "User is answering a calendar delete confirmation — do NOT change "
                    "startup_briefing_consent until the delete is resolved."
                ),
            }
    return None


DEFAULT_TOOL_TIMEOUT_S = 15.0
TOOL_TIMEOUTS: dict[str, float] = {
    "web_search": 30.0,
    "browser_control": 45.0,
    "flight_finder": 30.0,
    "weather_report": 20.0,
    "send_message": 20.0,
    "google_workspace": 30.0,
    "microsoft_graph": 30.0,
    "dropbox_files": 30.0,
    "s3_storage": 30.0,
    "slack_messaging": 20.0,
    "whatsapp_messaging": 20.0,
    "infomaniak_services": 30.0,
    "control_computer": 70.0,
    "plan_and_execute": 120.0,
    "web_agent": 180.0,
    "start_local_file_sort": 60.0,
}

BACKGROUND_VOICE_TOOLS: frozenset[str] = frozenset(
    {"plan_and_execute", "web_agent", "control_computer"}
)


_SPEAKABLE_SUMMARY_MAX = 1100


def queue_background_tool_result(pending: list[str], tool_name: str, text: str) -> None:
    """Append a follow-up turn for the model; coalesce duplicate web_agent outcomes."""
    if not text:
        return
    if tool_name == "web_agent":
        pending[:] = [item for item in pending if not item.startswith("[TOOL_RESULT web_agent]")]
    pending.append(text)


def shape_speakable_plan_summary(text: str) -> str:
    """Compress orchestrator output into a short spoken brief for Gemini Live."""
    cleaned = " ".join(str(text or "").split()).strip()
    if not cleaned:
        return ""
    low = cleaned.lower()
    if "resource_exhausted" in low or ("429" in low and "quota" in low):
        return (
            "The AI rate limit was hit while working on that. "
            "Ask the user to try again in about a minute."
        )
    if len(cleaned) > _SPEAKABLE_SUMMARY_MAX:
        cleaned = cleaned[: _SPEAKABLE_SUMMARY_MAX - 1].rstrip() + "…"
    return cleaned


def format_background_completion(name: str, result: Any) -> str:
    """Turn a finished background tool result into a follow-up turn for the model."""
    if not isinstance(result, dict):
        return f"[TOOL_RESULT {name}] Finished. Tell the user briefly that it's done."

    data = result.get("data") if isinstance(result.get("data"), dict) else {}
    if not result.get("ok", False):
        raw_err = (
            str(result.get("error") or "").strip()
            or str(result.get("summary") or "").strip()
            or "it didn't work"
        )
        err = shape_speakable_plan_summary(raw_err)
        return (
            f"[TOOL_RESULT {name}] FAILED: {err} "
            "Speak this to the user in one or two short sentences. "
            "Do NOT call plan_and_execute again."
        )

    status = str(data.get("status") or "").strip().lower()
    answer = str(data.get("answer") or "").strip()
    reason = str(data.get("reason") or "").strip()
    summary = str(result.get("summary") or "").strip()

    if status == "cancelled":
        return ""
    if status == "needs_user":
        detail = reason or "your input is needed to continue."
        return f"[TOOL_RESULT {name}] NEEDS THE USER: {detail} Tell the user exactly this now."
    if status in ("failed", "incomplete"):
        detail = shape_speakable_plan_summary(reason or "it couldn't be completed.")
        return (
            f"[TOOL_RESULT {name}] DID NOT COMPLETE: {detail} "
            "Tell the user now, in one short sentence, what blocked it. "
            "Do NOT call plan_and_execute again."
        )
    detail = shape_speakable_plan_summary(answer or summary or reason or "Done.")
    if name == "plan_and_execute":
        return (
            f"[TOOL_RESULT {name}] DONE — speak this summary in your own words "
            f"(do not re-plan, do not call more tools): {detail}"
        )
    return (
        f"[TOOL_RESULT {name}] DONE: {detail} "
        "Tell the user this result now, in one short sentence."
    )


def spawn_background_voice_tool(
    name: str,
    args: dict[str, Any],
    on_complete: Callable[[Any], None] | None = None,
    *,
    provider_holder: ProviderContextHolder | None = None,
) -> None:
    """Run a long tool off the realtime turn so it can't blow the Live API deadline."""
    dispatch_args = inject_provider_tool_args(
        name, args, holder=provider_holder, voice_handoff=True
    )

    def _run() -> None:
        try:
            result = dispatch_sync(name, dispatch_args, approval_granted=True)
        except Exception as exc:  # noqa: BLE001
            logger.exception("[voice] background tool %s failed", name)
            result = {"ok": False, "error": str(exc)}
        if on_complete is not None:
            try:
                on_complete(result)
            except Exception:  # noqa: BLE001
                logger.debug("[voice] background on_complete failed", exc_info=True)

    threading.Thread(target=_run, name=f"voice-bg-{name}", daemon=True).start()


def sanitize_for_live_tool_payload(value: Any) -> Any:
    """Recursively coerce tool handler output to JSON-safe structures for Live API."""
    if value is None or isinstance(value, (bool, int, float, str)):
        return value
    if isinstance(value, bytes):
        cap = 4096
        blob = value[:cap]
        encoded = base64.b64encode(blob).decode("ascii")
        if len(value) > cap:
            return {"_truncated_base64": encoded, "_original_bytes": len(value)}
        return encoded
    if isinstance(value, Enum):
        return value.value
    if isinstance(value, datetime | date):
        return value.isoformat()
    if isinstance(value, Path):
        return str(value)
    if isinstance(value, dict):
        return {str(k): sanitize_for_live_tool_payload(v) for k, v in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [sanitize_for_live_tool_payload(v) for v in value]
    return str(value)


_CALENDAR_CREATE_OPS = frozenset({"create_calendar_event", "create_event"})
_CALENDAR_LIST_OPS = frozenset({"list_calendar_events", "list_events"})


def _is_calendar_delete_speech(text: str) -> bool:
    """True when user speech is trying to delete calendar events."""
    from services.routing.capability_router import _DELETE_INTENT_RE, _has_calendar_intent

    return bool(_DELETE_INTENT_RE.search(text) and _has_calendar_intent(text))


def _delete_needle_for_speech(
    dispatch_state: ToolDispatchState,
    enrich_source: str,
) -> str | None:
    """Resolve title filter from current speech or prior delete context."""
    from services.routing.capability_router import extract_calendar_delete_needle

    needle = extract_calendar_delete_needle(enrich_source)
    if needle:
        return needle
    if is_delete_followup_reply(enrich_source):
        return dispatch_state.last_calendar_delete_needle
    return dispatch_state.last_calendar_delete_needle


def _discover_events_for_delete(
    dispatch_state: ToolDispatchState,
    enrich_source: str,
    *,
    tool_name: str = "google_workspace",
    force: bool = False,
) -> list[dict[str, Any]]:
    """Paginated wide list when delete cache is empty or follow-up needs fresh IDs."""
    needle = _delete_needle_for_speech(dispatch_state, enrich_source)
    if not force and not needle and not is_delete_followup_reply(enrich_source):
        return dispatch_state.last_listed_calendar_events or []

    resolved_tool = tool_name
    if dispatch_state.last_calendar_list_tool in (
        "google_workspace",
        "microsoft_graph",
        "infomaniak_services",
    ):
        resolved_tool = dispatch_state.last_calendar_list_tool

    events = get_calendar_service().fetch_events_for_delete(resolved_tool, needle=needle)
    if events:
        dispatch_state.last_listed_calendar_events = events
        dispatch_state.last_calendar_list_tool = resolved_tool
    return events


def _resolve_delete_without_event_id(
    dispatch_state: ToolDispatchState,
    *,
    name: str,
    args: dict[str, Any],
    enrich_source: str,
) -> dict[str, Any]:
    """
    Discover matching events and plan delete — never call provider delete without IDs.

    Google Calendar requires an event id per DELETE; recurring series use the master
    ``recurringEventId`` after list + collapse, not a bare model tool call.
    """
    source = dispatch_state.last_calendar_delete_source or enrich_source
    _remember_delete_context(dispatch_state, source if source != enrich_source else enrich_source)

    events = dispatch_state.last_listed_calendar_events or []
    if is_delete_followup_reply(enrich_source) or _is_calendar_delete_speech(enrich_source) or not events:
        discovered = _discover_events_for_delete(
            dispatch_state,
            source if is_delete_followup_reply(enrich_source) else enrich_source,
            tool_name=name,
            force=is_delete_followup_reply(enrich_source) or _is_calendar_delete_speech(enrich_source),
        )
        if discovered:
            events = discovered

    matched_ids = _resolve_delete_event_ids(events, args, enrich_source, dispatch_state)
    if not matched_ids and is_delete_followup_reply(enrich_source):
        discovered = _discover_events_for_delete(
            dispatch_state,
            source,
            tool_name=name,
            force=True,
        )
        if discovered:
            events = discovered
            matched_ids = _resolve_delete_event_ids(events, args, enrich_source, dispatch_state)

    if not matched_ids:
        return {"ok": False, "error": "No matching events to delete."}

    result = get_calendar_service().delete_tool_result_for_plan(
        events,
        matched_ids,
        source,
        tool_name=name,
    )
    _capture_pending_calendar_delete(dispatch_state, result)

    pending = dispatch_state.pending_calendar_delete
    if pending is not None and is_delete_followup_reply(enrich_source):
        pending = _resolve_pending_delete_draft(dispatch_state, pending, enrich_source)
        action = parse_delete_confirm_response(enrich_source, pending)
        if action.kind == CalendarDeleteActionKind.REJECT:
            dispatch_state.pending_calendar_delete = None
            dispatch_state.calendar_awaiting_confirm = False
            return {
                "ok": True,
                "data": {"status": "cancelled"},
                "summary": "User cancelled the delete.",
            }
        if action.kind == CalendarDeleteActionKind.SCOPE and action.scope:
            dispatch_state.pending_calendar_delete = None
            dispatch_state.calendar_awaiting_confirm = False
            scoped = get_calendar_service().delete_with_scope(pending, action.scope)
            dispatch_state.last_tool_ok = (
                scoped.get("ok", False) if isinstance(scoped, dict) else True
            )
            return scoped
        if action.kind == CalendarDeleteActionKind.CONFIRM:
            dispatch_state.pending_calendar_delete = None
            dispatch_state.calendar_awaiting_confirm = False
            scoped = get_calendar_service().delete_with_scope(pending, "this_instance")
            dispatch_state.last_tool_ok = (
                scoped.get("ok", False) if isinstance(scoped, dict) else True
            )
            return scoped
    return result


def _resolve_pending_delete_draft(
    dispatch_state: ToolDispatchState,
    pending: CalendarDeleteDraft,
    enrich_source: str,
) -> CalendarDeleteDraft:
    """Ensure pending delete draft has provider event IDs before mutating."""
    events = dispatch_state.last_listed_calendar_events or []
    resolved = resolve_delete_draft_from_events(pending, events)
    if str(resolved.event_id or "").strip() and (
        resolved.recurring_event_id or not resolved.is_recurring
    ):
        dispatch_state.pending_calendar_delete = resolved
        return resolved

    discovered = _discover_events_for_delete(
        dispatch_state,
        enrich_source,
        tool_name=pending.tool_name,
        force=True,
    )
    if discovered:
        events = discovered
    resolved = resolve_delete_draft_from_events(pending, events)
    dispatch_state.pending_calendar_delete = resolved
    return resolved


def _resolve_delete_event_ids(
    events: list[dict[str, Any]],
    args: dict[str, Any],
    enrich_source: str,
    dispatch_state: ToolDispatchState | None = None,
) -> list[str]:
    """Map a delete tool call to event ids from the last list cache and user speech."""
    from services.routing.capability_router import (
        extract_calendar_delete_needle,
        match_calendar_events_for_delete,
    )

    by_id = {str(e.get("id") or ""): e for e in events if e.get("id")}
    event_id = str(args.get("event_id") or "").strip()
    if event_id and event_id in by_id:
        return [event_id]

    needle = extract_calendar_delete_needle(enrich_source)
    if not needle and dispatch_state and is_delete_followup_reply(enrich_source):
        needle = dispatch_state.last_calendar_delete_needle
    matched = match_calendar_events_for_delete(events, needle)
    if matched:
        return matched
    return [event_id] if event_id else []


def _remember_delete_context(dispatch_state: ToolDispatchState, enrich_source: str) -> None:
    """Keep the last delete needle so scope-only replies do not match every listed event."""
    from services.routing.capability_router import extract_calendar_delete_needle

    needle = extract_calendar_delete_needle(enrich_source)
    if needle:
        dispatch_state.last_calendar_delete_needle = needle
    stripped = enrich_source.strip()
    if stripped:
        dispatch_state.last_calendar_delete_source = stripped[:4000]


def _try_rehydrate_pending_delete(
    dispatch_state: ToolDispatchState,
    enrich_source: str,
) -> CalendarDeleteDraft | None:
    """Rebuild pending delete from list cache when the model retries after scope speech."""
    if dispatch_state.pending_calendar_delete is not None:
        return dispatch_state.pending_calendar_delete
    if not is_delete_followup_reply(enrich_source):
        return None
    events = dispatch_state.last_listed_calendar_events
    if not events:
        events = _discover_events_for_delete(
            dispatch_state,
            dispatch_state.last_calendar_delete_source or enrich_source,
            tool_name=dispatch_state.last_calendar_list_tool or "google_workspace",
            force=True,
        )
    if not events:
        return None
    source = dispatch_state.last_calendar_delete_source or enrich_source
    needle = dispatch_state.last_calendar_delete_needle
    matched = match_calendar_events_for_delete(events, needle)
    if not matched:
        return None
    result = get_calendar_service().delete_tool_result_for_plan(
        events,
        matched,
        source,
        tool_name=dispatch_state.last_calendar_list_tool or "google_workspace",
    )
    _capture_pending_calendar_delete(dispatch_state, result)
    return dispatch_state.pending_calendar_delete


def _maybe_capture_delete_after_list(
    dispatch_state: ToolDispatchState,
    *,
    enrich_source: str,
    tool_name: str,
) -> None:
    """After a successful list, seed pending delete when the user asked to delete."""
    if not _is_calendar_delete_speech(enrich_source):
        return
    events = dispatch_state.last_listed_calendar_events
    if not events:
        return
    from services.routing.capability_router import (
        extract_calendar_delete_needle,
        match_calendar_events_for_delete,
    )

    needle = extract_calendar_delete_needle(enrich_source)
    matched = match_calendar_events_for_delete(events, needle)
    if not matched:
        return
    _remember_delete_context(dispatch_state, enrich_source)
    result = get_calendar_service().delete_tool_result_for_plan(
        events,
        matched,
        enrich_source,
        tool_name=tool_name,
    )
    _capture_pending_calendar_delete(dispatch_state, result)


def _resolve_calendar_create_tool_result(
    name: str,
    args: dict[str, Any],
    enrich_source: str,
    dispatch_state: ToolDispatchState,
) -> dict[str, Any]:
    """Handle create, confirm, patch, or duplicate recap for calendar voice tools."""
    if not calendar_service_enabled():
        from tool_registry import dispatch_sync

        return dispatch_sync(name, args, approval_granted=True)

    had_pending = dispatch_state.pending_calendar_create is not None
    service = get_calendar_service()
    pending, result = service.create_with_confirm(
        name,
        args,
        enrich_source,
        pending=dispatch_state.pending_calendar_create,
    )

    data = result.get("data") if isinstance(result.get("data"), dict) else {}
    status = str(data.get("status") or "")

    if had_pending:
        if status == "created":
            dispatch_state.pending_calendar_create = None
            dispatch_state.calendar_awaiting_confirm = False
            dispatch_state.last_tool_ok = bool(result.get("ok"))
            logger.info(
                "[voice] calendar_create confirmed at tool_call ok=%s",
                dispatch_state.last_tool_ok,
            )
            return result
        if status == "cancelled":
            dispatch_state.pending_calendar_create = None
            dispatch_state.calendar_awaiting_confirm = False
            return result
        dispatch_state.pending_calendar_create = pending
        dispatch_state.calendar_awaiting_confirm = pending is not None
        if pending is not None and pending.confirm_state == "corrected":
            logger.info(
                "[voice] calendar_create patched at tool_call summary=%.48r",
                pending.summary,
            )
        elif pending is not None:
            logger.info("[voice] calendar_create duplicate tool_call — reusing pending recap")
        return result

    if pending is None:
        dispatch_state.calendar_awaiting_confirm = False
        return result

    dispatch_state.pending_calendar_create = pending
    dispatch_state.calendar_awaiting_confirm = True
    logger.info(
        "[voice] calendar_create awaiting confirmation summary=%.48r",
        pending.summary,
    )
    return result


def _calendar_enrichment_summary(
    args: dict[str, Any], title_field: str
) -> tuple[str | None, str | None]:
    summary = str(args.get(title_field) or args.get("summary") or args.get("subject") or "").strip()
    start = str(args.get("start") or args.get("start_datetime") or "").strip()
    return (summary[:120] or None, start[:40] or None)


def _should_retry_calendar_create(name: str, args: dict[str, Any], result: Any) -> bool:
    if args.get("_calendar_retried"):
        return False
    if name not in ("google_workspace", "microsoft_graph", "infomaniak_services"):
        return False
    if str(args.get("operation", "")).strip() not in _CALENDAR_CREATE_OPS:
        return False
    if not isinstance(result, dict) or result.get("ok"):
        return False
    err = str(result.get("error", "")).lower()
    return "required" in err or "timeout" in err or "429" in err


def _should_retry_calendar_stt_race(
    dispatch_state: ToolDispatchState,
    name: str,
    args: dict[str, Any],
    result: Any,
) -> bool:
    if args.get("_calendar_stt_race_retried"):
        return False
    trace = dispatch_state.last_trace_at_tool
    if not trace or not trace.stt_race:
        return False
    return _should_retry_calendar_create(name, args, result) or (
        isinstance(result, dict)
        and not result.get("ok")
        and str(args.get("operation", "")).strip() in _CALENDAR_CREATE_OPS
    )


@dataclass
class ToolDispatchState:
    """Mutable tool-dispatch state shared across turns within one voice session."""

    last_open_tasks: list[dict[str, Any]] = field(default_factory=list)
    background_web_agent_generation: int = 0
    turn_traces: VoiceTurnTraceRing = field(default_factory=VoiceTurnTraceRing)
    last_trace_at_tool: VoiceTurnTraceEntry | None = None
    last_tool_ok: bool | None = None
    pending_calendar_create: CalendarCreateDraft | None = None
    pending_calendar_delete: CalendarDeleteDraft | None = None
    calendar_awaiting_confirm: bool = False
    last_calendar_delete_needle: str | None = None
    last_calendar_delete_source: str = ""
    last_listed_calendar_events: list[dict[str, Any]] = field(default_factory=list)
    last_calendar_list_tool: str = "google_workspace"
    last_refusal: LastRefusal | None = None


async def handle_voice_tool_calls(
    session: Any,
    genai_types_mod: Any,
    tool_calls: list[Any],
    *,
    last_user_text: str,
    canonical_at_tool: str,
    canonical_at_turn_start: str,
    dispatch_state: ToolDispatchState,
    pending_tool_results: list[str],
    approval_waiter: VoiceToolApprovalWaiter | None = None,
    deferred_tool_reason: str | None = None,
    provider_holder: ProviderContextHolder | None = None,
    allow_sensitive: bool = False,
    context_texts: list[str] | None = None,
) -> AsyncGenerator[str, None]:
    """Run tools, notify the UI, then send one Live ``tool_response`` per server batch."""
    function_responses: list[Any] = []
    background_tools_spawned: set[str] = set()

    prepared: list[tuple[Any, str, str, dict[str, Any], str | None, str | None, RouteResult]] = []
    for fc in tool_calls:
        call_id = str(getattr(fc, "id", None) or "").strip()
        name = str(getattr(fc, "name", None) or "").strip()
        raw_args = getattr(fc, "args", None) or {}
        if isinstance(raw_args, str):
            try:
                args = json.loads(raw_args)
            except json.JSONDecodeError:
                args = {}
        else:
            args = dict(raw_args) if isinstance(raw_args, dict) else {}
        enrich_source = canonical_at_tool or last_user_text
        route_ctx = RouteContext(
            user_speech=enrich_source,
            pending_calendar_create=dispatch_state.pending_calendar_create,
            last_listed_calendar_events=dispatch_state.last_listed_calendar_events,
            last_calendar_list_tool=dispatch_state.last_calendar_list_tool,
            last_refusal=dispatch_state.last_refusal,
        )
        routed = get_capability_router().route(name, args, route_ctx)
        if routed.refused:
            dispatch_state.last_refusal = routed.last_refusal
            prepared.append((fc, call_id, routed.name, routed.args, None, None, routed))
            continue
        dispatch_state.last_refusal = None
        name, args = routed.name, routed.args
        if routed.redirected and routed.reason:
            logger.info(
                "[voice] capability_route %s → %s reason=%s",
                str(getattr(fc, "name", "") or "").strip(),
                name,
                routed.reason,
            )
        args = enrich_voice_tool_args(
            name,
            args,
            enrich_source,
            dispatch_state.last_open_tasks,
            context_texts,
        )
        args = inject_provider_tool_args(
            name, args, holder=provider_holder, voice_handoff=True
        )
        args, plan_task_id, plan_goal = attach_plan_visualizer(name, args)
        prepared.append((fc, call_id, name, args, plan_task_id, plan_goal, routed))
        if is_mutating_voice_tool(name, args):
            title_field = "subject" if name == "microsoft_graph" else "summary"
            summary, start = _calendar_enrichment_summary(args, title_field)
            dispatch_state.last_trace_at_tool = VoiceTurnTraceEntry(
                commit_reason="tool_call",
                stt_chunk_count=0,
                canonical_at_tool=canonical_at_tool,
                canonical_at_turn_complete=canonical_at_turn_start,
                tool_name=name,
                tool_operation=str(args.get("operation", "")).strip() or None,
                stt_race=len(canonical_at_tool) > len(canonical_at_turn_start) + 8
                if canonical_at_turn_start
                else False,
                enriched_summary=summary,
                enriched_start=start,
                deferred_tool_reason=deferred_tool_reason,
            )

    if prepared:
        names = [p[2] for p in prepared if p[2] and not p[6].refused]
        if names:
            first_args = prepared[0][3]
            tool_source = derive_tool_source(names[0], first_args)
            plan_task_id = next((p[4] for p in prepared if p[4]), None)
            plan_goal = next((p[5] for p in prepared if p[5]), None)
            running_payload: dict[str, Any] = {"tools": names, "tool_source": tool_source}
            if plan_task_id:
                running_payload["plan_task_id"] = plan_task_id
            if plan_goal:
                running_payload["plan_goal"] = plan_goal
            yield frame("tool_running", **running_payload)

    for fc, call_id, name, args, _plan_task_id, _plan_goal, routed in prepared:
        logger.info("[voice] tool_call  name=%s call_id=%s", name, call_id or "?")
        enrich_source = canonical_at_tool or last_user_text

        approved_tool = True
        approval_fut: asyncio.Future[bool] | None = None
        if routed.refused:
            approved_tool = True
        elif name in TOOLS_NEEDING_APPROVAL:
            skip_prompt = (
                name == "screen_capture"
                and approval_waiter is not None
                and approval_waiter.screen_capture_session_active()
            )
            if skip_prompt:
                approved_tool = True
                logger.debug("[voice] approval   name=%s skipped (session grant active)", name)
            elif approval_waiter is None or not call_id:
                approved_tool = False
                logger.warning("[voice] approval   name=%s denied (no waiter or call_id)", name)
            else:
                # Ensure debug dumps show which tool awaited Allow once / Always / Deny.
                if (
                    dispatch_state.last_trace_at_tool is None
                    or dispatch_state.last_trace_at_tool.tool_name != name
                ):
                    dispatch_state.last_trace_at_tool = VoiceTurnTraceEntry(
                        commit_reason="tool_call",
                        stt_chunk_count=0,
                        canonical_at_tool=canonical_at_tool,
                        canonical_at_turn_complete=canonical_at_turn_start,
                        tool_name=name,
                        tool_operation=str(args.get("operation", "")).strip() or None,
                        confirm_state="awaiting_approval",
                    )
                approval_fut = approval_waiter.prepare(call_id)
                logger.info("[voice] approval   name=%s waiting for user consent…", name)
                yield frame(
                    "tool_approval_required",
                    call_id=call_id,
                    tool=name,
                )
                try:
                    approved_tool = await asyncio.wait_for(approval_fut, timeout=120.0)
                    logger.info(
                        "[voice] approval   name=%s decision=%s",
                        name,
                        "granted" if approved_tool else "denied",
                    )
                except asyncio.TimeoutError:
                    approved_tool = False
                    logger.warning("[voice] approval   name=%s timed out", name)

        if routed.refused:
            artifact = routed.last_refusal.artifact if routed.last_refusal else None
            result = refusal_tool_result(
                AdmitDecision(
                    action="refuse",
                    name=name,
                    args=args,
                    reason=routed.reason,
                    wanted_artifact=artifact,
                    model_hint=routed.refuse_hint,
                )
            )
        elif not approved_tool:
            result = {"ok": False, "error": "User denied or approval unavailable"}
        elif policy_block := _policy_block_result(
            name, args, allow_sensitive=allow_sensitive, approved_tool=approved_tool
        ):
            # Dead-zone / policy blocks must still appear in turn traces (not tool_name=null).
            if (
                dispatch_state.last_trace_at_tool is None
                or dispatch_state.last_trace_at_tool.tool_name != name
            ):
                dispatch_state.last_trace_at_tool = VoiceTurnTraceEntry(
                    commit_reason="tool_call",
                    stt_chunk_count=0,
                    canonical_at_tool=canonical_at_tool,
                    canonical_at_turn_complete=canonical_at_turn_start,
                    tool_name=name,
                    tool_operation=str(args.get("operation", "")).strip() or None,
                )
            result = policy_block
        elif blocked := _briefing_tool_block_result(dispatch_state, name, args):
            result = blocked
        elif routed.bulk_delete_event_ids:
            result = get_calendar_service().delete_tool_result_for_plan(
                dispatch_state.last_listed_calendar_events or [],
                routed.bulk_delete_event_ids,
                enrich_source,
                tool_name=routed.bulk_delete_tool_name or "google_workspace",
            )
            _capture_pending_calendar_delete(dispatch_state, result)
        elif (
            calendar_service_enabled()
            and name in ("google_workspace", "microsoft_graph", "infomaniak_services")
            and str(args.get("operation", "")).strip() == "delete_calendar_event"
        ):
            event_id = str(args.get("event_id") or "").strip()
            if not event_id:
                result = _resolve_delete_without_event_id(
                    dispatch_state,
                    name=name,
                    args=args,
                    enrich_source=enrich_source,
                )
            elif not calendar_delete_confirm_enabled():
                approval_ok = (name not in TOOLS_NEEDING_APPROVAL) or approved_tool
                tool_timeout = TOOL_TIMEOUTS.get(name, DEFAULT_TOOL_TIMEOUT_S)
                try:
                    sync_args = inject_provider_tool_args(
                        name, args, holder=provider_holder, voice_handoff=True
                    )
                    result = await asyncio.wait_for(
                        asyncio.to_thread(
                            dispatch_sync,
                            name,
                            sync_args,
                            approval_granted=approval_ok,
                        ),
                        timeout=tool_timeout,
                    )
                except asyncio.TimeoutError:
                    result = {
                        "ok": False,
                        "error": f"'{name}' did not respond within {tool_timeout:.0f} seconds.",
                    }
            else:
                pending = dispatch_state.pending_calendar_delete
                if pending is None:
                    pending = _try_rehydrate_pending_delete(dispatch_state, enrich_source)
                if pending is not None:
                    action = parse_delete_confirm_response(enrich_source, pending)
                    if action.kind == CalendarDeleteActionKind.REJECT:
                        dispatch_state.pending_calendar_delete = None
                        dispatch_state.calendar_awaiting_confirm = False
                        result = {
                            "ok": True,
                            "data": {"status": "cancelled"},
                            "summary": "User cancelled the delete.",
                        }
                    elif action.kind == CalendarDeleteActionKind.SCOPE and action.scope:
                        dispatch_state.pending_calendar_delete = None
                        dispatch_state.calendar_awaiting_confirm = False
                        result = get_calendar_service().delete_with_scope(pending, action.scope)
                        dispatch_state.last_tool_ok = (
                            result.get("ok", False) if isinstance(result, dict) else True
                        )
                    elif action.kind == CalendarDeleteActionKind.CONFIRM:
                        dispatch_state.pending_calendar_delete = None
                        dispatch_state.calendar_awaiting_confirm = False
                        result = get_calendar_service().delete_with_scope(pending, "this_instance")
                        dispatch_state.last_tool_ok = (
                            result.get("ok", False) if isinstance(result, dict) else True
                        )
                    else:
                        result = needs_delete_scope_tool_result(pending)
                else:
                    events = dispatch_state.last_listed_calendar_events or []
                    if (
                        is_delete_followup_reply(enrich_source)
                        or _is_calendar_delete_speech(enrich_source)
                        or not events
                    ):
                        discovered = _discover_events_for_delete(
                            dispatch_state,
                            enrich_source,
                            tool_name=name,
                            force=is_delete_followup_reply(enrich_source),
                        )
                        if discovered:
                            events = discovered
                    _remember_delete_context(dispatch_state, enrich_source)
                    matched_ids = _resolve_delete_event_ids(
                        events,
                        args,
                        enrich_source,
                        dispatch_state,
                    )
                    if not matched_ids:
                        result = {"ok": False, "error": "No matching events to delete."}
                    else:
                        result = get_calendar_service().delete_tool_result_for_plan(
                            events,
                            matched_ids,
                            enrich_source,
                            tool_name=name,
                        )
                        _capture_pending_calendar_delete(dispatch_state, result)
        elif is_calendar_create_call(name, args) and not args.get("_confirmed"):
            result = _resolve_calendar_create_tool_result(
                name, args, enrich_source, dispatch_state
            )
            if dispatch_state.last_trace_at_tool and dispatch_state.pending_calendar_create:
                pending = dispatch_state.pending_calendar_create
                dispatch_state.last_trace_at_tool.confirm_state = "awaiting"
                dispatch_state.last_trace_at_tool.title_source = pending.title_source
                dispatch_state.last_trace_at_tool.enriched_summary = pending.summary[:120]
                dispatch_state.last_trace_at_tool.enriched_start = pending.start[:40]
            elif (
                dispatch_state.last_trace_at_tool
                and not dispatch_state.pending_calendar_create
                and isinstance(result, dict)
                and result.get("ok")
            ):
                dispatch_state.last_trace_at_tool.confirm_state = "confirmed"
        elif name in BACKGROUND_VOICE_TOOLS:
            if name in background_tools_spawned:
                result = {
                    "ok": True,
                    "data": {"background": True, "deduped": True},
                    "summary": "Already started in the background for this turn.",
                }
            else:
                background_tools_spawned.add(name)
                loop = asyncio.get_running_loop()
                completion_tool = name
                delivery_generation = dispatch_state.background_web_agent_generation
                if name == "web_agent":
                    dispatch_state.background_web_agent_generation += 1
                    delivery_generation = dispatch_state.background_web_agent_generation

                def _deliver_background_result(
                    res: Any,
                    _name: str = completion_tool,
                    _generation: int = delivery_generation,
                ) -> None:
                    if (
                        _name == "web_agent"
                        and _generation != dispatch_state.background_web_agent_generation
                    ):
                        return
                    text = format_background_completion(_name, res)
                    if not text:
                        return

                    def _enqueue() -> None:
                        queue_background_tool_result(pending_tool_results, _name, text)

                    try:
                        loop.call_soon_threadsafe(_enqueue)
                    except RuntimeError:
                        logger.debug(
                            "[voice] loop closed; dropped background result",
                            exc_info=True,
                        )

                if name == "web_agent":
                    try:
                        from actions.web_agent import cancel_web_agent_run

                        cancel_web_agent_run("superseded by new voice request")
                    except Exception:  # noqa: BLE001
                        logger.debug("[voice] web_agent cancel failed", exc_info=True)
                spawn_background_voice_tool(
                    name,
                    args,
                    on_complete=_deliver_background_result,
                    provider_holder=provider_holder,
                )
                result = {
                    "ok": True,
                    "data": {"background": True, "task_id": _plan_task_id},
                    "summary": (
                        "Started in the background. Tell the user you're on it in one short "
                        "sentence. The result will arrive shortly as a follow-up — report it "
                        "then. Do NOT claim it finished yet."
                    ),
                }
        else:
            approval_ok = (name not in TOOLS_NEEDING_APPROVAL) or approved_tool
            tool_timeout = TOOL_TIMEOUTS.get(name, DEFAULT_TOOL_TIMEOUT_S)
            try:
                sync_args = inject_provider_tool_args(
                    name, args, holder=provider_holder, voice_handoff=True
                )
                result = await asyncio.wait_for(
                    asyncio.to_thread(
                        dispatch_sync,
                        name,
                        sync_args,
                        approval_granted=approval_ok,
                    ),
                    timeout=tool_timeout,
                )
                if _should_retry_calendar_create(name, args, result):
                    retry_args = {**args, "_calendar_retried": True}
                    retry_args = enrich_voice_tool_args(
                        name,
                        retry_args,
                        enrich_source,
                        dispatch_state.last_open_tasks,
                    )
                    logger.info("[voice] calendar_create retry name=%s", name)
                    result = await asyncio.wait_for(
                        asyncio.to_thread(
                            dispatch_sync,
                            name,
                            retry_args,
                            approval_granted=approval_ok,
                        ),
                        timeout=tool_timeout,
                    )
                elif _should_retry_calendar_stt_race(dispatch_state, name, args, result):
                    retry_args = {**args, "_calendar_stt_race_retried": True}
                    retry_args = enrich_voice_tool_args(
                        name,
                        retry_args,
                        enrich_source,
                        dispatch_state.last_open_tasks,
                    )
                    logger.info("[voice] calendar_create stt_race retry name=%s", name)
                    result = await asyncio.wait_for(
                        asyncio.to_thread(
                            dispatch_sync,
                            name,
                            retry_args,
                            approval_granted=approval_ok,
                        ),
                        timeout=tool_timeout,
                    )
            except asyncio.TimeoutError:
                logger.error(
                    "[voice] tool_timeout  name=%s — timed out after %.0f s",
                    name,
                    tool_timeout,
                )
                result = {
                    "ok": False,
                    "error": (
                        f"'{name}' did not respond within {tool_timeout:.0f} seconds. "
                        "Tell the user the action timed out and suggest they try again."
                    ),
                }

        ok = result.get("ok", False) if isinstance(result, dict) else True
        if tool_result_blocks_promise_nudge(result):
            ok = True
        logger.info("[voice] tool_result name=%s ok=%s", name, ok)

        if dispatch_state.last_tool_ok is None:
            dispatch_state.last_tool_ok = ok
        else:
            dispatch_state.last_tool_ok = dispatch_state.last_tool_ok and ok

        if (
            dispatch_state.last_trace_at_tool
            and dispatch_state.last_trace_at_tool.tool_name == name
        ):
            dispatch_state.last_trace_at_tool.tool_ok = ok
            if not ok and isinstance(result, dict):
                dispatch_state.last_trace_at_tool.tool_error = str(result.get("error", ""))[:200]
            dispatch_state.turn_traces.push(dispatch_state.last_trace_at_tool)
            dispatch_state.last_trace_at_tool = None
            yield frame("turn_trace", traces=dispatch_state.turn_traces.recent(3))

        if name == "list_tasks" and ok and isinstance(result, dict):
            data = result.get("data")
            if isinstance(data, dict) and isinstance(data.get("tasks"), list):
                dispatch_state.last_open_tasks = [t for t in data["tasks"] if isinstance(t, dict)]
        operation = str(args.get("operation", "")).strip()
        if (
            name in ("google_workspace", "microsoft_graph", "infomaniak_services")
            and operation in _CALENDAR_LIST_OPS
            and ok
            and isinstance(result, dict)
        ):
            data = result.get("data")
            if isinstance(data, dict) and isinstance(data.get("events"), list):
                dispatch_state.last_listed_calendar_events = [
                    e for e in data["events"] if isinstance(e, dict)
                ]
                dispatch_state.last_calendar_list_tool = name
                _maybe_capture_delete_after_list(
                    dispatch_state,
                    enrich_source=enrich_source,
                    tool_name=name,
                )
        if not ok:
            logger.warning(
                "[voice] tool_fail   name=%s error=%s",
                name,
                result.get("error", "no detail") if isinstance(result, dict) else result,
            )

        yield frame(
            "tool_result",
            call_id=call_id,
            tool=name,
            result=result,
        )

        if (
            isinstance(result, dict)
            and result.get("ok")
            and isinstance(result.get("data"), dict)
            and result["data"].get("action") == "stop_voice"
        ):
            yield frame("voice_session_end")

        if not call_id:
            logger.error(
                "[voice] Missing function call id for tool %r; cannot send tool_response.",
                name,
            )
            continue

        safe = (
            sanitize_for_live_tool_payload(result)
            if isinstance(result, dict)
            else sanitize_for_live_tool_payload({"ok": True, "data": result})
        )
        function_responses.append(
            genai_types_mod.FunctionResponse(
                id=call_id,
                name=name,
                response={"result": safe},
            )
        )

    if function_responses:
        await session.send_tool_response(function_responses=function_responses)

    if tool_calls:
        yield frame("tool_idle")


def _capture_pending_calendar_delete(dispatch_state: ToolDispatchState, result: Any) -> None:
    """Store pending delete draft when tool result needs scope or confirmation."""
    if not isinstance(result, dict) or not result.get("ok"):
        return
    data = result.get("data")
    if not isinstance(data, dict):
        return
    status = str(data.get("status") or "")
    if status not in ("needs_scope", "needs_confirmation"):
        return
    draft_data = data.get("draft")
    if isinstance(draft_data, dict):
        dispatch_state.pending_calendar_delete = draft_from_payload(draft_data)
        dispatch_state.calendar_awaiting_confirm = True
        source = str(draft_data.get("source_text") or "").strip()
        if source:
            _remember_delete_context(dispatch_state, source)


def process_pending_calendar_delete_confirm(
    user_text: str,
    dispatch_state: ToolDispatchState,
    pending_tool_results: list[str],
    *,
    sync_holder: Any | None = None,
) -> bool:
    """
    Handle the user's reply to a pending calendar delete recap.

    Returns True when the reply was consumed (scope, confirm, or reject).
    """
    pending = dispatch_state.pending_calendar_delete
    if pending is None or not user_text.strip():
        return False

    pending = _resolve_pending_delete_draft(dispatch_state, pending, user_text)

    action = parse_delete_confirm_response(user_text, pending)
    if action.kind == CalendarDeleteActionKind.NONE:
        from services.calendar.confirm import parse_simple_confirm_reply

        if pending.is_recurring and parse_simple_confirm_reply(user_text) == "confirm":
            recap = format_delete_recap(pending)
            pending_tool_results.append(
                f"[SYSTEM] Recurring event — ask scope in one sentence: {recap} "
                "Wait for this event / following / entire series before deleting."
            )
            return True
        return False

    if action.kind == CalendarDeleteActionKind.REJECT:
        dispatch_state.pending_calendar_delete = None
        dispatch_state.calendar_awaiting_confirm = False
        if sync_holder is not None:
            sync_holder.draft = None
        pending_tool_results.append(
            "[SYSTEM] User cancelled the calendar delete. Acknowledge briefly in one sentence."
        )
        logger.info("[voice] calendar_delete cancelled by user")
        return True

    scope = action.scope
    if action.kind == CalendarDeleteActionKind.CONFIRM:
        scope = "this_instance"

    if pending.is_recurring and scope is None:
        recap = format_delete_recap(pending)
        pending_tool_results.append(
            f"[SYSTEM] Recurring event — ask scope in one sentence: {recap} "
            "Wait for this event / following / entire series before deleting."
        )
        return True

    if not str(pending.event_id or "").strip() and not pending.recurring_event_id:
        dispatch_state.pending_calendar_delete = None
        dispatch_state.calendar_awaiting_confirm = False
        if sync_holder is not None:
            sync_holder.draft = None
        pending_tool_results.append(
            "[SYSTEM] Calendar delete failed — could not resolve event IDs. "
            "Tell the user briefly and ask them to repeat which events to delete."
        )
        logger.warning(
            "[voice] calendar_delete missing event ids summary=%.48r",
            pending.summary,
        )
        return True

    dispatch_state.pending_calendar_delete = None
    dispatch_state.calendar_awaiting_confirm = False
    if sync_holder is not None:
        sync_holder.draft = None
    result = get_calendar_service().delete_with_scope(pending, scope or "this_instance")
    pending_tool_results.append(format_delete_completion(pending, result, scope or "this_instance"))
    dispatch_state.last_tool_ok = result.get("ok", False) if isinstance(result, dict) else True
    logger.info(
        "[voice] calendar_delete confirmed ok=%s scope=%s summary=%.48r",
        dispatch_state.last_tool_ok,
        scope,
        pending.summary,
    )
    return True


def process_pending_calendar_confirm(
    user_text: str,
    dispatch_state: ToolDispatchState,
    pending_tool_results: list[str],
) -> bool:
    """
    Handle the user's reply to a pending calendar recap.

    Returns True when the reply was consumed (confirm, reject, or patch).
    """
    pending = dispatch_state.pending_calendar_create
    if pending is None or not user_text.strip():
        return False

    action = parse_calendar_confirm_response(user_text, pending)
    if action.kind == CalendarConfirmActionKind.NONE:
        return False

    if action.kind == CalendarConfirmActionKind.REJECT:
        dispatch_state.pending_calendar_create = None
        dispatch_state.calendar_awaiting_confirm = False
        pending_tool_results.append(
            "[SYSTEM] User cancelled the calendar event. Acknowledge briefly in one sentence."
        )
        logger.info("[voice] calendar_create cancelled by user")
        return True

    if action.kind == CalendarConfirmActionKind.PATCH:
        dispatch_state.pending_calendar_create = apply_calendar_draft_patch(pending, action.patch)
        dispatch_state.calendar_awaiting_confirm = True
        updated = dispatch_state.pending_calendar_create
        recap = format_calendar_recap(updated)
        pending_tool_results.append(
            f"[SYSTEM] User corrected the event. Recap again in one sentence: {recap} "
            "Wait for explicit confirmation before creating."
        )
        logger.info("[voice] calendar_create patched summary=%.48r", updated.summary)
        return True

    if action.kind == CalendarConfirmActionKind.CONFIRM:
        draft = pending
        dispatch_state.pending_calendar_create = None
        dispatch_state.calendar_awaiting_confirm = False
        result = execute_confirmed_calendar_draft(draft)
        pending_tool_results.append(
            format_calendar_create_completion(draft.tool_name, draft, result)
        )
        dispatch_state.last_tool_ok = (
            result.get("ok", False) if isinstance(result, dict) else True
        )
        logger.info(
            "[voice] calendar_create confirmed ok=%s summary=%.48r",
            dispatch_state.last_tool_ok,
            draft.summary,
        )
        return True

    return False
