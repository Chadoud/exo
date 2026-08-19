"""Tool registry assembly — domain-split declarations."""

from __future__ import annotations


def test_build_live_tools_count() -> None:
    from tool_registry import build_live_tools, build_tool_specs

    tools = build_live_tools()
    specs = build_tool_specs()
    names = [d.name for t in tools for d in t.function_declarations]
    assert len(names) == 50
    assert [s["name"] for s in specs] == names


def test_domain_modules_cover_all_tools() -> None:
    from tool_registry.declarations.calendar import build_declarations as calendar_decls
    from tool_registry.declarations.integrations import build_declarations as integration_decls
    from tool_registry.declarations.memory import build_declarations as memory_decls
    from tool_registry.declarations.system import build_declarations as system_decls

    total = (
        len(system_decls())
        + len(memory_decls())
        + len(calendar_decls())
        + len(integration_decls())
    )
    assert total == 50
