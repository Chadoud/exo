"""Join a harvested ready-reply to a mail task without exposing Gmail ids."""

from __future__ import annotations

from origin_refs import parse_external_id


def reply_id_for_external_id(external_id: str | None) -> int | None:
    """Return the drafted reply id for ``gmail:mail:{message_id}``, if any."""
    parsed = parse_external_id(str(external_id or ""))
    if parsed is None or parsed.kind != "mail":
        return None
    from mail_initiative import store

    message_id = parsed.item_id
    for row in store.list_candidates(limit=20, drafted_only=True):
        last_id = str(row.get("last_message_id") or "")
        message_ids = [str(x) for x in (row.get("message_ids") or [])]
        if message_id == last_id or message_id in message_ids:
            try:
                return int(row["id"])
            except (KeyError, TypeError, ValueError):
                return None
    return None


def attach_mail_reply_ids(tasks: list[dict]) -> list[dict]:
    """Add ``mail_reply_id`` on mail tasks that have a ready draft (in place)."""
    for task in tasks:
        reply_id = reply_id_for_external_id(str(task.get("external_id") or "") or None)
        if reply_id is not None:
            task["mail_reply_id"] = reply_id
    return tasks
