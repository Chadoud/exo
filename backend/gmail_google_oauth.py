"""
Google OAuth 2.0 for Gmail (read-only), adapted from OpenJarvis patterns.

Original reference: OpenJarvis ``connectors/oauth.py`` (Apache-2.0).
Local loopback consent + token exchange; tokens stored under ``APP_STATE_DIR``.
"""

from __future__ import annotations

import html
import json
import os
import pathlib
import secrets
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from typing import Any
from urllib.parse import parse_qs, urlencode, urlparse

import httpx

from constants import APP_DISPLAY_NAME, APP_STATE_DIR

GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly"
_GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth"
_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"


def gmail_token_file() -> pathlib.Path:
    """Path to persisted Gmail OAuth token JSON (0600).

    Electron materializes tokens under ``EXOSITES_USER_DATA`` while a backend
    that actually bound the listen port is running. Do not delete this file from
    interpreter ``atexit``: failed uvicorn children (port already in use) still
    import this module and would wipe the live backend's session.
    """
    user_data = (os.environ.get("EXOSITES_USER_DATA") or "").strip()
    if user_data:
        return pathlib.Path(user_data) / "gmail_oauth.json"
    return APP_STATE_DIR / "gmail_oauth.json"


def _oauth_callback_port() -> int:
    raw = os.environ.get("EXOSITES_GMAIL_OAUTH_PORT", "8789").strip()
    try:
        p = int(raw, 10)
        return p if 1024 <= p <= 65535 else 8789
    except ValueError:
        return 8789


def default_redirect_uri() -> str:
    """Default redirect URI when ``EXOSITES_GMAIL_OAUTH_REDIRECT_URI`` is unset."""
    return f"http://127.0.0.1:{_oauth_callback_port()}/callback"


def oauth_redirect_uri() -> str:
    """
    Redirect URI for auth + token exchange (must match Google Cloud **Authorized redirect URIs** exactly).
    """
    u = (os.environ.get("EXOSITES_GMAIL_OAUTH_REDIRECT_URI") or "").strip()
    return u if u else default_redirect_uri()


def _credentials_from_installed_json(data: dict[str, Any]) -> tuple[str, str] | None:
    """Parse Google ``credentials.json`` (``installed`` or ``web`` client)."""
    inst = data.get("installed") if isinstance(data.get("installed"), dict) else None
    if inst is None and isinstance(data.get("web"), dict):
        inst = data["web"]
    if not isinstance(inst, dict):
        return None
    cid = str(inst.get("client_id") or "").strip()
    sec = str(inst.get("client_secret") or "").strip()
    if cid and sec:
        return cid, sec
    return None


def google_client_credentials() -> tuple[str, str] | None:
    """
    OAuth client id + secret from, in order:

    1. ``EXOSITES_GOOGLE_CLIENT_ID`` + ``EXOSITES_GOOGLE_CLIENT_SECRET`` (both non-empty)
    2. ``EXOSITES_GOOGLE_OAUTH_CLIENT_ID`` + optional ``EXOSITES_GOOGLE_CLIENT_SECRET`` (Electron / PKCE; secret may be empty for native Desktop clients)
    3. JSON path in ``EXOSITES_GOOGLE_OAUTH_CLIENT_JSON`` (Desktop ``credentials.json``)
    4. ``~/.ai-file-sorter/gmail_oauth_client.json`` (same format)
    """
    cid = (os.environ.get("EXOSITES_GOOGLE_CLIENT_ID") or "").strip()
    sec = (os.environ.get("EXOSITES_GOOGLE_CLIENT_SECRET") or "").strip()
    if cid and sec:
        return cid, sec

    oauth_cid = (os.environ.get("EXOSITES_GOOGLE_OAUTH_CLIENT_ID") or "").strip()
    if oauth_cid:
        return oauth_cid, sec

    paths: list[pathlib.Path] = []
    env_path = (os.environ.get("EXOSITES_GOOGLE_OAUTH_CLIENT_JSON") or "").strip()
    if env_path:
        paths.append(pathlib.Path(env_path).expanduser())
    paths.append(APP_STATE_DIR / "gmail_oauth_client.json")

    for p in paths:
        if not p.is_file():
            continue
        try:
            raw = json.loads(p.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError, UnicodeDecodeError):
            continue
        pair = _credentials_from_installed_json(raw)
        if pair:
            return pair
    return None


def build_google_auth_url(*, client_id: str, redirect_uri: str, scopes: list[str], state: str) -> str:
    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": " ".join(scopes),
        "access_type": "offline",
        "prompt": "consent",
        "state": state,
    }
    return f"{_GOOGLE_AUTH_ENDPOINT}?{urlencode(params)}"


def exchange_google_token(
    *,
    code: str,
    client_id: str,
    client_secret: str,
    redirect_uri: str,
) -> dict[str, Any]:
    with httpx.Client(timeout=30.0) as client:
        resp = client.post(
            _TOKEN_ENDPOINT,
            data={
                "code": code,
                "client_id": client_id,
                "client_secret": client_secret,
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code",
            },
        )
        resp.raise_for_status()
        return resp.json()


def refresh_google_access_token(
    *,
    refresh_token: str,
    client_id: str,
    client_secret: str,
) -> dict[str, Any]:
    with httpx.Client(timeout=30.0) as client:
        resp = client.post(
            _TOKEN_ENDPOINT,
            data={
                "refresh_token": refresh_token,
                "client_id": client_id,
                "client_secret": client_secret,
                "grant_type": "refresh_token",
            },
        )
        resp.raise_for_status()
        return resp.json()


def load_gmail_token_payload() -> dict[str, Any] | None:
    p = gmail_token_file()
    if not p.is_file():
        return None
    try:
        data: dict[str, Any] = json.loads(p.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    # Lazy migration: older versions wrote client_secret into this file.
    # Strip it on first read so it is no longer persisted on disk.
    # Token refresh continues to work because get_valid_access_token() falls back
    # to google_client_credentials() (env / JSON key file) when the field is absent.
    if "client_secret" in data:
        data.pop("client_secret")
        try:
            save_gmail_token_payload(data)
        except OSError:
            pass
    return data


def save_gmail_token_payload(data: dict[str, Any]) -> None:
    p = gmail_token_file()
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(data, indent=2), encoding="utf-8")
    try:
        os.chmod(p, 0o600)
    except OSError:
        pass


def delete_gmail_token_file() -> None:
    """Explicit disconnect only. Electron owns crash/quit wipe of the ephemeral file."""
    p = gmail_token_file()
    if p.is_file():
        p.unlink()


def _access_token_from_relay_cache() -> str | None:
    """Desktop sort/import: Electron already pushed the live access token."""
    try:
        from connector_credentials import CredentialUnavailableError, try_get_token
    except ImportError:
        return None
    try:
        token = try_get_token("google-gmail", "google-all", "google").strip()
    except CredentialUnavailableError:
        return None
    return token or None


def is_gmail_connected() -> bool:
    data = load_gmail_token_payload()
    if data and bool((data.get("refresh_token") or data.get("access_token") or "").strip()):
        return True
    return _access_token_from_relay_cache() is not None


def _merge_token_save(
    *,
    token_response: dict[str, Any],
    client_id: str,
    client_secret: str,
    previous: dict[str, Any] | None,
) -> dict[str, Any]:
    """Persist access + refresh; keep prior refresh_token if Google omits it.

    ``client_secret`` is intentionally NOT written to disk — it is read from the
    environment or credential file at refresh time via ``google_client_credentials()``.
    """
    prev_rt = (previous or {}).get("refresh_token") or ""
    new_rt = token_response.get("refresh_token") or ""
    refresh = new_rt if isinstance(new_rt, str) and new_rt.strip() else prev_rt
    payload: dict[str, Any] = {
        "access_token": str(token_response.get("access_token", "") or ""),
        "refresh_token": str(refresh or ""),
        "token_type": str(token_response.get("token_type", "Bearer") or "Bearer"),
        "expires_in": int(token_response.get("expires_in", 3600) or 3600),
        "obtained_at": time.time(),
        "client_id": client_id,
        # client_secret is deliberately omitted — read from env at refresh time.
    }
    save_gmail_token_payload(payload)
    return payload


_oauth_lock = threading.Lock()
"""Serialize Gmail access-token refresh and disk writes (parallel import workers may 401)."""
_gmail_token_refresh_lock = threading.Lock()
_oauth_flow_active_flag = False
_oauth_cancel_event: threading.Event | None = None
_oauth_flow_thread: threading.Thread | None = None
_oauth_flow_error: str | None = None


def is_gmail_oauth_flow_active() -> bool:
    """True while a browser Gmail sign-in is waiting for the loopback callback."""
    with _oauth_lock:
        return _oauth_flow_active_flag


def get_gmail_oauth_flow_error() -> str | None:
    """Last OAuth failure message after the flow ended (success clears)."""
    with _oauth_lock:
        return _oauth_flow_error


def _gmail_oauth_loopback_page(*, variant: str, headline: str, subline: str) -> bytes:
    """Branded HTML for Gmail OAuth loopback (matches Electron ``oauthCallbackHtml.js``)."""
    esc = html.escape
    brand = esc(APP_DISPLAY_NAME)
    hl = esc(headline)
    sl = esc(subline)
    ok = variant == "success"
    icon_wrap = "icon-wrap icon-wrap--ok" if ok else "icon-wrap icon-wrap--err"
    if ok:
        icon_svg = """
    <svg class="icon icon--ok" viewBox="0 0 48 48" width="48" height="48" aria-hidden="true">
      <circle cx="24" cy="24" r="22" fill="none" stroke="currentColor" stroke-width="2" opacity="0.35"/>
      <path fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
            d="M14 24l7 7 13-14"/>
    </svg>"""
    else:
        icon_svg = """
    <svg class="icon icon--err" viewBox="0 0 48 48" width="48" height="48" aria-hidden="true">
      <circle cx="24" cy="24" r="22" fill="none" stroke="currentColor" stroke-width="2" opacity="0.35"/>
      <path fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" d="M17 17l14 14M31 17L17 31"/>
    </svg>"""
    page = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <meta name="color-scheme" content="dark"/>
  <title>{hl}</title>
  <style>
    * {{ box-sizing: border-box; margin: 0; padding: 0; }}
    :root {{
      --bg: #0f1117;
      --surface: #1a1d27;
      --accent: #6c63ff;
      --text: #e8eaf6;
      --muted: #8b8fa8;
      --border: #2e3248;
      --success: #4caf7d;
      --error: #ef5350;
    }}
    body {{
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      font-family: Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      -webkit-font-smoothing: antialiased;
    }}
    .bg-glow {{
      position: fixed;
      inset: 0;
      pointer-events: none;
      background:
        radial-gradient(ellipse 85% 55% at 50% -15%, rgba(108, 99, 255, 0.2), transparent 55%),
        radial-gradient(ellipse 50% 35% at 100% 100%, rgba(76, 175, 125, 0.09), transparent 50%);
    }}
    .card {{
      position: relative;
      max-width: 420px;
      width: 100%;
      padding: 40px 36px 36px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 20px;
      box-shadow:
        0 24px 56px rgba(0, 0, 0, 0.4),
        0 0 0 1px rgba(255, 255, 255, 0.04) inset;
      text-align: center;
    }}
    .icon-wrap {{
      display: flex;
      align-items: center;
      justify-content: center;
      width: 72px;
      height: 72px;
      margin: 0 auto 20px;
      border-radius: 50%;
    }}
    .icon-wrap--ok {{ color: var(--success); background: rgba(76, 175, 125, 0.12); }}
    .icon-wrap--err {{ color: var(--error); background: rgba(239, 83, 80, 0.12); }}
    .icon {{ display: block; }}
    h1 {{
      font-size: 1.35rem;
      font-weight: 600;
      letter-spacing: -0.02em;
      line-height: 1.3;
      margin-bottom: 12px;
    }}
    p {{
      font-size: 0.95rem;
      line-height: 1.55;
      color: var(--muted);
    }}
    .brand {{
      margin-top: 28px;
      padding-top: 22px;
      border-top: 1px solid var(--border);
      font-size: 0.75rem;
      font-weight: 600;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--accent);
      opacity: 0.9;
    }}
  </style>
</head>
<body>
  <div class="bg-glow" aria-hidden="true"></div>
  <main class="card" role="status">
    <div class="{icon_wrap}">{icon_svg}
    </div>
    <h1>{hl}</h1>
    <p>{sl}</p>
    <p class="brand">{brand}</p>
  </main>
</body>
</html>"""
    return page.encode("utf-8")


def abort_gmail_oauth_flow() -> None:
    """Signal the in-flight loopback wait to stop (user closed the browser or tapped Cancel)."""
    t: threading.Thread | None = None
    c: threading.Event | None = None
    with _oauth_lock:
        c = _oauth_cancel_event
        t = _oauth_flow_thread
    if c is not None:
        c.set()
    if t is not None and t.is_alive():
        t.join(timeout=8.0)


def _oauth_callback_handler_factory(
    auth_code: list[str], oauth_error: list[str], expected_state: str
) -> type[BaseHTTPRequestHandler]:
    class _CallbackHandler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:  # noqa: N802
            parsed = urlparse(self.path)
            params = parse_qs(parsed.query)

            # CSRF: verify the state parameter matches what we sent.
            returned_state = (params.get("state") or [""])[0]
            if not secrets.compare_digest(returned_state, expected_state):
                oauth_error.append("state_mismatch")
                self.send_response(400)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.end_headers()
                self.wfile.write(
                    _gmail_oauth_loopback_page(
                        variant="error",
                        headline="Gmail sign-in didn't finish",
                        subline="Security check failed (state mismatch). Try again from the app.",
                    )
                )
                return

            if "code" in params:
                auth_code.append(params["code"][0])
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.end_headers()
                self.wfile.write(
                    _gmail_oauth_loopback_page(
                        variant="success",
                        headline="Gmail connected",
                        subline="You can close this tab and return to the app.",
                    )
                )
            elif "error" in params:
                oauth_error.append(params["error"][0])
                self.send_response(400)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.end_headers()
                self.wfile.write(
                    _gmail_oauth_loopback_page(
                        variant="error",
                        headline="Gmail sign-in didn't finish",
                        subline="You can close this tab and try again from the app.",
                    )
                )
            else:
                self.send_response(400)
                self.end_headers()

        def log_message(self, _format: str, *_args: Any) -> None:
            return

    return _CallbackHandler


def _gmail_oauth_background_worker(
    *,
    server: HTTPServer,
    client_id: str,
    client_secret: str,
    redirect_uri: str,
    auth_code: list[str],
    oauth_error: list[str],
    cancel: threading.Event,
    timeout_seconds: float,
) -> None:
    outcome_error: str | None = None
    try:
        deadline = time.monotonic() + timeout_seconds
        while not auth_code and not oauth_error and not cancel.is_set():
            if time.monotonic() > deadline:
                break
            server.timeout = 1.0
            server.handle_request()
        if cancel.is_set():
            outcome_error = None
        elif oauth_error:
            outcome_error = f"OAuth authorization failed: {oauth_error[0]}"
        elif not auth_code:
            outcome_error = "OAuth authorization timed out or was cancelled."
        else:
            try:
                previous = load_gmail_token_payload()
                tokens = exchange_google_token(
                    code=auth_code[0],
                    client_id=client_id,
                    client_secret=client_secret,
                    redirect_uri=redirect_uri,
                )
                _merge_token_save(
                    token_response=tokens,
                    client_id=client_id,
                    client_secret=client_secret,
                    previous=previous,
                )
                outcome_error = None
            except Exception as exc:
                outcome_error = str(exc)
    finally:
        try:
            server.server_close()
        except OSError:
            pass
        with _oauth_lock:
            global _oauth_flow_active_flag, _oauth_flow_error, _oauth_cancel_event, _oauth_flow_thread
            _oauth_flow_active_flag = False
            _oauth_flow_error = outcome_error
            _oauth_cancel_event = None
            _oauth_flow_thread = None


def begin_gmail_oauth_browser_flow(*, timeout_seconds: float = 300.0) -> str:
    """
    Bind the loopback callback server and return the Google authorize URL.

    A background thread waits for redirect, exchange, and token save. The UI should
    open ``auth_url`` in a browser window and call :func:`abort_gmail_oauth_flow` if
    the user closes that window without finishing.
    """
    global _oauth_flow_error, _oauth_cancel_event, _oauth_flow_thread, _oauth_flow_active_flag
    with _oauth_lock:
        if _oauth_flow_active_flag:
            raise RuntimeError("Another Gmail sign-in is already in progress.")

    creds = google_client_credentials()
    if not creds:
        raise RuntimeError(
            "Gmail OAuth is not configured. Set EXOSITES_GOOGLE_CLIENT_ID and "
            "EXOSITES_GOOGLE_CLIENT_SECRET, or place a Desktop client JSON at "
            f"{APP_STATE_DIR / 'gmail_oauth_client.json'} (see gmail_oauth_client.json.example), "
            "or set EXOSITES_GOOGLE_OAUTH_CLIENT_JSON to that file's path."
        )
    client_id, client_secret = creds
    redirect_uri = oauth_redirect_uri()
    scopes = [GMAIL_READONLY_SCOPE]

    # Generate a cryptographically random state for CSRF protection.
    oauth_state = secrets.token_urlsafe(32)

    auth_code: list[str] = []
    oauth_error: list[str] = []
    handler_cls = _oauth_callback_handler_factory(auth_code, oauth_error, oauth_state)
    parsed_ru = urlparse(redirect_uri)
    port = parsed_ru.port or _oauth_callback_port()
    bind_host = (parsed_ru.hostname or "127.0.0.1").strip() or "127.0.0.1"
    try:
        server = HTTPServer((bind_host, port), handler_cls)
    except OSError as exc:
        raise RuntimeError(
            f"Could not start OAuth callback on {bind_host}:{port}. "
            "Use EXOSITES_GMAIL_OAUTH_REDIRECT_URI / EXOSITES_GMAIL_OAUTH_PORT so this host, port, "
            f"and path match an **Authorized redirect URI** in Google Cloud Console. ({exc})"
        ) from exc

    with _oauth_lock:
        if _oauth_flow_active_flag:
            try:
                server.server_close()
            except OSError:
                pass
            raise RuntimeError("Another Gmail sign-in is already in progress.")

    auth_url = build_google_auth_url(
        client_id=client_id,
        redirect_uri=redirect_uri,
        scopes=scopes,
        state=oauth_state,
    )

    cancel = threading.Event()

    def worker() -> None:
        _gmail_oauth_background_worker(
            server=server,
            client_id=client_id,
            client_secret=client_secret,
            redirect_uri=redirect_uri,
            auth_code=auth_code,
            oauth_error=oauth_error,
            cancel=cancel,
            timeout_seconds=timeout_seconds,
        )

    thread = threading.Thread(target=worker, name="gmail-oauth", daemon=True)
    with _oauth_lock:
        _oauth_flow_error = None
        _oauth_cancel_event = cancel
        _oauth_flow_thread = thread
        _oauth_flow_active_flag = True
    thread.start()
    return auth_url


def get_valid_access_token(*, force_refresh: bool = False) -> str:
    """
    Return a non-expired access token, refreshing with the refresh_token when needed.

    Use ``force_refresh=True`` when Gmail returns 401 for a call that used a token that still
    looked valid locally (clock skew, revocation, or Google invalidating the access token early).

    Raises:
        RuntimeError: not connected or refresh failure.
    """
    with _gmail_token_refresh_lock:
        data = load_gmail_token_payload()
        if not data:
            relayed = _access_token_from_relay_cache()
            if relayed:
                return relayed
            raise RuntimeError("Gmail is not connected. Run Connect Gmail first.")
        access = str(data.get("access_token", "") or "").strip()
        refresh = str(data.get("refresh_token", "") or "").strip()
        cid = str(data.get("client_id", "") or "").strip()
        sec = str(data.get("client_secret", "") or "").strip()
        if not cid or not sec:
            env = google_client_credentials()
            if env:
                cid, sec = env
        if not refresh:
            raise RuntimeError("Gmail session has no refresh token; connect again.")
        if not cid or not sec:
            raise RuntimeError("Missing OAuth client credentials for token refresh.")

        obtained = float(data.get("obtained_at", 0) or 0)
        expires_in = int(data.get("expires_in", 3600) or 3600)
        if (
            not force_refresh
            and access
            and (time.time() - obtained) < max(60, expires_in - 120)
        ):
            return access

        refreshed = refresh_google_access_token(
            refresh_token=refresh,
            client_id=cid,
            client_secret=sec,
        )
        new_access = str(refreshed.get("access_token", "") or "").strip()
        if not new_access:
            raise RuntimeError("Token refresh did not return an access_token.")
        data["access_token"] = new_access
        data["token_type"] = str(refreshed.get("token_type", data.get("token_type", "Bearer")))
        data["expires_in"] = int(refreshed.get("expires_in", data.get("expires_in", 3600)) or 3600)
        data["obtained_at"] = time.time()
        if refreshed.get("refresh_token"):
            data["refresh_token"] = str(refreshed["refresh_token"])
        save_gmail_token_payload(data)
        return new_access
