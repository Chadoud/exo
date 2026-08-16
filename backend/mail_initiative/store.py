"""Local sqlite for Gmail ready-reply candidates, dismissals, and draft tokens."""

from __future__ import annotations

import json
import os
import sqlite3
from contextlib import contextmanager
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any, Generator

_DB_NAME = "mail_replies.sqlite"
_ACCOUNT = "google-gmail"

_DDL = """
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS candidates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id TEXT NOT NULL DEFAULT 'google-gmail',
    thread_id TEXT NOT NULL,
    message_ids_json TEXT NOT NULL DEFAULT '[]',
    last_message_id TEXT NOT NULL DEFAULT '',
    from_name TEXT NOT NULL DEFAULT '',
    from_email TEXT NOT NULL DEFAULT '',
    subject TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    UNIQUE(account_id, thread_id)
);
CREATE TABLE IF NOT EXISTS dismissals (
    thread_id TEXT PRIMARY KEY,
    dismissed_until TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS draft_tokens (
    token TEXT PRIMARY KEY,
    candidate_id INTEGER NOT NULL,
    thread_id TEXT NOT NULL,
    in_reply_to TEXT NOT NULL DEFAULT '',
    references_hdr TEXT NOT NULL DEFAULT '',
    to_email TEXT NOT NULL,
    to_name TEXT NOT NULL DEFAULT '',
    last_message_id TEXT NOT NULL DEFAULT '',
    message_ids_json TEXT NOT NULL DEFAULT '[]',
    expires_at TEXT NOT NULL,
    used INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS harvest_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
"""


def _db_path() -> Path:
    base = os.environ.get("EXOSITES_DATA_DIR", "").strip()
    if base:
        return Path(base) / _DB_NAME
    return Path(__file__).resolve().parent.parent / "telemetry" / "data" / _DB_NAME


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


def _now() -> datetime:
    return datetime.now(UTC)


def get_setting(key: str) -> str | None:
    with _conn() as conn:
        row = conn.execute("SELECT value FROM settings WHERE key=?", (key,)).fetchone()
    return str(row["value"]) if row else None


def set_setting(key: str, value: str) -> None:
    with _conn() as conn:
        conn.execute(
            "INSERT INTO settings (key, value) VALUES (?, ?) "
            "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            (key, value),
        )
        conn.commit()


def last_harvest_at() -> datetime | None:
    raw = None
    with _conn() as conn:
        row = conn.execute(
            "SELECT value FROM harvest_meta WHERE key='last_harvest_at'"
        ).fetchone()
        if row:
            raw = str(row["value"])
    if not raw:
        return None
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return None


def set_last_harvest_at(when: datetime | None = None) -> None:
    stamp = (when or _now()).isoformat()
    with _conn() as conn:
        conn.execute(
            "INSERT INTO harvest_meta (key, value) VALUES ('last_harvest_at', ?) "
            "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            (stamp,),
        )
        conn.commit()


def is_dismissed(thread_id: str, *, now: datetime | None = None) -> bool:
    now = now or _now()
    with _conn() as conn:
        row = conn.execute(
            "SELECT dismissed_until FROM dismissals WHERE thread_id=?",
            (thread_id,),
        ).fetchone()
    if not row:
        return False
    try:
        until = datetime.fromisoformat(str(row["dismissed_until"]).replace("Z", "+00:00"))
    except ValueError:
        return False
    return until > now


def dismiss_thread(thread_id: str, *, days: int = 14) -> None:
    until = (_now() + timedelta(days=days)).isoformat()
    with _conn() as conn:
        conn.execute(
            "INSERT INTO dismissals (thread_id, dismissed_until) VALUES (?, ?) "
            "ON CONFLICT(thread_id) DO UPDATE SET dismissed_until=excluded.dismissed_until",
            (thread_id, until),
        )
        conn.commit()


def _candidate_from_row(row: sqlite3.Row) -> dict[str, Any]:
    ids = json.loads(row["message_ids_json"] or "[]")
    return {
        "id": int(row["id"]),
        "account_id": str(row["account_id"]),
        "thread_id": str(row["thread_id"]),
        "message_ids": [str(x) for x in ids] if isinstance(ids, list) else [],
        "last_message_id": str(row["last_message_id"] or ""),
        "from_name": str(row["from_name"] or ""),
        "from_email": str(row["from_email"] or ""),
        "subject": str(row["subject"] or ""),
        "created_at": str(row["created_at"]),
    }


def list_candidates(*, limit: int = 3) -> list[dict[str, Any]]:
    now = _now()
    with _conn() as conn:
        rows = conn.execute(
            "SELECT * FROM candidates WHERE account_id=? ORDER BY created_at DESC",
            (_ACCOUNT,),
        ).fetchall()
    out: list[dict[str, Any]] = []
    for row in rows:
        if is_dismissed(str(row["thread_id"]), now=now):
            continue
        out.append(_candidate_from_row(row))
        if len(out) >= limit:
            break
    return out


def get_candidate(candidate_id: int) -> dict[str, Any] | None:
    with _conn() as conn:
        row = conn.execute("SELECT * FROM candidates WHERE id=?", (candidate_id,)).fetchone()
    if not row:
        return None
    if is_dismissed(str(row["thread_id"])):
        return None
    return _candidate_from_row(row)


def upsert_candidate(
    *,
    thread_id: str,
    message_ids: list[str],
    last_message_id: str,
    from_name: str,
    from_email: str,
    subject: str,
) -> dict[str, Any]:
    now = _now().isoformat()
    payload = json.dumps(message_ids, ensure_ascii=False)
    with _conn() as conn:
        conn.execute(
            "INSERT INTO candidates "
            "(account_id, thread_id, message_ids_json, last_message_id, "
            "from_name, from_email, subject, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?) "
            "ON CONFLICT(account_id, thread_id) DO UPDATE SET "
            "message_ids_json=excluded.message_ids_json, "
            "last_message_id=excluded.last_message_id, "
            "from_name=excluded.from_name, "
            "from_email=excluded.from_email, "
            "subject=excluded.subject",
            (
                _ACCOUNT,
                thread_id,
                payload,
                last_message_id,
                from_name[:200],
                from_email[:320],
                subject[:200],
                now,
            ),
        )
        conn.commit()
        row = conn.execute(
            "SELECT * FROM candidates WHERE account_id=? AND thread_id=?",
            (_ACCOUNT, thread_id),
        ).fetchone()
    assert row is not None
    return _candidate_from_row(row)


def live_draft_thread_ids(*, now: datetime | None = None) -> set[str]:
    now = now or _now()
    stamp = now.isoformat()
    with _conn() as conn:
        rows = conn.execute(
            "SELECT thread_id FROM draft_tokens "
            "WHERE used=0 AND expires_at > ?",
            (stamp,),
        ).fetchall()
    return {str(r["thread_id"]) for r in rows}


def replace_candidates(keep: list[dict[str, Any]]) -> None:
    """Replace stored cards, keeping any thread that still has a live draft token."""
    protected = live_draft_thread_ids()
    keep_threads = {str(c["thread_id"]) for c in keep} | protected
    with _conn() as conn:
        rows = conn.execute(
            "SELECT id, thread_id FROM candidates WHERE account_id=?",
            (_ACCOUNT,),
        ).fetchall()
        for row in rows:
            if str(row["thread_id"]) not in keep_threads:
                conn.execute("DELETE FROM candidates WHERE id=?", (int(row["id"]),))
        conn.commit()
    for item in keep:
        upsert_candidate(
            thread_id=str(item["thread_id"]),
            message_ids=list(item.get("message_ids") or []),
            last_message_id=str(item.get("last_message_id") or ""),
            from_name=str(item.get("from_name") or ""),
            from_email=str(item.get("from_email") or ""),
            subject=str(item.get("subject") or ""),
        )


def delete_candidate(candidate_id: int) -> None:
    with _conn() as conn:
        conn.execute("DELETE FROM candidates WHERE id=?", (candidate_id,))
        conn.commit()


def save_draft_token(
    *,
    token: str,
    candidate_id: int,
    thread_id: str,
    in_reply_to: str,
    references_hdr: str,
    to_email: str,
    to_name: str,
    last_message_id: str,
    message_ids: list[str],
    ttl_minutes: int = 15,
) -> None:
    expires = (_now() + timedelta(minutes=ttl_minutes)).isoformat()
    with _conn() as conn:
        conn.execute("DELETE FROM draft_tokens WHERE candidate_id=?", (candidate_id,))
        conn.execute(
            "INSERT INTO draft_tokens "
            "(token, candidate_id, thread_id, in_reply_to, references_hdr, "
            "to_email, to_name, last_message_id, message_ids_json, expires_at, used) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)",
            (
                token,
                candidate_id,
                thread_id,
                in_reply_to,
                references_hdr,
                to_email,
                to_name,
                last_message_id,
                json.dumps(message_ids, ensure_ascii=False),
                expires,
            ),
        )
        conn.commit()


def get_draft_token(token: str) -> dict[str, Any] | None:
    with _conn() as conn:
        row = conn.execute("SELECT * FROM draft_tokens WHERE token=?", (token,)).fetchone()
    if not row:
        return None
    ids = json.loads(row["message_ids_json"] or "[]")
    return {
        "token": str(row["token"]),
        "candidate_id": int(row["candidate_id"]),
        "thread_id": str(row["thread_id"]),
        "in_reply_to": str(row["in_reply_to"] or ""),
        "references_hdr": str(row["references_hdr"] or ""),
        "to_email": str(row["to_email"]),
        "to_name": str(row["to_name"] or ""),
        "last_message_id": str(row["last_message_id"] or ""),
        "message_ids": [str(x) for x in ids] if isinstance(ids, list) else [],
        "expires_at": str(row["expires_at"]),
        "used": bool(row["used"]),
    }


def mark_token_used(token: str) -> None:
    with _conn() as conn:
        conn.execute("UPDATE draft_tokens SET used=1 WHERE token=?", (token,))
        conn.commit()


def revoke_tokens_for_candidate(candidate_id: int) -> None:
    with _conn() as conn:
        conn.execute("DELETE FROM draft_tokens WHERE candidate_id=?", (candidate_id,))
        conn.commit()


def clear_all() -> int:
    """Wipe every mail-reply table (privacy wipe / Gmail disconnect)."""
    removed = 0
    with _conn() as conn:
        for table in ("candidates", "dismissals", "draft_tokens", "harvest_meta", "settings"):
            cur = conn.execute(f"DELETE FROM {table}")
            removed += cur.rowcount
        conn.commit()
    return removed
