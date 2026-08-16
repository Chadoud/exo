"""Unified assistant turn handler — replaces client-side prefetch routing."""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass, field
from typing import Any, Literal

from services.assistant.intent import (
    classify_intent,
    extract_agent_retry_goal,
    is_agent_retry_prefill,
    is_mail_write_intent,
    merge_calendar_write_context,
)
from services.assistant.prefetch import list_google_calendar_events, search_gmail_messages
from services.calendar import (
    CalendarCreateDraft,
    CalendarDeleteActionKind,
    ConfirmCalendarDeleteRequest,
    ConfirmCalendarEventRequest,
    ProposeCalendarDeleteRequest,
    ProposeCalendarEventRequest,
    calendar_service_enabled,
    draft_from_payload,
    draft_to_payload,
    format_calendar_recap,
    format_delete_recap,
    get_calendar_service,
    parse_delete_confirm_response,
    parse_simple_confirm_reply,
    resolve_calendar_tool_name,
)
from services.calendar.schemas import CalendarDeleteDraftPayload
from services.routing.artifact_admit import (
    AdmitDecision,
    admit_proposed_tool,
    infer_wanted_artifact,
)

logger = logging.getLogger(__name__)

TurnMode = Literal["complete", "stream", "action"]


def unified_turn_enabled() -> bool:
    """Feature flag for POST /assistant/turn (on by default)."""
    val = os.environ.get("ASSISTANT_UNIFIED_TURN", "").strip().lower()
    if val in ("0", "false", "no", "off"):
        return False
    return True


@dataclass
class AssistantTurnResult:
    """Result of one assistant turn before optional streaming."""

    mode: TurnMode
    intent: str
    assistant_content: str = ""
    calendar_event_draft: dict[str, Any] | None = None
    calendar_delete_draft: dict[str, Any] | None = None
    calendar_deleted_count: int | None = None
    action: str | None = None
    action_payload: dict[str, Any] = field(default_factory=dict)
    prefetch_calendar_events: list[dict[str, Any]] | None = None
    prefetch_mail_messages: list[dict[str, Any]] | None = None
    stream_system_prompt: str | None = None
    stream_messages: list[dict[str, str]] | None = None


def _turn_from_admit(decision: AdmitDecision, text: str) -> AssistantTurnResult | None:
    """Map an admit-door decision onto a chat turn, or None when the tool may run."""
    if decision.action == "refuse":
        return AssistantTurnResult(
            mode="complete",
            intent="generic_chat",
            assistant_content=decision.user_message or "",
            action="capability_refuse",
            action_payload={"reason": decision.reason, "artifact": decision.wanted_artifact},
        )
    if decision.action == "redirect" and decision.name == "start_codegen_studio":
        return AssistantTurnResult(
            mode="action",
            intent="codegen_studio",
            action="codegen_studio",
            action_payload={"goal": text},
        )
    return None


def _parse_text_confirm(user_text: str) -> Literal["none", "confirm", "reject"]:
    return parse_simple_confirm_reply(user_text)


def _handle_pending_calendar_confirm(
    message: str,
    pending_draft: dict[str, Any],
) -> AssistantTurnResult | None:
    summary = str(pending_draft.get("summary") or pending_draft.get("title") or "").strip()
    start = str(pending_draft.get("start") or pending_draft.get("startIso") or "").strip()
    end = str(pending_draft.get("end") or pending_draft.get("endIso") or "").strip()
    tool_name = str(
        pending_draft.get("tool_name") or pending_draft.get("toolName") or "google_workspace"
    )
    if not summary or not start:
        return None

    action = _parse_text_confirm(message)
    if action == "none":
        return None

    if action == "reject":
        return AssistantTurnResult(
            mode="complete",
            intent="write_calendar",
            assistant_content="Cancelled — I won't create that event.",
        )

    service = get_calendar_service()
    result = service.execute_confirmed(
        ConfirmCalendarEventRequest(
            tool_name=tool_name,
            summary=summary,
            start=start,
            end=end or start,
            source_text=str(
                pending_draft.get("source_text") or pending_draft.get("sourceText") or summary
            ),
            title_field="subject" if tool_name == "microsoft_graph" else "summary",
        )
    )
    if result.status == "created":
        link = ""
        if result.data:
            link = str(result.data.get("html_link") or result.data.get("web_link") or "").strip()
        content = f"Done — I added **{summary}** to your calendar."
        if link:
            content = f"{content}\n{link}"
        return AssistantTurnResult(
            mode="complete", intent="write_calendar", assistant_content=content
        )

    return AssistantTurnResult(
        mode="complete",
        intent="write_calendar",
        assistant_content=(
            "I couldn't create that event. Check your calendar connection and try again."
        ),
    )


def _handle_calendar_create(message: str, source_text: str) -> AssistantTurnResult:
    service = get_calendar_service()
    response = service.propose(
        ProposeCalendarEventRequest(source_text=source_text.strip(), tool_name="google_workspace")
    )
    if response.status == "needs_input" and response.missing == "time":
        return AssistantTurnResult(
            mode="complete",
            intent="write_calendar",
            assistant_content="What time should I schedule it?",
        )
    if response.status != "needs_confirmation" or not response.draft:
        return AssistantTurnResult(
            mode="complete",
            intent="write_calendar",
            assistant_content="I couldn't draft that event. Try again with a title and time.",
        )
    draft = response.draft
    recap = response.recap or format_calendar_recap(
        CalendarCreateDraft(
            tool_name=draft.tool_name,
            args={
                "operation": "create_calendar_event",
                "summary": draft.summary,
                "start": draft.start,
                "end": draft.end,
            },
            source_text=source_text.strip(),
            summary=draft.summary,
            start=draft.start,
            end=draft.end,
            title_field="summary",
        )
    )
    return AssistantTurnResult(
        mode="complete",
        intent="write_calendar",
        assistant_content=recap,
        calendar_event_draft={
            "title": draft.summary,
            "summary": draft.summary,
            "startIso": draft.start,
            "endIso": draft.end,
            "start": draft.start,
            "end": draft.end,
            "sourceText": source_text.strip(),
            "source_text": source_text.strip(),
            "awaitingConfirm": True,
            "tool_name": draft.tool_name,
            "toolName": draft.tool_name,
        },
    )


def _delete_draft_to_turn_payload(draft: dict[str, Any], *, needs_scope: bool) -> dict[str, Any]:
    """Normalize delete draft for client storage."""
    additional_raw = draft.get("additional_series") or draft.get("additionalSeries") or []
    additional_series: list[dict[str, str | None]] = []
    if isinstance(additional_raw, list):
        for item in additional_raw:
            if not isinstance(item, dict):
                continue
            additional_series.append(
                {
                    "eventId": str(item.get("event_id") or item.get("eventId") or ""),
                    "recurringEventId": item.get("recurring_event_id")
                    or item.get("recurringEventId"),
                    "summary": str(item.get("summary") or ""),
                    "startIso": str(item.get("start") or item.get("startIso") or ""),
                    "endIso": str(item.get("end") or item.get("endIso") or ""),
                }
            )

    return {
        "summary": str(draft.get("summary") or ""),
        "title": str(draft.get("summary") or ""),
        "startIso": str(draft.get("start") or ""),
        "endIso": str(draft.get("end") or ""),
        "start": str(draft.get("start") or ""),
        "end": str(draft.get("end") or ""),
        "eventId": str(draft.get("event_id") or ""),
        "recurringEventId": draft.get("recurring_event_id"),
        "isRecurring": bool(draft.get("is_recurring")),
        "recurrenceLabel": draft.get("recurrence_label"),
        "sourceText": str(draft.get("source_text") or draft.get("sourceText") or ""),
        "source_text": str(draft.get("source_text") or draft.get("sourceText") or ""),
        "toolName": str(draft.get("tool_name") or "google_workspace"),
        "tool_name": str(draft.get("tool_name") or "google_workspace"),
        "calendarId": str(draft.get("calendar_id") or "primary"),
        "standaloneEventIds": list(draft.get("standalone_event_ids") or []),
        "additionalSeries": additional_series,
        "awaitingConfirm": True,
        "needsScope": needs_scope,
        "scopeOptions": (
            ["this_instance", "this_and_following", "all_series"] if needs_scope else None
        ),
    }


def _handle_pending_calendar_delete_confirm(
    message: str,
    pending_draft: dict[str, Any],
) -> AssistantTurnResult | None:
    draft = draft_from_payload(pending_draft)
    action = parse_delete_confirm_response(message, draft)
    if action.kind == CalendarDeleteActionKind.NONE:
        return None

    if action.kind == CalendarDeleteActionKind.REJECT:
        return AssistantTurnResult(
            mode="complete",
            intent="write_calendar_delete",
            assistant_content="Cancelled — I won't delete that event.",
        )

    service = get_calendar_service()
    scope = action.scope
    if action.kind == CalendarDeleteActionKind.CONFIRM:
        scope = "this_instance"

    if draft.is_recurring and scope is None:
        recap = format_delete_recap(draft)
        return AssistantTurnResult(
            mode="complete",
            intent="write_calendar_delete",
            assistant_content=recap,
            calendar_delete_draft=_delete_draft_to_turn_payload(
                draft_to_payload(draft),
                needs_scope=True,
            ),
        )

    result = service.confirm_delete(
        ConfirmCalendarDeleteRequest(
            draft=CalendarDeleteDraftPayload(**draft_to_payload(draft)),
            user_reply=message.strip(),
            scope=scope,
        )
    )
    if result.status == "needs_scope" and result.draft:
        return AssistantTurnResult(
            mode="complete",
            intent="write_calendar_delete",
            assistant_content=result.recap or format_delete_recap(draft),
            calendar_delete_draft=_delete_draft_to_turn_payload(
                result.draft.model_dump(),
                needs_scope=True,
            ),
        )
    if result.status == "deleted":
        count = int(result.deleted_count or 1)
        return AssistantTurnResult(
            mode="complete",
            intent="write_calendar_delete",
            assistant_content=f"Deleted {count} calendar event{'s' if count != 1 else ''}.",
            calendar_deleted_count=count,
        )
    return AssistantTurnResult(
        mode="complete",
        intent="write_calendar_delete",
        assistant_content=result.error or "Couldn't delete that event. Try again.",
    )


def _handle_calendar_delete(message: str) -> AssistantTurnResult:
    service = get_calendar_service()
    tool_name = resolve_calendar_tool_name()
    response = service.propose_delete(
        ProposeCalendarDeleteRequest(source_text=message.strip(), tool_name=tool_name)
    )
    if response.status == "failed":
        return AssistantTurnResult(
            mode="complete",
            intent="write_calendar_delete",
            assistant_content=response.error or "I couldn't find any matching calendar events to delete.",
        )
    if response.status == "deleted":
        count = int(response.deleted_count or 0)
        return AssistantTurnResult(
            mode="complete",
            intent="write_calendar_delete",
            assistant_content=response.recap or f"Deleted {count} calendar event{'s' if count != 1 else ''}.",
            calendar_deleted_count=count,
        )
    if response.status in ("needs_scope", "needs_confirmation") and response.draft:
        needs_scope = response.status == "needs_scope"
        recap = response.recap or format_delete_recap(draft_from_payload(response.draft.model_dump()))
        return AssistantTurnResult(
            mode="complete",
            intent="write_calendar_delete",
            assistant_content=recap,
            calendar_delete_draft=_delete_draft_to_turn_payload(
                response.draft.model_dump(),
                needs_scope=needs_scope,
            ),
        )
    return AssistantTurnResult(
        mode="complete",
        intent="write_calendar_delete",
        assistant_content="I couldn't prepare that delete. Try again with the event name.",
    )


def handle_assistant_turn(
    *,
    message: str,
    previous_user_message: str | None = None,
    pending_calendar_draft: dict[str, Any] | None = None,
    pending_calendar_delete_draft: dict[str, Any] | None = None,
    memory_block: str = "",
    conversation_summary: str | None = None,
    assistant_tools_enabled: bool = True,
    assistant_agent_enabled: bool = True,
    messages_for_stream: list[dict[str, str]] | None = None,
) -> AssistantTurnResult:
    """
    Route one user message through server-side intent and prefetch policy.

    Returns ``mode=stream`` with ``stream_messages`` when the client should
    open an SSE chat stream; otherwise returns a completed assistant message.
    """
    text = message.strip()
    if not text:
        return AssistantTurnResult(mode="complete", intent="generic_chat", assistant_content="")

    if pending_calendar_delete_draft and pending_calendar_delete_draft.get("awaitingConfirm"):
        if calendar_service_enabled():
            confirmed = _handle_pending_calendar_delete_confirm(text, pending_calendar_delete_draft)
            if confirmed is not None:
                return confirmed

    if pending_calendar_draft and pending_calendar_draft.get("awaitingConfirm"):
        if calendar_service_enabled():
            confirmed = _handle_pending_calendar_confirm(text, pending_calendar_draft)
            if confirmed is not None:
                return confirmed

    # Classify before stripping Retry wrapper so generic goals can fall back to agent_task.
    intent = classify_intent(text, previous_user_message)
    if is_agent_retry_prefill(text):
        text = extract_agent_retry_goal(text)

    if intent == "codegen_studio":
        gated = _turn_from_admit(
            admit_proposed_tool("start_codegen_studio", {"goal": text}, user_speech=text),
            text,
        )
        if gated is not None:
            return gated
        return AssistantTurnResult(
            mode="action",
            intent=intent,
            action="codegen_studio",
            action_payload={"goal": text},
        )

    if intent in ("agent_task", "external_source_task", "send_message"):
        gated = _turn_from_admit(
            admit_proposed_tool("plan_and_execute", {"goal": text}, user_speech=text),
            text,
        )
        if gated is not None:
            return gated
        if not assistant_agent_enabled and intent == "send_message":
            return AssistantTurnResult(
                mode="complete",
                intent=intent,
                assistant_content="Enable agent mode in Settings to send messages from chat.",
            )
        if assistant_tools_enabled and assistant_agent_enabled:
            return AssistantTurnResult(
                mode="action",
                intent=intent,
                action="agent_task",
                action_payload={"goal": text, "relay_tokens": intent == "external_source_task"},
            )

    if is_mail_write_intent(text):
        return AssistantTurnResult(
            mode="action",
            intent="write_calendar",
            action="mail_compose",
            action_payload={"text": text},
        )

    if intent == "write_calendar_delete":
        if not assistant_tools_enabled:
            return AssistantTurnResult(
                mode="complete",
                intent=intent,
                assistant_content="Calendar tools are disabled in Settings.",
            )
        if not calendar_service_enabled():
            return _stream_turn(
                intent, memory_block, conversation_summary, messages_for_stream
            )
        return _handle_calendar_delete(text)

    if intent == "write_calendar":
        wanted = infer_wanted_artifact(text)
        if wanted in {"video", "advice", "ambiguous"}:
            gated = _turn_from_admit(
                admit_proposed_tool("start_codegen_studio", {"goal": text}, user_speech=text),
                text,
            )
            if gated is not None:
                return gated
        if not assistant_tools_enabled:
            return AssistantTurnResult(
                mode="complete",
                intent=intent,
                assistant_content="Calendar tools are disabled in Settings.",
            )
        if not calendar_service_enabled():
            return _stream_turn(
                intent, memory_block, conversation_summary, messages_for_stream
            )
        source = merge_calendar_write_context(previous_user_message, text)
        return _handle_calendar_create(text, source)

    if intent == "read_calendar":
        if not assistant_tools_enabled:
            return AssistantTurnResult(
                mode="action",
                intent=intent,
                action="client_calendar_read",
                action_payload={"text": text, "previous_user_message": previous_user_message},
            )
        list_result = list_google_calendar_events()
        events: list[dict[str, Any]] = []
        if isinstance(list_result, dict) and list_result.get("ok"):
            data = list_result.get("data")
            if isinstance(data, dict) and isinstance(data.get("events"), list):
                events = [e for e in data["events"] if isinstance(e, dict)]
        if events:
            return AssistantTurnResult(
                mode="action",
                intent=intent,
                action="client_calendar_read",
                action_payload={"text": text, "previous_user_message": previous_user_message},
                prefetch_calendar_events=events,
            )
        return AssistantTurnResult(
            mode="action",
            intent=intent,
            action="client_calendar_read",
            action_payload={"text": text, "previous_user_message": previous_user_message},
        )

    if intent == "mail_manage":
        if not assistant_tools_enabled:
            return AssistantTurnResult(
                mode="complete",
                intent=intent,
                assistant_content="Mail tools are disabled in Settings.",
            )
        mail_result = search_gmail_messages(query=text[:200], max_messages=30)
        messages: list[dict[str, Any]] = []
        if isinstance(mail_result, dict) and mail_result.get("ok"):
            data = mail_result.get("data")
            if isinstance(data, dict) and isinstance(data.get("messages"), list):
                messages = [m for m in data["messages"] if isinstance(m, dict)]
        return AssistantTurnResult(
            mode="action",
            intent=intent,
            action="client_mail_manage",
            action_payload={"text": text, "previous_user_message": previous_user_message},
            prefetch_mail_messages=messages or None,
        )

    if intent in ("read_mail", "read_both"):
        if not assistant_tools_enabled:
            return AssistantTurnResult(
                mode="complete",
                intent=intent,
                assistant_content="Mail tools are disabled in Settings.",
            )
        mail_result = search_gmail_messages(query=text[:200], max_messages=20)
        messages: list[dict[str, Any]] = []
        if isinstance(mail_result, dict) and mail_result.get("ok"):
            data = mail_result.get("data")
            if isinstance(data, dict) and isinstance(data.get("messages"), list):
                messages = [m for m in data["messages"] if isinstance(m, dict)]
        return AssistantTurnResult(
            mode="action",
            intent=intent,
            action="client_mail_read",
            action_payload={"text": text, "previous_user_message": previous_user_message},
            prefetch_mail_messages=messages or None,
        )

    return _stream_turn(intent, memory_block, conversation_summary, messages_for_stream)


def _stream_turn(
    intent: str,
    memory_block: str,
    conversation_summary: str | None,
    messages_for_stream: list[dict[str, str]] | None,
) -> AssistantTurnResult:
    """Delegate to SSE chat when unified services are disabled or intent is generic."""
    system_parts: list[str] = []
    if memory_block.strip():
        system_parts.append(memory_block.strip())
    if conversation_summary and (messages_for_stream or []):
        if len(messages_for_stream or []) > 20:
            system_parts.insert(
                0,
                f"[EARLIER IN THIS CONVERSATION]\n{conversation_summary}\n[END OF EARLIER CONTEXT]",
            )
    return AssistantTurnResult(
        mode="stream",
        intent=intent,
        stream_system_prompt="\n\n".join(system_parts) if system_parts else None,
        stream_messages=messages_for_stream,
    )


def turn_result_to_json(result: AssistantTurnResult) -> dict[str, Any]:
    """Serialize a turn result for JSON responses."""
    payload: dict[str, Any] = {
        "mode": result.mode,
        "intent": result.intent,
        "assistant_content": result.assistant_content,
    }
    if result.calendar_event_draft is not None:
        payload["calendar_event_draft"] = result.calendar_event_draft
    if result.calendar_delete_draft is not None:
        payload["calendar_delete_draft"] = result.calendar_delete_draft
    if result.calendar_deleted_count is not None:
        payload["calendar_deleted_count"] = result.calendar_deleted_count
    if result.action:
        payload["action"] = result.action
        payload["action_payload"] = result.action_payload
    if result.prefetch_calendar_events is not None:
        payload["prefetch_calendar_events"] = result.prefetch_calendar_events
    if result.prefetch_mail_messages is not None:
        payload["prefetch_mail_messages"] = result.prefetch_mail_messages
    if result.stream_system_prompt:
        payload["stream_system_prompt"] = result.stream_system_prompt
    return payload
