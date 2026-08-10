"""Tool declarations for calendar."""

from __future__ import annotations

from typing import TYPE_CHECKING

from tool_registry.declarations._common import decl

if TYPE_CHECKING:
    from google.genai import types as genai_types  # type: ignore[import]


def build_declarations() -> list["genai_types.FunctionDeclaration"]:
    return [
                decl(
            "schedule_reminder",
            "Schedule a local reminder for a future date/time.",
            {
                "message": {"type": "string"},
                "date": {"type": "string", "description": "YYYY-MM-DD"},
                "time": {"type": "string", "description": "HH:MM 24h"},
            },
            ["message", "date", "time"],
        ),
    ]
