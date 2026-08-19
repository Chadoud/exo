"""Single source of truth for tool risk tiers (M3.6).

Used by ``orchestrator.policy`` (AutonomyPolicy / classify) and
``tool_registry.handlers`` (TOOLS_NEEDING_APPROVAL).
"""

from __future__ import annotations

from enum import Enum

# Tools that only read or are trivially reversible.
SAFE_TOOLS = frozenset({
    "list_directory", "find_home_folder", "terminal_safe", "get_running_apps", "read_file",
    "web_search", "weather_report", "analyze_local_file", "screen_capture",
    "youtube_video", "flight_finder", "review_and_suggest",
    "read_project_file", "list_project_tree",
    # Local second-brain / tasks reads — never fake "needs confirmation"
    "list_tasks",
    "search_memories",
    "search_conversations",
    "search_activity",
    "search_everything",
    "run_startup_briefing",
})

# Tools whose every call can have real-world side effects (AutonomyPolicy gate).
SENSITIVE_TOOLS = frozenset({
    "os_control", "control_computer", "code_runner", "dev_scaffold_project",
    "send_message", "open_app", "close_app", "file_workspace", "computer_settings",
    "desktop_environment", "manage_connection", "schedule_reminder", "save_memory",
    "system_volume", "start_local_file_sort", "run_google_drive_workspace_sort",
    "write_project_files",
    "create_task", "complete_task", "start_codegen_studio",
    "google_workspace", "microsoft_graph", "dropbox_files", "slack_messaging",
    "whatsapp_messaging", "s3_storage", "infomaniak_services", "icloud_drive",
    "notion", "browser_control", "web_agent",
})

# Explicit user approval required (voice UI / agent task without autonomous mode).
# Must include every SENSITIVE non-connector tool — otherwise AutonomyPolicy returns
# "needs your confirmation" with no Allow once / Always allow / Deny UI.
APPROVAL_TOOLS = frozenset({
    "screen_capture",
    "code_runner",
    "dev_scaffold_project",
    "control_computer",
    "os_control",
    "file_workspace",
    "start_local_file_sort",
    "plan_and_execute",
    "browser_control",
    "open_app",
    "close_app",
    "web_agent",
    "send_message",
    "google_workspace",
    "microsoft_graph",
    "dropbox_files",
    "slack_messaging",
    "whatsapp_messaging",
    "notion",
    "s3_storage",
    "icloud_drive",
    "infomaniak_services",
    "write_project_files",
    "computer_settings",
    "desktop_environment",
    "run_google_drive_workspace_sort",
    # Connect/disconnect integrations from voice — must go through the same
    # approval UI as google_workspace; otherwise AutonomyPolicy hard-blocks it
    # with "needs your confirmation" and never shows the Allow prompt.
    "manage_connection",
    "create_task",
    "complete_task",
    "save_memory",
    "schedule_reminder",
    "system_volume",
    "start_codegen_studio",
})

# Never run inside an autonomous plan loop.
BLOCKED_TOOLS = frozenset({"plan_and_execute", "end_voice_session"})

# Connector tools multiplex operations; verbs decide read vs write risk.
CONNECTOR_TOOLS = frozenset({
    "google_workspace", "microsoft_graph", "dropbox_files", "slack_messaging",
    "whatsapp_messaging", "s3_storage", "infomaniak_services", "icloud_drive",
    "notion", "browser_control",
})

_WRITE_VERBS = (
    "send", "move", "delete", "create", "update", "copy", "append", "remove",
    "write", "upload", "type", "click", "go_to", "submit",
)


class Risk(str, Enum):
    SAFE = "safe"
    SENSITIVE = "sensitive"
    BLOCKED = "blocked"


def operation_of(args: dict) -> str:
    for key in ("operation", "action"):
        value = args.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip().lower()
    return ""


def classify(tool: str, args: dict | None = None) -> Risk:
    """Return the risk tier for a tool call (name first, then operation verb)."""
    name = (tool or "").strip()
    args = args or {}
    if name in BLOCKED_TOOLS:
        return Risk.BLOCKED
    if name in CONNECTOR_TOOLS:
        operation = operation_of(args)
        if not operation:
            return Risk.SENSITIVE
        return Risk.SENSITIVE if operation.startswith(_WRITE_VERBS) else Risk.SAFE
    if name in SAFE_TOOLS:
        return Risk.SAFE
    if name in SENSITIVE_TOOLS:
        return Risk.SENSITIVE
    return Risk.SENSITIVE
