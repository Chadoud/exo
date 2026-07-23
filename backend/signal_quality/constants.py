"""Shared noise / spam signal constants for mail and memory ingestion."""

from __future__ import annotations

# Gmail labelIds that indicate low-value mail (aligned with assistant_routes + gmail_import).
GMAIL_NOISE_LABELS = frozenset(
    {
        "SPAM",
        "TRASH",
        "CATEGORY_PROMOTIONS",
        "CATEGORY_SOCIAL",
        "CATEGORY_FORUMS",
    }
)

# Gmail Updates tab — noisy but sometimes has receipts; excluded in balanced mode.
GMAIL_UPDATES_LABEL = "CATEGORY_UPDATES"

# Canonical query suffix for task harvest / recap (single source of truth).
GMAIL_NOISE_QUERY_EXCLUSIONS = (
    "-category:promotions -category:social -category:forums -category:updates -in:spam"
)

# Preference / consent keys that must never be blocked by signal gate.
SIGNAL_CHECK_BYPASS_KEYS = frozenset(
    {
        "startup_briefing_consent",
        "startup_briefing_consent_v2",
        "startup_routine",
    }
)

# Provenance values stored on memory_entries.
PROVENANCE_MANUAL = "manual"
PROVENANCE_CHAT = "chat"
PROVENANCE_MEETING = "meeting"
PROVENANCE_MAIL = "mail"
PROVENANCE_CALENDAR = "calendar"
PROVENANCE_INTEGRATION = "integration"

# Unreviewed auto-memories at or above this score are hidden from prompts and search.
AUTO_MEMORY_HIDDEN_NOISE_THRESHOLD = 0.35

# Unreviewed auto-memories at or above this score are excluded from Needs review triage UI.
# Aligned with AUTO_MEMORY_HIDDEN_NOISE_THRESHOLD — nothing orphaned between All and triage.
AUTO_MEMORY_TRIAGE_MAX_NOISE = 0.35
