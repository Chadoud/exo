"""Drop harvested tasks when a mail/calendar account is replaced.

Tasks are stored by provider (``gmail``, ``google-calendar``), not mailbox.
Switching Google/Microsoft leaves the old rows unless we wipe on disconnect
or when the connected identity fingerprint changes.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
from pathlib import Path
from typing import Iterable

import tasks_store

logger = logging.getLogger(__name__)

FORGETTABLE_SOURCES = frozenset(
    {"gmail", "google-calendar", "outlook", "outlook-calendar"}
)
_IDENTITY_KEY = {
    "gmail": "gmail",
    "google-calendar": "google-calendar",
    "outlook": "microsoft",
    "outlook-calendar": "microsoft",
}
_SOURCES_FOR_IDENTITY_KEY = {
    "gmail": frozenset({"gmail"}),
    "google-calendar": frozenset({"google-calendar"}),
    "microsoft": frozenset({"outlook", "outlook-calendar"}),
}
_TOKEN_IDS = {
    "gmail": ("google-gmail",),
    "google-calendar": ("google-calendar",),
    "outlook": ("microsoft",),
    "outlook-calendar": ("microsoft",),
}
_MEMORY_ORIGIN_PREFIXES = {
    "google-calendar": ("google-calendar:",),
    "outlook-calendar": ("outlook-calendar:",),
}


def identity_fingerprint(raw: str) -> str:
    norm = (raw or "").strip().casefold()
    if not norm:
        return ""
    return hashlib.sha256(norm.encode("utf-8")).hexdigest()


def _identity_path() -> Path:
    base = os.environ.get("EXOSITES_DATA_DIR", "")
    root = Path(base) if base else Path(__file__).parent / "telemetry" / "data"
    root.mkdir(parents=True, exist_ok=True)
    return root / "task_source_identity.json"


def _read_identities() -> dict[str, str]:
    path = _identity_path()
    if not path.is_file():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    if not isinstance(data, dict):
        return {}
    return {str(k): str(v) for k, v in data.items() if isinstance(v, str)}


def _write_identities(data: dict[str, str]) -> None:
    path = _identity_path()
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, separators=(",", ":")), encoding="utf-8")
    tmp.replace(path)


def _clear_identity_keys(sources: Iterable[str]) -> None:
    keys = {_IDENTITY_KEY[s] for s in sources if s in _IDENTITY_KEY}
    if not keys:
        return
    data = _read_identities()
    changed = False
    for key in keys:
        if key in data:
            del data[key]
            changed = True
    if changed:
        _write_identities(data)


def _evict_relayed_tokens(sources: Iterable[str]) -> None:
    from connector_credentials import clear_token

    seen: set[str] = set()
    for source in sources:
        for token_id in _TOKEN_IDS.get(source, ()):
            if token_id in seen:
                continue
            seen.add(token_id)
            clear_token(token_id)


def _forget_calendar_memories(sources: Iterable[str]) -> int:
    prefixes: list[str] = []
    for source in sources:
        prefixes.extend(_MEMORY_ORIGIN_PREFIXES.get(source, ()))
    if not prefixes:
        return 0
    try:
        import assistant_memory
    except Exception:
        return 0
    removed = 0
    for entry in assistant_memory.list_all_memory_scoped():
        if str(entry.get("source") or "") != "auto":
            continue
        ref = str(entry.get("origin_ref") or "")
        if not any(ref.startswith(prefix) for prefix in prefixes):
            continue
        try:
            row_id = int(entry["id"])
        except (KeyError, TypeError, ValueError):
            continue
        if assistant_memory.delete_memory_by_id(row_id):
            removed += 1
    if removed:
        logger.info("forgot calendar memories dropped=%s", removed)
    return removed


def forget_tasks_for_sources(
    sources: Iterable[str],
    *,
    evict_tokens: bool = False,
) -> int:
    """Hard-delete harvested tasks. Never touches typed/conversation rows."""
    allowed = FORGETTABLE_SOURCES.intersection(str(s).strip() for s in sources)
    if not allowed:
        return 0
    dropped = tasks_store.clear_tasks_by_sources(allowed)
    _forget_calendar_memories(allowed)
    _clear_identity_keys(allowed)
    if evict_tokens:
        _evict_relayed_tokens(allowed)
    if dropped:
        logger.info("forgot integration tasks dropped=%s", dropped)
    return dropped


def remember_or_drop_if_identity_changed(source: str, identity: str) -> int:
    """If this mailbox/calendar is not the last one we harvested, drop its tasks."""
    if source not in FORGETTABLE_SOURCES:
        return 0
    fingerprint = identity_fingerprint(identity)
    if not fingerprint:
        return 0
    key = _IDENTITY_KEY[source]
    data = _read_identities()
    previous = data.get(key)
    dropped = 0
    drop_sources = _SOURCES_FOR_IDENTITY_KEY[key]
    unknown_prior = not previous
    replaced = bool(previous and previous != fingerprint)
    leftovers = unknown_prior and tasks_store.count_tasks_for_sources(drop_sources) > 0
    if replaced or leftovers:
        dropped = tasks_store.clear_tasks_by_sources(drop_sources)
        _forget_calendar_memories(drop_sources)
        if dropped:
            logger.info("integration tasks dropped after account change count=%s", dropped)
    data[key] = fingerprint
    _write_identities(data)
    return dropped


def peek_gmail_identity() -> str:
    try:
        from actions.google_workspace_tool import _gmail_self_email

        return _gmail_self_email()
    except Exception:
        return ""


def peek_google_calendar_identity() -> str:
    try:
        import httpx

        from connector_credentials import try_get_token

        token = try_get_token("google-calendar", "google")
        response = httpx.get(
            "https://www.googleapis.com/calendar/v3/calendars/primary",
            headers={"Authorization": f"Bearer {token}"},
            timeout=10,
        )
        response.raise_for_status()
        return str(response.json().get("id") or "")
    except Exception:
        return ""


def peek_outlook_identity() -> str:
    try:
        from actions.microsoft_graph_tool import _graph_self_email

        return _graph_self_email()
    except Exception:
        return ""
