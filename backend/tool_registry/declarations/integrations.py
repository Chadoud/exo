"""Tool declarations for integrations."""

from __future__ import annotations

from typing import TYPE_CHECKING

from tool_registry.declarations._common import decl

if TYPE_CHECKING:
    from google.genai import types as genai_types  # type: ignore[import]


def build_declarations() -> list["genai_types.FunctionDeclaration"]:
    return [
                decl(
            "manage_connection",
            "Connect or disconnect one of the user's external-source accounts "
            "(Gmail, Google Drive, Google Calendar, Microsoft/Outlook/OneDrive, Notion, "
            "Dropbox, Slack, WhatsApp Business API, Infomaniak). Call this whenever the user asks to connect, "
            "link, sign in, add, disconnect, unlink, sign out, or remove one of these "
            "services. Connecting opens the sign-in page in the browser; disconnecting is "
            "immediate. NEVER tell the user to do it themselves in Settings — call this tool.",
            {
                "operation": {
                    "type": "string",
                    "enum": ["connect", "disconnect"],
                    "description": "connect = start sign-in; disconnect = remove the saved account.",
                },
                "provider": {
                    "type": "string",
                    "description": (
                        "Service name as the user said it, e.g. 'Gmail', 'Google Drive', "
                        "'Google Calendar', 'Google', 'Outlook', 'Microsoft', 'OneDrive', "
                        "'Notion', 'Dropbox', 'Slack', 'WhatsApp', 'Infomaniak'."
                    ),
                },
                "missing_scope": {
                    "type": "string",
                    "description": (
                        "When reconnecting after a scope error, the failing service: "
                        "'calendar', 'gmail', 'drive', etc. Targets a narrow reconnect."
                    ),
                },
            },
            ["operation", "provider"],
        ),
                decl(
            "google_workspace",
            "Manage Gmail (send_mail, search_mail, move_mail, move_mail_batch, create_filter, list_labels, resolve_recipient, read_mail_attachment), "
            "Google Drive (list_drive_files, search_drive, move_drive_file, create_drive_folder, get_drive_file_metadata), "
            "and Google Calendar (list_calendar_events, create_calendar_event, update_calendar_event, delete_calendar_event). "
            "Requires a connected Google account.",
            {
                "operation": {
                    "type": "string",
                    "description": (
                        "One of: send_mail, search_mail, move_mail, move_mail_batch, create_filter, list_labels, resolve_recipient, read_mail_attachment, "
                        "list_drive_files, search_drive, move_drive_file, create_drive_folder, get_drive_file_metadata, "
                        "list_calendar_events, create_calendar_event, update_calendar_event, delete_calendar_event"
                    ),
                },
                "query": {"type": "string", "description": "Search query for search operations. For read_mail_attachment, a Gmail search locating the email (e.g. \"from:SwissAligner newer_than:2d\") when no message_id is known."},
                "name": {"type": "string", "description": "Person name to resolve to an email for resolve_recipient (phonetic/fuzzy match against your contacts, e.g. \"Chady Kassab\")."},
                "message_id": {"type": "string", "description": "Gmail message id for read_mail_attachment — prefer reusing the id from a prior search_mail result."},
                "attachment_name": {"type": "string", "description": "Optional filename (or substring) selecting which attachment to read for read_mail_attachment; defaults to the first PDF/attachment."},
                "to": {"type": "string", "description": "Recipient email for send_mail. Use \"me\" to send to the user's own mailbox (resolved automatically)."},
                "subject": {"type": "string", "description": "Email or event subject. Optional for send_mail — derived from the body if omitted."},
                "body": {"type": "string", "description": "Email body or event description"},
                "file_id": {"type": "string", "description": "Drive file ID for file operations"},
                "folder_id": {"type": "string", "description": "Drive folder ID"},
                "destination_folder_id": {"type": "string", "description": "Destination folder ID for move"},
                "event_id": {"type": "string", "description": "Calendar event ID"},
                "time_min": {
                    "type": "string",
                    "description": "ISO 8601 lower bound for list_calendar_events (inclusive)",
                },
                "time_max": {
                    "type": "string",
                    "description": "ISO 8601 upper bound for list_calendar_events (exclusive)",
                },
                "start": {"type": "string", "description": "ISO 8601 start datetime for events"},
                "end": {"type": "string", "description": "ISO 8601 end datetime for events"},
                "summary": {"type": "string", "description": "Calendar event title"},
                "max_results": {"type": "integer", "description": "Maximum results to return"},
            },
            ["operation"],
        ),
                decl(
            "microsoft_graph",
            "Manage Outlook Mail (search_mail, send_mail, list_mail_folders, move_mail), "
            "OneDrive (list_onedrive_files, search_onedrive, move_onedrive_file, create_onedrive_folder, get_onedrive_metadata), "
            "and Outlook Calendar (list_calendar_events, create_calendar_event, update_calendar_event, delete_calendar_event). "
            "Requires a connected Microsoft account.",
            {
                "operation": {
                    "type": "string",
                    "description": (
                        "One of: search_mail, send_mail, list_mail_folders, move_mail, "
                        "list_onedrive_files, search_onedrive, move_onedrive_file, create_onedrive_folder, get_onedrive_metadata, "
                        "list_calendar_events, create_calendar_event, update_calendar_event, delete_calendar_event"
                    ),
                },
                "query": {"type": "string"},
                "to": {"type": "string", "description": "Recipient email for send_mail. Use \"me\" to send to the user's own mailbox (resolved automatically)."},
                "subject": {"type": "string", "description": "Email or event subject. Optional for send_mail — derived from the body if omitted."},
                "body": {"type": "string"},
                "item_id": {"type": "string", "description": "OneDrive item ID"},
                "destination_folder_id": {"type": "string"},
                "event_id": {"type": "string"},
                "start_datetime": {
                    "type": "string",
                    "description": "ISO start for list_calendar_events (alias: time_min or start)",
                },
                "end_datetime": {
                    "type": "string",
                    "description": "ISO end for list_calendar_events (alias: time_max or end)",
                },
                "time_min": {"type": "string"},
                "time_max": {"type": "string"},
                "start": {"type": "string"},
                "end": {"type": "string"},
                "max_results": {"type": "integer"},
            },
            ["operation"],
        ),
                decl(
            "dropbox_files",
            "Manage Dropbox files and folders: list_files, search_files, move_file, copy_file, "
            "delete_file, create_folder, get_metadata. Requires a connected Dropbox account.",
            {
                "operation": {
                    "type": "string",
                    "description": "One of: list_files, search_files, move_file, copy_file, delete_file, create_folder, get_metadata",
                },
                "path": {"type": "string", "description": "Dropbox path (e.g. /Documents/file.pdf)"},
                "from_path": {"type": "string", "description": "Source path for move/copy"},
                "to_path": {"type": "string", "description": "Destination path for move/copy"},
                "query": {"type": "string", "description": "Search query for search_files"},
                "recursive": {"type": "boolean", "description": "Recursive listing for list_files"},
                "limit": {"type": "integer"},
            },
            ["operation"],
        ),
                decl(
            "notion",
            "Work with Notion: search (list/find pages & databases, newest-edited first), "
            "read_page (read a page's text), create_page (new page under a parent page or "
            "database), append_text (add paragraphs to a page), query_database (list rows of a "
            "database). Requires a connected Notion account; only pages/databases shared with the "
            "integration are visible. To summarize or 'look into' the user's Notion when they give "
            "NO keywords, call search with an empty query to get the most recently edited pages, "
            "then read_page on the top ones — do NOT ask the user for keywords first.",
            {
                "operation": {
                    "type": "string",
                    "description": "One of: search, read_page, create_page, append_text, query_database",
                },
                "query": {
                    "type": "string",
                    "description": (
                        "OPTIONAL title text for search. Leave empty/omit to list the most "
                        "recently edited pages (use this for 'show/summarize my Notion pages')."
                    ),
                },
                "filter": {"type": "string", "description": "Restrict search to 'page' or 'database'"},
                "page_id": {"type": "string", "description": "Page ID for read_page / append_text"},
                "title": {"type": "string", "description": "Title for create_page"},
                "parent_page_id": {"type": "string", "description": "Parent page ID for create_page"},
                "parent_database_id": {"type": "string", "description": "Parent database ID for create_page"},
                "database_id": {"type": "string", "description": "Database ID for query_database"},
                "body": {"type": "string", "description": "Plain-text body for create_page"},
                "text": {"type": "string", "description": "Plain text to append for append_text"},
                "max_results": {"type": "integer", "description": "Maximum results to return"},
            },
            ["operation"],
        ),
                decl(
            "slack_messaging",
            "Interact with Slack: list_channels, send_message, search_messages, "
            "get_channel_history, list_users. Requires a connected Slack account.",
            {
                "operation": {
                    "type": "string",
                    "description": "One of: list_channels, send_message, search_messages, get_channel_history, list_users",
                },
                "channel": {"type": "string", "description": "Channel ID or name for send_message / get_channel_history"},
                "text": {"type": "string", "description": "Message text for send_message"},
                "query": {"type": "string", "description": "Search query for search_messages"},
                "limit": {"type": "integer"},
            },
            ["operation"],
        ),
                decl(
            "whatsapp_messaging",
            "WhatsApp Business Cloud API: connection_status, send_text (E.164 phone numbers), "
            "send_template (approved Meta templates), list_templates, list_recent_messages, "
            "get_delivery_status, check_session. Requires Business API credentials under "
            "External sources → WhatsApp and cloud webhooks for inbound/delivery events. "
            "For personal WhatsApp by contact name, use send_message instead (desktop app).",
            {
                "operation": {
                    "type": "string",
                    "description": (
                        "One of: connection_status, send_text, send_template, list_templates, "
                        "list_recent_messages, get_delivery_status, check_session"
                    ),
                },
                "to": {
                    "type": "string",
                    "description": "Recipient phone number with country code (E.164) for send_text/send_template",
                },
                "recipient": {
                    "type": "string",
                    "description": "Alias for to",
                },
                "text": {"type": "string", "description": "Message body for send_text"},
                "message_text": {"type": "string", "description": "Alias for text"},
                "template_name": {
                    "type": "string",
                    "description": "Approved template name for send_template",
                },
                "language_code": {
                    "type": "string",
                    "description": "Template language code (default en)",
                },
                "components": {
                    "type": "array",
                    "description": "Optional template variable components for send_template",
                },
                "waba_id": {
                    "type": "string",
                    "description": "WhatsApp Business Account ID for list_templates (optional if saved at connect)",
                },
                "limit": {"type": "integer"},
                "wa_message_id": {
                    "type": "string",
                    "description": "Outbound WhatsApp message id for get_delivery_status",
                },
                "message_id": {
                    "type": "string",
                    "description": "Alias for wa_message_id",
                },
                "event_type": {
                    "type": "string",
                    "description": "Filter for list_recent_messages: message | status",
                },
                "force": {
                    "type": "boolean",
                    "description": "If true, send_text skips local session-window check",
                },
            },
            ["operation"],
        ),
                decl(
            "s3_storage",
            "Manage Amazon S3 objects: list_buckets, list_objects, get_object_metadata, "
            "copy_object, delete_object, create_folder. Requires AWS credentials.",
            {
                "operation": {
                    "type": "string",
                    "description": "One of: list_buckets, list_objects, get_object_metadata, copy_object, delete_object, create_folder",
                },
                "bucket": {"type": "string", "description": "S3 bucket name"},
                "key": {"type": "string", "description": "S3 object key"},
                "prefix": {"type": "string", "description": "Key prefix filter for list_objects or create_folder"},
                "source_bucket": {"type": "string"},
                "source_key": {"type": "string"},
                "destination_bucket": {"type": "string"},
                "destination_key": {"type": "string"},
                "max_keys": {"type": "integer"},
            },
            ["operation"],
        ),
                decl(
            "infomaniak_services",
            "Manage Infomaniak Mail (list_mail, search_mail, send_mail) and Calendar "
            "(list_calendars, list_events, create_event, update_event, delete_event). "
            "Requires a connected Infomaniak account.",
            {
                "operation": {
                    "type": "string",
                    "description": "One of: list_mail, search_mail, send_mail, list_calendars, list_events, create_event, update_event, delete_event",
                },
                "query": {"type": "string"},
                "to": {"type": "string"},
                "subject": {"type": "string"},
                "body": {"type": "string"},
                "calendar_id": {"type": "string"},
                "event_id": {"type": "string"},
                "summary": {"type": "string"},
                "start": {"type": "string"},
                "end": {"type": "string"},
                "limit": {"type": "integer"},
            },
            ["operation"],
        ),
                decl(
            "icloud_drive",
            "Read iCloud Drive files (list_files, get_metadata). "
            "Note: write operations are not supported via API — Apple does not expose "
            "a public REST API for iCloud Drive mutations. "
            "Requires a connected iCloud account.",
            {
                "operation": {
                    "type": "string",
                    "description": "One of: list_files, get_metadata",
                },
                "folder_id": {"type": "string", "description": "iCloud drivewsid for the folder"},
                "drivewsid": {"type": "string", "description": "iCloud item drivewsid for get_metadata"},
                "limit": {"type": "integer"},
            },
            ["operation"],
        ),
    ]
