"""Assemble domain-split tool declarations into Gemini Live and chat-loop catalogs."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from tool_registry.declarations.calendar import build_declarations as calendar_decls
from tool_registry.declarations.integrations import build_declarations as integration_decls
from tool_registry.declarations.memory import build_declarations as memory_decls
from tool_registry.declarations.system import build_declarations as system_decls

if TYPE_CHECKING:
    from google.genai import types as genai_types  # type: ignore[import]


def _all_declarations() -> list["genai_types.FunctionDeclaration"]:
    return [
        *system_decls(),
        *memory_decls(),
        *calendar_decls(),
        *integration_decls(),
    ]


def build_live_tools() -> list["genai_types.Tool"]:
    """Tool definitions for Gemini LiveConnectConfig."""
    # Deferred: google.genai adds ~3s to backend boot; only needed once a Live
    # session is actually started, not at import.
    from google.genai import types as genai_types  # type: ignore[import]

    return [genai_types.Tool(function_declarations=_all_declarations())]


def build_tool_specs() -> list[dict[str, Any]]:
    """
    Provider-neutral tool descriptions for the text chat tool-calling loop.

    Derived from the same declarations Gemini uses (each carries a plain JSON Schema),
    so OpenAI / Anthropic / Ollama all expose the identical tool catalog. Returns a list
    of ``{"name", "description", "parameters"}`` dicts.
    """
    specs: list[dict[str, Any]] = []
    for tool in build_live_tools():
        for decl in getattr(tool, "function_declarations", None) or []:
            specs.append({
                "name": decl.name,
                "description": getattr(decl, "description", "") or "",
                "parameters": getattr(decl, "parameters_json_schema", None)
                or {"type": "object", "properties": {}},
            })
    return specs
