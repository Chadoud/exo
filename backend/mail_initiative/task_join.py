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


def task_record_ids_by_reply_id() -> dict[int, str]:
    """Map drafted reply id → task record_id. Safe for incremental task export."""
    from mail_initiative import store

    by_msg: dict[str, int] = {}
    for row in store.list_candidates(limit=20, drafted_only=True):
        try:
            cid = int(row["id"])
        except (KeyError, TypeError, ValueError):
            continue
        last_id = str(row.get("last_message_id") or "")
        if last_id:
            by_msg[last_id] = cid
        for mid in row.get("message_ids") or []:
            text = str(mid)
            if text:
                by_msg[text] = cid
    if not by_msg:
        return {}
    import tasks_store

    out: dict[int, str] = {}
    for task in tasks_store.list_tasks(include_completed=True, include_dismissed=False):
        parsed = parse_external_id(str(task.get("external_id") or "") or None)
        if parsed is None or parsed.kind != "mail":
            continue
        cid = by_msg.get(parsed.item_id)
        if cid is None:
            continue
        tid = task.get("id")
        if tid is None:
            continue
        out[cid] = str(tid)
    return out
