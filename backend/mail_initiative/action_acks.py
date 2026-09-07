"""Desktop-local ack rows for mobile pending_actions (never stores draft_token)."""

from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from datetime import UTC, datetime
from typing import Any, Generator

from mail_initiative import store

_DDL = """
CREATE TABLE IF NOT EXISTS action_acks (
    record_id TEXT PRIMARY KEY,
    status TEXT NOT NULL,
    error_class TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL
);
"""


@contextmanager
def _conn() -> Generator[sqlite3.Connection, None, None]:
    path = store.db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(path), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.executescript(_DDL)
    conn.commit()
    try:
        yield conn
    finally:
        conn.close()


def upsert_ack(record_id: str, status: str, *, error_class: str = "") -> None:
    now = datetime.now(UTC).isoformat()
    with _conn() as conn:
        conn.execute(
            "INSERT INTO action_acks (record_id, status, error_class, updated_at) "
            "VALUES (?, ?, ?, ?) "
            "ON CONFLICT(record_id) DO UPDATE SET "
            "status=excluded.status, error_class=excluded.error_class, "
            "updated_at=excluded.updated_at",
            (record_id, status, error_class, now),
        )
        conn.commit()


def get_ack(record_id: str) -> dict[str, Any] | None:
    with _conn() as conn:
        row = conn.execute(
            "SELECT * FROM action_acks WHERE record_id=?",
            (record_id,),
        ).fetchone()
    if not row:
        return None
    return {
        "record_id": str(row["record_id"]),
        "status": str(row["status"]),
        "error_class": str(row["error_class"] or ""),
        "updated_at": str(row["updated_at"]),
    }


def list_acks() -> list[dict[str, Any]]:
    with _conn() as conn:
        rows = conn.execute("SELECT * FROM action_acks").fetchall()
    return [
        {
            "record_id": str(row["record_id"]),
            "status": str(row["status"]),
            "error_class": str(row["error_class"] or ""),
            "updated_at": str(row["updated_at"]),
        }
        for row in rows
    ]
