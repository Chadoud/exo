"""Tool name → handler map for the assistant tool catalog.

Each tool name maps to an ``actions.*`` handler returning
``{"ok": bool, "data"|"error": ...}``. This module owns ONLY the wiring of
names to callables and the derived name sets — declarations live in
``tool_registry.declarations.*`` (assembled by ``tool_registry.assemble``) and execution
in ``tool_registry.dispatch``.
"""

from __future__ import annotations

from typing import Any, Callable

from actions import (
    analyze_local_file,
    browser_control,
    code_runner,
    computer_settings,
    computer_use,
    desktop_environment,
    dev_scaffold,
    dropbox_tool,
    end_voice_session,
    file_workspace,
    find_home_folder,
    flight_finder,
    google_workspace_tool,
    icloud_tool,
    infomaniak_tool,
    manage_connection,
    microsoft_graph_tool,
    notion_tool,
    os_control,
    reminder,
    s3_tool,
    screen_capture,
    send_message,
    slack_tool,
    start_local_sort,
    system_safe,
    weather_report,
    web_agent,
    web_search,
    whatsapp_tool,
    youtube_video,
)
from actions.agent_task import plan_and_execute
from actions.open_app import close_app, open_app
from actions.recall_tools import (
    complete_task,
    create_task,
    list_tasks,
    search_activity,
    search_conversations,
    search_everything,
    search_memories,
)
from actions.run_startup_briefing import run_startup_briefing
from actions.run_workspace_google_drive_sort import run_google_drive_workspace_sort
from actions.start_codegen_studio import start_codegen_studio
from actions.suggest_actions import review_and_suggest
from actions.write_project_files import list_project_tree, read_project_file, write_project_files
from tool_registry.risk_tiers import APPROVAL_TOOLS

Handler = Callable[[dict[str, Any]], dict[str, Any]]

TOOLS_NEEDING_APPROVAL = APPROVAL_TOOLS

HANDLERS: dict[str, Handler] = {
    "list_directory": system_safe.list_directory,
    "find_home_folder": find_home_folder.find_home_folder,
    "terminal_safe": system_safe.terminal_safe,
    "get_running_apps": system_safe.get_running_apps,
    "system_volume": system_safe.system_volume,
    "read_file": system_safe.read_file,
    "save_memory": system_safe.save_memory,
    "run_startup_briefing": run_startup_briefing,
    "open_app": open_app,
    "close_app": close_app,
    # ── Second-brain recall + tasks ───────────────────────────────────────────
    "search_memories": search_memories,
    "search_conversations": search_conversations,
    "search_everything": search_everything,
    "search_activity": search_activity,
    "create_task": create_task,
    "list_tasks": list_tasks,
    "complete_task": complete_task,
    "os_control": os_control.os_control,
    "web_search": web_search.web_search,
    "web_agent": web_agent.web_agent,
    "browser_control": browser_control.browser_control,
    "screen_capture": screen_capture.screen_capture,
    "schedule_reminder": reminder.schedule_reminder,
    "youtube_video": youtube_video.youtube_video,
    "flight_finder": flight_finder.flight_finder,
    "code_runner": code_runner.code_runner,
    "send_message": send_message.send_message,
    "weather_report": weather_report.weather_report,
    "end_voice_session": end_voice_session.end_voice_session,
    "file_workspace": file_workspace.file_workspace,
    "analyze_local_file": analyze_local_file.analyze_local_file,
    "start_local_file_sort": start_local_sort.start_local_file_sort,
    "run_google_drive_workspace_sort": run_google_drive_workspace_sort,
    "dev_scaffold_project": dev_scaffold.dev_scaffold_project,
    "write_project_files": write_project_files,
    "read_project_file": read_project_file,
    "list_project_tree": list_project_tree,
    "computer_settings": computer_settings.computer_settings,
    "control_computer": computer_use.control_computer,
    "plan_and_execute": plan_and_execute,
    "start_codegen_studio": start_codegen_studio,
    "review_and_suggest": review_and_suggest,
    "desktop_environment": desktop_environment.desktop_environment,
    "manage_connection": manage_connection.manage_connection,
    # ── External source connectors ───────────────────────────────────────────
    "google_workspace": google_workspace_tool.google_workspace,
    "microsoft_graph": microsoft_graph_tool.microsoft_graph,
    "dropbox_files": dropbox_tool.dropbox_files,
    "slack_messaging": slack_tool.slack_messaging,
    "whatsapp_messaging": whatsapp_tool.whatsapp_messaging,
    "s3_storage": s3_tool.s3_storage,
    "infomaniak_services": infomaniak_tool.infomaniak_services,
    "icloud_drive": icloud_tool.icloud_drive,
    "notion": notion_tool.notion,
}

ALL_TOOL_NAMES = frozenset(HANDLERS.keys())

CONNECTOR_TOOL_NAMES = frozenset({
    "google_workspace",
    "microsoft_graph",
    "dropbox_files",
    "slack_messaging",
    "whatsapp_messaging",
    "s3_storage",
    "infomaniak_services",
    "icloud_drive",
    "notion",
})
