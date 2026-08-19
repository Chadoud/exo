"""Resolve a folder-search query from speech and recent conversation text."""

from __future__ import annotations

import re

from actions.find_home_folder import is_usable_folder_query

_QUOTED = re.compile(r"""["']([^"']{2,80})["']""")
_NAMED = re.compile(
    r"""(?:folder|directory|dossier)\s+named\s+["']?([^"'?.!]{2,80})""",
    re.IGNORECASE,
)


def extract_folder_names(texts: list[str]) -> list[str]:
    """Return folder names mentioned in conversation order (oldest first)."""
    found: list[str] = []
    seen: set[str] = set()
    for text in texts:
        chunks = [m.group(1).strip() for m in _QUOTED.finditer(text or "")]
        named = [m.group(1).strip() for m in _NAMED.finditer(text or "")]
        for name in chunks + named:
            key = name.casefold()
            if key in seen or not is_usable_folder_query(name):
                continue
            seen.add(key)
            found.append(name)
    return found


def resolve_folder_query(raw_query: str, speech: str, context_texts: list[str]) -> str:
    """Prefer a name-bearing query from the tool, then speech, then recent chat."""
    for candidate in (raw_query, speech):
        text = str(candidate or "").strip()
        if is_usable_folder_query(text):
            return text[:80]
    names = extract_folder_names(context_texts)
    if names:
        return names[-1][:80]
    return str(raw_query or speech or "").strip()[:80]
