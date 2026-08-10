"""Tool declarations for memory."""

from __future__ import annotations

from typing import TYPE_CHECKING

from tool_registry.declarations._common import decl

if TYPE_CHECKING:
    from google.genai import types as genai_types  # type: ignore[import]


def build_declarations() -> list["genai_types.FunctionDeclaration"]:
    return [
                decl(
            "save_memory",
            "Save a persistent memory entry for future sessions.",
            {
                "category": {
                    "type": "string",
                    "enum": [
                        "identity",
                        "preferences",
                        "projects",
                        "context",
                        "notes",
                        "relationships",
                        "wishes",
                    ],
                },
                "key": {"type": "string"},
                "value": {"type": "string"},
                "origin_ref": {
                    "type": "string",
                    "description": "Optional source ref (gmail:mail:ID, google-calendar:cal:ID, conv:ID).",
                },
                "origin_label": {
                    "type": "string",
                    "description": "Human label for the source (email subject, event title, etc.).",
                },
            },
            ["category", "key", "value"],
        ),
                decl(
            "search_memories",
            (
                "Search what you've REMEMBERED about the user (their identity, preferences, "
                "projects, relationships, context, notes, wishes). Use this whenever answering "
                "depends on personal facts — e.g. 'what's my dog's name?', 'what am I working on?', "
                "'what do you know about me?'. Leave query empty to list the most recent facts."
            ),
            {
                "query": {"type": "string", "description": "What to recall; empty = most recent facts."},
                "category": {
                    "type": "string",
                    "enum": [
                        "identity", "preferences", "projects", "context",
                        "notes", "relationships", "wishes",
                    ],
                    "description": "Optional category filter.",
                },
                "limit": {"type": "integer", "description": "Max results (1-25, default 8)."},
            },
        ),
                decl(
            "search_conversations",
            (
                "Search the user's PAST conversations by topic and return their titles + "
                "summaries so you can recall earlier discussions and cite them. Use for "
                "'what did we decide about X?', 'remind me what we talked about yesterday'."
            ),
            {
                "query": {"type": "string", "description": "Topic or keywords to find."},
                "limit": {"type": "integer", "description": "Max results (1-20, default 5)."},
            },
            ["query"],
        ),
                decl(
            "search_activity",
            (
                "Search the user's on-screen ACTIVITY timeline (apps/windows they worked in, "
                "distilled to one-line summaries). Use for temporal recall like 'what was I "
                "doing this morning?', 'when was I last in Figma?'. Leave query empty for the "
                "most recent activity."
            ),
            {
                "query": {"type": "string", "description": "Keywords to match app/window/summary; empty = most recent."},
                "since": {
                    "type": "string",
                    "description": "Optional ISO 8601 datetime lower bound (only activity at/after this time).",
                },
                "limit": {"type": "integer", "description": "Max results (1-200, default 20)."},
            },
        ),
                decl(
            "search_everything",
            (
                "Unified search across memories, past conversations, meetings, on-screen activity, "
                "and open tasks. Use when the user asks 'what do I know about X?' or wants one "
                "answer spanning their whole second brain."
            ),
            {
                "query": {"type": "string", "description": "What to find across all brain sources."},
                "limit": {"type": "integer", "description": "Max results (1-25, default 12)."},
            },
            ["query"],
        ),
                decl(
            "create_task",
            (
                "Add a task / action item to the user's task list, optionally with a due date so "
                "they get a reminder. Use when the user says 'remind me to…', 'add a task…', "
                "'I need to…', or commits to doing something."
            ),
            {
                "description": {"type": "string", "description": "What needs to be done."},
                "due_at": {
                    "type": "string",
                    "description": "Optional ISO 8601 datetime (e.g. 2026-06-12T09:00:00) for the due date.",
                },
                "priority": {
                    "type": "string",
                    "enum": ["low", "normal", "high"],
                    "description": "Optional priority. Default: normal.",
                },
            },
            ["description"],
        ),
                decl(
            "list_tasks",
            "List the user's tasks. By default only open (incomplete) ones; set include_completed to also show finished tasks.",
            {"include_completed": {"type": "boolean"}},
        ),
                decl(
            "complete_task",
            "Mark a task as done. Pass its task_id when known, otherwise a description to match an open task.",
            {
                "task_id": {"type": "integer"},
                "description": {"type": "string", "description": "Text to match an open task when no id is known."},
            },
        ),
                decl(
            "run_startup_briefing",
            "Start the user's saved startup briefing (news, weather, calendar, mail) in the "
            "current voice session. Call after the user agrees to the briefing, or when they "
            "explicitly ask for it later. Does nothing if no startup routine is saved.",
            {},
        ),
    ]
