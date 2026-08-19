"""Episodic long-term memory with lexical retrieval.

Complements the structured key/value store in ``assistant_memory`` (semantic
facts) with free-text *episodes* — what the agent did, what happened, and what
failed — that can be recalled by relevance for a new task.

Retrieval is deterministic **lexical** scoring (token overlap with rarity and
recency weighting). It needs no embedding model or API, so it works offline and
is fully testable; the ``recall`` interface is intentionally swappable for a
vector backend later without changing callers.
"""

from __future__ import annotations

import logging
import math
import re
import sqlite3
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

from assistant_memory import memory_db_path
from orchestrator.failure_admit import is_trash_inbox_failure, outcome_from_failure_content

logger = logging.getLogger(__name__)

KIND_EPISODE = "episode"
KIND_FAILURE = "failure"
KIND_SKILL = "skill"

_MAX_ENTRIES = 500  # oldest episodes are evicted beyond this
_TOKEN_RE = re.compile(r"[a-z0-9]+")
_STOPWORDS = frozenset({
    "the", "a", "an", "and", "or", "to", "of", "in", "on", "for", "with", "is",
    "it", "this", "that", "my", "me", "i", "you", "your", "do", "did", "was",
    "are", "be", "at", "by", "as", "from", "so", "if", "then", "what", "how",
})

_DDL = """
CREATE TABLE IF NOT EXISTS episodic_memory (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    kind       TEXT    NOT NULL,
    content    TEXT    NOT NULL,
    tags       TEXT    NOT NULL DEFAULT '',
    importance REAL    NOT NULL DEFAULT 1.0,
    created_at TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_episodic_kind ON episodic_memory (kind);
"""


@dataclass
class Memory:
    """One recalled episodic memory."""

    id: int
    kind: str
    content: str
    tags: list[str]
    importance: float
    created_at: str


def _path() -> Path:
    return memory_db_path()


def _ensure_dismissed_column(conn: sqlite3.Connection) -> None:
    cols = {str(r[1]) for r in conn.execute("PRAGMA table_info(episodic_memory)").fetchall()}
    if "dismissed" not in cols:
        conn.execute(
            "ALTER TABLE episodic_memory ADD COLUMN dismissed INTEGER NOT NULL DEFAULT 0"
        )
        conn.commit()


def _connect() -> sqlite3.Connection:
    path = _path()
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(path), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.executescript(_DDL)
    _ensure_dismissed_column(conn)
    conn.commit()
    return conn


def _tokenize(text: str) -> list[str]:
    return [t for t in _TOKEN_RE.findall((text or "").lower()) if t not in _STOPWORDS and len(t) > 1]


def _row_to_memory(row: sqlite3.Row) -> Memory:
    tags = [t for t in str(row["tags"]).split(",") if t]
    return Memory(int(row["id"]), str(row["kind"]), str(row["content"]), tags,
                  float(row["importance"]), str(row["created_at"]))


def remember(content: str, *, kind: str = KIND_EPISODE, tags: list[str] | None = None,
             importance: float = 1.0) -> None:
    """Store one episodic memory. Evicts the oldest beyond ``_MAX_ENTRIES``."""
    content = (content or "").strip()
    if not content:
        return
    tag_str = ",".join(sorted({t.strip().lower() for t in (tags or []) if t.strip()}))
    now = datetime.now(UTC).isoformat()
    try:
        conn = _connect()
        try:
            conn.execute(
                "INSERT INTO episodic_memory (kind, content, tags, importance, created_at) VALUES (?,?,?,?,?)",
                (kind, content[:4000], tag_str, float(importance), now),
            )
            conn.execute(
                """DELETE FROM episodic_memory WHERE id IN (
                       SELECT id FROM episodic_memory ORDER BY created_at DESC LIMIT -1 OFFSET ?
                   )""",
                (_MAX_ENTRIES,),
            )
            conn.commit()
        finally:
            conn.close()
    except Exception:
        logger.exception("episodic remember failed")


def _load_all() -> list[sqlite3.Row]:
    conn = _connect()
    try:
        return conn.execute(
            "SELECT id, kind, content, tags, importance, created_at FROM episodic_memory"
        ).fetchall()
    finally:
        conn.close()


def recall(query: str, *, k: int = 5, kinds: list[str] | None = None) -> list[Memory]:
    """Return up to ``k`` memories most relevant to ``query`` by lexical score.

    Scoring: sum of inverse-document-frequency weights for query tokens present in
    a memory, scaled by the memory's importance, with recency as the tiebreaker.
    """
    query_tokens = set(_tokenize(query))
    if not query_tokens:
        return []
    try:
        rows = _load_all()
    except Exception:
        logger.exception("episodic recall failed")
        return []
    if kinds:
        wanted = set(kinds)
        rows = [r for r in rows if str(r["kind"]) in wanted]
    if not rows:
        return []

    # Document frequency per token → rarer tokens carry more weight.
    doc_tokens: list[set[str]] = [set(_tokenize(str(r["content"])) + str(r["tags"]).split(",")) for r in rows]
    total_docs = len(rows)
    df: dict[str, int] = {}
    for tokens in doc_tokens:
        for tok in tokens & query_tokens:
            df[tok] = df.get(tok, 0) + 1

    scored: list[tuple[float, str, sqlite3.Row]] = []
    for row, tokens in zip(rows, doc_tokens):
        matched = tokens & query_tokens
        if not matched:
            continue
        idf = sum(math.log((total_docs + 1) / (df.get(tok, 0) + 0.5)) for tok in matched)
        score = idf * max(float(row["importance"]), 0.1)
        scored.append((score, str(row["created_at"]), row))

    scored.sort(key=lambda s: (s[0], s[1]), reverse=True)
    return [_row_to_memory(row) for _, _, row in scored[:k]]


def recent(k: int = 5, *, kinds: list[str] | None = None) -> list[Memory]:
    """Return the ``k`` most recent memories (optionally filtered by kind)."""
    try:
        conn = _connect()
        try:
            if kinds:
                placeholders = ",".join("?" * len(kinds))
                rows = conn.execute(
                    f"SELECT * FROM episodic_memory WHERE kind IN ({placeholders}) "
                    "AND dismissed = 0 ORDER BY created_at DESC LIMIT ?",
                    (*kinds, k),
                ).fetchall()
            else:
                rows = conn.execute(
                    "SELECT * FROM episodic_memory WHERE dismissed = 0 "
                    "ORDER BY created_at DESC LIMIT ?",
                    (k,),
                ).fetchall()
            return [_row_to_memory(r) for r in rows]
        finally:
            conn.close()
    except Exception:
        logger.exception("episodic recent failed")
        return []


class EpisodicAdapter:
    """Thin recall/remember surface the agent loop depends on (swappable backend)."""

    def recall(self, query: str, *, k: int = 4) -> list[str]:
        # Exclude KIND_FAILURE from planner seed — prior failure text pushed models
        # to invent alternate tools (e.g. list_invoices) instead of using the catalog.
        return [
            m.content
            for m in recall(query, k=k, kinds=[KIND_EPISODE, KIND_SKILL])
        ]

    def remember_outcome(self, goal: str, summary: str, ok: bool) -> None:
        goal = (goal or "").strip()
        summary = (summary or "").strip()
        # One open Inbox card per ask: replace prior failures for this goal, and
        # clear them entirely when the run succeeds.
        if goal:
            forget_failures_for_goal(goal)
        if ok:
            remember(
                f"Goal: {goal}\nOutcome: {summary}",
                kind=KIND_EPISODE,
                tags=_tokenize(goal)[:8],
                importance=1.0,
            )
            return
        if is_trash_inbox_failure(goal, summary):
            return
        remember(
            f"Goal: {goal}\nOutcome: {summary}",
            kind=KIND_FAILURE,
            tags=_tokenize(goal)[:8],
            importance=1.5,
        )


def default_adapter() -> EpisodicAdapter:
    return EpisodicAdapter()


def clear_all() -> None:
    """Wipe episodic memory (used by tests and a user 'forget everything')."""
    try:
        conn = _connect()
        try:
            conn.execute("DELETE FROM episodic_memory")
            conn.commit()
        finally:
            conn.close()
    except Exception:
        logger.exception("episodic clear failed")


def dismiss_failure(memory_id: int) -> bool:
    """Hide one failure from Inbox without deleting the episode."""
    try:
        conn = _connect()
        try:
            cur = conn.execute(
                "UPDATE episodic_memory SET dismissed=1 WHERE id=? AND kind=?",
                (int(memory_id), KIND_FAILURE),
            )
            conn.commit()
            return cur.rowcount > 0
        finally:
            conn.close()
    except Exception:
        logger.exception("episodic dismiss_failure failed")
        return False


def restore_failure(memory_id: int) -> bool:
    """Return a soft-dismissed failure to Inbox."""
    try:
        conn = _connect()
        try:
            cur = conn.execute(
                "UPDATE episodic_memory SET dismissed=0 WHERE id=? AND kind=?",
                (int(memory_id), KIND_FAILURE),
            )
            conn.commit()
            return cur.rowcount > 0
        finally:
            conn.close()
    except Exception:
        logger.exception("episodic restore_failure failed")
        return False


def forget(memory_id: int) -> bool:
    """Delete one episodic memory row by id. Returns True if a row was removed."""
    try:
        conn = _connect()
        try:
            cur = conn.execute("DELETE FROM episodic_memory WHERE id = ?", (int(memory_id),))
            conn.commit()
            return cur.rowcount > 0
        finally:
            conn.close()
    except Exception:
        logger.exception("episodic forget failed")
        return False


_GOAL_CONTENT_RE = re.compile(r"^Goal:\s*(.*?)(?:\nOutcome:\s*|$)", re.IGNORECASE | re.DOTALL)


def goal_from_failure_content(content: str) -> str:
    """Extract the Goal: line from a stored failure episode (or the whole string)."""
    raw = (content or "").strip()
    if not raw:
        return ""
    match = _GOAL_CONTENT_RE.match(raw)
    if match:
        return (match.group(1) or "").strip()
    return raw


def normalize_goal_key(goal: str) -> str:
    """Stable key for Inbox upsert — same ask → same open failure card."""
    return " ".join(_tokenize(goal))


def forget_failures_for_goal(goal: str) -> int:
    """Delete all KIND_FAILURE rows whose Goal matches ``goal`` (normalized)."""
    key = normalize_goal_key(goal)
    if not key:
        return 0
    removed = 0
    try:
        conn = _connect()
        try:
            rows = conn.execute(
                "SELECT id, content FROM episodic_memory WHERE kind = ?",
                (KIND_FAILURE,),
            ).fetchall()
            for row in rows:
                if normalize_goal_key(goal_from_failure_content(str(row["content"]))) == key:
                    conn.execute("DELETE FROM episodic_memory WHERE id = ?", (int(row["id"]),))
                    removed += 1
            if removed:
                conn.commit()
        finally:
            conn.close()
    except Exception:
        logger.exception("episodic forget_failures_for_goal failed")
        return 0
    return removed


def _dismiss_failures(ids: list[int]) -> None:
    if not ids:
        return
    try:
        conn = _connect()
        try:
            placeholders = ",".join("?" * len(ids))
            conn.execute(
                f"UPDATE episodic_memory SET dismissed=1 WHERE kind=? AND id IN ({placeholders})",
                (KIND_FAILURE, *ids),
            )
            conn.commit()
        finally:
            conn.close()
    except Exception:
        logger.exception("episodic dismiss trash failures failed")


def recent_open_failures(k: int = 10) -> list[Memory]:
    """Newest open failures, deduped by normalized goal (one Inbox card per ask)."""
    # Over-fetch so older duplicates of the same goal can be collapsed.
    rows = recent(max(k * 5, k), kinds=[KIND_FAILURE])
    seen: set[str] = set()
    out: list[Memory] = []
    trash_ids: list[int] = []
    for row in rows:
        goal = goal_from_failure_content(row.content)
        outcome = outcome_from_failure_content(row.content)
        if is_trash_inbox_failure(goal, outcome):
            trash_ids.append(row.id)
            continue
        key = normalize_goal_key(goal) or f"id:{row.id}"
        if key in seen:
            continue
        seen.add(key)
        out.append(row)
        if len(out) >= k:
            break
    _dismiss_failures(trash_ids)
    return out
