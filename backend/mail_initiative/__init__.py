"""Ready-to-send Gmail replies — local store + dedicated HTTP, not the tool bus."""

from __future__ import annotations

from mail_initiative.settings import (
    GatedReason,
    gated_reason,
    is_enabled,
    is_kill_switched,
    set_enabled,
)
from mail_initiative.store import clear_all

__all__ = [
    "GatedReason",
    "clear_all",
    "gated_reason",
    "is_enabled",
    "is_kill_switched",
    "set_enabled",
]
