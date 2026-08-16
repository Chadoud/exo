"""Versioned telemetry payloads — keep in sync with frontend/src/telemetry/schema.ts.

Privacy / usage overview: SECURITY.md at repo root — update when changing allowlists.
"""

from __future__ import annotations

import re
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

SCHEMA_VERSION = 1

# Keys that must never appear in event props or feedback (paths, PII surfaces).
FORBIDDEN_PROP_KEYS: frozenset[str] = frozenset(
    {
        "path",
        "paths",
        "filepath",
        "file_path",
        "filePath",
        "filename",
        "file_name",
        "folder",
        "folder_path",
        "output_dir",
        "outputDir",
        "dest_path",
        "email",
        "password",
        "token",
        "license_key",
        "licenseKey",
        "content",
        "prompt",
        "response",
    }
)

ALLOWED_EVENT_NAMES: frozenset[str] = frozenset(
    {
        "app_started",
        "welcome_step_viewed",
        "welcome_completed",
        "welcome_dismissed",
        "settings_opened",
        "tab_changed",
        "first_drop",
        "job_started",
        "job_completed",
        "job_failed",
        "job_cancelled",
        "sort_blocked",
        "feedback_submitted",
        "post_run_cta_clicked",
        "review_filter_changed",
        "codegen_session_start",
        "codegen_preview_ready",
        "codegen_error",
        "codegen_repair_outcome",
        "account_signed_in",
        "account_signed_out",
        "account_deleted",
        "telemetry_opt_in",
        "telemetry_opt_out",
        "app_heartbeat",
        "assistant_turn_started",
        "assistant_turn_completed",
        "assistant_turn_failed",
        "assistant_tool_invoked",
        "send_message_started",
        "send_message_completed",
        "send_message_failed",
        "integration_connect_started",
        "integration_connect_completed",
        "integration_connect_failed",
        "feature_entered",
        "feature_exited",
        "provider_error",
        "review_opened",
        "review_bulk_applied",
        "review_reassign",
        "review_dismissed",
        "setup_milestone",
        "brain_map_node_clicked",
        "brain_map_source_opened",
        "brain_map_empty_state",
        "memory_recalled",
        "memory_evicted_stale",
        "sort_structure_enabled",
        "sort_structure_cap_applied",
        "sort_structure_pack_imported",
        "mail_reply_proposed",
        "mail_reply_opened",
        "mail_reply_sent",
        "mail_reply_dismissed",
        "mail_reply_failed",
    }
)

# Optional allowlisted keys inside props (string / number / bool only).
ALLOWED_PROP_KEYS: frozenset[str] = frozenset(
    {
        "step",
        "tab",
        "from_tab",
        "duration_bucket",
        "ui_locale",
        "theme",
        "destination",
        "filter_field",
        "selection",
        "stack",
        "follow_up",
        "channel",
        "tool_count",
        "outcome",
        "error_class",
        "provider",
        "tool_name",
        "platform",
        "method",
        "feature",
        "model",
        "file_count_bucket",
        "uncertain_rate_bucket",
        "failed_sort_bucket",
        "failed_fetch_bucket",
        "source",
        "ocr_used",
        "reason",
        "stage",
        "milestone",
        "count_bucket",
        "intent_bucket",
        "structure_depth",
        "structure_themes",
        "has_structure_caps",
        "overflow_count_bucket",
        "pack_id",
    }
)

_FEEDBACK_MAX_LEN = 4000
_CATEGORY = Literal["bug", "ux", "idea", "other"]


def _reject_forbidden_keys(obj: dict[str, Any], path: str = "props") -> None:
    lower_keys = {k.lower() for k in obj}
    for forbidden in FORBIDDEN_PROP_KEYS:
        if forbidden.lower() in lower_keys:
            raise ValueError(f"Forbidden key in {path}: {forbidden}")


class UiEventItem(BaseModel):
    v: int = Field(default=SCHEMA_VERSION, ge=1, le=1)
    name: str = Field(min_length=1, max_length=128)
    props: dict[str, Any] = Field(default_factory=dict)

    @field_validator("name")
    @classmethod
    def name_allowlist(cls, v: str) -> str:
        if v not in ALLOWED_EVENT_NAMES:
            raise ValueError(f"Unknown event name: {v}")
        return v

    @field_validator("props")
    @classmethod
    def props_safe(cls, v: dict[str, Any]) -> dict[str, Any]:
        _reject_forbidden_keys(v, "props")
        for key, val in v.items():
            if key not in ALLOWED_PROP_KEYS:
                raise ValueError(f"Props key not allowlisted: {key}")
            if type(val) not in (str, int, float, bool):
                raise ValueError(f"Invalid prop type for {key}")
            if isinstance(val, str) and len(val) > 512:
                raise ValueError(f"Prop string too long: {key}")
        return v


class TelemetryBatchIn(BaseModel):
    instance_id: str = Field(min_length=8, max_length=128)
    session_id: str | None = Field(default=None, min_length=8, max_length=128)
    app_version: str = Field(default="unknown", max_length=64)
    platform: str = Field(default="unknown", max_length=64)
    locale: str = Field(default="en", max_length=16)
    client_ts_ms: int | None = Field(default=None, ge=0)
    events: list[UiEventItem] = Field(default_factory=list, max_length=50)

    @field_validator("instance_id")
    @classmethod
    def instance_id_format(cls, v: str) -> str:
        if not re.match(r"^[a-zA-Z0-9._:-]+$", v):
            raise ValueError("instance_id has invalid characters")
        return v

    @field_validator("session_id")
    @classmethod
    def session_id_format(cls, v: str | None) -> str | None:
        if v is None:
            return None
        if not re.match(r"^[a-zA-Z0-9._:-]+$", v):
            raise ValueError("session_id has invalid characters")
        return v


class FeedbackIn(BaseModel):
    instance_id: str = Field(min_length=8, max_length=128)
    category: _CATEGORY = "ux"
    message: str = Field(min_length=1, max_length=_FEEDBACK_MAX_LEN)
    app_version: str = Field(default="unknown", max_length=64)
    locale: str = Field(default="en", max_length=16)

    @field_validator("message")
    @classmethod
    def message_no_paths(cls, v: str) -> str:
        # Heuristic: block obvious Windows / Unix path patterns in free text.
        if re.search(r"(?:[A-Za-z]:\\|/Users/|/home/|\\\\)", v):
            raise ValueError("Message must not contain file paths")
        return v.strip()

    @field_validator("instance_id")
    @classmethod
    def instance_id_format(cls, v: str) -> str:
        if not re.match(r"^[a-zA-Z0-9._:-]+$", v):
            raise ValueError("instance_id has invalid characters")
        return v
