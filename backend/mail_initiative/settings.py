"""Gates for ready-to-send Gmail replies (kill switch, toggle, Pro, send scope)."""

from __future__ import annotations

import os
from typing import Literal

from mail_initiative import store

GatedReason = Literal["pro", "toggle_off", "no_scope", "disabled"]

_KILL = "EXOSITES_DISABLE_GMAIL_READY_REPLIES"
_ENABLED_KEY = "enabled"


def is_kill_switched() -> bool:
    return os.environ.get(_KILL, "").strip() == "1"


def is_enabled() -> bool:
    raw = store.get_setting(_ENABLED_KEY)
    if raw is None:
        return True
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def set_enabled(enabled: bool) -> None:
    store.set_setting(_ENABLED_KEY, "true" if enabled else "false")


def _has_gmail_token() -> bool:
    from connector_credentials import CredentialUnavailableError, try_get_token

    try:
        try_get_token("google-gmail", "google")
        return True
    except CredentialUnavailableError:
        return False


def has_send_scope() -> bool:
    """True when the connector token includes gmail.send (tokeninfo, fail open if unreachable)."""
    if not _has_gmail_token():
        return False
    from mail_initiative.gmail_api import token_has_send_scope

    return token_has_send_scope()


def gated_reason() -> GatedReason | None:
    if is_kill_switched():
        return "disabled"
    from entitlement_gate import may_use_proactive

    allowed, _ = may_use_proactive()
    if not allowed:
        return "pro"
    if not is_enabled():
        return "toggle_off"
    if not has_send_scope():
        return "no_scope"
    return None
