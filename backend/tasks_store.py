"""
Persistent task / action-item store backed by SQLite.

Mirrors the structure of ``assistant_memory`` (same data dir, contextmanaged
connections, row factory). Tasks are the "things to do" half of the second-brain
loop: created manually, by chat/voice tools, or auto-extracted from conversations
and meetings. Due dates feed OS reminder notifications.
"""

from __future__ import annotations

import logging
import os
import sqlite3
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Generator

logger = logging.getLogger(__name__)

VALID_PRIORITIES = frozenset({"low", "normal", "high"})
MAX_TASKS = 5000
_MAIL_SOURCES = frozenset({"gmail", "outlook"})
# Typed / conversation tasks must survive a mailbox switch.
_PROTECTED_SOURCES = frozenset(
    {"manual", "conversation", "meeting", "assistant", "chat", "auto"}
)


def _task_passes_signal_gate(description: str, source: str) -> bool:
    """Drop promotional mail-derived tasks from lists and creation."""
    from signal_quality import mail_task_allowed

    if source not in _MAIL_SOURCES:
        return True
    return mail_task_allowed(description)


def _db_path() -> Path:
    base = os.environ.get("EXOSITES_DATA_DIR", "")
    if base:
        return Path(base) / "tasks.sqlite"
    return Path(__file__).parent / "telemetry" / "data" / "tasks.sqlite"


def tasks_db_path() -> Path:
    """Public accessor for the tasks database path."""
    return _db_path()


_DDL = """
CREATE TABLE IF NOT EXISTS tasks (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    description          TEXT    NOT NULL,
    due_at               TEXT    DEFAULT NULL,
    priority             TEXT    NOT NULL DEFAULT 'normal',
    completed            INTEGER NOT NULL DEFAULT 0,
    completed_at         TEXT    DEFAULT NULL,
    source               TEXT    NOT NULL DEFAULT 'manual',
    source_conversation_id TEXT  DEFAULT NULL,
    external_id          TEXT    DEFAULT NULL,
    created_at           TEXT    NOT NULL,
    updated_at           TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tasks_completed ON tasks (completed);
CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks (due_at);
"""


def _migrate_schema(conn: sqlite3.Connection) -> None:
    """Add columns introduced after the initial tasks table."""
    cols = {row[1] for row in conn.execute("PRAGMA table_info(tasks)").fetchall()}
    if "external_id" not in cols:
        conn.execute("ALTER TABLE tasks ADD COLUMN external_id TEXT DEFAULT NULL")
    if "source_url" not in cols:
        conn.execute("ALTER TABLE tasks ADD COLUMN source_url TEXT DEFAULT NULL")
    if "dismissed" not in cols:
        conn.execute("ALTER TABLE tasks ADD COLUMN dismissed INTEGER NOT NULL DEFAULT 0")
    if "dismissed_at" not in cols:
        conn.execute("ALTER TABLE tasks ADD COLUMN dismissed_at TEXT DEFAULT NULL")
    conn.commit()
    conn.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_external_unique "
        "ON tasks (external_id) WHERE external_id IS NOT NULL"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_tasks_dismissed ON tasks (dismissed)"
    )
    conn.commit()


def _connect() -> sqlite3.Connection:
    path = _db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(path), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.executescript(_DDL)
    _migrate_schema(conn)
    return conn


@contextmanager
def _conn() -> Generator[sqlite3.Connection, None, None]:
    conn = _connect()
    try:
        yield conn
    finally:
        conn.close()


def _row_to_dict(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": int(row["id"]),
        "description": str(row["description"]),
        "due_at": row["due_at"],
        "priority": str(row["priority"]),
        "completed": bool(row["completed"]),
        "completed_at": row["completed_at"],
        "source": str(row["source"]),
        "source_conversation_id": row["source_conversation_id"],
        "external_id": row["external_id"],
        "source_url": row["source_url"],
        "dismissed": bool(row["dismissed"]) if "dismissed" in row.keys() else False,
        "dismissed_at": row["dismissed_at"] if "dismissed_at" in row.keys() else None,
        "created_at": str(row["created_at"]),
        "updated_at": str(row["updated_at"]),
    }


def create_task(
    description: str,
    *,
    due_at: str | None = None,
    priority: str = "normal",
    source: str = "manual",
    source_conversation_id: str | None = None,
    external_id: str | None = None,
    source_url: str | None = None,
) -> dict[str, Any]:
    """Insert a task and return the created row."""
    desc = (description or "").strip()
    if not desc:
        raise ValueError("Task description is required")
    if not _task_passes_signal_gate(desc, source):
        raise ValueError("task_rejected:promotional")
    if priority not in VALID_PRIORITIES:
        priority = "normal"
    if external_id:
        existing = get_task_by_external_id(external_id)
        if existing:
            return existing
    now = datetime.now(UTC).isoformat()
    try:
        with _conn() as conn:
            cur = conn.execute(
                """
                INSERT INTO tasks
                    (description, due_at, priority, source, source_conversation_id,
                     external_id, source_url, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                RETURNING *
                """,
                (
                    desc,
                    due_at,
                    priority,
                    source,
                    source_conversation_id,
                    external_id,
                    source_url,
                    now,
                    now,
                ),
            )
            row = cur.fetchone()
            conn.commit()
            return _row_to_dict(row)
    except sqlite3.IntegrityError:
        if external_id:
            existing = get_task_by_external_id(external_id)
            if existing:
                return existing
        raise


def get_task_by_external_id(external_id: str) -> dict[str, Any] | None:
    ext = (external_id or "").strip()
    if not ext:
        return None
    with _conn() as conn:
        row = conn.execute(
            "SELECT * FROM tasks WHERE external_id=? LIMIT 1",
            (ext,),
        ).fetchone()
    return _row_to_dict(row) if row else None


def list_tasks(
    *,
    include_completed: bool = True,
    only_due_before: str | None = None,
    exclude_manual: bool = False,
    map_eligible: bool = False,
    include_dismissed: bool = False,
) -> list[dict[str, Any]]:
    """List tasks newest-first; incomplete before completed.

    ``only_due_before`` (ISO string) filters to incomplete tasks with a due date
    at or before the given instant — used by the reminder scheduler.
    Dismissed rows stay hidden unless ``include_dismissed`` (GO SYNC export).
    """
    clauses: list[str] = []
    params: list[Any] = []
    if not include_dismissed:
        clauses.append("dismissed = 0")
    if not include_completed:
        clauses.append("completed = 0")
    if exclude_manual:
        clauses.append("source != 'manual'")
    if only_due_before:
        clauses.append("completed = 0 AND due_at IS NOT NULL AND due_at <= ?")
        params.append(only_due_before)
    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    with _conn() as conn:
        rows = conn.execute(
            f"SELECT * FROM tasks {where} "
            "ORDER BY completed ASC, "
            "CASE WHEN due_at IS NULL THEN 1 ELSE 0 END ASC, "
            "due_at ASC, created_at DESC",
            params,
        ).fetchall()
    return [
        _row_to_dict(row)
        for row in rows
        if _task_passes_signal_gate(str(row["description"]), str(row["source"]))
        and (
            not map_eligible
            or _task_map_eligible(str(row["description"]), str(row["source"]))
        )
    ]


def _task_map_eligible(description: str, source: str) -> bool:
    from signal_quality import task_map_eligible

    return task_map_eligible(description, source)


def get_task(task_id: int) -> dict[str, Any] | None:
    with _conn() as conn:
        row = conn.execute("SELECT * FROM tasks WHERE id=?", (task_id,)).fetchone()
    return _row_to_dict(row) if row else None


def update_task(task_id: int, **fields: Any) -> dict[str, Any] | None:
    """Patch mutable fields (description, due_at, priority) and return the row."""
    allowed = {"description", "due_at", "priority"}
    updates = {k: v for k, v in fields.items() if k in allowed and v is not None}
    if "priority" in updates and updates["priority"] not in VALID_PRIORITIES:
        updates["priority"] = "normal"
    if not updates:
        return get_task(task_id)
    if "description" in updates:
        existing = get_task(task_id)
        if not existing:
            return None
        if not _task_passes_signal_gate(str(updates["description"]), str(existing["source"])):
            raise ValueError("task_rejected:promotional")
    updates["updated_at"] = datetime.now(UTC).isoformat()
    set_clause = ", ".join(f"{k}=?" for k in updates)
    with _conn() as conn:
        conn.execute(
            f"UPDATE tasks SET {set_clause} WHERE id=?",
            (*updates.values(), task_id),
        )
        conn.commit()
    return get_task(task_id)


def set_task_source_url(task_id: int, source_url: str | None) -> dict[str, Any] | None:
    """Persist a refreshed provider link for a synced task."""
    now = datetime.now(UTC).isoformat()
    with _conn() as conn:
        conn.execute(
            "UPDATE tasks SET source_url=?, updated_at=? WHERE id=?",
            (source_url, now, task_id),
        )
        conn.commit()
    return get_task(task_id)


def set_completed(task_id: int, completed: bool = True) -> dict[str, Any] | None:
    now = datetime.now(UTC).isoformat()
    with _conn() as conn:
        conn.execute(
            "UPDATE tasks SET completed=?, completed_at=?, updated_at=? WHERE id=?",
            (1 if completed else 0, now if completed else None, now, task_id),
        )
        conn.commit()
    return get_task(task_id)


def delete_task(task_id: int) -> bool:
    """Remove from lists without forgetting the source.

    Soft-dismiss keeps ``external_id`` so calendar/mail sync cannot recreate
    a "Prepare for…" item the user already said is not a to-do.
    """
    now = datetime.now(UTC).isoformat()
    with _conn() as conn:
        cur = conn.execute(
            "UPDATE tasks SET dismissed=1, dismissed_at=?, updated_at=? "
            "WHERE id=? AND dismissed=0",
            (now, now, task_id),
        )
        conn.commit()
        return cur.rowcount > 0


def restore_task(task_id: int) -> dict[str, Any] | None:
    """Bring a soft-dismissed task back onto the list."""
    now = datetime.now(UTC).isoformat()
    with _conn() as conn:
        cur = conn.execute(
            "UPDATE tasks SET dismissed=0, dismissed_at=NULL, updated_at=? "
            "WHERE id=? AND dismissed=1",
            (now, task_id),
        )
        conn.commit()
        if cur.rowcount <= 0:
            return None
    return get_task(task_id)


def purge_task(task_id: int) -> bool:
    """Hard-delete so the same ``external_id`` can be ingested again."""
    with _conn() as conn:
        cur = conn.execute("DELETE FROM tasks WHERE id=?", (task_id,))
        conn.commit()
        return cur.rowcount > 0


def clear_all_tasks() -> int:
    """Remove every stored task (local erasure)."""
    with _conn() as conn:
        cur = conn.execute("DELETE FROM tasks")
        conn.commit()
        return cur.rowcount


def count_tasks_for_sources(sources: set[str]) -> int:
    """Count harvested rows for sources, including completed and dismissed."""
    wanted = {str(s).strip() for s in sources if str(s).strip()}
    if not wanted:
        return 0
    placeholders = ",".join("?" * len(wanted))
    with _conn() as conn:
        row = conn.execute(
            f"SELECT COUNT(*) AS n FROM tasks WHERE source IN ({placeholders})",
            tuple(wanted),
        ).fetchone()
    return int(row["n"]) if row else 0


def clear_tasks_by_sources(sources: set[str]) -> int:
    """Hard-delete harvested rows for the given sources. Refuses typed tasks."""
    wanted = {str(s).strip() for s in sources if str(s).strip()}
    if not wanted:
        return 0
    blocked = wanted & _PROTECTED_SOURCES
    if blocked:
        raise ValueError("refusing to clear protected task sources")
    placeholders = ",".join("?" * len(wanted))
    with _conn() as conn:
        cur = conn.execute(
            f"DELETE FROM tasks WHERE source IN ({placeholders})",
            tuple(wanted),
        )
        conn.commit()
        return int(cur.rowcount)


def task_exists(description: str) -> bool:
    """Case-insensitive dedupe check used by the extraction pipeline."""
    norm = (description or "").strip().lower()
    if not norm:
        return False
    with _conn() as conn:
        row = conn.execute(
            "SELECT 1 FROM tasks WHERE LOWER(TRIM(description))=? AND completed=0 "
            "AND dismissed=0 LIMIT 1",
            (norm,),
        ).fetchone()
        return row is not None


def cleanup_noise_tasks(*, dry_run: bool = False) -> dict[str, Any]:
    """Delete incomplete mail-sourced tasks that look promotional or non-actionable."""
    from signal_quality import SignalTier, evaluate_text, task_map_eligible

    with _conn() as conn:
        rows = conn.execute(
            "SELECT id, description, source FROM tasks WHERE completed = 0 AND dismissed = 0"
        ).fetchall()

    candidates: list[int] = []
    for row in rows:
        source = str(row["source"])
        desc = str(row["description"])
        if source in _MAIL_SOURCES:
            if evaluate_text(desc).tier != SignalTier.ALLOW or not task_map_eligible(desc, source):
                candidates.append(int(row["id"]))
            continue
        if not task_map_eligible(desc, source):
            candidates.append(int(row["id"]))

    if dry_run:
        return {"ok": True, "candidates": len(candidates), "ids": candidates[:50]}

    removed = sum(1 for task_id in candidates if delete_task(task_id))
    return {"ok": True, "candidates": len(candidates), "removed": removed}
