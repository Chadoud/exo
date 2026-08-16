"""
Connector credential bridge — retrieves OAuth access tokens per provider.

Token resolution order:
  1. In-memory token cache (populated via POST /integration/token-relay from Electron)
  2. Environment variable (e.g. CONNECTOR_TOKEN_GOOGLE for provider "google")

Raises CredentialUnavailableError when no token is found so callers fail fast
with a clear, actionable error message rather than a silent empty response.
"""

from __future__ import annotations

import logging
import os
import time
from dataclasses import dataclass

logger = logging.getLogger(__name__)

# Environment variable prefix for manual/CI token injection.
# Example: provider "google-drive" → env var CONNECTOR_TOKEN_GOOGLE_DRIVE
_ENV_PREFIX = "CONNECTOR_TOKEN_"


class CredentialUnavailableError(Exception):
    """Raised when no valid access token exists for the requested provider."""


@dataclass
class _TokenEntry:
    token: str
    expires_at: float  # monotonic seconds; 0.0 means no expiry recorded


# provider_id → most recently relayed token
_token_cache: dict[str, _TokenEntry] = {}

# Canonical provider IDs accepted from POST /integration/token-relay.
RELAY_PROVIDER_IDS = frozenset(
    {
        "google",
        "google-all",
        "google-gmail",
        "google-drive",
        "google-calendar",
        "microsoft",
        "onedrive",
        "outlook",
        "dropbox",
        "notion",
        "slack",
        "whatsapp",
        "s3",
        "icloud",
        "infomaniak",
        "infomaniak-calendar",
    }
)


def store_token(provider_id: str, token: str, expires_in: int = 0) -> None:
    """
    Store an access token for a provider.

    Called by the token-relay endpoint when Electron pushes a fresh token
    after OAuth connect or a scheduled refresh.

    Args:
        provider_id: Canonical provider identifier (e.g. "google", "dropbox").
        token: OAuth access token string.
        expires_in: Lifetime in seconds. 0 means no expiry tracked.

    Raises:
        ValueError: provider_id is not in the relay allowlist.
    """
    normalized = (provider_id or "").strip().lower()
    if normalized not in RELAY_PROVIDER_IDS:
        raise ValueError(f"provider_id {provider_id!r} is not allowed for token relay")
    expires_at = (time.monotonic() + expires_in) if expires_in > 0 else 0.0
    _token_cache[normalized] = _TokenEntry(token=token, expires_at=expires_at)
    logger.debug("[creds] stored token for %r (expires_in=%ds)", normalized, expires_in)


def get_token(provider_id: str) -> str:
    """
    Return a valid access token for provider_id.

    Resolution order:
      1. In-memory cache (token-relay path, populated by Electron after OAuth).
      2. Environment variable CONNECTOR_TOKEN_<PROVIDER_ID_UPPERCASED>.

    Raises:
        CredentialUnavailableError: No token found or the cached one has expired.
    """
    # 1. In-memory cache
    entry = _token_cache.get(provider_id)
    if entry is not None:
        if entry.expires_at == 0.0 or time.monotonic() < entry.expires_at:
            return entry.token
        # Stale — evict
        del _token_cache[provider_id]
        logger.debug("[creds] cached token for %r expired", provider_id)

    # 2. Environment variable: CONNECTOR_TOKEN_GOOGLE_DRIVE → provider "google-drive"
    env_key = _ENV_PREFIX + provider_id.upper().replace("-", "_")
    env_val = os.environ.get(env_key, "").strip()
    if env_val:
        return env_val

    raise CredentialUnavailableError(
        f"No access token available for provider {provider_id!r}. "
        f"Connect the account in Settings → External Sources, or set the "
        f"{env_key} environment variable."
    )


def try_get_token(*provider_ids: str) -> str:
    """
    Try each provider ID in order and return the first available token.

    Useful for providers that share a single OAuth session across sub-services
    (e.g. "google", "google-drive", "gmail" all use the same Google token).

    Raises:
        CredentialUnavailableError: None of the provider IDs have a token.
    """
    for pid in provider_ids:
        try:
            return get_token(pid)
        except CredentialUnavailableError:
            continue
    raise CredentialUnavailableError(
        f"No access token available for any of: {list(provider_ids)}. "
        "Connect the account in Settings → External Sources."
    )


def list_connected_providers() -> list[str]:
    """Return provider IDs that currently have a non-expired token (cache + env)."""
    now = time.monotonic()
    connected: list[str] = []

    for pid, entry in list(_token_cache.items()):
        if entry.expires_at == 0.0 or now < entry.expires_at:
            connected.append(pid)

    for key, val in os.environ.items():
        if key.startswith(_ENV_PREFIX) and val.strip():
            pid = key[len(_ENV_PREFIX):].lower().replace("_", "-")
            if pid not in connected:
                connected.append(pid)

    return connected


def clear_token(provider_id: str) -> None:
    """Evict one relayed OAuth token (disconnect)."""
    normalized = (provider_id or "").strip().lower()
    _token_cache.pop(normalized, None)


def clear_all_tokens() -> None:
    """Evict all in-memory relayed OAuth tokens (privacy wipe)."""
    _token_cache.clear()
    logger.info("[creds] cleared in-memory token cache")
