/**
 * Infomaniak kDrive OAuth 2 (PKCE, loopback) + kDrive REST API helpers.
 * Register at https://manager.infomaniak.com/v3/ng/accounts/applications/list
 * Set EXOSITES_INFOMANIAK_CLIENT_ID (and EXOSITES_INFOMANIAK_CLIENT_SECRET for confidential client).
 *
 * Optional: set EXOSITES_INFOMANIAK_TOKEN to a static API bearer from `backend/.env` (dev) or
 * userData `.env` (packaged). When set, kDrive and Calendar integrations use it without stored OAuth
 * (same token must include the scopes you need). Never commit real tokens.
 *
 * Infomaniak scopes are configured on the Manager application. Do not send a
 * scope parameter unless explicitly overridden by env; unknown scopes make the
 * authorize endpoint return `invalid_scope` with an empty page.
 *
 * Redirect URI must match the Manager entry exactly. Default loopback:
 *   http://127.0.0.1:58889/callback — override port with EXOSITES_INFOMANIAK_OAUTH_REDIRECT_PORT.
 */

const crypto = require("crypto");
const fs = require("fs").promises;
const path = require("path");
const { generatePkcePair, b64url } = require("./pkce");
const { startLoopbackServer } = require("./loopbackServer");
const {
  IK_AUTH,
  IK_TOKEN,
  IK_API,
  IK_PAGE_SIZE,
  IK_IMPORT_MAX_BYTES,
  IK_METADATA_TIMEOUT_MS,
  IK_DOWNLOAD_TIMEOUT_MS,
  IK_RECURSE_MAX_DIRS,
  IK_RECURSE_MAX_FILES,
} = require("./infomaniak/constants");

const { URL } = require("url");
const { shell, app } = require("electron");
const { oauthLoopbackSuccessHtml, oauthLoopbackErrorHtml } = require("../oauthCallbackHtml");

function getClientId() {
  return (process.env.EXOSITES_INFOMANIAK_CLIENT_ID || "").trim();
}

function getClientSecret() {
  return (process.env.EXOSITES_INFOMANIAK_CLIENT_SECRET || "").trim();
}

/** Optional long-lived or dev bearer — read from Electron main `process.env` (synced from .env at startup). */
function getEnvAccessToken() {
  return (process.env.EXOSITES_INFOMANIAK_TOKEN || "").trim();
}

/**
 * @returns {string} Optional kDrive scope override; empty uses the Infomaniak Manager app settings.
 */
function getDriveOAuthScope() {
  return (
    process.env.EXOSITES_INFOMANIAK_DRIVE_OAUTH_SCOPE ||
    process.env.EXOSITES_INFOMANIAK_OAUTH_SCOPE ||
    ""
  ).trim();
}

/**
 * @returns {string} Optional Calendar scope override; empty uses the Infomaniak Manager app settings.
 */
function getCalendarOAuthScope() {
  return (
    process.env.EXOSITES_INFOMANIAK_CALENDAR_OAUTH_SCOPE ||
    process.env.EXOSITES_INFOMANIAK_OAUTH_SCOPE ||
    ""
  ).trim();
}

/**
 * @returns {boolean} True when `EXOSITES_INFOMANIAK_TOKEN` is set (session can work without stored OAuth).
 */
function hasEnvInfomaniakToken() {
  return Boolean(getEnvAccessToken());
}

/**
 * True when OAuth app id is set (browser sign-in) or a static env bearer is set.
 * @returns {boolean}
 */
function infomaniakAuthConfigured() {
  return Boolean(getClientId() || getEnvAccessToken());
}

/** Infomaniak requires a registered redirect URI — random ports break OAuth. Default beside OneDrive (58888). */
const DEFAULT_INFOMANIAK_LOOPBACK_PORT = 58889;

function getInfomaniakLoopbackPort() {
  const raw = (process.env.EXOSITES_INFOMANIAK_OAUTH_REDIRECT_PORT || "").trim();
  if (raw) {
    const n = Number.parseInt(raw, 10);
    if (Number.isFinite(n) && n >= 1024 && n <= 65535) return n;
  }
  return DEFAULT_INFOMANIAK_LOOPBACK_PORT;
}

async function withTimeout(label, timeoutMs, task) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await task(controller.signal);
  } catch (e) {
    if (e?.name === "AbortError") throw new Error(`${label}_timeout`);
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Run Infomaniak PKCE OAuth2 flow.
 * @param {string} scope Optional OAuth scope override. Empty means Infomaniak uses the Manager app's configured scopes.
 * @param {string} successProductLabel Shown on the loopback success HTML page.
 * @returns {Promise<{ access_token: string; refresh_token: string; expires_at: number; drives?: object[] }>}
 */
async function connectInfomaniakPkceWithScope(scope, successProductLabel) {
  const clientId = getClientId();
  if (!clientId) throw new Error("EXOSITES_INFOMANIAK_CLIENT_ID is not set");
  const { verifier, challenge } = generatePkcePair();
  const state = b64url(crypto.randomBytes(16));
  const loopbackPort = getInfomaniakLoopbackPort();
  let lb;
  try {
    lb = await startLoopbackServer({ port: loopbackPort, label: "[infomaniak]" });
  } catch (e) {
    const code = e && typeof e === "object" && "code" in e ? e.code : "";
    if (code === "EADDRINUSE") {
      throw new Error(`infomaniak_redirect_port_in_use:${loopbackPort}`);
    }
    throw e;
  }
  const redirectUri = `http://127.0.0.1:${lb.port}/callback`;

  const authUrl = new URL(IK_AUTH);
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge", challenge);
  authUrl.searchParams.set("code_challenge_method", "S256");
  const requestedScope = String(scope || "").trim();
  if (requestedScope) {
    authUrl.searchParams.set("scope", requestedScope);
  }

  shell.openExternal(authUrl.toString());

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(async () => {
      await lb.close();
      reject(new Error("infomaniak_auth_timeout"));
    }, 5 * 60 * 1000);

    lb.server.on("request", async (req, res) => {
      try {
        const url = new URL(req.url, `http://127.0.0.1:${lb.port}`);
        if (url.pathname !== "/callback") { res.end(); return; }
        clearTimeout(timeout);
        await lb.close();

        const code = url.searchParams.get("code");
        const returnedState = url.searchParams.get("state");
        const error = url.searchParams.get("error");

        if (error || !code || returnedState !== state) {
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(
            oauthLoopbackErrorHtml({
              headline: `${successProductLabel} sign-in didn't finish`,
              subline: "You can close this tab and try connecting again from the app.",
            })
          );
          reject(new Error(error || "infomaniak_auth_failed"));
          return;
        }

        const tokenBody = new URLSearchParams({
          grant_type: "authorization_code",
          code,
          client_id: clientId,
          redirect_uri: redirectUri,
          code_verifier: verifier,
        });
        const clientSecret = getClientSecret();
        if (clientSecret) tokenBody.set("client_secret", clientSecret);

        const tokenRes = await fetch(IK_TOKEN, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: tokenBody.toString(),
        });
        const data = await tokenRes.json();

        if (!tokenRes.ok || !data.access_token) {
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(
            oauthLoopbackErrorHtml({
              headline: `${successProductLabel} sign-in didn't finish`,
              subline: "Couldn't complete the connection. Close this tab and try again from the app.",
            })
          );
          reject(new Error(data.error || "infomaniak_token_exchange_failed"));
          return;
        }

        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(
          oauthLoopbackSuccessHtml({
            headline: `${successProductLabel} connected`,
            subline: "You can close this tab and return to the app.",
          })
        );
        resolve({
          access_token: data.access_token,
          refresh_token: data.refresh_token || null,
          expires_at: Date.now() + (data.expires_in || 3600) * 1000,
        });
      } catch (err) {
        clearTimeout(timeout);
        await lb.close().catch(() => {});
        reject(err);
      }
    });
  });
}

async function connectInfomaniakPkce() {
  return connectInfomaniakPkceWithScope(getDriveOAuthScope(), "Infomaniak kDrive");
}

async function connectInfomaniakCalendarPkce() {
  return connectInfomaniakPkceWithScope(getCalendarOAuthScope(), "Infomaniak Calendar");
}

/**
 * Combined drive + calendar scope string for one consent (empty = Infomaniak Manager defaults).
 * @returns {string}
 */
function buildInfomaniakAllOAuthScope() {
  const d = getDriveOAuthScope();
  const c = getCalendarOAuthScope();
  if (!d && !c) return "";
  const parts = [...String(d).split(/\s+/), ...String(c).split(/\s+/)]
    .map((s) => s.trim())
    .filter(Boolean);
  const seen = new Set();
  const unique = [];
  for (const p of parts) {
    if (!seen.has(p)) {
      seen.add(p);
      unique.push(p);
    }
  }
  return unique.join(" ");
}

/**
 * One PKCE flow; stores the same tokens in kDrive and Calendar slots when scopes cover both APIs.
 */
async function connectInfomaniakAllPkce() {
  const scope = buildInfomaniakAllOAuthScope();
  return connectInfomaniakPkceWithScope(scope, "Infomaniak kDrive & Calendar");
}

/**
 * @param {{ access_token: string; refresh_token?: string; expires_at?: number }} secrets
 */
async function refreshStoredTokens(secrets) {
  if (!secrets?.refresh_token) return null;
  const clientId = getClientId();
  if (!clientId) return null;
  const now = Date.now();
  if (secrets.expires_at && secrets.expires_at - now > 5 * 60 * 1000) return null;

  try {
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: secrets.refresh_token,
      client_id: clientId,
    });
    const clientSecret = getClientSecret();
    if (clientSecret) body.set("client_secret", clientSecret);

    const res = await fetch(IK_TOKEN, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    const data = await res.json();
    if (!res.ok || !data.access_token) return null;
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token || secrets.refresh_token,
      expires_at: Date.now() + (data.expires_in || 3600) * 1000,
    };
  } catch {
    return null;
  }
}

async function getValidAccessToken(secrets) {
  const fromEnv = getEnvAccessToken();
  if (fromEnv) return fromEnv;
  return secrets?.access_token || null;
}

function infomaniakSessionLooksUsable(secrets) {
  return !!(getEnvAccessToken() || secrets?.access_token || secrets?.refresh_token);
}

/**
 * True only when calendar-specific stored OAuth secrets exist.
 * Does NOT count the shared `EXOSITES_INFOMANIAK_TOKEN` env token because that
 * token is typically scoped to kDrive only and will fail on the calendar API.
 * The env token is shown as a separate hint (authViaEnvToken) in the UI.
 *
 * If the env token is known to have calendar scope, the user can still connect
 * explicitly via "Connect Calendar" and the stored session will work normally.
 */
function infomaniakCalendarSessionLooksUsable(secrets) {
  return !!(secrets?.access_token || secrets?.refresh_token);
}

/**
 * @param {string} token
 */
function emailFromInfomaniakProfile(data) {
  const payload = data && typeof data === "object" ? data.data : null;
  if (!payload || typeof payload !== "object") return undefined;
  const direct = typeof payload.email === "string" ? payload.email.trim() : "";
  if (direct.includes("@")) return direct;
  const user = payload.user;
  const nested =
    user && typeof user === "object" && typeof user.email === "string" ? user.email.trim() : "";
  return nested.includes("@") ? nested : undefined;
}

async function infomaniakDriveHealth(token) {
  try {
    const res = await withTimeout("ik_health", IK_METADATA_TIMEOUT_MS, (signal) =>
      fetch(`${IK_API}/1/profile`, {
        headers: { Authorization: `Bearer ${token}` },
        signal,
      })
    );
    if (!res.ok) return { ok: false, reason: `http_${res.status}` };
    const data = await res.json();
    if (data.result !== "success") return { ok: false, reason: data.error?.code || "api_error" };
    const email = emailFromInfomaniakProfile(data);
    return email ? { ok: true, email } : { ok: true };
  } catch (e) {
    return { ok: false, reason: e.message || "fetch_failed" };
  }
}

/**
 * Lightweight check that a calendar-scoped token can reach the Infomaniak API profile (identity).
 * Calendar REST paths vary by product; profile validates the bearer token.
 * @param {string} token
 */
async function infomaniakCalendarHealth(token) {
  return infomaniakDriveHealth(token);
}

/**
 * List the user's kDrive drives.
 * @param {string} token
 * @returns {Promise<{ ok: true; drives: object[] } | { ok: false; reason: string }>}
 */
async function listInfomaniakDrives(token) {
  try {
    const res = await withTimeout("ik_list_drives", IK_METADATA_TIMEOUT_MS, (signal) =>
      fetch(`${IK_API}/1/drive`, {
        headers: { Authorization: `Bearer ${token}` },
        signal,
      })
    );
    if (!res.ok) return { ok: false, reason: `http_${res.status}` };
    const data = await res.json();
    if (data.result !== "success") return { ok: false, reason: data.error?.code || "api_error" };
    return { ok: true, drives: data.data || [] };
  } catch (e) {
    return { ok: false, reason: e.message || "fetch_failed" };
  }
}

/**
 * List files in a kDrive folder.
 * @param {string} token
 * @param {number} driveId
 * @param {{ parentId?: number; page?: number }} opts
 * @returns {Promise<{ ok: true; files: object[]; hasMore: boolean } | { ok: false; reason: string }>}
 */
async function listInfomaniakFolderFiles(token, driveId, { parentId = 1, page = 1 } = {}) {
  try {
    const url = new URL(`${IK_API}/1/drive/${driveId}/files/${parentId}/files`);
    url.searchParams.set("per_page", String(IK_PAGE_SIZE));
    url.searchParams.set("page", String(page));
    url.searchParams.set("type", "file");

    const res = await withTimeout("ik_list_files", IK_METADATA_TIMEOUT_MS, (signal) =>
      fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
        signal,
      })
    );
    if (!res.ok) return { ok: false, reason: `http_${res.status}` };
    const data = await res.json();
    if (data.result !== "success") return { ok: false, reason: data.error?.code || "api_error" };
    const items = data.data || [];
    const total = data.total || items.length;
    const hasMore = page * IK_PAGE_SIZE < total;
    return { ok: true, files: items, hasMore, total };
  } catch (e) {
    return { ok: false, reason: e.message || "fetch_failed" };
  }
}

/**
 * Recursively list all files in kDrive using BFS.
 * @param {string} token
 * @param {number} driveId
 * @param {number} [rootFolderId]
 */
async function listInfomaniakAllFilesRecursive(token, driveId, rootFolderId = 1) {
  const files = [];
  // BFS queue of folder IDs
  const queue = [rootFolderId];
  let dirsVisited = 0;
  let cappedByDirs = false;
  let cappedByFiles = false;

  while (queue.length > 0 && !cappedByDirs && !cappedByFiles) {
    const folderId = queue.shift();
    dirsVisited++;
    if (dirsVisited > IK_RECURSE_MAX_DIRS) { cappedByDirs = true; break; }

    let page = 1;
    let hasMore = true;
    while (hasMore) {
      // List files in this folder
      const fileResult = await listInfomaniakFolderFiles(token, driveId, { parentId: folderId, page });
      if (!fileResult.ok) break;
      for (const f of fileResult.files) {
        files.push({ ...f, driveId });
        if (files.length >= IK_RECURSE_MAX_FILES) { cappedByFiles = true; break; }
      }
      hasMore = fileResult.hasMore;
      page++;
    }
    if (cappedByFiles) break;

    // List subdirectories
    const subDirUrl = new URL(`${IK_API}/1/drive/${driveId}/files/${folderId}/files`);
    subDirUrl.searchParams.set("type", "dir");
    subDirUrl.searchParams.set("per_page", String(IK_PAGE_SIZE));
    try {
      const sdRes = await fetch(subDirUrl.toString(), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (sdRes.ok) {
        const sdData = await sdRes.json();
        if (sdData.result === "success") {
          for (const d of sdData.data || []) {
            queue.push(d.id);
          }
        }
      }
    } catch {}
  }

  return { ok: true, files, cappedByDirs, cappedByFiles };
}

/**
 * Download selected kDrive files to a staging directory.
 * @param {string} token
 * @param {object[]} items  kDrive file objects (must have id, name, driveId)
 * @param {string} stagingDir
 */
async function importInfomaniakFilesToDirectory(token, items, stagingDir) {
  await fs.mkdir(stagingDir, { recursive: true });
  const localPaths = [];
  const failed = [];

  for (const item of items) {
    if (!item?.id || !item?.name) {
      failed.push({ id: item?.id || "unknown", reason: "invalid_item" });
      continue;
    }
    const size = Number(item.size || 0);
    if (size > IK_IMPORT_MAX_BYTES) {
      failed.push({ id: item.id, reason: "too_large" });
      continue;
    }
    const driveId = item.driveId || item.drive_id;
    if (!driveId) {
      failed.push({ id: item.id, reason: "missing_drive_id" });
      continue;
    }
    const destPath = path.join(stagingDir, sanitizeFilename(item.name));
    try {
      const res = await withTimeout("ik_download", IK_DOWNLOAD_TIMEOUT_MS, (signal) =>
        fetch(`${IK_API}/1/drive/${driveId}/files/${item.id}/download`, {
          headers: { Authorization: `Bearer ${token}` },
          signal,
        })
      );
      if (!res.ok) {
        failed.push({ id: item.id, reason: `http_${res.status}` });
        continue;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      await fs.writeFile(destPath, buf);
      localPaths.push(destPath);
    } catch (e) {
      failed.push({ id: item.id, reason: e.message || "download_failed" });
    }
  }

  return { ok: true, localPaths, failed, stagingDir };
}

function sanitizeFilename(name) {
  return String(name).replace(/[\\/:*?"<>|]/g, "_").slice(0, 200);
}

function infomaniakStagingDir(jobId) {
  return path.join(require("../accountProfile").resolveProfileRoot(), "infomaniak_sort_staging", jobId);
}

/**
 * List events on the default PIM calendar in a time range.
 * @param {string} token
 * @param {string} startIso RFC-like datetime string for Infomaniak query params
 * @param {string} endIso
 * @param {number} maxEvents
 */
async function listInfomaniakCalendarEvents(token, startIso, endIso, maxEvents) {
  const cap = Math.min(50, Math.max(1, Number(maxEvents) || 50));
  try {
    const calRes = await withTimeout("ik_cal_list", IK_METADATA_TIMEOUT_MS, (signal) =>
      fetch(`${IK_API}/1/calendar/pim/calendar`, {
        headers: { Authorization: `Bearer ${token}` },
        signal,
      })
    );
    const calText = await calRes.text();
    let calJson;
    try {
      calJson = JSON.parse(calText);
    } catch {
      calJson = {};
    }
    if (!calRes.ok || calJson.result !== "success") {
      return { ok: false, reason: calJson.error?.description || `http_${calRes.status}` };
    }
    const calendars = Array.isArray(calJson.data?.calendars) ? calJson.data.calendars : [];
    const first = calendars[0];
    const calendarId = first?.id;
    if (!calendarId) {
      return { ok: false, reason: "no_calendar" };
    }
    function formatIk(dt) {
      const d = new Date(dt);
      if (Number.isNaN(d.getTime())) return String(dt);
      return d
        .toISOString()
        .replace("T", " ")
        .replace("Z", "")
        .slice(0, -5);
    }
    const from = formatIk(startIso);
    const to = formatIk(endIso);
    const params = new URLSearchParams({
      calendar_id: String(calendarId),
      from,
      to,
    });
    const evRes = await withTimeout("ik_cal_events", IK_METADATA_TIMEOUT_MS, (signal) =>
      fetch(`${IK_API}/1/calendar/pim/event?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal,
      })
    );
    const evText = await evRes.text();
    let evJson;
    try {
      evJson = JSON.parse(evText);
    } catch {
      evJson = {};
    }
    if (!evRes.ok || evJson.result !== "success") {
      return { ok: false, reason: evJson.error?.description || `http_${evRes.status}` };
    }
    const raw = Array.isArray(evJson.data) ? evJson.data : [];
    const slice = raw.slice(0, cap);
    const events = slice.map((ev) => ({
      summary: (ev.title || ev.summary || "").trim(),
      start: ev.start || "",
      end: ev.end || "",
      location: ev.location || "",
    }));
    return { ok: true, events };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}

module.exports = {
  getClientId,
  getDriveOAuthScope,
  getCalendarOAuthScope,
  infomaniakAuthConfigured,
  hasEnvInfomaniakToken,
  connectInfomaniakPkce,
  connectInfomaniakPkceWithScope,
  connectInfomaniakCalendarPkce,
  connectInfomaniakAllPkce,
  refreshStoredTokens,
  getValidAccessToken,
  infomaniakSessionLooksUsable,
  infomaniakCalendarSessionLooksUsable,
  infomaniakDriveHealth,
  infomaniakCalendarHealth,
  listInfomaniakCalendarEvents,
  listInfomaniakDrives,
  listInfomaniakFolderFiles,
  listInfomaniakAllFilesRecursive,
  importInfomaniakFilesToDirectory,
  infomaniakStagingDir,
};
