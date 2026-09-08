"""List-stop mail drafts without wiping SENT acks the phone needs to tombstone."""

from __future__ import annotations

import sqlite3

from mail_initiative.store import db_path


def _delete_tables(tables: tuple[str, ...]) -> int:
    removed = 0
    conn = sqlite3.connect(db_path())
    try:
        for table in tables:
            cur = conn.execute(f"DELETE FROM {table}")
            removed += cur.rowcount
        conn.commit()
    finally:
        conn.close()
    return removed


def tombstone_then_clear_mail_replies() -> int:
    """Mark every ready-reply SENT, then drop candidates. Keep action_acks."""
    from mail_initiative import action_acks, store
    from mail_initiative.pending_sync import STATUS_SENT, record_id_for

    store.list_candidates(limit=1)
    conn = sqlite3.connect(db_path())
    try:
        conn.row_factory = sqlite3.Row
        rows = conn.execute("SELECT id FROM candidates").fetchall()
    finally:
        conn.close()
    for row in rows:
        action_acks.upsert_ack(record_id_for(int(row["id"])), STATUS_SENT)
    return _delete_tables(("candidates", "dismissals", "draft_tokens", "harvest_meta"))
