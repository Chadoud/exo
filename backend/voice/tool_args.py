"""Voice tool argument enrichment and display-source derivation."""

from __future__ import annotations

from typing import Any

from services.routing import RouteContext, get_capability_router
from voice.calendar_create_args import infer_calendar_create_args

# Filler words stripped when turning "mark the shooting as done" into a task needle.
_COMPLETE_TASK_STOPWORDS = frozenset({
    "mark", "marquer", "marque", "complete", "completed", "done", "finish", "finished",
    "as", "the", "my", "task", "todo", "to-do", "item", "please", "can", "you", "set",
    "termine", "terminé", "terminée", "fini", "finie", "fait", "faite", "comme", "ma",
    "erledigt", "fertig", "abgeschlossen", "completato", "completata", "fatto",
})

# Tools that stream live progress to the cube visualizer, mapped to the arg that
# holds their plain-language goal.
_VISUALIZED_VOICE_TOOLS: dict[str, str] = {
    "plan_and_execute": "goal",
    "web_agent": "task",
}

_GMAIL_OPS: frozenset[str] = frozenset(
    {"search_mail", "send_mail", "move_mail", "move_mail_batch", "create_filter", "list_labels", "list_mail"}
)
_CALENDAR_OPS: frozenset[str] = frozenset({
    "list_calendar_events", "create_calendar_event",
    "update_calendar_event", "delete_calendar_event",
    "list_calendars", "list_events", "create_event",
    "update_event", "delete_event",
})
_DRIVE_OPS: frozenset[str] = frozenset({
    "list_drive_files", "search_drive", "move_drive_file",
    "create_drive_folder", "get_drive_file_metadata",
})
_ONEDRIVE_OPS: frozenset[str] = frozenset({
    "list_onedrive_files", "search_onedrive", "move_onedrive_file",
    "create_onedrive_folder", "get_onedrive_metadata",
})
_MAIL_FOLDERS_OPS: frozenset[str] = frozenset({"list_mail_folders"})


def infer_close_browser_args(user_text: str) -> dict[str, str] | None:
    """When the voice model calls ``os_control`` without ``action``, infer close-browser args."""
    text = user_text.strip().lower().replace("tubs", "tabs")
    if not text:
        return None
    if not any(
        v in text
        for v in ("close", "ferme", "fermer", "schließ", "chiudi", "kill", "quit", "shut")
    ):
        return None
    tab_like = (
        "tab", "tabs", "onglet", "onglets", "scheda", "schede", "window", "windows",
        "fenêtre", "fenetre", "fenster", "finestra", "chrome", "browser", "firefox",
        "edge", "brave", "opened", "other ones", "the rest", "the others", "les autres",
    )
    if not any(w in text for w in tab_like):
        return None

    browser = "chrome"
    for name in ("firefox", "edge", "brave", "safari"):
        if name in text:
            browser = name
            break

    has_tab_word = any(
        w in text for w in ("tab", "tabs", "onglet", "onglets", "scheda", "schede")
    )
    has_window_word = any(
        w in text
        for w in ("window", "windows", "fenêtre", "fenetre", "fenster", "finestra")
    )
    browser_app_names = ("chrome", "google chrome", "firefox", "edge", "brave", "safari")
    mentions_browser_app = any(b in text for b in browser_app_names)

    if any(p in text for p in (
        "kill chrome", "quit chrome", "close chrome entirely", "ferme chrome",
        " kill ", " quit ", "shut down", "entirely",
    )):
        return {"action": "close_browser", "browser": browser, "scope": "all"}

    if mentions_browser_app and not has_tab_word and not has_window_word and "browser" not in text:
        return {"action": "close_browser", "browser": browser, "scope": "all"}

    if any(p in text for p in (
        "all tabs", "tous les onglets", "every tab", "all the tabs", "other tabs",
        "other ones", "the rest", "the others", "les autres", "other windows",
    )) or ("all" in text and has_tab_word):
        return {"action": "close_browser", "browser": browser, "scope": "window"}

    if has_window_word and not has_tab_word:
        return {"action": "close_browser", "browser": browser, "scope": "window"}

    return {"action": "close_browser", "browser": browser, "scope": "tab"}


def _infer_complete_task_args(
    args: dict[str, Any], last_user_text: str, open_tasks: list[dict[str, Any]],
) -> dict[str, Any]:
    """Resolve a complete_task call the model fired without a usable id/description."""
    if args.get("task_id") is not None or str(args.get("description", "") or "").strip():
        return args
    needle = " ".join(
        w for w in last_user_text.lower().split() if w not in _COMPLETE_TASK_STOPWORDS
    ).strip()
    if not needle:
        return args
    for task in open_tasks:
        desc = str(task.get("description", "") or "").strip().lower()
        if desc and (needle in desc or desc in needle):
            task_id = task.get("id")
            if task_id is not None:
                return {**args, "task_id": task_id}
    return {**args, "description": needle[:200]}


def resolve_voice_tool_call(
    name: str,
    args: dict[str, Any],
    last_user_text: str,
    *,
    listed_calendar_events: list[dict[str, Any]] | None = None,
    calendar_list_tool: str = "google_workspace",
) -> tuple[str, dict[str, Any]]:
    """
    Redirect misrouted voice tool calls before argument enrichment.

    Delegates to ``CapabilityRouter`` (schedule_reminder → calendar create,
    plan_and_execute → direct integration tools for single-domain ops).
    """
    ctx = RouteContext(
        user_speech=last_user_text,
        last_listed_calendar_events=listed_calendar_events or [],
        last_calendar_list_tool=calendar_list_tool,
    )
    routed = get_capability_router().route(name, args, ctx)
    return routed.name, routed.args


def enrich_voice_tool_args(
    name: str,
    args: dict[str, Any],
    last_user_text: str,
    open_tasks: list[dict[str, Any]] | None = None,
    context_texts: list[str] | None = None,
) -> dict[str, Any]:
    """Fill missing required fields voice models often omit (e.g. dev_scaffold description)."""
    enriched = dict(args)
    if name == "find_home_folder":
        from voice.folder_query import resolve_folder_query

        enriched["query"] = resolve_folder_query(
            str(enriched.get("query") or enriched.get("name") or ""),
            last_user_text,
            context_texts or [],
        )
    if name == "dev_scaffold_project":
        desc = str(
            enriched.get("description")
            or enriched.get("goal")
            or enriched.get("prompt")
            or ""
        ).strip()
        if not desc and last_user_text.strip():
            enriched["description"] = last_user_text.strip()[:2048]
    if name == "plan_and_execute":
        goal = str(enriched.get("goal", "")).strip()
        if not goal and last_user_text.strip():
            enriched["goal"] = last_user_text.strip()[:4000]
    if name in ("web_agent", "control_computer"):
        task = str(enriched.get("task", "")).strip()
        if not task and last_user_text.strip():
            enriched["task"] = last_user_text.strip()[:4000]
    if name == "web_agent":
        enriched.setdefault("_voice_triggered", True)
        enriched.setdefault("_auto_close_scope", "tab")
        if not enriched.get("max_steps"):
            enriched["max_steps"] = 8
    if name == "complete_task":
        enriched = _infer_complete_task_args(enriched, last_user_text, open_tasks or [])
    if name == "os_control" and not str(enriched.get("action", "")).strip():
        inferred = infer_close_browser_args(last_user_text)
        if inferred:
            enriched.update(inferred)
    if name == "google_workspace":
        enriched = infer_calendar_create_args(enriched, last_user_text, title_field="summary")
    if name == "microsoft_graph":
        enriched = infer_calendar_create_args(enriched, last_user_text, title_field="subject")
    if name == "infomaniak_services":
        enriched = infer_calendar_create_args(enriched, last_user_text, title_field="summary")
    return enriched


def attach_plan_visualizer(
    name: str, args: dict[str, Any]
) -> tuple[dict[str, Any], str | None, str | None]:
    """Register a mirror task so the cube visualizer can subscribe to live progress."""
    goal_field = _VISUALIZED_VOICE_TOOLS.get(name)
    if goal_field is None:
        return args, None, None
    goal = str(args.get(goal_field, "")).strip()
    if not goal or args.get("_visualizer_task_id"):
        return args, None, None
    from agent.task_queue import TaskStatus, create_task

    vis = create_task(goal)
    vis.status = TaskStatus.running
    enriched = {**args, "_visualizer_task_id": vis.task_id}
    return enriched, vis.task_id, goal


def derive_tool_source(name: str, args: dict) -> str:
    """Return a granular tool source string (tool/service) from a tool name + args."""
    op = str(args.get("operation", "")).strip()
    if name == "google_workspace":
        if op in _GMAIL_OPS:
            return "google_workspace/gmail"
        if op in _DRIVE_OPS:
            return "google_workspace/drive"
        return "google_workspace/calendar"
    if name == "microsoft_graph":
        if op in _GMAIL_OPS or op in _MAIL_FOLDERS_OPS:
            return "microsoft_graph/mail"
        if op in _ONEDRIVE_OPS:
            return "microsoft_graph/onedrive"
        return "microsoft_graph/calendar"
    if name == "infomaniak_services":
        if op in _GMAIL_OPS:
            return "infomaniak_services/mail"
        return "infomaniak_services/calendar"
    return name
