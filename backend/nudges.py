"""
Proactive nudges + in-app notification center.

Turns the orchestrator's bounded ``initiative.suggest()`` output, due tasks, and
detected commitments into a small, rate-limited stream of notifications the user
sees in a notification center (and, for high-signal ones, an OS toast). Strict
rate limiting keeps this from becoming spam — unlike a chat assistant we aim for
a few nudges per day, not per minute.

All side-effecting suggestions stay advisory: a nudge never executes a tool, it
only proposes. Acting on it routes back through the normal confirmation flow.
"""

from __future__ import annotations

import json
import logging
import os
import sqlite3
from contextlib import contextmanager
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any, Generator

logger = logging.getLogger(__name__)

# At most this many nudges generated within the window — the "few per day" budget.
_MAX_PER_WINDOW = 5
_WINDOW_HOURS = 24
# Don't re-create an identical (kind,title) nudge within this cooldown.
_DEDUPE_HOURS = 6


def _db_path() -> Path:
    base = os.environ.get("EXOSITES_DATA_DIR", "")
    if base:
        return Path(base) / "nudges.sqlite"
    return Path(__file__).parent / "telemetry" / "data" / "nudges.sqlite"


_DDL = """
CREATE TABLE IF NOT EXISTS nudges (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    kind        TEXT NOT NULL DEFAULT 'suggestion',
    title       TEXT NOT NULL,
    body        TEXT NOT NULL DEFAULT '',
    meta_json   TEXT NOT NULL DEFAULT '{}',
    dismissed   INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_nudges_created ON nudges (created_at);
CREATE INDEX IF NOT EXISTS idx_nudges_dismissed ON nudges (dismissed);
"""


@contextmanager
def _conn() -> Generator[sqlite3.Connection, None, None]:
    path = _db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(path), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.executescript(_DDL)
    conn.commit()
    try:
        yield conn
    finally:
        conn.close()


def _row_to_dict(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": int(row["id"]),
        "kind": str(row["kind"]),
        "title": str(row["title"]),
        "body": str(row["body"]),
        "meta": json.loads(row["meta_json"]) if row["meta_json"] else {},
        "dismissed": bool(row["dismissed"]),
        "created_at": str(row["created_at"]),
    }


def _recent_count(conn: sqlite3.Connection) -> int:
    cutoff = (datetime.now(UTC) - timedelta(hours=_WINDOW_HOURS)).isoformat()
    row = conn.execute(
        "SELECT COUNT(*) AS n FROM nudges WHERE created_at >= ?", (cutoff,)
    ).fetchone()
    return int(row["n"]) if row else 0


def _is_duplicate(conn: sqlite3.Connection, kind: str, title: str) -> bool:
    cutoff = (datetime.now(UTC) - timedelta(hours=_DEDUPE_HOURS)).isoformat()
    row = conn.execute(
        "SELECT 1 FROM nudges WHERE kind=? AND title=? AND created_at >= ? LIMIT 1",
        (kind, title, cutoff),
    ).fetchone()
    return row is not None


def _add(
    conn: sqlite3.Connection,
    kind: str,
    title: str,
    body: str,
    meta: dict[str, Any],
) -> dict[str, Any] | None:
    if _is_duplicate(conn, kind, title):
        return None
    now = datetime.now(UTC).isoformat()
    cur = conn.execute(
        "INSERT INTO nudges (kind, title, body, meta_json, created_at) "
        "VALUES (?, ?, ?, ?, ?) RETURNING *",
        (kind, title[:200], body[:600], json.dumps(meta, ensure_ascii=False), now),
    )
    return _row_to_dict(cur.fetchone())


def _due_task_candidates() -> list[tuple[str, str, str, dict[str, Any]]]:
    """(kind, title, body, meta) for tasks due within the next 24h."""
    import tasks_store

    soon = (datetime.now(UTC) + timedelta(hours=24)).isoformat()
    due = tasks_store.list_tasks(only_due_before=soon)
    out = []
    for t in due[:3]:
        out.append((
            "task_due",
            f"Task due soon: {t['description'][:80]}",
            f"Due {t['due_at']}." if t["due_at"] else "Due soon.",
            {"task_id": t["id"]},
        ))
    return out


def _suggestion_candidates() -> list[tuple[str, str, str, dict[str, Any]]]:
    try:
        from orchestrator.initiative import suggest

        out = []
        for s in suggest(max_suggestions=3):
            meta: dict[str, Any] = {
                "tool": s.tool,
                "requires_confirmation": s.requires_confirmation,
            }
            if "failed" in s.title.lower():
                meta["suggestion_kind"] = "orchestrator_failure"
            out.append((
                "suggestion",
                s.title,
                s.rationale,
                meta,
            ))
        return out
    except Exception:
        logger.debug("suggestion candidates failed", exc_info=True)
        return []


def generate_nudges() -> list[dict[str, Any]]:
    """Generate new nudges within the rate budget; returns the ones created now."""
    created: list[dict[str, Any]] = []
    candidates = _due_task_candidates() + _suggestion_candidates()
    if not candidates:
        return []
    with _conn() as conn:
        budget = _MAX_PER_WINDOW - _recent_count(conn)
        if budget <= 0:
            return []
        for kind, title, body, meta in candidates:
            if len(created) >= budget:
                break
            added = _add(conn, kind, title, body, meta)
            if added is not None:
                created.append(added)
        conn.commit()
    return created


def list_nudges(*, include_dismissed: bool = False, limit: int = 50) -> list[dict[str, Any]]:
    clause = "" if include_dismissed else "WHERE dismissed = 0"
    with _conn() as conn:
        rows = conn.execute(
            f"SELECT * FROM nudges {clause} ORDER BY created_at DESC LIMIT ?",
            (max(1, limit),),
        ).fetchall()
    return [_row_to_dict(r) for r in rows]


def dismiss_nudge(nudge_id: int) -> bool:
    with _conn() as conn:
        cur = conn.execute("UPDATE nudges SET dismissed=1 WHERE id=?", (nudge_id,))
        conn.commit()
        return cur.rowcount > 0


def restore_nudge(nudge_id: int) -> bool:
    with _conn() as conn:
        cur = conn.execute("UPDATE nudges SET dismissed=0 WHERE id=?", (nudge_id,))
        conn.commit()
        return cur.rowcount > 0


def dismiss_all() -> list[int]:
    with _conn() as conn:
        rows = conn.execute("SELECT id FROM nudges WHERE dismissed=0").fetchall()
        ids = [int(r["id"]) for r in rows]
        if ids:
            conn.execute("UPDATE nudges SET dismissed=1 WHERE dismissed=0")
            conn.commit()
        return ids
