"""Folder-name recovery from speech and conversation."""

from voice.folder_query import resolve_folder_query
from voice.tool_args import enrich_voice_tool_args


def test_resolve_folder_query_uses_quoted_history() -> None:
    query = resolve_folder_query(
        "",
        "can you start sorting the files within the folder file?",
        ['I couldn\'t find a folder named "Q3 invoices".'],
    )
    assert query == "Q3 invoices"


def test_resolve_folder_query_keeps_name_tokens_in_speech() -> None:
    query = resolve_folder_query("", "please sort Q3 invoices", [])
    assert "Q3" in query


def test_enrich_find_home_folder_fills_empty_query() -> None:
    enriched = enrich_voice_tool_args(
        "find_home_folder",
        {},
        "sort the folder file",
        context_texts=['I couldn\'t find a folder named "Q3 invoices".'],
    )
    assert enriched["query"] == "Q3 invoices"
