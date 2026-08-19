/**
 * Microsoft identity (PKCE, loopback) + Microsoft Graph OneDrive helpers.
 * Set EXOSITES_MICROSOFT_OAUTH_CLIENT_ID to an Azure "Mobile and desktop" app registration.
 *
 * Redirect URI must match Azure exactly. We use a fixed loopback port (default 58888) so you
 * register one URI: http://127.0.0.1:58888/callback — override with EXOSITES_MICROSOFT_OAUTH_REDIRECT_PORT.
 */

const crypto = require("crypto");
const fs = require("fs").promises;
const path = require("path");
const { generatePkcePair, b64url } = require("./pkce");
const { startLoopbackServer } = require("./loopbackServer");
const { URL } = require("url");
const { shell, app } = require("electron");
const { oauthLoopbackSuccessHtml, oauthLoopbackErrorHtml } = require("../oauthCallbackHtml");
const { openAuthUrl } = require("./oauthAutopilot");
const {
  WORKSPACE_CLOUD_RECURSE_MAX_FILES: ONEDRIVE_RECURSE_MAX_FILES,
  WORKSPACE_CLOUD_RECURSE_MAX_FOLDER_LISTINGS: ONEDRIVE_RECURSE_MAX_FOLDERS,
} = require("./workspaceRecurseCaps");

const MS_AUTH = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
const MS_TOKEN = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
const GRAPH = "https://graph.microsoft.com/v1.0";

const SCOPES = [
  "offline_access",
  "openid",
  "profile",
  "https://graph.microsoft.com/User.Read",
  "https://graph.microsoft.com/Files.ReadWrite",
  "https://graph.microsoft.com/Mail.ReadWrite",
  "https://graph.microsoft.com/Mail.Send",
  "https://graph.microsoft.com/Calendars.ReadWrite",
].join(" ");

const ONEDRIVE_IMPORT_MAX_BYTES = 50 * 1024 * 1024;
const ONEDRIVE_METADATA_TIMEOUT_MS = 15_000;
const ONEDRIVE_DOWNLOAD_TIMEOUT_MS = 90_000;

const ONEDRIVE_CHILDREN_SELECT =
  "$select=id,name,size,file,folder,parentReference,lastModifiedDateTime";

const ONEDRIVE_SKIP_FILE_MIME = new Set([
  "application/vnd.ms-excel.sheet.macroEnabled.12.onenote",
  "application/octet-stream",
]);

/**
 * @param {object} item Graph driveItem
 * @returns {boolean}
 */
function shouldIncludeOneDriveDownloadableFile(item) {
  if (!item || item.folder) return false;
  const mime = (item.file?.mimeType || "").toLowerCase();
  if (mime === "application/vnd.onenote" || mime === "application/x-ms-shortcut") return false;
  if (ONEDRIVE_SKIP_FILE_MIME.has(mime) && item.name?.endsWith(".url")) return false;
  return true;
}

function getClientId() {
  return (process.env.EXOSITES_MICROSOFT_OAUTH_CLIENT_ID || "").trim();
}

/** Azure requires redirect_uri to match a registered URI exactly — random ports break OAuth. */
const DEFAULT_MICROSOFT_LOOPBACK_PORT = 58888;

function getMicrosoftLoopbackPort() {
  const raw = (process.env.EXOSITES_MICROSOFT_OAUTH_REDIRECT_PORT || "").trim();
  if (raw) {
    const n = Number.parseInt(raw, 10);
    if (Number.isFinite(n) && n >= 1024 && n <= 65535) return n;
  }
  return DEFAULT_MICROSOFT_LOOPBACK_PORT;
}

/**
 * @param {{ autopilot?: boolean; providerId?: string; label?: string }} [options]
 * @returns {Promise<{ ok: true; tokens: object } | { ok: false; reason: string }>}
 */
async function connectMicrosoftPkce(options = {}) {
  const clientId = getClientId();
  if (!clientId) {
    return { ok: false, reason: "oauth_not_configured" };
  }
  const { verifier, challenge } = generatePkcePair();
  const state = b64url(crypto.randomBytes(16));

  let ctx;
  try {
    ctx = await startLoopbackServer({ port: getMicrosoftLoopbackPort(), label: "[microsoft]" });
  } catch (e) {
    const port = getMicrosoftLoopbackPort();
    const code = e && typeof e === "object" && "code" in e ? e.code : "";
    if (code === "EADDRINUSE") {
      return {
        ok: false,
        reason: `microsoft_redirect_port_in_use:${port}`,
      };
    }
    return {
      ok: false,
      reason: e instanceof Error ? e.message : String(e),
    };
  }
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
          } catch (_) {}
          await auto.close();
          await ctx.close();
          resolve({ ok: false, reason });
        };

        if (err) {
          const sub =
            err === "access_denied"
              ? "Access was cancelled or blocked. Use Connect in the app to try again."
              : "You can close this tab and try again from the app.";
          await failPage(err, "Microsoft sign-in didn't finish", sub);
          return;
        }
        if (!code || !st) {
          await failPage(
            "missing_code_or_state",
            "Microsoft sign-in didn't finish",
            "Something was missing from the response. Try connecting again.",
          );
          return;
        }
        if (st !== state) {
          await failPage(
            "state_mismatch",
            "Microsoft sign-in didn't finish",
            "Security check failed. Try connecting again.",
          );
          return;
        }

        settled = true;
        try {
          const body = new URLSearchParams({
            client_id: clientId,
            grant_type: "authorization_code",
            code,
            redirect_uri: redirectUri,
            code_verifier: verifier,
          });
          const tokenRes = await fetch(MS_TOKEN, {
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
            try {
              if (!res.headersSent) {
                res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
                res.end(
                  oauthLoopbackErrorHtml({
                    headline: "Couldn't finish connecting",
                    subline: "Microsoft did not issue tokens. Check the app registration and try again.",
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
                headline: "Microsoft account connected",
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
      response_type: "code",
      redirect_uri: redirectUri,
      response_mode: "query",
      scope: SCOPES,
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
      prompt: "consent",
    });
    const authUrl = `${MS_AUTH}?${params.toString()}`;
    const autopilot = Boolean(options.autopilot);
    auto = openAuthUrl(authUrl, {
      autopilot,
      providerId: options.providerId || "microsoft",
      label: options.label || "Microsoft",
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

/**
 * @param {Record<string, unknown>} stored
 * @returns {Promise<Record<string, unknown> | null>}
 */
async function refreshStoredTokens(stored) {
  if (!stored?.access_token) return null;
  const exp = typeof stored.expires_at === "number" ? stored.expires_at : 0;
  if (exp > Date.now() + 60_000) return stored;
  const rt = stored.refresh_token;
  const clientId = getClientId();
  if (!rt || !clientId) return stored;
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: String(rt),
    client_id: clientId,
  });
  const tokenRes = await fetch(MS_TOKEN, {
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
 * @param {Record<string, unknown>} stored
 * @returns {Promise<string | null>}
 */
async function getValidAccessToken(stored) {
  const refreshed = await refreshStoredTokens(stored);
  const s = refreshed ?? stored;
  if (!s?.access_token || typeof s.access_token !== "string") return null;
  return s.access_token;
}

/**
 * Lightweight Graph check (no secrets returned).
 * @param {string} accessToken
 */
function emailFromGraphMePayload(json) {
  if (!json || typeof json !== "object") return undefined;
  const mail = typeof json.mail === "string" ? json.mail.trim() : "";
  if (mail) return mail;
  const upn = typeof json.userPrincipalName === "string" ? json.userPrincipalName.trim() : "";
  return upn || undefined;
}

async function graphMeHealth(accessToken) {
  const res = await fetch(`${GRAPH}/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const t = await res.text();
  let j;
  try {
    j = JSON.parse(t);
  } catch {
    j = {};
  }
  if (!res.ok) {
    return { ok: false, reason: j.error?.message || `http_${res.status}` };
  }
  const email = emailFromGraphMePayload(j);
  return email ? { ok: true, email } : { ok: true };
}

/**
 * Verify Outlook / Microsoft Calendar (Graph) access.
 * @param {string} accessToken
 */
async function graphCalendarHealth(accessToken) {
  const res = await fetch(`${GRAPH}/me/calendar`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const t = await res.text();
    let j;
    try {
      j = JSON.parse(t);
    } catch {
      j = {};
    }
    return { ok: false, reason: j.error?.message || `http_${res.status}` };
  }
  return { ok: true };
}

/**
 * Timeout-guarded fetch helper.
 * @template T
 * @param {string} label
 * @param {number} timeoutMs
 * @param {(signal: AbortSignal) => Promise<T>} task
 */
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
 * @param {string} accessToken
 * @param {string} url
 * @returns {Promise<{ ok: true; value: object[]; nextLink?: string } | { ok: false; reason: string }>}
 */
async function fetchOneDriveChildrenPage(accessToken, url) {
  const t0 = Date.now();
  try {
    const res = await withTimeout("onedrive_list", ONEDRIVE_METADATA_TIMEOUT_MS, (signal) =>
      fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal,
      })
    );
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = {};
    }
    if (!res.ok) {
      const reason = json.error?.message || `http_${res.status}`;
      console.log("[onedrive:list] failed", { status: res.status, reason, elapsedMs: Date.now() - t0 });
      return { ok: false, reason };
    }
    const value = Array.isArray(json.value) ? json.value : [];
    return {
      ok: true,
      value,
      nextLink: json["@odata.nextLink"] || undefined,
    };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Follow @odata.nextLink until this folder's listing is complete.
 * @param {string} accessToken
 * @param {string} firstUrl
 * @returns {Promise<{ ok: true; raw: object[] } | { ok: false; reason: string }>}
 */
async function listOneDriveAllPagesForUrl(accessToken, firstUrl) {
  const raw = [];
  let url = firstUrl;
  while (url) {
    const page = await fetchOneDriveChildrenPage(accessToken, url);
    if (!page.ok) return page;
    raw.push(...page.value);
    url = page.nextLink;
  }
  return { ok: true, raw };
}

/**
 * @param {string} folderPath Empty or "/" = root; otherwise path under root (e.g. Documents/Work).
 */
function oneDriveChildrenUrlForRootOrPath(folderPath) {
  if (!folderPath || folderPath === "/") {
    return `${GRAPH}/me/drive/root/children?${ONEDRIVE_CHILDREN_SELECT}&$top=200`;
  }
  const encoded = encodeURIComponent(folderPath).replace(/%2F/g, "/");
  return `${GRAPH}/me/drive/root:/${encoded}:/children?${ONEDRIVE_CHILDREN_SELECT}&$top=200`;
}

/**
 * @param {string} folderId
 */
function oneDriveChildrenUrlForFolderId(folderId) {
  return `${GRAPH}/me/drive/items/${encodeURIComponent(folderId)}/children?${ONEDRIVE_CHILDREN_SELECT}&$top=200`;
}

/**
 * Walk OneDrive from `folderPath` (default root), BFS every folder, return every downloadable file row.
 *
 * @param {string} accessToken
 * @param {string} [folderPath]
 * @returns {Promise<{ ok: true; items: object[]; cappedByFolders: boolean; cappedByFiles: boolean } | { ok: false; reason: string }>}
 */
async function listOneDriveAllFilesRecursive(accessToken, folderPath = "") {
  const filesOut = [];
  /** @type {string[]} */
  const folderQueue = [];
  let listingsDone = 0;
  let cappedByFolders = false;
  let cappedByFiles = false;

  /**
   * @param {object[]} raw
   */
  const visitRawBatch = (raw) => {
    for (const item of raw) {
      if (cappedByFiles) break;
      if (!item || typeof item.id !== "string") continue;
      if (item.folder) {
        folderQueue.push(item.id);
        continue;
      }
      if (!shouldIncludeOneDriveDownloadableFile(item)) continue;
      if (filesOut.length >= ONEDRIVE_RECURSE_MAX_FILES) {
        cappedByFiles = true;
        break;
      }
      filesOut.push(item);
    }
  };

  const firstUrl = oneDriveChildrenUrlForRootOrPath(folderPath);
  const first = await listOneDriveAllPagesForUrl(accessToken, firstUrl);
  if (!first.ok) return first;
  listingsDone += 1;
  visitRawBatch(first.raw);

  while (folderQueue.length > 0 && !cappedByFiles) {
    if (listingsDone >= ONEDRIVE_RECURSE_MAX_FOLDERS) {
      cappedByFolders = true;
      break;
    }
    const folderId = folderQueue.shift();
    const batch = await listOneDriveAllPagesForUrl(accessToken, oneDriveChildrenUrlForFolderId(folderId));
    if (!batch.ok) return batch;
    listingsDone += 1;
    visitRawBatch(batch.raw);
  }

  console.log("[onedrive:listRecursive] done", {
    fileCount: filesOut.length,
    folderListings: listingsDone,
    foldersQueuedRemaining: folderQueue.length,
    cappedByFolders,
    cappedByFiles,
  });

  return { ok: true, items: filesOut, cappedByFolders, cappedByFiles };
}

/**
 * List one page of items under an OneDrive folder (or root).
 * Skips OneNote notebooks and URL shortcut items (no binary content to download).
 *
 * @param {string} accessToken
 * @param {{ path?: string; nextLink?: string }} opts
 * @returns {Promise<{ ok: true; items: object[]; nextLink?: string } | { ok: false; reason: string }>}
 */
async function listOneDriveFolderContents(accessToken, { path: folderPath = "", nextLink } = {}) {
  const t0 = Date.now();
  try {
    let url;
    if (nextLink) {
      url = nextLink;
    } else {
      url = oneDriveChildrenUrlForRootOrPath(folderPath);
    }
    const page = await fetchOneDriveChildrenPage(accessToken, url);
    if (!page.ok) {
      return page;
    }
    const raw = page.value;
    const items = raw.filter((item) => shouldIncludeOneDriveDownloadableFile(item));
    console.log("[onedrive:list] ok", {
      rawCount: raw.length,
      filteredCount: items.length,
      hasNextLink: Boolean(page.nextLink),
      elapsedMs: Date.now() - t0,
    });
    return {
      ok: true,
      items,
      nextLink: page.nextLink,
    };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Download a single OneDrive item by id into destDir.
 * @param {string} accessToken
 * @param {{ id: string; name: string; size?: number }} item
 * @param {string} destDir
 * @param {Set<string>} usedNames
 * @returns {Promise<{ ok: true; localPath: string } | { ok: false; reason: string }>}
 */
async function downloadOneDriveItem(accessToken, item, destDir, usedNames) {
  const sizeBytes = typeof item.size === "number" ? item.size : 0;
  if (sizeBytes > ONEDRIVE_IMPORT_MAX_BYTES) {
    return { ok: false, reason: "file_too_large" };
  }

  let baseName = path.basename(item.name || "file").replace(/[\\/:*?"<>|]/g, "_") || "file";
  if (usedNames.has(baseName)) {
    const ext = path.extname(baseName);
    const stem = path.basename(baseName, ext);
    let i = 2;
    while (usedNames.has(`${stem}_${i}${ext}`)) i++;
    baseName = `${stem}_${i}${ext}`;
  }
  usedNames.add(baseName);
  const localPath = path.join(destDir, baseName);

  try {
    const url = `${GRAPH}/me/drive/items/${encodeURIComponent(item.id)}/content`;
    const res = await withTimeout("onedrive_download", ONEDRIVE_DOWNLOAD_TIMEOUT_MS, (signal) =>
      fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
        redirect: "follow",
        signal,
      })
    );
    if (!res.ok) {
      let reason = `http_${res.status}`;
      try {
        const j = await res.json();
        reason = j.error?.message || reason;
      } catch {}
      return { ok: false, reason };
    }
    const buf = Buffer.from(await res.arrayBuffer());
    await fs.writeFile(localPath, buf);
    return { ok: true, localPath };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Download a batch of OneDrive items into a staging directory.
 * @param {string} accessToken
 * @param {{ id: string; name: string; size?: number }[]} items
 * @param {string} destDir
 * @returns {Promise<{ ok: true; localPaths: string[]; stagingDir: string; failed: { id: string; reason: string }[] } | { ok: false; reason: string }>}
 */
async function importOneDriveFilesToDirectory(accessToken, items, destDir) {
  const validItems = (items || []).filter((i) => i && i.id);
  if (validItems.length === 0) return { ok: false, reason: "no_items" };

  await fs.mkdir(destDir, { recursive: true });
  const localPaths = [];
  const failed = [];
  const usedNames = new Set();

  for (let i = 0; i < validItems.length; i++) {
    const item = validItems[i];
    console.log("[onedrive:import] file_start", { index: i + 1, total: validItems.length, id: item.id, name: item.name });
    const r = await downloadOneDriveItem(accessToken, item, destDir, usedNames);
    if (r.ok) {
      localPaths.push(r.localPath);
      console.log("[onedrive:import] file_done", { index: i + 1, total: validItems.length, name: item.name });
    } else {
      failed.push({ id: item.id, reason: r.reason });
      console.log("[onedrive:import] file_failed", { index: i + 1, total: validItems.length, name: item.name, reason: r.reason });
    }
  }
  return { ok: true, localPaths, stagingDir: destDir, failed };
}

/**
 * Build the OneDrive staging directory path for a sort job.
 * @param {string} jobId
 */
function oneDriveStagingDir(jobId) {
  return path.join(
    require("../accountProfile").resolveProfileRoot(),
    "onedrive_sort_staging",
    jobId.replace(/[^a-zA-Z0-9_-]/g, "")
  );
}

/**
 * Upload UTF-8 text to OneDrive personal root.
 * @param {string} accessToken
 * @param {string} fileName basename only
 * @param {string} content
 */
async function uploadTextToOneDriveRoot(accessToken, fileName, content) {
  const enc = encodeURIComponent(fileName).replace(/'/g, "''");
  const url = `${GRAPH}/me/drive/root:/${enc}:/content`;
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "text/plain; charset=utf-8",
    },
    body: content,
  });
  if (!res.ok) {
    const t = await res.text();
    let j;
    try {
      j = JSON.parse(t);
    } catch {
      j = {};
    }
    return { ok: false, reason: j.error?.message || `http_${res.status}` };
  }
  return { ok: true };
}

// ─── Outlook / Graph Mail ────────────────────────────────────────────────────

const OUTLOOK_PAGE_SIZE = 50;
const OUTLOOK_METADATA_TIMEOUT_MS = 15_000;
/** Skip attachments larger than 20 MB — avoids huge base64 payloads in the Graph response. */
const OUTLOOK_ATTACHMENT_MAX_BYTES = 20 * 1024 * 1024;

/** Lightweight HTML → plain-text strip for email bodies (no external dependency). */
function htmlToPlainText(html) {
  if (!html || typeof html !== "string") return "";
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * One page of Outlook messages from a folder, newest first.
 * @param {string} accessToken
 * @param {{ folder?: string; since?: string; nextLink?: string; pageSize?: number }} opts
 * @returns {Promise<{ ok: true; messages: object[]; nextLink?: string } | { ok: false; reason: string }>}
 */
async function listOutlookMessages(
  accessToken,
  { folder = "Inbox", since, nextLink, pageSize = OUTLOOK_PAGE_SIZE } = {}
) {
  const t0 = Date.now();
  try {
    let url;
    if (nextLink) {
      url = nextLink;
    } else {
      const select = "$select=id,subject,from,bodyPreview,hasAttachments,receivedDateTime";
      const top = `$top=${Math.min(100, Math.max(1, pageSize))}`;
      const orderby = "$orderby=receivedDateTime desc";
      const filter = since ? `$filter=receivedDateTime ge ${since}` : "";
      const base =
        folder === "AllMessages"
          ? `${GRAPH}/me/messages`
          : `${GRAPH}/me/mailFolders/${encodeURIComponent(folder)}/messages`;
      const params = [select, top, orderby, filter].filter(Boolean).join("&");
      url = `${base}?${params}`;
    }
    const res = await withTimeout("outlook_list", OUTLOOK_METADATA_TIMEOUT_MS, (signal) =>
      fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }, signal })
    );
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
    const messages = Array.isArray(json.value) ? json.value : [];
    console.log("[outlook:list] ok", {
      folder,
      messageCount: messages.length,
      elapsedMs: Date.now() - t0,
    });
    return { ok: true, messages, nextLink: json["@odata.nextLink"] || undefined };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Fetch one message's full body from Graph.
 * @param {string} accessToken
 * @param {string} msgId
 */
async function _fetchMessageBody(accessToken, msgId) {
  const res = await withTimeout("outlook_body", OUTLOOK_METADATA_TIMEOUT_MS, (signal) =>
    fetch(
      `${GRAPH}/me/messages/${encodeURIComponent(msgId)}` +
        `?$select=id,subject,from,body,receivedDateTime,hasAttachments`,
      { headers: { Authorization: `Bearer ${accessToken}` }, signal }
    )
  );
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = {};
  }
  if (!res.ok) throw new Error(json.error?.message || `http_${res.status}`);
  return json;
}

/**
 * Compose a safe .txt filename from subject + first 8 chars of Graph id.
 * @param {string} subject
 * @param {string} msgId
 * @param {Set<string>} usedNames mutated in place
 */
function _uniqueMessageFilename(subject, msgId, usedNames) {
  const safeSubject = subject
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 60);
  const shortId = (msgId || "").replace(/[^a-zA-Z0-9]/g, "").slice(0, 8);
  let baseName = `${safeSubject}_${shortId}.txt`;
  if (usedNames.has(baseName)) {
    let i = 2;
    while (usedNames.has(`${safeSubject}_${shortId}_${i}.txt`)) i++;
    baseName = `${safeSubject}_${shortId}_${i}.txt`;
  }
  usedNames.add(baseName);
  return baseName;
}

/**
 * Download one message's non-inline attachments and save them to destDir.
 * @param {string} accessToken
 * @param {string} messageId
 * @param {string} destDir
 * @param {Set<string>} usedNames
 * @returns {Promise<string[]>} saved local paths
 */
async function _downloadMessageAttachments(accessToken, messageId, destDir, usedNames) {
  try {
    const res = await withTimeout("outlook_attachments", OUTLOOK_METADATA_TIMEOUT_MS, (signal) =>
      fetch(
        `${GRAPH}/me/messages/${encodeURIComponent(messageId)}/attachments` +
          `?$filter=isInline eq false&$select=id,name,contentType,size,contentBytes`,
        { headers: { Authorization: `Bearer ${accessToken}` }, signal }
      )
    );
    if (!res.ok) return [];
    const json = await res.json().catch(() => ({}));
    const attachments = Array.isArray(json.value) ? json.value : [];
    const saved = [];
    for (const att of attachments) {
      if (typeof att.size === "number" && att.size > OUTLOOK_ATTACHMENT_MAX_BYTES) continue;
      if (!att.contentBytes) continue;
      const rawName = (att.name || "attachment").replace(/[\\/:*?"<>|]/g, "_") || "attachment";
      let baseName = rawName;
      if (usedNames.has(baseName)) {
        const ext = path.extname(baseName);
        const stem = path.basename(baseName, ext);
        let i = 2;
        while (usedNames.has(`${stem}_${i}${ext}`)) i++;
        baseName = `${stem}_${i}${ext}`;
      }
      usedNames.add(baseName);
      const localPath = path.join(destDir, baseName);
      await fs.writeFile(localPath, Buffer.from(att.contentBytes, "base64"));
      saved.push(localPath);
    }
    return saved;
  } catch {
    return [];
  }
}

/**
 * Download Outlook messages to destDir as structured .txt files, plus optional attachments.
 * @param {string} accessToken
 * @param {string[]} messageIds
 * @param {string} destDir
 * @param {{ includeAttachments?: boolean; messagesMeta?: object[] }} opts
 */
async function importOutlookMessagesToDirectory(accessToken, messageIds, destDir, opts = {}) {
  const ids = (messageIds || []).filter(Boolean);
  if (ids.length === 0) return { ok: false, reason: "no_message_ids" };
  await fs.mkdir(destDir, { recursive: true });
  const localPaths = [];
  const failed = [];
  const usedNames = new Set();
  const metaMap = new Map((opts.messagesMeta || []).map((m) => [m.id, m]));

  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const meta = metaMap.get(id) || { id };
    console.log("[outlook:import] message_start", { index: i + 1, total: ids.length, id });
    try {
      const bodyJson = await _fetchMessageBody(accessToken, id);
      const subject = (bodyJson.subject || meta.subject || "No Subject").trim();
      const fromName = bodyJson.from?.emailAddress?.name || "";
      const fromAddr = bodyJson.from?.emailAddress?.address || "";
      const fromLine = fromName ? `${fromName} <${fromAddr}>` : fromAddr;
      const date = bodyJson.receivedDateTime || meta.receivedDateTime || "";
      const rawBody = bodyJson.body?.content || "";
      const bodyContent =
        bodyJson.body?.contentType === "html"
          ? htmlToPlainText(rawBody)
          : (rawBody || "").trim();
      const textContent = [
        `Subject: ${subject}`,
        `From: ${fromLine}`,
        `Date: ${date}`,
        "",
        bodyContent,
      ].join("\n");
      const baseName = _uniqueMessageFilename(subject, id, usedNames);
      const localPath = path.join(destDir, baseName);
      await fs.writeFile(localPath, textContent, "utf8");
      localPaths.push(localPath);
      if (opts.includeAttachments && (meta.hasAttachments || bodyJson.hasAttachments)) {
        const attPaths = await _downloadMessageAttachments(accessToken, id, destDir, usedNames);
        localPaths.push(...attPaths);
      }
      console.log("[outlook:import] message_done", { index: i + 1, total: ids.length });
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      failed.push({ id, reason });
      console.log("[outlook:import] message_failed", { index: i + 1, id, reason });
    }
  }
  return { ok: true, localPaths, stagingDir: destDir, failed };
}

/**
 * Build the Outlook staging directory path for a sort job.
 * @param {string} jobId
 */
function outlookStagingDir(jobId) {
  return path.join(
    require("../accountProfile").resolveProfileRoot(),
    "outlook_sort_staging",
    jobId.replace(/[^a-zA-Z0-9_-]/g, "")
  );
}

async function graphMailSearchMessages(accessToken, query, maxMessages) {
  const cap = Math.min(25, Math.max(1, Number(maxMessages) || 25));
  const url = new URL(`${GRAPH}/me/messages`);
  url.searchParams.set("$top", String(cap));
  url.searchParams.set(
    "$select",
    "subject,from,bodyPreview,receivedDateTime,isRead,hasAttachments,importance,inferenceClassification"
  );
  const headers = { Authorization: `Bearer ${accessToken}` };
  const q = typeof query === "string" ? query.trim() : "";
  if (q) {
    // User-provided search query: use $search (ConsistencyLevel required), skip date filter
    // so the user can find old emails by keyword.
    url.searchParams.set("$search", `"${q.replace(/"/g, "")}"`);
    headers["ConsistencyLevel"] = "eventual";
  } else {
    // Recap mode: limit to last 14 days and exclude "Other" clutter inbox.
    // Graph $filter and $orderby require no $search — they're mutually exclusive.
    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    url.searchParams.set(
      "$filter",
      `receivedDateTime ge ${since} and inferenceClassification ne 'other'`
    );
    url.searchParams.set("$orderby", "receivedDateTime DESC");
  }
  const t0 = Date.now();
  try {
    const res = await withTimeout("graph_mail_search", 25_000, (signal) =>
      fetch(url.toString(), { headers, signal })
    );
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = {};
    }
    if (!res.ok) {
      const reason = json.error?.message || `http_${res.status}`;
      console.log("[graph:mail_search] failed", { reason, elapsedMs: Date.now() - t0 });
      return { ok: false, reason };
    }
    const raw = Array.isArray(json.value) ? json.value : [];
    const messages = raw.map((m) => ({
      subject: m.subject || "",
      from: m.from?.emailAddress?.name || m.from?.emailAddress?.address || "",
      bodyPreview: (m.bodyPreview || "").trim().slice(0, 500),
      date: m.receivedDateTime || "",
      isRead: Boolean(m.isRead),
      hasAttachments: Boolean(m.hasAttachments),
      isImportant: m.importance === "high",
      isFocused: m.inferenceClassification === "focused",
    }));
    console.log("[graph:mail_search] ok", { count: messages.length, elapsedMs: Date.now() - t0 });
    return { ok: true, messages };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * List calendar events in [startIso, endIso) via Graph calendarView.
 * @param {string} accessToken
 * @param {string} startIso RFC3339
 * @param {string} endIso RFC3339
 * @param {number} maxEvents
 */
/**
 * Normalise a Graph dateTime object to a display-ready string.
 *
 * - All-day events: return "YYYY-MM-DD" so the frontend date-only formatter handles them.
 * - Timed events: the dateTime value is already in the user's local timezone (from the Prefer header),
 *   so we strip the sub-second noise and leave it as-is for JavaScript's `new Date()` to parse as local.
 * @param {{ dateTime?: string; date?: string; timeZone?: string } | undefined} dt
 * @param {boolean} isAllDay
 * @returns {string}
 */
function normaliseGraphDateTime(dt, isAllDay) {
  if (!dt) return "";
  // All-day events: Graph returns midnight dateTime; surface as a plain date string instead.
  if (isAllDay) {
    const raw = dt.dateTime || dt.date || "";
    const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : raw;
  }
  // Timed events: strip trailing sub-second decimals (e.g. ".0000000") so Date() parses cleanly.
  const raw = (dt.dateTime || "").replace(/\.\d+$/, "");
  return raw;
}

async function graphListCalendarViewEvents(accessToken, startIso, endIso, maxEvents) {
  const cap = Math.min(50, Math.max(1, Number(maxEvents) || 50));

  // Use the system's local timezone so Graph returns datetimes already in the user's local time.
  // This avoids the double-offset bug where bare ISO strings (no Z) get parsed as local by JS
  // even though the actual value is UTC.
  const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

  const url = new URL(`${GRAPH}/me/calendar/calendarView`);
  url.searchParams.set("startDateTime", startIso);
  url.searchParams.set("endDateTime", endIso);
  url.searchParams.set("$top", String(cap));
  // $orderby omitted — Graph calendarView rejects it when combined with $top.
  url.searchParams.set(
    "$select",
    "subject,start,end,location,organizer,isCancelled,isAllDay,bodyPreview,onlineMeetingUrl,importance,showAs,categories"
  );
  const t0 = Date.now();
  try {
    const res = await withTimeout("graph_calendar_view", 25_000, (signal) =>
      fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Prefer: `outlook.timezone="${localTz}"`,
        },
        signal,
      })
    );
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = {};
    }
    if (!res.ok) {
      const msg =
        json.error?.message ||
        (Array.isArray(json.error?.errors) && json.error.errors[0]?.message) ||
        `http_${res.status}`;
      // Typical 403: missing/incorrect Calendars.Read consent on this refresh token, org policy, or Azure API permissions.
      console.log("[graph:calendar_view] failed", {
        httpStatus: res.status,
        graphCode: json.error?.code,
        graphMessage: msg,
        innerError: json.error?.innerError,
        elapsedMs: Date.now() - t0,
      });
      const code = json.error?.code;
      if (
        res.status === 403 &&
        (code === "ErrorAccessDenied" || /\baccess is denied\b/i.test(String(msg)))
      ) {
        return { ok: false, reason: "microsoft_calendar_access_denied" };
      }
      return { ok: false, reason: String(msg).slice(0, 500) };
    }
    const raw = Array.isArray(json.value) ? json.value : [];
    const events = raw
      .filter((ev) => !ev.isCancelled)
      .map((ev) => {
        const isAllDay = Boolean(ev.isAllDay);
        return {
          // "summary" matches the field name used by Google Calendar — the frontend reads ev.summary
          summary: (ev.subject || "").trim(),
          start: normaliseGraphDateTime(ev.start, isAllDay),
          end: normaliseGraphDateTime(ev.end, isAllDay),
          isAllDay,
          location: ev.location?.displayName?.trim() || "",
          organizer: ev.organizer?.emailAddress?.address || "",
          bodyPreview: (ev.bodyPreview || "").trim().slice(0, 200),
          onlineMeetingUrl: ev.onlineMeetingUrl || "",
          importance: ev.importance || "",
          showAs: ev.showAs || "",
          categories: Array.isArray(ev.categories) ? ev.categories : [],
        };
      });
    console.log("[graph:calendar_view] ok", { count: events.length, elapsedMs: Date.now() - t0 });
    return { ok: true, events };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}

module.exports = {
  getClientId,
  connectMicrosoftPkce,
  refreshStoredTokens,
  getValidAccessToken,
  emailFromGraphMePayload,
  graphMeHealth,
  graphCalendarHealth,
  uploadTextToOneDriveRoot,
  listOneDriveFolderContents,
  listOneDriveAllFilesRecursive,
  importOneDriveFilesToDirectory,
  oneDriveStagingDir,
  listOutlookMessages,
  importOutlookMessagesToDirectory,
  outlookStagingDir,
  SCOPES,
  graphListCalendarViewEvents,
  graphMailSearchMessages,
};

const { registerProvider } = require("./providerInterface");

registerProvider("microsoft", {
  id: "microsoft",
  getAuthStatus: async () => {
    try {
      const token = await getValidAccessToken();
      return { ok: true, connected: Boolean(token?.access_token) };
    } catch {
      return { ok: true, connected: false };
    }
  },
  listFiles: async (payload) => listOneDriveFolderContents(payload ?? {}),
  importFiles: async (payload) => importOneDriveFilesToDirectory(payload ?? {}),
});
