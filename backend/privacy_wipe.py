"""
Wipe locally persisted user data (GDPR local erasure).

Clears assistant memory, conversations, tasks, activity, audit trail, proactive
stores, connector token cache, and opt-in telemetry on this device. Does not
revoke OAuth tokens — disconnect integrations separately if required.
"""

from __future__ import annotations

import logging
import os
import sqlite3
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)


def _data_dir() -> Path | None:
    base = os.environ.get("EXOSITES_DATA_DIR", "").strip()
    return Path(base) if base else None


def _truncate_sqlite(path: Path, tables: list[str]) -> int:
    if not path.exists():
        return 0
    removed = 0
    conn = sqlite3.connect(str(path))
    try:
        for table in tables:
            try:
                cur = conn.execute(f"DELETE FROM {table}")
                removed += cur.rowcount
            except sqlite3.Error as exc:
                logger.warning("wipe skip %s.%s: %s", path.name, table, exc)
        conn.commit()
    finally:
        conn.close()
    return removed


def _wipe_sqlite_in_data_dir(filename: str, tables: list[str]) -> tuple[str, int]:
    data_dir = _data_dir()
    if data_dir:
        path = data_dir / filename
    else:
        path = Path(__file__).resolve().parent / "telemetry" / "data" / filename
    removed = _truncate_sqlite(path, tables)
    return filename, removed


def wipe_local_user_data() -> dict[str, Any]:
    """
    Delete user-generated local stores. Safe to call while backend is running;
    SQLite deletes are best-effort per file.
    """
    from activity_store import clear_activity
    from assistant_memory import clear_all_memory
    from connector_credentials import clear_all_tokens
    from conversation_store import clear_all_conversations
    from mail_initiative.store import clear_all as clear_mail_replies
    from meeting_store import clear_all_active_meetings
    from orchestrator.audit import clear_all as clear_audit
    from orchestrator.memory import clear_all as clear_episodic_memory
    from orchestrator.skills import clear_all as clear_skills
    from tasks_store import clear_all_tasks
    from whatsapp_event_store import clear_events_for_tests as clear_whatsapp_events

    cleared: list[str] = []

    clear_all_memory()
    cleared.append("memory")

    clear_episodic_memory()
    cleared.append("episodic_memory")

    clear_skills()
    cleared.append("skills")

    clear_activity()
    cleared.append("activity")

    conv_removed = clear_all_conversations()
    cleared.append(f"conversations({conv_removed})")

    tasks_removed = clear_all_tasks()
    cleared.append(f"tasks({tasks_removed})")

    clear_audit()
    cleared.append("audit")

    clear_all_tokens()
    cleared.append("connector_tokens")

    active_meetings = clear_all_active_meetings()
    if active_meetings:
        cleared.append(f"active_meetings({active_meetings})")

    for filename, tables in (
        ("digests.sqlite", ["digests"]),
        ("nudges.sqlite", ["nudges"]),
        ("mail_replies.sqlite", ["candidates", "dismissals", "draft_tokens", "harvest_meta", "settings"]),
        ("meetings.sqlite", ["meeting_drafts"]),
    ):
        name, removed = _wipe_sqlite_in_data_dir(filename, tables)
        if removed:
            cleared.append(f"{name}({removed})")

    clear_whatsapp_events()
    cleared.append("whatsapp_events")

    mail_removed = clear_mail_replies()
    if mail_removed:
        cleared.append(f"mail_replies({mail_removed})")

    telemetry_path = Path(__file__).resolve().parent / "telemetry" / "data" / "telemetry.sqlite"
    if data_dir := _data_dir():
        alt = data_dir / "telemetry.sqlite"
        if alt.exists():
            telemetry_path = alt
    tel_removed = _truncate_sqlite(telemetry_path, ["telemetry_events", "telemetry_feedback"])
    if tel_removed:
        cleared.append(f"telemetry({tel_removed})")

    logger.info("local data wipe completed: %s", ", ".join(cleared))
    return {"ok": True, "cleared": cleared}
