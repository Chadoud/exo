"""Bounded name search for folders under the user's home directory."""

from __future__ import annotations

import re
from pathlib import Path

from actions import system_safe

_MAX_QUERY = 80
_MAX_RESULTS = 20
_MAX_DEPTH = 5
_MAX_VISIT = 800
_PRIORITY_VISIT = 200

_PRIORITY_DIR_NAMES = ("Downloads", "Desktop", "Documents", "Pictures")
_SKIP_DIR_NAMES = frozenset(
    {
        ".git",
        ".svn",
        ".hg",
        "node_modules",
        "Library",
        ".Trash",
        ".cache",
        "__pycache__",
        "Application Support",
    }
)
_STOP_TOKENS = frozenset(
    {
        "a",
        "an",
        "called",
        "can",
        "dir",
        "directory",
        "find",
        "folder",
        "folders",
        "just",
        "look",
        "my",
        "named",
        "please",
        "search",
        "sort",
        "sorting",
        "start",
        "the",
        "within",
        "you",
    }
)
_GENERIC_TOKENS = frozenset(
    {
        "desktop",
        "doc",
        "docs",
        "document",
        "documents",
        "download",
        "downloads",
        "file",
        "files",
        "picture",
        "pictures",
    }
)


def _normalize_query(raw: object) -> str:
    text = str(raw or "").strip()
    if len(text) > _MAX_QUERY:
        text = text[:_MAX_QUERY]
    return text


def _fold(text: str) -> str:
    return re.sub(r"[\s_\-./]+", " ", text).casefold().strip()


def _query_tokens(query_l: str) -> list[str]:
    tokens = [
        tok
        for tok in re.findall(r"[a-z0-9]+", query_l, flags=re.IGNORECASE)
        if tok.casefold() not in _STOP_TOKENS and len(tok) >= 2
    ]
    return [tok.casefold() for tok in tokens]


def distinctive_tokens(raw: object) -> list[str]:
    """Name tokens from any text — fillers like sort/folder/the are dropped."""
    return [tok for tok in _query_tokens(_fold(str(raw or ""))) if tok not in _GENERIC_TOKENS]


def is_usable_folder_query(raw: object) -> bool:
    """True when the text still has a name token after fillers are stripped."""
    return bool(distinctive_tokens(raw))


def _name_matches(name: str, query: str, tokens: list[str]) -> bool:
    name_f = _fold(name)
    query_f = _fold(query)
    if query_f and query_f in name_f:
        return True
    if tokens and all(tok in name_f for tok in tokens):
        return True
    return False


def _rank(name: str, query: str) -> tuple[int, int, str]:
    name_f = _fold(name)
    query_f = _fold(query)
    if name_f == query_f:
        return (0, len(name_f), name_f)
    if name_f.startswith(query_f):
        return (1, len(name_f), name_f)
    if query_f in name_f:
        return (2, len(name_f), name_f)
    return (3, len(name_f), name_f)


def _should_skip_name(name: str) -> bool:
    return name in _SKIP_DIR_NAMES or name.startswith(".")


def _as_searchable_dir(entry: Path) -> Path | None:
    try:
        if not entry.is_dir():
            return None
    except OSError:
        return None
    if _should_skip_name(entry.name):
        return None
    resolved = system_safe._resolve_under_home(str(entry))
    if resolved is None:
        return None
    if system_safe._is_blocked_content_path(resolved):
        return None
    return resolved


def _child_dirs(current: Path) -> list[tuple[str, Path]]:
    """Return (on-disk name, resolved path) so symlink Downloads stays priority."""
    try:
        entries = list(current.iterdir())
    except OSError:
        return []
    found: list[tuple[str, Path]] = []
    for entry in entries:
        resolved = _as_searchable_dir(entry)
        if resolved is not None:
            found.append((entry.name, resolved))
    return found


def _collect(
    roots: list[tuple[Path, int]],
    query_l: str,
    tokens: list[str],
    visit_budget: int,
    matches: list[tuple[tuple[int, int, str], str]],
    seen: set[str],
) -> None:
    stack = list(roots)
    visited = 0
    while stack and visited < visit_budget and len(matches) < _MAX_RESULTS:
        current, depth = stack.pop(0)
        key = str(current)
        if key in seen:
            continue
        seen.add(key)
        visited += 1
        if depth > _MAX_DEPTH:
            continue
        for name, child in _child_dirs(current):
            if _name_matches(name, query_l, tokens):
                matches.append((_rank(name, query_l), str(child)))
                if len(matches) >= _MAX_RESULTS:
                    return
            if depth < _MAX_DEPTH:
                stack.append((child, depth + 1))


def _nearby_folders(home: Path) -> list[str]:
    """Immediate children of Downloads / Desktop / Documents / Pictures."""
    paths: list[str] = []
    top = _child_dirs(home)
    roots = [path for name, path in top if name in _PRIORITY_DIR_NAMES]
    for root in roots:
        for _name, child in _child_dirs(root):
            paths.append(str(child))
            if len(paths) >= 40:
                return paths
    return paths


def find_home_folder(args: dict) -> dict:
    """Find folders under home whose name contains the query (case-insensitive)."""
    query = _normalize_query(args.get("query") or args.get("name"))

    home = system_safe._resolve_under_home(str(system_safe.HOME))
    if home is None:
        home = Path(system_safe.HOME).expanduser().resolve()
    tokens = distinctive_tokens(query)
    if not tokens:
        return {
            "ok": True,
            "data": {
                "query": query,
                "folders": [],
                "nearby": _nearby_folders(home),
                "hint": "No folder name yet. Nearby folders in Downloads, Desktop, and Documents.",
            },
        }
    query_l = _fold(query)
    matches: list[tuple[tuple[int, int, str], str]] = []
    seen: set[str] = set()

    top = _child_dirs(home)
    priority = [path for name, path in top if name in _PRIORITY_DIR_NAMES]
    rest = [path for name, path in top if name not in _PRIORITY_DIR_NAMES]
    for name, child in top:
        if _name_matches(name, query_l, tokens):
            matches.append((_rank(name, query_l), str(child)))

    _collect([(p, 1) for p in priority], query_l, tokens, _PRIORITY_VISIT, matches, seen)
    if len(matches) < _MAX_RESULTS:
        _collect([(p, 1) for p in rest], query_l, tokens, _MAX_VISIT, matches, seen)

    if not matches:
        distinctive = [tok for tok in tokens if len(tok) >= 2]
        if distinctive:
            token = max(distinctive, key=len)
            if token != query_l:
                retry_seen: set[str] = set()
                _collect(
                    [(p, 1) for p in priority],
                    token,
                    [token],
                    _PRIORITY_VISIT,
                    matches,
                    retry_seen,
                )
                if len(matches) < _MAX_RESULTS:
                    _collect(
                        [(p, 1) for p in rest],
                        token,
                        [token],
                        _MAX_VISIT,
                        matches,
                        retry_seen,
                    )

    matches.sort(key=lambda item: item[0])
    folders = [path for _rank, path in matches[:_MAX_RESULTS]]
    if not folders:
        return {
            "ok": True,
            "data": {
                "query": query,
                "folders": [],
                "nearby": _nearby_folders(home),
                "hint": "No folder with that name under your home folder. Nearby folders listed.",
            },
        }
    return {"ok": True, "data": {"query": query, "folders": folders}}
