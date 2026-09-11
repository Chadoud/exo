"""
Google Workspace connector — Gmail, Google Drive, and Google Calendar.

All operations use the OAuth access token stored in connector_credentials.
The same Google token covers all three services when the right scopes were
granted during the OAuth connect flow.

Operations:
  Gmail:    search_mail, send_mail, list_labels, move_mail, resolve_recipient,
            read_mail_attachment
  Drive:    list_files, search_files, move_file, create_folder, get_file_metadata
  Calendar: list_events, create_event, update_event, delete_event
"""

from __future__ import annotations

import base64
import email.mime.text
import email.utils
import json
import logging
import os
import tempfile
from typing import Any, Iterator

import httpx

from actions.contact_matching import Candidate, rank_candidates, tokenize_name
from connector_credentials import CredentialUnavailableError, try_get_token

logger = logging.getLogger(__name__)

_GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me"
_DRIVE_BASE = "https://www.googleapis.com/drive/v3"
_CALENDAR_BASE = "https://www.googleapis.com/calendar/v3"

# Each Google service has its own OAuth grant with distinct scopes.
# Prefer the service-specific token so we never call Calendar with a Drive-scoped
# token (or vice-versa).  Fallback to the generic "google" slot covers accounts
# that used a single "all-in-one" Google OAuth grant.
_GMAIL_TOKEN_IDS = ("google-gmail", "google")
_DRIVE_TOKEN_IDS = ("google-drive", "google")
_CAL_TOKEN_IDS = ("google-calendar", "google")


def _gmail_headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {try_get_token(*_GMAIL_TOKEN_IDS)}"}


def _drive_headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {try_get_token(*_DRIVE_TOKEN_IDS)}"}


def _calendar_headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {try_get_token(*_CAL_TOKEN_IDS)}"}


# ── Gmail ─────────────────────────────────────────────────────────────────────

def _gmail_search(params: dict[str, Any]) -> dict[str, Any]:
    """
    Search Gmail messages.

    Args:
        query: Gmail search query (e.g. "from:alice subject:invoice newer_than:7d").
        max_results: Maximum number of messages to return (default 20, max 50).
    """
    query = str(params.get("query", "")).strip()
    max_results = min(int(params.get("max_results", 20)), 50)

    list_res = httpx.get(
        f"{_GMAIL_BASE}/messages",
        headers=_gmail_headers(),
        params={"q": query, "maxResults": max_results},
        timeout=15,
    )
    list_res.raise_for_status()
    messages_meta = list_res.json().get("messages", [])

    results = []
    for meta in messages_meta[:max_results]:
        msg_res = httpx.get(
            f"{_GMAIL_BASE}/messages/{meta['id']}",
            headers=_gmail_headers(),
            params={
                "format": "metadata",
                "metadataHeaders": [
                    "Subject",
                    "From",
                    "Date",
                    "List-Unsubscribe",
                    "List-Id",
                    "Precedence",
                ],
            },
            timeout=10,
        )
        if msg_res.status_code != 200:
            continue
        msg = msg_res.json()
        headers_list = msg.get("payload", {}).get("headers", [])
        header_map = {h["name"]: h["value"] for h in headers_list}
        results.append({
            "id": msg["id"],
            "subject": header_map.get("Subject", "(no subject)"),
            "from": header_map.get("From", ""),
            "date": header_map.get("Date", ""),
            "snippet": msg.get("snippet", ""),
            "labelIds": msg.get("labelIds") or [],
            "headers": header_map,
        })

    return {"ok": True, "data": {"messages": results, "count": len(results)}}


# Recipient aliases that mean "send it to the account owner" — resolved to the
# authenticated user's own address so the assistant never has to ask for it.
_SELF_RECIPIENT_ALIASES = frozenset({
    "me", "myself", "self", "my email", "my e-mail", "my address", "my mail",
    "moi", "moi-même", "mon email", "mon e-mail", "mon adresse", "mon mail",
    "mich", "ich", "mir", "mi", "io", "me stesso",
})


def _gmail_self_email() -> str:
    """Return the authenticated user's own Gmail address via the profile endpoint."""
    res = httpx.get(f"{_GMAIL_BASE}/profile", headers=_gmail_headers(), timeout=10)
    res.raise_for_status()
    return str(res.json().get("emailAddress", "")).strip()


# Bound the harvest so a name lookup stays well within the voice tool timeout:
# one header fetch per message, capped at this many unique messages.
_MAX_HARVEST_MESSAGES = 40
_HARVEST_HEADERS = ("From", "To", "Cc")


def _gmail_list_message_ids(query: str, max_results: int) -> list[str]:
    """Return Gmail message IDs matching ``query`` (best-effort, never raises)."""
    try:
        res = httpx.get(
            f"{_GMAIL_BASE}/messages",
            headers=_gmail_headers(),
            params={"q": query, "maxResults": max_results},
            timeout=10,
        )
        res.raise_for_status()
    except httpx.HTTPError:
        return []
    return [m["id"] for m in res.json().get("messages", []) if m.get("id")]


def _accumulate_addresses(header_value: str, into: dict[str, Candidate]) -> None:
    """Parse an RFC-2822 address header and merge each contact into ``into``."""
    for display, addr in email.utils.getaddresses([header_value or ""]):
        addr = addr.strip().lower()
        if "@" not in addr:
            continue
        display = display.strip()
        existing = into.get(addr)
        if existing is None:
            into[addr] = Candidate(name=display, email=addr, frequency=1)
        else:
            # Keep the most informative display name and bump correspondence count.
            best_name = display if len(display) > len(existing.name) else existing.name
            into[addr] = Candidate(
                name=best_name, email=addr, frequency=existing.frequency + 1
            )


def _harvest_gmail_contacts(name: str) -> list[Candidate]:
    """
    Build a candidate-contact list from the mailbox for fuzzy name resolution.

    Searches on each spoken token (matches names whose other tokens are spelled
    correctly, e.g. a shared surname) plus the raw phrase, then reads the
    From/To/Cc headers of the matched messages. Sent and received mail both count
    so recipients the user writes to are discoverable even with no reply.
    """
    tokens = tokenize_name(name)
    queries: list[str] = []
    for tok in tokens:
        queries.append(f"from:{tok} OR to:{tok} OR cc:{tok}")
    raw = name.strip()
    if raw:
        queries.append(f'from:"{raw}" OR to:"{raw}"')

    message_ids: list[str] = []
    seen_ids: set[str] = set()
    per_query = max(5, _MAX_HARVEST_MESSAGES // max(1, len(queries)))
    for query in queries:
        for mid in _gmail_list_message_ids(query, per_query):
            if mid not in seen_ids:
                seen_ids.add(mid)
                message_ids.append(mid)
        if len(message_ids) >= _MAX_HARVEST_MESSAGES:
            break

    contacts: dict[str, Candidate] = {}
    for mid in message_ids[:_MAX_HARVEST_MESSAGES]:
        try:
            res = httpx.get(
                f"{_GMAIL_BASE}/messages/{mid}",
                headers=_gmail_headers(),
                params={"format": "metadata", "metadataHeaders": list(_HARVEST_HEADERS)},
                timeout=10,
            )
            if res.status_code != 200:
                continue
        except httpx.HTTPError:
            continue
        header_map = {
            h["name"]: h["value"]
            for h in res.json().get("payload", {}).get("headers", [])
        }
        for header in _HARVEST_HEADERS:
            _accumulate_addresses(header_map.get(header, ""), contacts)

    return list(contacts.values())


def _resolve_recipient(params: dict[str, Any]) -> dict[str, Any]:
    """
    Resolve a spoken/typed person name to the best-matching email address.

    Harvests the user's Gmail correspondents and ranks them phonetically so
    transcription errors ("Shady" for "Chady") still find the right person.

    Args:
        name: The person's name as heard (e.g. "Shady Kassab"). Aliases for the
            account owner ("me", "myself", …) resolve to the user's own address.

    Returns ``data`` with ``best`` (top match or null), ``matches`` (ranked list),
    and ``confident`` (true when ``best`` is a high-confidence match).
    """
    name = str(params.get("name", params.get("query", params.get("recipient", "")))).strip()
    if not name:
        return {"ok": False, "error": "name is required"}

    if name.lower() in _SELF_RECIPIENT_ALIASES:
        try:
            own = _gmail_self_email()
        except Exception as exc:
            return {"ok": False, "error": f"Could not resolve your own email address: {exc}"}
        return {
            "ok": True,
            "data": {
                "best": {"name": "You", "email": own, "score": 1.0, "confidence": "high"},
                "matches": [{"name": "You", "email": own, "score": 1.0, "confidence": "high"}],
                "confident": True,
            },
        }

    candidates = _harvest_gmail_contacts(name)
    ranked = rank_candidates(name, candidates)
    matches = [
        {"name": m.name, "email": m.email, "score": m.score, "confidence": m.confidence}
        for m in ranked
    ]
    best = matches[0] if matches else None
    return {
        "ok": True,
        "data": {
            "best": best,
            "matches": matches,
            "confident": bool(best and best["confidence"] == "high"),
        },
    }


# ── Gmail attachments ──────────────────────────────────────────────────────────

# Cap downloads so a single attachment can't exhaust memory or stall the voice tool.
_MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024
# Returned extracted text is bounded so a long PDF doesn't blow the model context.
_ATTACHMENT_TEXT_BUDGET = 12_000


def _b64url_decode(data: str) -> bytes:
    """Decode Gmail's URL-safe base64 attachment payload, tolerating missing padding."""
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + padding)


def _walk_message_parts(part: dict[str, Any]) -> Iterator[dict[str, Any]]:
    """Yield every MIME part in a Gmail payload, recursing into nested multiparts."""
    yield part
    for sub in part.get("parts", []) or []:
        yield from _walk_message_parts(sub)


def _gmail_get_message_full(message_id: str) -> dict[str, Any]:
    """Fetch a full Gmail message (payload + part tree) by id."""
    res = httpx.get(
        f"{_GMAIL_BASE}/messages/{message_id}",
        headers=_gmail_headers(),
        params={"format": "full"},
        timeout=15,
    )
    res.raise_for_status()
    return res.json()


def _list_message_attachments(message: dict[str, Any]) -> list[dict[str, Any]]:
    """Return downloadable attachment parts (filename + attachmentId) of a message."""
    payload = message.get("payload", {}) or {}
    attachments: list[dict[str, Any]] = []
    for part in _walk_message_parts(payload):
        body = part.get("body", {}) or {}
        filename = (part.get("filename") or "").strip()
        attachment_id = body.get("attachmentId")
        if filename and attachment_id:
            attachments.append({
                "filename": filename,
                "mime_type": part.get("mimeType", "application/octet-stream"),
                "attachment_id": attachment_id,
                "size": int(body.get("size", 0) or 0),
            })
    return attachments


def _pick_attachment(
    attachments: list[dict[str, Any]], wanted_name: str
) -> dict[str, Any] | None:
    """Pick the attachment to read: name match first, then any PDF, then the first."""
    if not attachments:
        return None
    if wanted_name:
        needle = wanted_name.strip().lower()
        for att in attachments:
            if needle in att["filename"].lower():
                return att
    for att in attachments:
        if att["filename"].lower().endswith(".pdf") or att["mime_type"] == "application/pdf":
            return att
    return attachments[0]


def _download_attachment_bytes(message_id: str, attachment_id: str) -> bytes:
    """Download and decode a single Gmail attachment's bytes."""
    res = httpx.get(
        f"{_GMAIL_BASE}/messages/{message_id}/attachments/{attachment_id}",
        headers=_gmail_headers(),
        timeout=30,
    )
    res.raise_for_status()
    return _b64url_decode(res.json().get("data", ""))


def _extract_attachment_text(filename: str, blob: bytes) -> tuple[str, str]:
    """
    Run downloaded attachment bytes through the shared sort ingest engine.

    Writes to a temp file (the engine reads paths) with the original suffix so PDFs,
    images and Office docs are detected correctly, then OCRs scanned PDFs just like
    the Sort feature. Returns (text, extraction_source).
    """
    from ingestor import extract_content

    suffix = os.path.splitext(filename)[1] or ".bin"
    tmp = tempfile.NamedTemporaryFile(prefix="aifm_attach_", suffix=suffix, delete=False)
    try:
        tmp.write(blob)
        tmp.close()
        vision_model = _resolve_attachment_vision_model()
        payload = extract_content(tmp.name, vision_model=vision_model)
        text = str(payload.get("text", "") or "")
        source = str(payload.get("extraction_source", "") or "unknown")
        return text, source
    finally:
        try:
            os.unlink(tmp.name)
        except OSError:
            logger.debug("could not remove temp attachment %s", tmp.name, exc_info=True)


def _resolve_attachment_vision_model() -> str | None:
    """Installed vision model for OCR/vision of scanned attachments (None if absent)."""
    try:
        from classifier_ollama import list_models
        from vision import find_vision_model

        return find_vision_model(list_models())
    except Exception:
        logger.debug("attachment vision model resolution failed", exc_info=True)
        return None


def _find_message_with_attachments(params: dict[str, Any]) -> tuple[str | None, str | None]:
    """
    Resolve which message to read from.

    Returns (message_id, error). Uses an explicit ``message_id`` when given,
    otherwise searches with ``query`` (scoped to messages that have attachments) and
    returns the most recent match that actually carries one.
    """
    message_id = str(params.get("message_id", "")).strip()
    if message_id:
        return message_id, None

    query = str(params.get("query", "")).strip()
    if not query:
        return None, "Provide a message_id or a search query identifying the email."

    if "has:attachment" not in query:
        query = f"{query} has:attachment"
    candidate_ids = _gmail_list_message_ids(query, 10)
    if not candidate_ids:
        return None, "No emails with attachments matched that search."

    for mid in candidate_ids:
        try:
            message = _gmail_get_message_full(mid)
        except httpx.HTTPError:
            continue
        if _list_message_attachments(message):
            return mid, None
    return None, "Found matching emails but none had a readable attachment."


def _read_mail_attachment(params: dict[str, Any]) -> dict[str, Any]:
    """
    Download an attachment from a Gmail message and read its contents.

    Reads PDFs (including scanned ones via OCR), images, Word/Excel and text using the
    same extraction engine as the Sort feature — no need for the user to download the
    file manually first.

    Args:
        message_id: Gmail message id to read from (preferred — take it from a prior
            search_mail result).
        query: Gmail search to locate the email when no message_id is known
            (e.g. "from:SwissAligner newer_than:2d"). Scoped to has:attachment.
        attachment_name: Optional filename (or substring) to pick a specific
            attachment; otherwise the first PDF (or first attachment) is read.

    Returns ``data`` with the extracted ``text``, the chosen ``filename``, the
    extraction ``source``, and the list of available ``attachments``.
    """
    message_id, error = _find_message_with_attachments(params)
    if error:
        return {"ok": False, "error": error}

    try:
        message = _gmail_get_message_full(message_id)  # type: ignore[arg-type]
    except httpx.HTTPError as exc:
        return {"ok": False, "error": f"Could not open the email: {exc}"}

    attachments = _list_message_attachments(message)
    if not attachments:
        return {"ok": False, "error": "That email has no downloadable attachments."}

    chosen = _pick_attachment(attachments, str(params.get("attachment_name", "")))
    if chosen is None:
        return {"ok": False, "error": "Could not pick an attachment to read."}

    if chosen["size"] and chosen["size"] > _MAX_ATTACHMENT_BYTES:
        mb = _MAX_ATTACHMENT_BYTES // (1024 * 1024)
        return {"ok": False, "error": f"Attachment is too large to read (max {mb} MB)."}

    try:
        blob = _download_attachment_bytes(message_id, chosen["attachment_id"])  # type: ignore[arg-type]
    except httpx.HTTPError as exc:
        return {"ok": False, "error": f"Could not download the attachment: {exc}"}

    try:
        text, source = _extract_attachment_text(chosen["filename"], blob)
    except Exception as exc:
        logger.exception("read_mail_attachment: extraction failed")
        return {"ok": False, "error": f"Couldn't read {chosen['filename']}: {exc}"}

    if not text.strip():
        return {
            "ok": False,
            "error": (
                f"I downloaded {chosen['filename']} but couldn't pull any readable text "
                "from it — it may be blank, encrypted, or an unsupported format."
            ),
        }

    return {
        "ok": True,
        "data": {
            "text": text[:_ATTACHMENT_TEXT_BUDGET],
            "filename": chosen["filename"],
            "source": source,
            "attachments": [a["filename"] for a in attachments],
        },
    }


def _derive_subject_from_body(body: str) -> str:
    """Make a short, sensible subject from the body when none was provided."""
    first_line = body.strip().splitlines()[0] if body.strip() else ""
    words = first_line.split()
    if not words:
        return "(no subject)"
    snippet = " ".join(words[:8])
    if len(snippet) > 60:
        snippet = snippet[:59].rstrip() + "…"
    return snippet[0].upper() + snippet[1:] if snippet else "(no subject)"


def _gmail_send(params: dict[str, Any]) -> dict[str, Any]:
    """
    Send an email via Gmail.

    Args:
        to: Recipient email address. "me"/"myself" (and common translations) or an
            empty value resolve to the authenticated user's own address.
        subject: Email subject line. Derived from the body when omitted.
        body: Plain-text email body.
        cc: Optional CC address(es), comma-separated.
    """
    to = str(params.get("to", "")).strip()
    subject = str(params.get("subject", "")).strip()
    body = str(params.get("body", "")).strip()
    cc = str(params.get("cc", "")).strip()

    # "send me ..." / empty recipient → the user's own mailbox, no need to ask.
    if not to or to.lower() in _SELF_RECIPIENT_ALIASES:
        try:
            to = _gmail_self_email()
        except Exception as exc:
            return {"ok": False, "error": f"Could not resolve your own email address: {exc}"}
        if not to:
            return {"ok": False, "error": "Could not determine your own email address from Gmail."}

    if not body:
        return {"ok": False, "error": "body is required"}

    # Subject is optional — derive a short one from the body so we never block on it.
    if not subject:
        subject = _derive_subject_from_body(body)

    msg = email.mime.text.MIMEText(body)
    msg["to"] = to
    msg["subject"] = subject
    if cc:
        msg["cc"] = cc

    raw = base64.urlsafe_b64encode(msg.as_bytes()).decode()
    res = httpx.post(
        f"{_GMAIL_BASE}/messages/send",
        headers={**_gmail_headers(), "Content-Type": "application/json"},
        content=json.dumps({"raw": raw}),
        timeout=15,
    )
    res.raise_for_status()
    return {"ok": True, "data": {"message_id": res.json().get("id")}}


def _gmail_move(params: dict[str, Any]) -> dict[str, Any]:
    """
    Move (label) a Gmail message — e.g. archive it or mark spam.

    Args:
        message_id: Gmail message ID.
        add_labels: List of label IDs to add (e.g. ["INBOX", "STARRED"]).
        remove_labels: List of label IDs to remove (e.g. ["INBOX"] to archive).
    """
    message_id = str(params.get("message_id", "")).strip()
    add_labels = params.get("add_labels", [])
    remove_labels = params.get("remove_labels", [])

    if not message_id:
        return {"ok": False, "error": "message_id is required"}

    res = httpx.post(
        f"{_GMAIL_BASE}/messages/{message_id}/modify",
        headers={**_gmail_headers(), "Content-Type": "application/json"},
        content=json.dumps({"addLabelIds": add_labels, "removeLabelIds": remove_labels}),
        timeout=10,
    )
    res.raise_for_status()
    return {"ok": True, "data": {"message_id": message_id}}


_MOVE_BATCH_CAP = 50


def _gmail_move_batch(params: dict[str, Any]) -> dict[str, Any]:
    """
    Move multiple Gmail messages by id list or search query.

    Args:
        message_ids: Optional list of Gmail message IDs.
        query: Gmail search query used when message_ids is empty.
        add_labels: Label IDs to add (default ["SPAM"]).
        remove_labels: Label IDs to remove (default ["INBOX"]).
        max_results: Cap on messages moved (default 50).
    """
    raw_ids = params.get("message_ids") or []
    message_ids: list[str] = [str(mid).strip() for mid in raw_ids if str(mid).strip()]
    query = str(params.get("query", "")).strip()
    add_labels = params.get("add_labels") or ["SPAM"]
    remove_labels = params.get("remove_labels") or ["INBOX"]
    max_results = min(int(params.get("max_results", _MOVE_BATCH_CAP)), _MOVE_BATCH_CAP)

    if not message_ids and query:
        search = _gmail_search({"query": query, "max_results": max_results})
        if not search.get("ok"):
            return search
        data = search.get("data") or {}
        messages = data.get("messages") if isinstance(data, dict) else []
        if isinstance(messages, list):
            message_ids = [str(m.get("id", "")).strip() for m in messages if m.get("id")]

    if not message_ids:
        return {"ok": False, "error": "message_ids or query is required"}

    moved = 0
    errors: list[str] = []
    for mid in message_ids[:max_results]:
        try:
            result = _gmail_move(
                {
                    "message_id": mid,
                    "add_labels": add_labels,
                    "remove_labels": remove_labels,
                }
            )
            if result.get("ok"):
                moved += 1
            else:
                errors.append(str(result.get("error") or "unknown error"))
        except Exception as exc:  # noqa: BLE001
            errors.append(str(exc)[:120])

    if moved == 0:
        return {
            "ok": False,
            "error": errors[0] if errors else "No messages were moved",
            "data": {"moved_count": 0, "errors": errors[:3]},
        }
    return {
        "ok": True,
        "data": {
            "moved_count": moved,
            "total_attempted": min(len(message_ids), max_results),
            "errors": errors[:3],
        },
    }


def _gmail_create_filter(params: dict[str, Any]) -> dict[str, Any]:
    """
    Create a Gmail inbox filter (e.g. block a sender).

    Args:
        from: Sender email or domain for criteria.from.
        query: Optional Gmail query criteria.
        add_labels: Labels to add (default ["SPAM"]).
        remove_labels: Labels to remove (default ["INBOX"]).
    """
    from_addr = str(params.get("from", "")).strip()
    query_criteria = str(params.get("query", "")).strip()
    if not from_addr and not query_criteria:
        return {"ok": False, "error": "from or query is required for filter criteria"}

    criteria: dict[str, str] = {}
    if from_addr:
        criteria["from"] = from_addr
    if query_criteria:
        criteria["query"] = query_criteria

    action = {
        "addLabelIds": params.get("add_labels") or ["SPAM"],
        "removeLabelIds": params.get("remove_labels") or ["INBOX"],
    }
    payload = {"criteria": criteria, "action": action}

    res = httpx.post(
        f"{_GMAIL_BASE}/settings/filters",
        headers={**_gmail_headers(), "Content-Type": "application/json"},
        content=json.dumps(payload),
        timeout=15,
    )
    res.raise_for_status()
    body = res.json()
    return {"ok": True, "data": {"filter_id": body.get("id"), "criteria": criteria}}


def _gmail_list_labels(_params: dict[str, Any]) -> dict[str, Any]:
    """List all Gmail labels/folders."""
    res = httpx.get(f"{_GMAIL_BASE}/labels", headers=_gmail_headers(), timeout=10)
    res.raise_for_status()
    labels = [
        {"id": label["id"], "name": label["name"]}
        for label in res.json().get("labels", [])
    ]
    return {"ok": True, "data": {"labels": labels}}


# ── Google Drive ──────────────────────────────────────────────────────────────

def _drive_list(params: dict[str, Any]) -> dict[str, Any]:
    """
    List files in Google Drive.

    Args:
        folder_id: Drive folder ID (default "root").
        page_size: Number of items to return (default 30, max 100).
    """
    folder_id = str(params.get("folder_id", "root")).strip() or "root"
    page_size = min(int(params.get("page_size", 30)), 100)

    q = f"'{folder_id}' in parents and trashed=false"
    res = httpx.get(
        f"{_DRIVE_BASE}/files",
        headers=_drive_headers(),
        params={
            "q": q,
            "pageSize": page_size,
            "fields": "files(id,name,mimeType,size,modifiedTime,parents)",
        },
        timeout=15,
    )
    res.raise_for_status()
    files = res.json().get("files", [])
    return {"ok": True, "data": {"files": files, "count": len(files)}}


def _drive_search(params: dict[str, Any]) -> dict[str, Any]:
    """
    Full-text search across Google Drive.

    Args:
        query: Search terms (searches file names and content).
        max_results: Maximum results to return (default 20, max 50).
    """
    query = str(params.get("query", "")).strip()
    max_results = min(int(params.get("max_results", 20)), 50)

    if not query:
        return {"ok": False, "error": "query is required"}

    q = f"fullText contains '{query}' and trashed=false"
    res = httpx.get(
        f"{_DRIVE_BASE}/files",
        headers=_drive_headers(),
        params={
            "q": q,
            "pageSize": max_results,
            "fields": "files(id,name,mimeType,size,modifiedTime)",
        },
        timeout=15,
    )
    res.raise_for_status()
    files = res.json().get("files", [])
    return {"ok": True, "data": {"files": files, "count": len(files)}}


def _drive_move(params: dict[str, Any]) -> dict[str, Any]:
    """
    Move a Drive file to a different folder.

    Args:
        file_id: ID of the file to move.
        destination_folder_id: ID of the destination folder.
    """
    file_id = str(params.get("file_id", "")).strip()
    dest_folder = str(params.get("destination_folder_id", "")).strip()

    if not file_id or not dest_folder:
        return {"ok": False, "error": "file_id and destination_folder_id are required"}

    # Retrieve current parents to remove them
    meta_res = httpx.get(
        f"{_DRIVE_BASE}/files/{file_id}",
        headers=_drive_headers(),
        params={"fields": "parents"},
        timeout=10,
    )
    meta_res.raise_for_status()
    current_parents = ",".join(meta_res.json().get("parents", []))

    res = httpx.patch(
        f"{_DRIVE_BASE}/files/{file_id}",
        headers={**_drive_headers(), "Content-Type": "application/json"},
        params={
            "addParents": dest_folder,
            "removeParents": current_parents,
            "fields": "id,parents",
        },
        content=json.dumps({}),
        timeout=10,
    )
    res.raise_for_status()
    return {"ok": True, "data": {"file_id": file_id, "new_folder": dest_folder}}


def _drive_create_folder(params: dict[str, Any]) -> dict[str, Any]:
    """
    Create a new folder in Google Drive.

    Args:
        name: Folder name.
        parent_id: Parent folder ID (default "root").
    """
    name = str(params.get("name", "")).strip()
    parent_id = str(params.get("parent_id", "root")).strip() or "root"

    if not name:
        return {"ok": False, "error": "name is required"}

    res = httpx.post(
        f"{_DRIVE_BASE}/files",
        headers={**_drive_headers(), "Content-Type": "application/json"},
        content=json.dumps({
            "name": name,
            "mimeType": "application/vnd.google-apps.folder",
            "parents": [parent_id],
        }),
        timeout=10,
    )
    res.raise_for_status()
    data = res.json()
    return {"ok": True, "data": {"folder_id": data.get("id"), "name": data.get("name")}}


def _drive_get_metadata(params: dict[str, Any]) -> dict[str, Any]:
    """
    Get metadata for a single Drive file.

    Args:
        file_id: Drive file ID.
    """
    file_id = str(params.get("file_id", "")).strip()
    if not file_id:
        return {"ok": False, "error": "file_id is required"}

    res = httpx.get(
        f"{_DRIVE_BASE}/files/{file_id}",
        headers=_drive_headers(),
        params={"fields": "id,name,mimeType,size,modifiedTime,parents,webViewLink"},
        timeout=10,
    )
    res.raise_for_status()
    return {"ok": True, "data": res.json()}


# ── Google Calendar ───────────────────────────────────────────────────────────

def _normalize_calendar_event_row(e: dict[str, Any]) -> dict[str, Any]:
    """Map a Google Calendar API event resource to our list shape."""
    return {
        "id": e.get("id"),
        "summary": e.get("summary", "(no title)"),
        "start": e.get("start", {}).get("dateTime") or e.get("start", {}).get("date"),
        "end": e.get("end", {}).get("dateTime") or e.get("end", {}).get("date"),
        "location": e.get("location"),
        "description": e.get("description"),
        "html_link": e.get("htmlLink") or "",
        "recurring_event_id": e.get("recurringEventId"),
        "is_recurring_instance": bool(e.get("recurringEventId")),
        "recurrence": e.get("recurrence"),
        "start_time_zone": e.get("start", {}).get("timeZone"),
    }


def _calendar_list_events(params: dict[str, Any]) -> dict[str, Any]:
    """
    List Google Calendar events.

    Args:
        calendar_id: Calendar ID (default "primary").
        time_min: ISO 8601 start bound (default: now).
        time_max: ISO 8601 end bound.
        max_results: Page size (default 25, max 2500 per Google API page).
        q: Free-text search (summary, description, location, attendees).
        fetch_all: When true, follow nextPageToken until max_total.
        max_total: Cap on total events when fetch_all is true (default 500).
        single_events: Expand recurring events into instances (default true).
    """
    from datetime import datetime, timezone

    calendar_id = str(params.get("calendar_id", "primary")).strip() or "primary"
    # Live models often send start/end; accept those as list-window bounds.
    time_min = (
        params.get("time_min")
        or params.get("start")
        or datetime.now(timezone.utc).isoformat()
    )
    time_max = params.get("time_max") or params.get("end")
    page_size = min(int(params.get("max_results", 25)), 2500)
    max_total = min(int(params.get("max_total", 500)), 2500)
    fetch_all = bool(params.get("fetch_all"))
    q = str(params.get("q") or "").strip()
    single_events_raw = params.get("single_events", True)
    if isinstance(single_events_raw, str):
        single_events = single_events_raw.strip().lower() not in ("0", "false", "no", "off")
    else:
        single_events = bool(single_events_raw)

    all_items: list[dict[str, Any]] = []
    page_token: str | None = None

    while True:
        query_params: dict[str, Any] = {
            "timeMin": time_min,
            "maxResults": page_size,
            "singleEvents": single_events,
        }
        if single_events:
            query_params["orderBy"] = "startTime"
        if time_max:
            query_params["timeMax"] = time_max
        if q:
            query_params["q"] = q
        if page_token:
            query_params["pageToken"] = page_token

        res = httpx.get(
            f"{_CALENDAR_BASE}/calendars/{calendar_id}/events",
            headers=_calendar_headers(),
            params=query_params,
            timeout=20,
        )
        res.raise_for_status()
        body = res.json()
        page_items = body.get("items", [])
        if isinstance(page_items, list):
            all_items.extend(page_items)

        if not fetch_all:
            break
        page_token = body.get("nextPageToken")
        if not page_token or len(all_items) >= max_total:
            break

    items = all_items[:max_total] if fetch_all else all_items
    events = [_normalize_calendar_event_row(e) for e in items]
    return {"ok": True, "data": {"events": events, "count": len(events)}}


def _calendar_create_event(params: dict[str, Any]) -> dict[str, Any]:
    """
    Create a new Google Calendar event.

    Args:
        summary: Event title.
        start: ISO 8601 start datetime (e.g. "2026-05-10T14:00:00+02:00").
        end: ISO 8601 end datetime.
        description: Optional event description.
        location: Optional event location.
        calendar_id: Calendar ID (default "primary").
        attendees: Optional list of email addresses.
    """
    summary = str(params.get("summary", "")).strip()
    start = str(params.get("start", "")).strip()
    end = str(params.get("end", "")).strip()
    calendar_id = str(params.get("calendar_id", "primary")).strip() or "primary"

    if not summary or not start or not end:
        return {"ok": False, "error": "summary, start, and end are required"}

    body: dict[str, Any] = {
        "summary": summary,
        "start": {"dateTime": start},
        "end": {"dateTime": end},
    }
    if params.get("description"):
        body["description"] = str(params["description"])
    if params.get("location"):
        body["location"] = str(params["location"])
    if params.get("attendees"):
        emails = params["attendees"]
        if isinstance(emails, list):
            body["attendees"] = [{"email": e} for e in emails]

    res = httpx.post(
        f"{_CALENDAR_BASE}/calendars/{calendar_id}/events",
        headers={**_calendar_headers(), "Content-Type": "application/json"},
        content=json.dumps(body),
        timeout=15,
    )
    res.raise_for_status()
    data = res.json()
    return {"ok": True, "data": {"event_id": data.get("id"), "html_link": data.get("htmlLink")}}


def _calendar_update_event(params: dict[str, Any]) -> dict[str, Any]:
    """
    Update an existing Google Calendar event (patch — only provided fields are changed).

    Args:
        event_id: ID of the event to update.
        calendar_id: Calendar ID (default "primary").
        summary: New title (optional).
        start: New ISO 8601 start datetime (optional).
        end: New ISO 8601 end datetime (optional).
        description: New description (optional).
        location: New location (optional).
    """
    event_id = str(params.get("event_id", "")).strip()
    calendar_id = str(params.get("calendar_id", "primary")).strip() or "primary"

    if not event_id:
        return {"ok": False, "error": "event_id is required"}

    patch: dict[str, Any] = {}
    if params.get("summary"):
        patch["summary"] = str(params["summary"])
    if params.get("start"):
        patch["start"] = {"dateTime": str(params["start"])}
    if params.get("end"):
        patch["end"] = {"dateTime": str(params["end"])}
    if params.get("description"):
        patch["description"] = str(params["description"])
    if params.get("location"):
        patch["location"] = str(params["location"])

    if not patch:
        return {"ok": False, "error": "At least one field to update is required"}

    res = httpx.patch(
        f"{_CALENDAR_BASE}/calendars/{calendar_id}/events/{event_id}",
        headers={**_calendar_headers(), "Content-Type": "application/json"},
        content=json.dumps(patch),
        timeout=15,
    )
    res.raise_for_status()
    return {"ok": True, "data": {"event_id": event_id}}


def _calendar_delete_event(params: dict[str, Any]) -> dict[str, Any]:
    """
    Delete a Google Calendar event.

    Args:
        event_id: ID of the event to delete.
        calendar_id: Calendar ID (default "primary").
    """
    event_id = str(params.get("event_id", "")).strip()
    calendar_id = str(params.get("calendar_id", "primary")).strip() or "primary"

    if not event_id:
        return {"ok": False, "error": "event_id is required"}

    res = httpx.delete(
        f"{_CALENDAR_BASE}/calendars/{calendar_id}/events/{event_id}",
        headers=_calendar_headers(),
        timeout=10,
    )
    res.raise_for_status()
    return {"ok": True, "data": {"deleted_event_id": event_id}}


def _calendar_fetch_event_html_link(
    event_id: str,
    *,
    calendar_id: str = "primary",
) -> str | None:
    """Fetch the provider ``htmlLink`` for one calendar event by id."""
    text = str(event_id or "").strip()
    cal = str(calendar_id or "primary").strip() or "primary"
    if not text:
        return None
    res = httpx.get(
        f"{_CALENDAR_BASE}/calendars/{cal}/events/{text}",
        headers=_calendar_headers(),
        timeout=10,
    )
    res.raise_for_status()
    link = str(res.json().get("htmlLink") or "").strip()
    return link or None


def _calendar_get_event(params: dict[str, Any]) -> dict[str, Any]:
    """Fetch one calendar event (series master or instance)."""
    event_id = str(params.get("event_id", "")).strip()
    calendar_id = str(params.get("calendar_id", "primary")).strip() or "primary"
    if not event_id:
        return {"ok": False, "error": "event_id is required"}
    res = httpx.get(
        f"{_CALENDAR_BASE}/calendars/{calendar_id}/events/{event_id}",
        headers=_calendar_headers(),
        timeout=10,
    )
    res.raise_for_status()
    data = res.json()
    return {
        "ok": True,
        "data": {
            "id": data.get("id"),
            "html_link": data.get("htmlLink") or "",
            "recurrence": data.get("recurrence"),
            "start_time_zone": data.get("start", {}).get("timeZone"),
        },
    }


def _calendar_patch_recurrence(params: dict[str, Any]) -> dict[str, Any]:
    """Patch recurrence rules on a series master."""
    event_id = str(params.get("event_id", "")).strip()
    calendar_id = str(params.get("calendar_id", "primary")).strip() or "primary"
    recurrence = params.get("recurrence")
    if not event_id:
        return {"ok": False, "error": "event_id is required"}
    if not isinstance(recurrence, list) or not recurrence:
        return {"ok": False, "error": "recurrence is required"}
    res = httpx.patch(
        f"{_CALENDAR_BASE}/calendars/{calendar_id}/events/{event_id}",
        headers={**_calendar_headers(), "Content-Type": "application/json"},
        content=json.dumps({"recurrence": recurrence}),
        timeout=15,
    )
    res.raise_for_status()
    return {"ok": True, "data": {"event_id": event_id}}


def _calendar_list_instances(params: dict[str, Any]) -> dict[str, Any]:
    """List expanded instances of a recurring series from time_min onward."""
    event_id = str(params.get("event_id", "")).strip()
    calendar_id = str(params.get("calendar_id", "primary")).strip() or "primary"
    time_min = str(params.get("time_min", "")).strip()
    if not event_id or not time_min:
        return {"ok": False, "error": "event_id and time_min are required"}
    res = httpx.get(
        f"{_CALENDAR_BASE}/calendars/{calendar_id}/events/{event_id}/instances",
        headers=_calendar_headers(),
        params={"timeMin": time_min, "singleEvents": True, "maxResults": 100},
        timeout=15,
    )
    res.raise_for_status()
    items = res.json().get("items", [])
    events = [{"id": e.get("id")} for e in items if e.get("id")]
    return {"ok": True, "data": {"events": events, "count": len(events)}}


# ── Dispatcher ────────────────────────────────────────────────────────────────

_OPERATIONS: dict[str, Any] = {
    # Gmail
    "search_mail": _gmail_search,
    "send_mail": _gmail_send,
    "move_mail": _gmail_move,
    "move_mail_batch": _gmail_move_batch,
    "create_filter": _gmail_create_filter,
    "list_labels": _gmail_list_labels,
    "resolve_recipient": _resolve_recipient,
    "read_mail_attachment": _read_mail_attachment,
    # Drive
    "list_drive_files": _drive_list,
    "search_drive": _drive_search,
    "move_drive_file": _drive_move,
    "create_drive_folder": _drive_create_folder,
    "get_drive_file_metadata": _drive_get_metadata,
    # Calendar
    "list_calendar_events": _calendar_list_events,
    "create_calendar_event": _calendar_create_event,
    "update_calendar_event": _calendar_update_event,
    "delete_calendar_event": _calendar_delete_event,
    "get_calendar_event": _calendar_get_event,
    "patch_calendar_recurrence": _calendar_patch_recurrence,
    "list_calendar_instances": _calendar_list_instances,
}


def google_workspace(parameters: dict[str, Any]) -> dict[str, Any]:
    """
    Google Workspace connector — Gmail, Drive, and Calendar.

    Parameters:
        operation: One of search_mail | send_mail | move_mail | move_mail_batch |
                   create_filter | list_labels |
                   resolve_recipient | read_mail_attachment |
                   list_drive_files | search_drive | move_drive_file |
                   create_drive_folder | get_drive_file_metadata |
                   list_calendar_events | create_calendar_event |
                   update_calendar_event | delete_calendar_event
        (operation-specific params): See individual operation docstrings above.
    """
    logger.debug("[action] google_workspace called args=%r", parameters)
    operation = str(parameters.get("operation", "")).strip()

    if not operation:
        return {
            "ok": False,
            "error": f"operation is required. Available: {sorted(_OPERATIONS)}",
        }

    handler = _OPERATIONS.get(operation)
    if handler is None:
        return {
            "ok": False,
            "error": f"Unknown operation {operation!r}. Available: {sorted(_OPERATIONS)}",
        }

    def _scope_error(op: str) -> dict[str, Any]:
        """Operation-specific reconnect guidance for a 401/403 missing-scope failure.

        A generic "most likely sending email" message is misleading for calendar or
        drive reads, so we name the service the user actually needs to reconnect.
        """
        if op.endswith("_calendar_event") or op == "list_calendar_events":
            return {
                "ok": False,
                "error": (
                    "Your Google account is connected, but it doesn't have calendar access. "
                    "Reconnect Google Calendar from Settings → External sources, then try again."
                ),
                "needs_reconnect": "google-calendar",
            }
        if op in ("list_drive_files",) or op.startswith("drive_"):
            return {
                "ok": False,
                "error": (
                    "Your Google account is connected, but it doesn't have Drive access. "
                    "Reconnect Google Drive from Settings → External sources, then try again."
                ),
                "needs_reconnect": "google-drive",
            }
        if op == "create_filter":
            return {
                "ok": False,
                "error": (
                    "Gmail needs an updated connection for inbox filters. "
                    "Disconnect and connect Gmail again under Settings → External sources, "
                    "then try again."
                ),
                "needs_reconnect": "google-gmail",
            }
        return {
            "ok": False,
            "error": (
                "Your Google account is connected, but it doesn't have permission for this "
                "mail action. Reconnect Gmail from Settings → External sources to grant the "
                "missing access, then try again."
            ),
            "needs_reconnect": "google-gmail",
        }

    try:
        return handler(parameters)
    except CredentialUnavailableError as exc:
        logger.warning("[google_workspace] credential unavailable: %s", exc)
        return {"ok": False, "error": str(exc)}
    except httpx.HTTPStatusError as exc:
        status = exc.response.status_code
        body = exc.response.text or ""
        logger.warning("[google_workspace] HTTP %s for %s", status, exc.request.url)
        # A 403 with insufficient scopes means the stored Google token was granted
        # without the permission this action needs (e.g. Gmail "send"). Surface a
        # plain, actionable message so the assistant tells the user how to fix it
        # instead of relaying a raw API error blob.
        scope_markers = (
            "insufficientPermissions",
            "insufficient authentication scopes",
            "ACCESS_TOKEN_SCOPE_INSUFFICIENT",
            "PERMISSION_DENIED",
        )
        if status in (401, 403) and any(marker in body for marker in scope_markers):
            return _scope_error(operation)
        return {"ok": False, "error": f"Google API error {status}: {body[:300]}"}
    except Exception as exc:
        logger.exception("[google_workspace] unexpected error in operation=%r", operation)
        return {"ok": False, "error": str(exc)}
