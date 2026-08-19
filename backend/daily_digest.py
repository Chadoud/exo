"""
Daily briefing: what the user needs to act on today.

Uses dated tasks (calendar + to-dos), mail waiting a reply, and completed work.
Does not feed assistant chat or screen activity — those produced meta recaps
about Exo itself. When no LLM is configured we return counts, not invented prose.
"""

from __future__ import annotations

import json
import os
import sqlite3
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Generator

from digest_inputs import (
    empty_digest_body,
    fallback_digest,
    gather_digest_inputs,
    needs_workday_rebuild,
)
from llm.complete import complete


def _db_path() -> Path:
    base = os.environ.get("EXOSITES_DATA_DIR", "")
    if base:
        return Path(base) / "digests.sqlite"
    return Path(__file__).parent / "telemetry" / "data" / "digests.sqlite"


_DDL = """
CREATE TABLE IF NOT EXISTS digests (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    date        TEXT NOT NULL,
    headline    TEXT NOT NULL DEFAULT '',
    body_json   TEXT NOT NULL DEFAULT '{}',
    created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_digests_date ON digests (date);
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


_SYSTEM = (
    "You brief a busy person on THEIR work day. Output STRICT JSON only. "
    "Never mention Exo, the assistant, retries, UI preferences, or that they chatted."
)

_INSTRUCTION = """Given only the user's calendar, tasks, and mail below, return JSON:
{
  "headline": "one line about what needs them today",
  "highlights": ["meeting or due work worth seeing first", "..."],
  "decisions": ["a real work decision already made — omit if none", "..."],
  "unresolved": ["a real loose end in their work — omit product/support chat", "..."],
  "focus_tomorrow": ["next useful action from the lists below", "..."]
}
Rules:
- Use empty arrays when nothing applies. Do not invent events, tasks, or mail.
- Prefer overdue and due-today items. Skip untitled or placeholder events.
- Do not recap conversations with an app. Do not mention briefing preferences.
- Keep each string under 140 characters. No ticket IDs unless they appear in a task title.
Output JSON ONLY.

Today's work:
"""


def generate_digest() -> dict[str, Any]:
    """Build today's digest, persist it, and return it."""
    prompt_text, counts = gather_digest_inputs()
    today = datetime.now(UTC).strftime("%Y-%m-%d")

    if not prompt_text:
        return _persist(today, empty_digest_body(counts))

    raw = complete(_SYSTEM, _INSTRUCTION + prompt_text[:12000])
    if not raw:
        return _persist(today, fallback_digest(counts))

    from memory_extract import _parse_json_object

    parsed = _parse_json_object(raw)
    if not parsed:
        return _persist(today, fallback_digest(counts))

    parsed.setdefault("headline", fallback_digest(counts)["headline"])
    parsed["counts"] = counts
    parsed["llm"] = True
    return _persist(today, parsed)


def _persist(date: str, body: dict[str, Any]) -> dict[str, Any]:
    now = datetime.now(UTC).isoformat()
    headline = str(body.get("headline", ""))[:300]
    payload = json.dumps(body, ensure_ascii=False)
    with _conn() as conn:
        existing = conn.execute(
            "SELECT id FROM digests WHERE date = ? ORDER BY created_at DESC LIMIT 1",
            (date,),
        ).fetchone()
        if existing:
            digest_id = int(existing["id"])
            conn.execute(
                "UPDATE digests SET headline=?, body_json=?, created_at=? WHERE id=?",
                (headline, payload, now, digest_id),
            )
        else:
            cur = conn.execute(
                "INSERT INTO digests (date, headline, body_json, created_at) "
                "VALUES (?, ?, ?, ?) RETURNING id",
                (date, headline, payload, now),
            )
            row = cur.fetchone()
            digest_id = int(row["id"]) if row else -1
        conn.commit()
    return {"id": digest_id, "date": date, "created_at": now, **body}


def _row_to_digest(row: sqlite3.Row) -> dict[str, Any]:
    body = json.loads(row["body_json"]) if row["body_json"] else {}
    return {
        "id": int(row["id"]),
        "date": str(row["date"]),
        "created_at": str(row["created_at"]),
        **body,
    }


def latest_digest() -> dict[str, Any] | None:
    with _conn() as conn:
        row = conn.execute(
            "SELECT * FROM digests ORDER BY created_at DESC LIMIT 1"
        ).fetchone()
    return _row_to_digest(row) if row else None


def digest_for_date(date: str) -> dict[str, Any] | None:
    with _conn() as conn:
        row = conn.execute(
            "SELECT * FROM digests WHERE date = ? ORDER BY created_at DESC LIMIT 1",
            (date,),
        ).fetchone()
    return _row_to_digest(row) if row else None


def ensure_today_digest(*, use_llm: bool = True) -> dict[str, Any]:
    """Return today's digest, creating it if missing. No click required."""
    today = datetime.now(UTC).strftime("%Y-%m-%d")
    existing = digest_for_date(today)
    if existing and not needs_workday_rebuild(existing):
        return existing
    if not use_llm:
        prompt_text, counts = gather_digest_inputs()
        body = empty_digest_body(counts) if not prompt_text else fallback_digest(counts)
        return _persist(today, body)
    return generate_digest()


def list_digests(limit: int = 14) -> list[dict[str, Any]]:
    with _conn() as conn:
        rows = conn.execute(
            "SELECT id, date, headline, created_at FROM digests "
            "ORDER BY created_at DESC LIMIT ?",
            (max(1, limit),),
        ).fetchall()
    return [
        {
            "id": int(r["id"]),
            "date": str(r["date"]),
            "headline": str(r["headline"]),
            "created_at": str(r["created_at"]),
        }
        for r in rows
    ]
