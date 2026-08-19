"""
Agent planner — receives a goal and returns an ordered list of concrete steps.

.. deprecated::
   ``/agent/task`` now runs through ``orchestrator.orchestrate`` by default
   (``agent/orchestrator_runner.py``). This module remains for
   ``ASSISTANT_ORCHESTRATOR_TASK_QUEUE=0`` fallback and parsing helpers used in tests.

Routes through the Conductor REASONING capability with provider failover (same
policy as chat and plan_and_execute). The user's active provider is tried first;
on quota/transient errors the chain relays to the next configured engine.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
from collections.abc import Callable
from dataclasses import dataclass, field

from orchestrator import Capability, candidates_for
from orchestrator.complete import CompletionError, complete

logger = logging.getLogger(__name__)

OnPlannerRelay = Callable[[str, str, str], None]
"""Invoked on provider hand-off during planning: (from_id, to_id, reason)."""


@dataclass
class AgentSubtask:
    """A smaller unit of work nested under an :class:`AgentStep`."""

    index: int
    description: str
    """Human-readable subtask, e.g. 'Read invoice_2026.pdf'."""
    command_id: str | None = None
    command_args: dict = field(default_factory=dict)


@dataclass
class AgentStep:
    index: int
    description: str
    """Human-readable action, e.g. 'List files in ~/Documents'."""
    command_id: str | None = None
    """Optional system command ID the executor should call for this step."""
    command_args: dict = field(default_factory=dict)
    subtasks: list[AgentSubtask] = field(default_factory=list)
    """Optional ordered subtasks. Empty for flat plans (back-compat)."""


_SYSTEM_PROMPT = """\
You are an AI task planner. Given a user goal, break it into 3-7 concrete steps.

IMPORTANT:
- Each step must map to ONE of these commands (or reasoning only with command_id null):

  LOCAL SYSTEM:
    list_directory      – List files/folders under the user's home directory
    find_home_folder    – Find a folder under home by name when the path is unknown
    terminal_safe       – Run a read-only shell command (ls, git status, etc.)
    get_running_apps    – List running applications
    system_volume       – Set system volume 0–100
    read_file           – Read a text file under home directory
    save_memory         – Save a persistent memory entry
    open_app            – Open an application by name or path
    os_control          – Desktop automation (type, click, hotkey, scroll)
    web_search          – Search the web and return results
    browser_control     – Control the automation browser
    screen_capture      – Capture the screen (requires user approval)
    schedule_reminder   – Schedule a local reminder
    youtube_video       – Play or summarize YouTube content
    flight_finder       – Search Google Flights
    code_runner         – Execute Python code (requires user approval)
    send_message        – Send a message via WhatsApp, Telegram, Signal, Discord, email, etc.
    weather_report      – Get current weather for a city
    end_voice_session   – End the voice session
    file_workspace      – mkdir | move | copy | rename under home directory (no write/create action)
    analyze_local_file  – Analyze a local file (text, image, PDF) with AI
    dev_scaffold_project – Create a Python project scaffold (requires user approval)
    computer_settings   – Adjust system settings (brightness, etc.)
    desktop_environment – Set desktop wallpaper

  EXTERNAL SOURCES (use when the goal involves cloud accounts, email, calendar, or cloud storage):
    google_workspace    – Gmail (send_mail, search_mail, move_mail, list_labels),
                          Google Drive (list_drive_files, search_drive, move_drive_file, create_drive_folder, get_drive_file_metadata),
                          Google Calendar (list_calendar_events, create_calendar_event, update_calendar_event, delete_calendar_event).
                          command_args must include "operation" plus operation-specific fields.
    microsoft_graph     – Outlook Mail (search_mail, send_mail, list_mail_folders, move_mail),
                          OneDrive (list_onedrive_files, search_onedrive, move_onedrive_file, create_onedrive_folder, get_onedrive_metadata),
                          Outlook Calendar (list_calendar_events, create_calendar_event, update_calendar_event, delete_calendar_event).
    dropbox_files       – Dropbox files (list_files, search_files, move_file, copy_file, delete_file, create_folder, get_metadata).
    slack_messaging     – Slack (list_channels, send_message, search_messages, get_channel_history, list_users).
    whatsapp_messaging  – WhatsApp Business Cloud API (connection_status, send_text, send_template, list_templates).
                          Phone numbers only — contact names use send_message on desktop.
    s3_storage          – Amazon S3 (list_buckets, list_objects, get_object_metadata, copy_object, delete_object, create_folder).
    infomaniak_services – Infomaniak Mail (list_mail, search_mail, send_mail) and Calendar (list_calendars, list_events, create_event, update_event, delete_event).
    icloud_drive        – iCloud Drive read-only (list_files, get_metadata). Write operations not supported via API.

- Do NOT invent commands outside that list.
- For external source commands, always pass an "operation" key in command_args.
- file_workspace command_args MUST use action=mkdir|move|copy|rename — never action=create or write.
- For React/TypeScript/web app codegen goals: use command_id null reasoning steps that describe
  the files to generate; do NOT call file_workspace or dev_scaffold_project (Python-only).
- Prefer non-destructive steps. screen_capture, code_runner, and dev_scaffold_project may fail without interactive approval.
- If an external source account may not be connected, add a reasoning step (command_id null) that notes the dependency.

SUBTASKS:
- Each step MAY include a "subtasks" array breaking the step into smaller ordered units.
- Subtasks follow the SAME command rules as steps (command_id from the list above, or null for reasoning).
- Only add subtasks when a step genuinely has distinct sub-steps; otherwise omit "subtasks" or use [].
- Keep each step's "description" a short title (2-6 words is ideal) since it labels the step.

Respond ONLY with valid JSON — an array of objects:
[
  {"index": 1, "description": "List documents", "command_id": "list_directory", "command_args": {"path": "/home/user/docs"},
    "subtasks": [
      {"index": 1, "description": "Scan ~/Documents", "command_id": "list_directory", "command_args": {"path": "/home/user/docs"}},
      {"index": 2, "description": "Note PDFs", "command_id": null, "command_args": {}}
    ]},
  {"index": 2, "description": "Find invoices", "command_id": "google_workspace", "command_args": {"operation": "search_drive", "query": "invoice 2026"}, "subtasks": []},
  {"index": 3, "description": "Summarize", "command_id": null, "command_args": {}}
]
"""


def _friendly_completion_error(message: str) -> str:
    """Map raw provider errors to short, actionable planner failures."""
    if "RESOURCE_EXHAUSTED" in message or re.search(r"\b429\b", message):
        return (
            "All configured AI providers hit rate limits while planning this task. "
            "Wait about a minute or check billing, then try again."
        )
    if re.search(r"disconnect|timed out|timeout|keepalive|unavailable", message, re.I):
        return (
            "Planning failed after connection errors on every configured AI provider. "
            "Check your network, then try again."
        )
    if "No AI provider is configured" in message:
        return (
            "No AI provider is configured for autonomous planning. "
            "Add an API key in Settings or run Ollama locally."
        )
    if len(message) > 280:
        return message[:280] + "…"
    return message


def _plan_with_conductor(
    goal: str,
    *,
    preferred: str | None,
    preferred_model: str | None,
    preferred_api_key: str | None,
    preferred_base_url: str | None,
    on_relay: OnPlannerRelay | None,
) -> str:
    cands = candidates_for(
        Capability.REASONING,
        preferred=preferred,
        preferred_model=preferred_model,
        preferred_api_key=preferred_api_key,
        preferred_base_url=preferred_base_url,
    )
    return complete(
        Capability.REASONING,
        _SYSTEM_PROMPT,
        f"GOAL: {goal}",
        preferred=preferred,
        candidates=cands,
        on_relay=on_relay,
        relay_kind="reasoning",
    )


async def plan_goal(
    goal: str,
    *,
    preferred: str | None = None,
    preferred_model: str | None = None,
    preferred_api_key: str | None = None,
    preferred_base_url: str | None = None,
    on_relay: OnPlannerRelay | None = None,
) -> list[AgentStep]:
    """Return a list of steps to achieve goal, or raise on unrecoverable error."""
    try:
        raw = await asyncio.to_thread(
            _plan_with_conductor,
            goal,
            preferred=preferred,
            preferred_model=preferred_model,
            preferred_api_key=preferred_api_key,
            preferred_base_url=preferred_base_url,
            on_relay=on_relay,
        )
    except CompletionError as exc:
        raise ValueError(_friendly_completion_error(str(exc))) from exc
    return _parse_steps(raw)


def _parse_steps(raw: str) -> list[AgentStep]:
    # Extract JSON array from the response (may be wrapped in markdown fences)
    start = raw.find("[")
    end = raw.rfind("]")
    if start == -1 or end == -1:
        logger.warning("Planner returned no JSON array; raw=%s", raw[:200])
        return []
    try:
        items = json.loads(raw[start : end + 1])
    except json.JSONDecodeError:
        logger.exception("Failed to parse planner JSON")
        return []

    steps: list[AgentStep] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        steps.append(
            AgentStep(
                index=int(item.get("index", len(steps) + 1)),
                description=str(item.get("description", "")),
                command_id=item.get("command_id") or None,
                command_args=item.get("command_args") or {},
                subtasks=_parse_subtasks(item.get("subtasks")),
            )
        )
    return steps


def _parse_subtasks(raw: object) -> list[AgentSubtask]:
    """Parse an optional subtasks array; tolerant of missing/malformed entries."""
    if not isinstance(raw, list):
        return []
    subtasks: list[AgentSubtask] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        description = str(item.get("description", "")).strip()
        if not description:
            continue
        subtasks.append(
            AgentSubtask(
                index=int(item.get("index", len(subtasks) + 1)),
                description=description,
                command_id=item.get("command_id") or None,
                command_args=item.get("command_args") or {},
            )
        )
    return subtasks
