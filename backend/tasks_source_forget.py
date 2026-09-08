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
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Iterable

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


_SEEN_KEY = "_seen"


def _fingerprint_identities(data: dict[str, str]) -> dict[str, str]:
    return {k: v for k, v in data.items() if k != _SEEN_KEY}


def _seen_identity_keys(data: dict[str, str]) -> set[str]:
    extra = {p.strip() for p in str(data.get(_SEEN_KEY) or "").split(",") if p.strip()}
    return extra | {k for k in data if k in _SOURCES_FOR_IDENTITY_KEY}


def _with_seen(data: dict[str, str], key: str) -> dict[str, str]:
    seen = _seen_identity_keys(data)
    seen.add(key)
    out = {k: v for k, v in data.items() if k != _SEEN_KEY}
    out[_SEEN_KEY] = ",".join(sorted(seen))
    return out


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
        data = _with_seen(data, key)
        if key in data:
            del data[key]
            changed = True
        else:
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


SOURCE_FORGET_PREFIX = "source_forget:"
CAPABILITY_RECORD_ID = "capability:source_forget_v1"
_FORGETS_FILE = "task_source_forgets.json"
_CAPABILITY_FILE = "source_forget_capability.json"


def _forgets_path() -> Path:
    base = os.environ.get("EXOSITES_DATA_DIR", "")
    root = Path(base) if base else Path(__file__).parent / "telemetry" / "data"
    root.mkdir(parents=True, exist_ok=True)
    return root / _FORGETS_FILE


def _read_forgets() -> dict[str, str]:
    path = _forgets_path()
    if not path.is_file():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    if not isinstance(data, dict):
        return {}
    out: dict[str, str] = {}
    for key, value in data.items():
        source = str(key).strip()
        if source not in FORGETTABLE_SOURCES:
            continue
        if not isinstance(value, str) or not value.strip():
            continue
        out[source] = value.strip()
    return out


def _write_forgets(data: dict[str, str]) -> None:
    path = _forgets_path()
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, separators=(",", ":")), encoding="utf-8")
    tmp.replace(path)


def harvest_paused(source: str) -> bool:
    """True when list-stop is active and this provider must not create tasks."""
    src = str(source).strip()
    return src in FORGETTABLE_SOURCES and src in _read_forgets()


def forget_updated_at(source: str) -> str | None:
    """Frozen timestamp of an active list-stop, if any."""
    return _read_forgets().get(str(source).strip())


def clear_source_forgets(sources: Iterable[str]) -> None:
    """Unpause harvest after the user connects that account again on desktop."""
    allowed = FORGETTABLE_SOURCES.intersection(str(s).strip() for s in sources)
    if not allowed:
        return
    data = _read_forgets()
    changed = False
    for source in allowed:
        if source in data:
            del data[source]
            changed = True
    if changed:
        _write_forgets(data)


def parse_source_forget_record(record: dict[str, Any]) -> str | None:
    """Return a forgettable source when the blob is a valid list-stop tombstone."""
    if str(record.get("collection") or "") != "tasks":
        return None
    if record.get("deleted") is not True:
        return None
    payload = record.get("payload") or {}
    if not isinstance(payload, dict):
        return None
    source = str(payload.get("forget_source") or "").strip()
    if source not in FORGETTABLE_SOURCES:
        return None
    if str(record.get("record_id") or "") != f"{SOURCE_FORGET_PREFIX}{source}":
        return None
    return source


def export_capability_marker() -> dict[str, Any]:
    """Stable row so phones know desktop can apply source_forget. Frozen timestamp."""
    path = _forgets_path().with_name(_CAPABILITY_FILE)
    existing = ""
    if path.is_file():
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                existing = str(data.get("at") or "").strip()
        except (OSError, json.JSONDecodeError):
            existing = ""
    if not existing:
        existing = datetime.now(UTC).isoformat()
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".tmp")
        tmp.write_text(json.dumps({"at": existing}, separators=(",", ":")), encoding="utf-8")
        tmp.replace(path)
    return {
        "collection": "tasks",
        "record_id": CAPABILITY_RECORD_ID,
        "payload": {"capability": "source_forget_v1"},
        "updated_at": existing,
        "deleted": False,
    }


def record_source_forgets(sources: Iterable[str]) -> None:
    """Remember sources so export can tell the phone to drop leftovers."""
    allowed = FORGETTABLE_SOURCES.intersection(str(s).strip() for s in sources)
    if not allowed:
        return
    now = datetime.now(UTC).isoformat()
    data = _read_forgets()
    changed = False
    for source in allowed:
        if source in data:
            continue
        data[source] = now
        changed = True
    if changed:
        _write_forgets(data)


def export_source_forget_markers() -> list[dict[str, Any]]:
    """Tombstone-shaped rows: phone drops leftover harvested tasks for the source."""
    out: list[dict[str, Any]] = []
    now = datetime.now(UTC).isoformat()
    for source, updated_at in _read_forgets().items():
        out.append(
            {
                "collection": "tasks",
                "record_id": f"{SOURCE_FORGET_PREFIX}{source}",
                "payload": {"forget_source": source},
                "updated_at": updated_at or now,
                "deleted": True,
            }
        )
    return out


def ensure_disconnected_source_forgets() -> None:
    """Backfill a forget marker when a source is gone and no open harvested rows remain.

    Skip brand-new profiles (no identity file) so first export is not four
    dummy task tombstones.
    """
    if not _identity_path().is_file():
        return
    identities = _read_identities()
    fingerprints = _fingerprint_identities(identities)
    seen = _seen_identity_keys(identities)
    if not seen and not fingerprints:
        # Pre-marker disconnect left an empty identity file — one-shot all keys.
        keys = set(_SOURCES_FOR_IDENTITY_KEY)
    else:
        keys = seen
    for key in keys:
        if fingerprints.get(key):
            continue
        drop = _SOURCES_FOR_IDENTITY_KEY.get(key)
        if not drop:
            continue
        if tasks_store.count_tasks_for_sources(drop, include_dismissed=False) > 0:
            continue
        record_source_forgets(drop)


def forget_tasks_for_sources(
    sources: Iterable[str],
    *,
    evict_tokens: bool = False,
) -> int:
    """Dismiss harvested tasks and mark the source forgotten for GO SYNC."""
    allowed = FORGETTABLE_SOURCES.intersection(str(s).strip() for s in sources)
    if not allowed:
        return 0
    dropped = tasks_store.clear_tasks_by_sources(allowed)
    record_source_forgets(allowed)
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
    leftovers = unknown_prior and tasks_store.count_tasks_for_sources(
        drop_sources, include_dismissed=False
    ) > 0
    if replaced or leftovers:
        dropped = tasks_store.clear_tasks_by_sources(drop_sources)
        record_source_forgets(drop_sources)
        _forget_calendar_memories(drop_sources)
        if dropped:
            logger.info("integration tasks dropped after account change count=%s", dropped)
    data[key] = fingerprint
    _write_identities(_with_seen(data, key))
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
