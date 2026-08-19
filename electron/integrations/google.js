/**
 * Google OAuth (PKCE, loopback) + Drive v3 helpers (list + app-scoped uploads).
 * Set EXOSITES_GOOGLE_OAUTH_CLIENT_ID to a Google OAuth client ID (Desktop or Web).
 * Loopback redirect uses a random port; register loopback URIs per Google’s OAuth client type docs.
 * If the client is **Web** (has a secret), set EXOSITES_GOOGLE_CLIENT_SECRET in backend/.env — the app
 * forwards it on the token request when present (same pair as Gmail).
 */

const crypto = require("crypto");
const os = require("os");
const { generatePkcePair, b64url } = require("./pkce");
const { startLoopbackServer } = require("./loopbackServer");
const fs = require("fs").promises;
const fssync = require("fs");
const path = require("path");
const { URL } = require("url");
const { shell, app } = require("electron");
const { oauthLoopbackSuccessHtml, oauthLoopbackErrorHtml } = require("../oauthCallbackHtml");
const { openAuthUrl } = require("./oauthAutopilot");
const { safeLocalBasename, googleAppExportTarget } = require("./googleDriveExportMap");
const {
  saveGmailOAuthMirror,
  clearGmailOAuthMirror,
  materializeGmailOAuthMirrorForBackend,
  deleteMaterializedGmailOAuthMirror,
  legacyHomeMirrorPath,
} = require("../gmailOAuthMirrorStore");

const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
const DRIVE_FILES = "https://www.googleapis.com/drive/v3/files";
const DRIVE_UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";

const DRIVE_IMPORT_MAX_BYTES_PER_FILE = 50 * 1024 * 1024;
const DRIVE_METADATA_TIMEOUT_MS = 15_000;
const DRIVE_DOWNLOAD_TIMEOUT_MS = 60_000;

const MIME_FOLDER = "application/vnd.google-apps.folder";

/**
 * Gmail OAuth (mirrored to Python ``gmail_oauth.json``).
 * - gmail.modify: read/search messages and label/move/trash them.
 * - gmail.send: send email on the user's behalf.
 * - gmail.settings.basic: create inbox filters (create_filter).
 * Reconnecting the Google account is required after changing these so Google
 * re-issues a refresh token covering the new scope set.
 */
const SCOPES_GMAIL = [
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.settings.basic",
].join(" ");

/**
 * Drive — full read/write so the assistant can list, search, move, and create
 * folders on any file (not only app-created ones). Used when connecting Drive
 * separately.
 */
const SCOPES_DRIVE = [
  "https://www.googleapis.com/auth/drive",
].join(" ");

/**
 * Google Calendar — read calendar list plus create/update/delete events.
 * Separate OAuth slot from Gmail/Drive.
 */
const SCOPES_CALENDAR = [
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events",
].join(" ");

/** Union of Gmail + Drive + Calendar scopes — one OAuth consent for External sources “Connect all”. */
const SCOPES_GOOGLE_ALL = (() => {
  const parts = [
    ...SCOPES_GMAIL.split(/\s+/).filter(Boolean),
    ...SCOPES_DRIVE.split(/\s+/).filter(Boolean),
    ...SCOPES_CALENDAR.split(/\s+/).filter(Boolean),
  ];
  const seen = new Set();
  const unique = [];
  for (const p of parts) {
    if (p && !seen.has(p)) {
      seen.add(p);
      unique.push(p);
    }
  }
  return unique.join(" ");
})();

function getClientId() {
  return (process.env.EXOSITES_GOOGLE_OAUTH_CLIENT_ID || "").trim();
}

/** Web OAuth clients require this on the token endpoint; Desktop / PKCE-only flows omit it. */
function getClientSecret() {
  return (process.env.EXOSITES_GOOGLE_CLIENT_SECRET || "").trim();
}

function gmailOAuthMirrorPath() {
  return legacyHomeMirrorPath();
}

/**
 * Persist Gmail OAuth mirror in safeStorage and materialize for the running backend.
 * @param {{ access_token?: string, refresh_token?: string, expires_at?: number }} secrets
 */
function syncGmailOAuthMirrorFromSecrets(secrets) {
  if (!secrets?.refresh_token) return;
  const clientId = getClientId();
  if (!clientId) return;
  const exp = typeof secrets.expires_at === "number" ? secrets.expires_at : 0;
  const expiresIn =
    exp > Date.now() ? Math.max(120, Math.floor((exp - Date.now()) / 1000)) : 3600;
  const payload = {
    access_token: String(secrets.access_token || ""),
    refresh_token: String(secrets.refresh_token),
    token_type: "Bearer",
    expires_in: expiresIn,
    obtained_at: Date.now() / 1000,
    client_id: clientId,
    // client_secret intentionally omitted — backend reads it from env at refresh time.
  };
  saveGmailOAuthMirror(payload);
  try {
    materializeGmailOAuthMirrorForBackend(require("../accountProfile").resolveProfileRoot());
  } catch {
    /* not in Electron main context */
  }
}

function deleteGmailOAuthMirror() {
  clearGmailOAuthMirror();
  try {
    deleteMaterializedGmailOAuthMirror(require("../accountProfile").resolveProfileRoot());
  } catch {
    /* ignore */
  }
  const p = gmailOAuthMirrorPath();
  try {
    if (fssync.existsSync(p)) fssync.unlinkSync(p);
  } catch (_) {
    /* ignore legacy home mirror */
  }
}

/** @param {URLSearchParams} body */
function appendClientSecretIfPresent(body) {
  const s = getClientSecret();
  if (s) body.set("client_secret", s);
}

/**
 * Abort Google Drive requests that stop making progress so one bad file cannot block a job forever.
 * @template T
 * @param {string} label
 * @param {number} timeoutMs
 * @param {(signal: AbortSignal) => Promise<T>} task
 * @returns {Promise<T>}
 */
async function withDriveRequestTimeout(label, timeoutMs, task) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await task(controller.signal);
  } catch (e) {
    if (e?.name === "AbortError") {
      throw new Error(`${label}_timeout`);
    }
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}


/**
 * Desktop loopback OAuth for a given scope string (space-separated).
 * @param {string} scopeString
 * @param {{ autopilot?: boolean; providerId?: string; label?: string }} [options]
 * @returns {Promise<{ ok: true; tokens: object } | { ok: false; reason: string }>}
 */
async function connectGooglePkceWithScopes(scopeString, options = {}) {
  const clientId = getClientId();
  if (!clientId) {
    return { ok: false, reason: "oauth_not_configured" };
  }
  const { verifier, challenge } = generatePkcePair();
  const state = b64url(crypto.randomBytes(16));

  const ctx = await startLoopbackServer({ label: "[google]" });
  const redirectUri = `http://127.0.0.1:${ctx.port}/callback`;

  return new Promise((resolve) => {
    let settled = false;
    /** @type {{ close: () => Promise<void> }} */
    let auto = { close: async () => {} };

    ctx.server.on("request", async (req, res) => {
      try {
        const host = req.headers.host || "127.0.0.1";
        const u = new URL(req.url || "/", `http://${host}`);
        if (u.pathname !== "/callback") {
          res.writeHead(404, { "Content-Type": "text/plain" });
          res.end("Not found");
          return;
        }
        const code = u.searchParams.get("code");
        const err = u.searchParams.get("error");
        const st = u.searchParams.get("state");

        if (settled) return;

        const failPage = async (reason, headline, subline) => {
          settled = true;
          try {
            if (!res.headersSent) {
              res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
              res.end(oauthLoopbackErrorHtml({ headline, subline }));
            }
          } catch (_) {
            /* client may have disconnected */
          }
          await auto.close();
          await ctx.close();
          resolve({ ok: false, reason });
        };

        if (err) {
          const sub =
            err === "access_denied"
              ? "Access was cancelled or blocked. Use Connect Google in the app to try again."
              : "You can close this tab and try again from the app.";
          await failPage(err, "Google sign-in didn't finish", sub);
          return;
        }
        if (!code || !st) {
          await failPage(
            "missing_code_or_state",
            "Google sign-in didn't finish",
            "Something was missing from Google's response. Try Connect Google again.",
          );
          return;
        }
        if (st !== state) {
          await failPage(
            "state_mismatch",
            "Google sign-in didn't finish",
            "Security check failed. Try Connect Google again.",
          );
          return;
        }

        settled = true;
        try {
          const body = new URLSearchParams({
            grant_type: "authorization_code",
            code,
            redirect_uri: redirectUri,
            client_id: clientId,
            code_verifier: verifier,
          });
          appendClientSecretIfPresent(body);
          const tokenRes = await fetch(GOOGLE_TOKEN, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: body.toString(),
          });
          const tokenText = await tokenRes.text();
          let tokenJson;
          try {
            tokenJson = JSON.parse(tokenText);
          } catch {
            tokenJson = {};
          }
          if (!tokenRes.ok) {
            const msg =
              (typeof tokenJson.error_description === "string" && tokenJson.error_description) ||
              (typeof tokenJson.error === "string" && tokenJson.error) ||
              `token_http_${tokenRes.status}`;
            const shortCode =
              (typeof tokenJson.error === "string" && tokenJson.error) || `http_${tokenRes.status}`;
            console.error("[google-oauth] token exchange failed:", {
              status: tokenRes.status,
              error: tokenJson.error,
              error_description: tokenJson.error_description,
            });
            try {
              if (!res.headersSent) {
                res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
                res.end(
                  oauthLoopbackErrorHtml({
                    headline: "Couldn't finish connecting",
                    subline:
                      `Google did not issue tokens (${shortCode}). Confirm OAuth client type, credentials, and redirect settings, then try again.`,
                  })
                );
              }
            } catch (_) {}
            await auto.close();
            await ctx.close();
            resolve({ ok: false, reason: msg });
            return;
          }
          const expiresAt =
            typeof tokenJson.expires_in === "number"
              ? Date.now() + tokenJson.expires_in * 1000
              : Date.now() + 3600 * 1000;
          try {
            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            res.end(
              oauthLoopbackSuccessHtml({
                headline: "Google account connected",
                subline: "You can close this tab and return to the app.",
              })
            );
          } catch (_) {}
          await auto.close();
          await ctx.close();
          resolve({
            ok: true,
            tokens: {
              access_token: tokenJson.access_token,
              refresh_token: tokenJson.refresh_token,
              expires_at: expiresAt,
            },
          });
        } catch (e) {
          try {
            if (!res.headersSent) {
              res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
              res.end(
                oauthLoopbackErrorHtml({
                  headline: "Couldn't finish connecting",
                  subline: e instanceof Error ? e.message : String(e),
                })
              );
            }
          } catch (_) {}
          await auto.close();
          await ctx.close();
          resolve({ ok: false, reason: e instanceof Error ? e.message : String(e) });
        }
      } catch (e) {
        if (!settled) {
          settled = true;
          await auto.close();
          await ctx.close();
          resolve({ ok: false, reason: e instanceof Error ? e.message : String(e) });
        }
      }
    });

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: scopeString,
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
      access_type: "offline",
      prompt: "consent",
    });
    const authUrl = `${GOOGLE_AUTH}?${params.toString()}`;
    const autopilot = Boolean(options.autopilot);
    auto = openAuthUrl(authUrl, {
      autopilot,
      providerId: options.providerId || "google",
      label: options.label || "Google",
      redirectUri,
    });

    setTimeout(async () => {
      if (!settled) {
        settled = true;
        await auto.close();
        await ctx.close();
        resolve({ ok: false, reason: "timeout" });
      }
    }, 120000);
  });
}

function connectGoogleGmailPkce(options = {}) {
  return connectGooglePkceWithScopes(SCOPES_GMAIL, {
    ...options,
    providerId: options.providerId || "google-gmail",
    label: options.label || "Gmail",
  });
}

function connectGoogleDrivePkce(options = {}) {
  return connectGooglePkceWithScopes(SCOPES_DRIVE, {
    ...options,
    providerId: options.providerId || "google-drive",
    label: options.label || "Google Drive",
  });
}

function connectGoogleCalendarPkce(options = {}) {
  return connectGooglePkceWithScopes(SCOPES_CALENDAR, {
    ...options,
    providerId: options.providerId || "google-calendar",
    label: options.label || "Google Calendar",
  });
}

function connectGoogleAllPkce(options = {}) {
  return connectGooglePkceWithScopes(SCOPES_GOOGLE_ALL, {
    ...options,
    providerId: options.providerId || "google-all",
    label: options.label || "Google",
  });
}

/**
 * Verify Calendar API access and read the primary calendar id (usually the mailbox).
 * @param {string} accessToken
 * @returns {Promise<{ ok: true, email?: string } | { ok: false; reason?: string }>}
 */
async function googleCalendarHealth(accessToken) {
  const res = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = {};
  }
  if (!res.ok) {
    return { ok: false, reason: json.error?.message || `http_${res.status}` };
  }
  const email = emailFromCalendarPrimaryPayload(json);
  return email ? { ok: true, email } : { ok: true };
}

/**
 * List events on the primary calendar in a time range (Calendar API v3).
 * @param {string} accessToken
 * @param {string} timeMin ISO string
 * @param {string} timeMax ISO string
 * @param {number} maxResults
 * @returns {Promise<{ ok: true; events: object[] } | { ok: false; reason?: string }>}
 */
async function listPrimaryCalendarEvents(accessToken, timeMin, timeMax, maxResults) {
  const cap = Math.min(50, Math.max(1, Number(maxResults) || 50));
  const url = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("orderBy", "startTime");
  url.searchParams.set("maxResults", String(cap));
  url.searchParams.set("timeMin", timeMin);
  url.searchParams.set("timeMax", timeMax);
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = {};
  }
  if (!res.ok) {
    const firstSub =
      Array.isArray(json.error?.errors) && json.error.errors[0]
        ? String(json.error.errors[0].message || json.error.errors[0].reason || "")
        : "";
    const msg = [json.error?.message, firstSub].find((s) => typeof s === "string" && s.trim().length > 0);
    return { ok: false, reason: String(msg || `http_${res.status}`).slice(0, 500) };
  }
  const raw = Array.isArray(json.items) ? json.items : [];
  const events = raw.map((ev) => ({
    summary: ev.summary || "",
    start: ev.start?.dateTime || ev.start?.date || "",
    end: ev.end?.dateTime || ev.end?.date || "",
    location: ev.location || "",
    htmlLink: ev.htmlLink || "",
  }));
  return { ok: true, events };
}

/**
 * @param {unknown} json
 * @returns {string | undefined}
 */
function emailFromCalendarPrimaryPayload(json) {
  const raw =
    json && typeof json === "object" && typeof json.id === "string" ? json.id.trim() : "";
  return raw.includes("@") ? raw : undefined;
}

/**
 * @param {unknown} json
 * @returns {string | undefined}
 */
function emailFromDriveAboutPayload(json) {
  const user = json && typeof json === "object" ? json.user : null;
  const raw =
    user && typeof user === "object" && typeof user.emailAddress === "string"
      ? user.emailAddress.trim()
      : "";
  return raw || undefined;
}

function emailFromGmailProfilePayload(json) {
  const raw =
    json && typeof json === "object" && typeof json.emailAddress === "string"
      ? json.emailAddress.trim()
      : "";
  return raw || undefined;
}

/**
 * @returns {Promise<{ ok: true, email?: string } | { ok: false; reason?: string }>}
 */
async function gmailProfileHealth(accessToken) {
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = {};
  }
  if (!res.ok) {
    return { ok: false, reason: json.error?.message || `http_${res.status}` };
  }
  const email = emailFromGmailProfilePayload(json);
  return email ? { ok: true, email } : { ok: true };
}

/**
 * @param {Record<string, unknown>} stored
 * @returns {Promise<string | null>}
 */
async function getValidAccessToken(stored) {
  if (!stored) return null;
  const exp = typeof stored.expires_at === "number" ? stored.expires_at : 0;
  const access = typeof stored.access_token === "string" ? stored.access_token : "";
  if (access && exp > Date.now() + 60_000) return access;

  const refreshed = await refreshStoredTokens(stored);
  if (refreshed?.access_token && typeof refreshed.access_token === "string") return refreshed.access_token;
  return access || null;
}

/**
 * @param {Record<string, unknown>} stored
 * @returns {Promise<Record<string, unknown> | null>} updated secrets or null
 */
async function refreshStoredTokens(stored) {
  if (!stored) return null;
  const rt = stored.refresh_token;
  const clientId = getClientId();
  if (!rt || !clientId) return null;
  const exp = typeof stored.expires_at === "number" ? stored.expires_at : 0;
  const access = typeof stored.access_token === "string" ? stored.access_token : "";
  if (access && exp > Date.now() + 60_000) return stored;
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: String(rt),
    client_id: clientId,
  });
  appendClientSecretIfPresent(body);
  const tokenRes = await fetch(GOOGLE_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const tokenText = await tokenRes.text();
  let tokenJson;
  try {
    tokenJson = JSON.parse(tokenText);
  } catch {
    return null;
  }
  if (!tokenRes.ok || !tokenJson.access_token) return null;
  const expiresAt =
    typeof tokenJson.expires_in === "number"
      ? Date.now() + tokenJson.expires_in * 1000
      : Date.now() + 3600 * 1000;
  return {
    access_token: tokenJson.access_token,
    refresh_token: tokenJson.refresh_token || rt,
    expires_at: expiresAt,
  };
}

/**
 * @param {string} id
 * @returns {string}
 */
function escapeDriveQueryId(id) {
  return String(id).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

/**
 * Drive list page tokens are secrets; log only length, never the raw value.
 * @param {string | null | undefined} token
 * @returns {string | null}
 */
function redactDrivePageTokenForLog(token) {
  if (token == null || String(token).length === 0) return null;
  const n = String(token).length;
  return n <= 8 ? "[redacted]" : `pageToken(${n} chars)`;
}

/**
 * @param {string} accessToken
 * @param {{ pageSize?: number, pageToken?: string, parentId?: string | null, flatMyDriveFiles?: boolean }} [opts]
 * @returns {Promise<{ ok: true, files: object[], nextPageToken?: string } | { ok: false, reason: string }>}
 */
async function listDriveFiles(
  accessToken,
  { pageSize = 20, pageToken, parentId, flatMyDriveFiles = false } = {}
) {
  const t0 = Date.now();
  const ps = Math.min(100, Math.max(1, pageSize));
  const fields = encodeURIComponent("files(id,name,mimeType,size,modifiedTime),nextPageToken");
  let qText;
  if (flatMyDriveFiles) {
    // Every non-folder file in My Drive at any depth (one paginated stream). Avoids per-folder BFS
    // (which can mean thousands of API calls on large drives).
    qText = "trashed = false and mimeType != 'application/vnd.google-apps.folder'";
  } else if (parentId != null && String(parentId).length > 0) {
    const safe = escapeDriveQueryId(String(parentId).trim() || "root");
    qText = `'${safe}' in parents and trashed = false`;
  } else {
    qText = "trashed = false";
  }
  const q = encodeURIComponent(qText);
  let url = `${DRIVE_FILES}?pageSize=${ps}&fields=${fields}&q=${q}&spaces=drive`;
  if (pageToken) {
    url += `&pageToken=${encodeURIComponent(String(pageToken))}`;
  }
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = {};
  }
  if (!res.ok) {
    console.log("[drive:list] failed", {
      mode: flatMyDriveFiles ? "flatMyDriveFiles" : "parentScoped",
      parentId: parentId || null,
      pageSize: ps,
      pageToken: redactDrivePageTokenForLog(pageToken),
      status: res.status,
      elapsedMs: Date.now() - t0,
      reason: json.error?.message || `http_${res.status}`,
    });
    return { ok: false, reason: json.error?.message || `http_${res.status}` };
  }
  console.log("[drive:list] ok", {
    mode: flatMyDriveFiles ? "flatMyDriveFiles" : "parentScoped",
    parentId: parentId || null,
    pageSize: ps,
    pageToken: redactDrivePageTokenForLog(pageToken),
    fileCount: Array.isArray(json.files) ? json.files.length : 0,
    hasNextPage: Boolean(json.nextPageToken),
    elapsedMs: Date.now() - t0,
  });
  return { ok: true, files: json.files || [], nextPageToken: json.nextPageToken };
}

/**
 * @param {string} accessToken
 * @param {string} fileId
 * @returns {Promise<{ ok: true, id: string, name: string, mimeType: string, size?: string } | { ok: false, reason: string }>}
 */
async function getDriveFileMetadata(accessToken, fileId) {
  try {
    return await withDriveRequestTimeout("drive_metadata", DRIVE_METADATA_TIMEOUT_MS, async (signal) => {
      const fields = encodeURIComponent("id,name,mimeType,size");
      const url = `${DRIVE_FILES}/${encodeURIComponent(fileId)}?fields=${fields}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }, signal });
      const text = await res.text();
      let json;
      try {
        json = JSON.parse(text);
      } catch {
        json = {};
      }
      if (!res.ok) {
        return { ok: false, reason: json.error?.message || `http_${res.status}` };
      }
      return {
        ok: true,
        id: String(json.id || fileId),
        name: String(json.name || "file"),
        mimeType: String(json.mimeType || "application/octet-stream"),
        size: json.size != null ? String(json.size) : undefined,
      };
    });
  } catch (e) {
    return { ok: false, reason: e?.message || "metadata_failed" };
  }
}

/**
 * @param {string} accessToken
 * @param {string} fileId
 * @param {string} exportMime
 */
async function downloadExportBuffer(accessToken, fileId, exportMime) {
  return withDriveRequestTimeout("drive_export", DRIVE_DOWNLOAD_TIMEOUT_MS, async (signal) => {
    const u = `${DRIVE_FILES}/${encodeURIComponent(
      fileId
    )}/export?mimeType=${encodeURIComponent(exportMime)}`;
    const res = await fetch(u, { headers: { Authorization: `Bearer ${accessToken}` }, signal });
    if (!res.ok) {
      const t = await res.text();
      let j;
      try {
        j = JSON.parse(t);
      } catch {
        j = {};
      }
      throw new Error(j.error?.message || `export_http_${res.status}`);
    }
    const cl = res.headers.get("content-length");
    if (cl && Number(cl) > DRIVE_IMPORT_MAX_BYTES_PER_FILE) {
      throw new Error("file_too_large");
    }
    const ab = await res.arrayBuffer();
    if (ab.byteLength > DRIVE_IMPORT_MAX_BYTES_PER_FILE) {
      throw new Error("file_too_large");
    }
    return Buffer.from(ab);
  });
}

/**
 * @param {string} accessToken
 * @param {string} fileId
 */
async function downloadMediaBuffer(accessToken, fileId) {
  return withDriveRequestTimeout("drive_media", DRIVE_DOWNLOAD_TIMEOUT_MS, async (signal) => {
    const u = `${DRIVE_FILES}/${encodeURIComponent(fileId)}?alt=media`;
    const res = await fetch(u, { headers: { Authorization: `Bearer ${accessToken}` }, signal });
    if (!res.ok) {
      const t = await res.text();
      let j;
      try {
        j = JSON.parse(t);
      } catch {
        j = {};
      }
      throw new Error(j.error?.message || `media_http_${res.status}`);
    }
    const cl = res.headers.get("content-length");
    if (cl && Number(cl) > DRIVE_IMPORT_MAX_BYTES_PER_FILE) {
      throw new Error("file_too_large");
    }
    const ab = await res.arrayBuffer();
    if (ab.byteLength > DRIVE_IMPORT_MAX_BYTES_PER_FILE) {
      throw new Error("file_too_large");
    }
    return Buffer.from(ab);
  });
}

/**
 * Download selected Drive file IDs into an existing directory. Skips folders and unsupported types.
 * @param {string} accessToken
 * @param {string[]} fileIds
 * @param {string} destDir
 * @returns {Promise<{ ok: true, localPaths: string[], failed: { id: string, reason: string }[] } | { ok: false, reason: string }>}
 */
async function importDriveFilesToDirectory(accessToken, fileIds, destDir) {
  const ids = Array.from(
    new Set((fileIds || []).map((x) => String(x).trim()).filter(Boolean))
  );
  if (ids.length === 0) {
    return { ok: false, reason: "no_file_ids" };
  }
  await fs.mkdir(destDir, { recursive: true });
  const localPaths = [];
  const failed = [];
  const usedNames = new Set();

  for (let i = 0; i < ids.length; i += 1) {
    const id = ids[i];
    const fileStartedAt = Date.now();
    const logBase = { index: i + 1, total: ids.length, id };
    console.log("[drive:import] file_start", logBase);
    const m = await getDriveFileMetadata(accessToken, id);
    if (!m.ok) {
      failed.push({ id, reason: m.reason || "metadata" });
      console.log("[drive:import] file_failed", {
        ...logBase,
        reason: m.reason || "metadata",
        elapsedMs: Date.now() - fileStartedAt,
      });
      continue;
    }
    if (m.mimeType === MIME_FOLDER) {
      failed.push({ id, reason: "is_folder" });
      console.log("[drive:import] file_skipped", {
        ...logBase,
        reason: "is_folder",
        mimeType: m.mimeType,
        elapsedMs: Date.now() - fileStartedAt,
      });
      continue;
    }
    if (m.mimeType === "application/vnd.google-apps.form") {
      failed.push({ id, reason: "unsupported_form" });
      console.log("[drive:import] file_skipped", {
        ...logBase,
        reason: "unsupported_form",
        mimeType: m.mimeType,
        elapsedMs: Date.now() - fileStartedAt,
      });
      continue;
    }

    let fileName;
    let buf;
    try {
      const g = googleAppExportTarget(m.mimeType);
      if (g) {
        buf = await downloadExportBuffer(accessToken, id, g.exportMime);
        fileName = safeLocalBasename(m.name, g.ext);
      } else {
        buf = await downloadMediaBuffer(accessToken, id);
        fileName = safeLocalBasename(m.name, undefined);
      }
    } catch (e) {
      failed.push({ id, reason: e?.message || "download_failed" });
      console.log("[drive:import] file_failed", {
        ...logBase,
        reason: e?.message || "download_failed",
        mimeType: m.mimeType,
        elapsedMs: Date.now() - fileStartedAt,
      });
      continue;
    }

    let finalName = fileName;
    let n = 0;
    while (usedNames.has(finalName)) {
      n += 1;
      const p = path.parse(fileName);
      finalName = `${p.name} (${n})${p.ext || ""}`;
    }
    usedNames.add(finalName);
    const fullPath = path.join(destDir, finalName);
    try {
      await fs.writeFile(fullPath, buf);
      localPaths.push(fullPath);
      console.log("[drive:import] file_done", {
        ...logBase,
        mimeType: m.mimeType,
        bytes: buf.length,
        elapsedMs: Date.now() - fileStartedAt,
      });
    } catch (e) {
      failed.push({ id, reason: e?.message || "write_failed" });
      console.log("[drive:import] file_failed", {
        ...logBase,
        reason: e?.message || "write_failed",
        mimeType: m.mimeType,
        elapsedMs: Date.now() - fileStartedAt,
      });
    }
  }

  return { ok: true, localPaths, failed };
}

async function driveAboutHealth(accessToken) {
  const url = "https://www.googleapis.com/drive/v3/about?fields=user";
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = {};
  }
  if (!res.ok) {
    return { ok: false, reason: json.error?.message || `http_${res.status}` };
  }
  const email = emailFromDriveAboutPayload(json);
  return email ? { ok: true, email } : { ok: true };
}

/**
 * @param {string} accessToken
 * @param {string} fileName
 * @param {string} content
 */
async function uploadTextFile(accessToken, fileName, content) {
  const boundary = `exosites_${crypto.randomBytes(16).toString("hex")}`;
  const metadata = JSON.stringify({
    name: fileName,
    mimeType: "text/plain",
  });
  const body = [
    `--${boundary}\r\n`,
    "Content-Type: application/json; charset=UTF-8\r\n\r\n",
    metadata,
    "\r\n",
    `--${boundary}\r\n`,
    "Content-Type: text/plain; charset=UTF-8\r\n\r\n",
    content,
    "\r\n",
    `--${boundary}--\r\n`,
  ].join("");
  const url = `${DRIVE_UPLOAD}?uploadType=multipart`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body,
  });
  const resText = await res.text();
  let json;
  try {
    json = JSON.parse(resText);
  } catch {
    json = {};
  }
  if (!res.ok) {
    return { ok: false, reason: json.error?.message || `http_${res.status}` };
  }
  return { ok: true };
}

module.exports = {
  getClientId,
  gmailOAuthMirrorPath,
  connectGooglePkceWithScopes,
  connectGoogleGmailPkce,
  connectGoogleDrivePkce,
  connectGoogleCalendarPkce,
  connectGoogleAllPkce,
  googleCalendarHealth,
  listPrimaryCalendarEvents,
  getValidAccessToken,
  refreshStoredTokens,
  syncGmailOAuthMirrorFromSecrets,
  deleteGmailOAuthMirror,
  listDriveFiles,
  getDriveFileMetadata,
  importDriveFilesToDirectory,
  driveAboutHealth,
  emailFromCalendarPrimaryPayload,
  emailFromDriveAboutPayload,
  emailFromGmailProfilePayload,
  gmailProfileHealth,
  uploadTextFile,
  redactDrivePageTokenForLog,
};

const storage = require("./storage");
const { registerProvider } = require("./providerInterface");

const GOOGLE_DRIVE_PROVIDER_IDS = ["google-drive", "google-all", "google-gmail", "google"];

async function resolveGoogleDriveTokenForProvider() {
  const ud = require("../accountProfile").resolveProfileRoot();
  for (const providerId of GOOGLE_DRIVE_PROVIDER_IDS) {
    const secrets = storage.loadProviderSecrets(ud, providerId);
    if (!secrets?.refresh_token && !secrets?.access_token) continue;
    try {
      const token = await getValidAccessToken(secrets);
      if (token) return token;
    } catch {
      /* try next slot */
    }
  }
  return null;
}

function googleDriveSecretsPresent() {
  const ud = require("../accountProfile").resolveProfileRoot();
  return GOOGLE_DRIVE_PROVIDER_IDS.some((providerId) => {
    const secrets = storage.loadProviderSecrets(ud, providerId);
    return Boolean(secrets?.refresh_token || secrets?.access_token);
  });
}

registerProvider("google", {
  id: "google",
  async getAuthStatus() {
    return {
      ok: true,
      configured: Boolean(getClientId()),
      connected: googleDriveSecretsPresent(),
    };
  },
  async listFiles(options = {}) {
    const token = await resolveGoogleDriveTokenForProvider();
    if (!token) return { ok: false, reason: "not_connected" };
    return listDriveFiles(token, {
      pageSize: options.pageSize,
      pageToken: options.pageToken,
      parentId: options.parentId,
      flatMyDriveFiles: Boolean(options.recursive),
    });
  },
  async importFiles(options = {}) {
    const token = await resolveGoogleDriveTokenForProvider();
    if (!token) return { ok: false, reason: "not_connected" };
    const fileIds = (options.items || [])
      .map((item) => (typeof item === "string" ? item : String(item?.id || "")))
      .map((id) => id.trim())
      .filter(Boolean);
    if (fileIds.length === 0) return { ok: false, reason: "no_items" };
    const ud = require("../accountProfile").resolveProfileRoot();
    const stagingDir =
      typeof options.stagingDir === "string" && options.stagingDir.trim()
        ? options.stagingDir.trim()
        : path.join(ud, "drive_sort_staging", crypto.randomBytes(12).toString("hex"));
    const result = await importDriveFilesToDirectory(token, fileIds, stagingDir);
    if (!result.ok) return result;
    return {
      ok: true,
      localPaths: result.localPaths,
      failed: result.failed,
      stagingDir,
    };
  },
});
