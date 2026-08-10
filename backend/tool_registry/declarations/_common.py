"""Shared JSON-Schema helper for tool declarations."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from google.genai import types as genai_types  # type: ignore[import]


def decl(
    name: str,
    description: str,
    properties: dict[str, Any],
    required: list[str] | None = None,
) -> "genai_types.FunctionDeclaration":
    # Deferred: google.genai adds ~3s to backend boot; only needed once a tool
    # declaration is actually assembled (first voice/assistant request), not at import.
    from google.genai import types as genai_types  # type: ignore[import]

    schema = {"type": "object", "properties": properties}
    if required:
        schema["required"] = required
    return genai_types.FunctionDeclaration(
        name=name,
        description=description,
        parameters_json_schema=schema,
    )
