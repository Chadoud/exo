/**
 * Exosites cloud account gate: POST to EXOSITES_CLOUD_URL (/auth/register, /auth/login, /auth/refresh).
 * Session stored in userData/cloud_session.json (encrypted with safeStorage when available).
 * Set EXOSITES_SKIP_CLOUD_AUTH=1 to disable (local dev).
 *
 * Packaged builds always point at the production cloud API unless overridden — new users
 * must sign in before the welcome wizard.
 */

const fs = require("fs");
const path = require("path");
const { safeStorage, app } = require("electron");
const { fetchAuthProviders } = require("./cloudAuthProviders");

/** Default cloud API for signed release builds (public URL, not a secret). */
const PACKAGED_CLOUD_URL = "https://api.exosites.ch";
/** LLM gateway where virtual keys are minted (colocated with LiteLLM on VPS). */
const PACKAGED_SORT_CREDENTIALS_URL = "https://llm-staging.exosites.ch";
const SORT_CREDENTIALS_FETCH_TIMEOUT_MS = 12_000;

function readJsonSafe(p, fallback) {
  try {
    if (!fs.existsSync(p)) return fallback;
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return fallback;
  }
}

/**
 * Load EXOSITES_CLOUD_URL into process.env from bundled config, then packaged default.
 */
function ensureCloudUrlInProcessEnv() {
  if ((process.env.EXOSITES_CLOUD_URL || "").trim()) return;

  try {
    const { syncGoogleOauthClientIdForElectronMain } = require("./backendProcess");
    syncGoogleOauthClientIdForElectronMain();
  } catch (err) {
    console.warn("[cloudAuth] env sync failed:", err && err.message);
  }

  if ((process.env.EXOSITES_CLOUD_URL || "").trim()) return;

  if (app?.isPackaged) {
    process.env.EXOSITES_CLOUD_URL = PACKAGED_CLOUD_URL;
    console.log("[cloudAuth] using packaged default cloud URL");
  }
}

function cloudBaseUrl() {
  ensureCloudUrlInProcessEnv();
  return (process.env.EXOSITES_CLOUD_URL || "").trim().replace(/\/$/, "");
}

/**
 * Base URL for POST /v1/sort/credentials (LLM gateway broker, not api.exosites.ch).
 */
function sortCredentialsBaseUrl() {
  ensureCloudUrlInProcessEnv();
  const explicit = (process.env.EXOSITES_SORT_CREDENTIALS_URL || "").trim();
  if (explicit) return explicit.replace(/\/$/, "");
  if (app?.isPackaged) return PACKAGED_SORT_CREDENTIALS_URL;
  return PACKAGED_SORT_CREDENTIALS_URL;
}

function isAuthGateEnabled() {
  if (process.env.EXOSITES_SKIP_CLOUD_AUTH === "1") return false;
  if (app?.isPackaged) return true;
  return Boolean(cloudBaseUrl());
}

function sessionPath(userData) {
  return path.join(userData, "cloud_session.json");
}

/** @deprecated Legacy path copy — opt-in only via migrateLegacyCloudSession(); not run on startup. */
function migrateLegacyCloudSession(userData) {
  const dest = sessionPath(userData);
  if (fs.existsSync(dest) || process.platform !== "darwin") return;
  const supportRoot = path.join(app.getPath("home"), "Library", "Application Support");
  for (const dirName of ["Exo", "EXO", "Exosites AI Manager", "exosites-assistant"]) {
    const legacy = path.join(supportRoot, dirName, "cloud_session.json");
    if (!fs.existsSync(legacy)) continue;
    try {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(legacy, dest);
      console.log("[cloudAuth] migrated cloud session from", dirName);
      return;
    } catch (err) {
      console.warn("[cloudAuth] legacy session migration failed:", err && err.message);
    }
  }
}

function readSession(userData) {
  const p = sessionPath(userData);
  if (!fs.existsSync(p)) return null;
  try {
    const raw = fs.readFileSync(p);
    // Detect encrypted format: binary buffer that is not valid UTF-8 JSON, or explicit enc marker.
    let parsed;
    try {
      parsed = JSON.parse(raw.toString("utf8"));
    } catch {
      parsed = null;
    }
    if (parsed && parsed.__enc === true && safeStorage?.isEncryptionAvailable?.()) {
      const decrypted = safeStorage.decryptString(Buffer.from(parsed.data, "base64"));
      parsed = JSON.parse(decrypted);
    } else if (parsed && parsed.__enc === true) {
      // Encrypted but safeStorage unavailable — cannot decrypt, clear and re-auth.
      console.warn("[cloudAuth] Cannot decrypt session: safeStorage unavailable. Clearing.");
      clearSession(userData);
      return null;
    } else if (parsed && typeof parsed === "object" && parsed.access_token) {
      // M2.6/M2.7: legacy plaintext session — wipe, do not use.
      console.warn("[cloudAuth] Refusing plaintext cloud session; clearing.");
      clearSession(userData);
      return null;
    }
    if (!parsed || typeof parsed !== "object") return null;
    return parsed.access_token ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Persist session encrypted with safeStorage. Fail-closed when encryption is unavailable (M2.6).
 * @returns {boolean} true when written
 */
function writeSession(userData, obj) {
  if (!safeStorage?.isEncryptionAvailable?.()) {
    console.warn("[cloudAuth] safeStorage unavailable — refusing plaintext session write.");
    return false;
  }
  const p = sessionPath(userData);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const payload = { v: 1, ...obj };
  try {
    const enc = safeStorage.encryptString(JSON.stringify(payload));
    fs.writeFileSync(p, JSON.stringify({ __enc: true, data: enc.toString("base64") }), "utf8");
  } catch (err) {
    console.warn("[cloudAuth] session encrypt/write failed:", err && err.message);
    return false;
  }
  try {
    const { broadcastCloudSessionChanged } = require("./cloudSessionBroadcast");
    broadcastCloudSessionChanged("saved");
  } catch {
    /* ignore if Electron app not ready */
  }
  // Retry binding a saved offline license to this account on every fresh session
  // (login/register/social/token-refresh) — self-guarded (no-op without a saved
  // key) and covers users who applied a license while offline/signed-out.
  try {
    const { attachOfflineLicenseToCloudAccount } = require("./entitlement/applyLicenseRuntime");
    attachOfflineLicenseToCloudAccount(userData).catch(() => {});
  } catch {
    /* ignore if module unavailable */
  }
  return true;
}

function clearSession(userData) {
  try {
    fs.unlinkSync(sessionPath(userData));
  } catch {
    /* ignore */
  }
  try {
    const { broadcastCloudSessionChanged } = require("./cloudSessionBroadcast");
    broadcastCloudSessionChanged("cleared");
  } catch {
    /* ignore if Electron app not ready */
  }
}

function jwtExpMs(token) {
  try {
    const parts = String(token).split(".");
    if (parts.length < 2) return 0;
    const json = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return typeof json.exp === "number" ? json.exp * 1000 : 0;
  } catch {
    return 0;
  }
}

function formatHttpError(status, data, text) {
  if (typeof data?.error === "string" && data.error.trim()) return data.error.trim();
  const d = data?.detail;
  if (typeof d === "string") {
    if (/already registered/i.test(d)) return "Email already registered";
    if (/invalid credentials/i.test(d)) return "Invalid credentials";
    if (/google or apple/i.test(d)) return "This account uses Google or Apple sign-in";
    if (/disabled/i.test(d)) return "Account disabled";
    return d;
  }
  if (Array.isArray(d)) return d.map((x) => (typeof x === "object" && x.msg ? x.msg : String(x))).join(", ");
  if (d && typeof d === "object") return JSON.stringify(d);
  return text || `HTTP ${status}`;
}

/** Keep session when refresh fails due to connectivity (not invalid credentials). */
function isTransientRefreshFailure(err) {
  if (!err) return false;
  if (err instanceof TypeError) return true;
  const code = err.cause && typeof err.cause === "object" ? err.cause.code : null;
  if (typeof code === "string" && ["ENOTFOUND", "ECONNREFUSED", "ETIMEDOUT", "EAI_AGAIN"].includes(code)) {
    return true;
  }
  const msg = String(err.message || "").toLowerCase();
  return msg.includes("fetch failed") || msg.includes("network");
}

async function getJson(relPath, accessToken) {
  const base = cloudBaseUrl();
  const pathPart = relPath.startsWith("/") ? relPath : `/${relPath}`;
  const url = `${base}${pathPart}`;
  const res = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json", Authorization: `Bearer ${accessToken}` },
  });
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {};
  }
  if (!res.ok) {
    throw new Error(formatHttpError(res.status, data, text));
  }
  return data;
}

async function deleteJson(relPath, accessToken) {
  const base = cloudBaseUrl();
  const pathPart = relPath.startsWith("/") ? relPath : `/${relPath}`;
  const url = `${base}${pathPart}`;
  const res = await fetch(url, {
    method: "DELETE",
    headers: { Accept: "application/json", Authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 204) {
    return { ok: true };
  }
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {};
  }
  if (!res.ok) {
    throw new Error(formatHttpError(res.status, data, text));
  }
  return data;
}

/**
 * Load the signed-in account profile (trial end, entitlements).
 * @param {string} userData
 */
async function fetchProfile(userData) {
  const sess = await ensureFreshSession(userData);
  if (!sess?.access_token) return null;
  return getJson("/v1/me", sess.access_token);
}

/**
 * Mint or refresh short-lived sort LLM credentials for entitled accounts.
 * Credentials are minted on the LLM gateway (VPS), not api.exosites.ch — Infomaniak
 * hosting cannot reach the inference VPS for server-side key generation.
 * @param {string} userData
 */
async function fetchSortCredentials(userData) {
  const sess = await ensureFreshSession(userData);
  if (!sess?.access_token) {
    throw new Error("not_logged_in");
  }
  const base = sortCredentialsBaseUrl();
  const pathPart = "/v1/sort/credentials";
  const url = `${base}${pathPart}`;
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${sess.access_token}`,
      },
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(SORT_CREDENTIALS_FETCH_TIMEOUT_MS),
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`${detail} (${url})`);
  }
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {};
  }
  if (!res.ok) {
    throw new Error(formatHttpError(res.status, data, text));
  }
  return data;
}

/**
 * Lightweight broker config probe (no LiteLLM key mint).
 * @param {string} userData
 */
async function fetchSortCredentialsConfig(userData) {
  const sess = await ensureFreshSession(userData);
  if (!sess?.access_token) {
    throw new Error("not_logged_in");
  }
  const url = `${sortCredentialsBaseUrl()}/v1/sort/credentials/config`;
  let res;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${sess.access_token}`,
      },
      signal: AbortSignal.timeout(SORT_CREDENTIALS_FETCH_TIMEOUT_MS),
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`${detail} (${url})`);
  }
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {};
  }
  if (!res.ok) {
    throw new Error(formatHttpError(res.status, data, text));
  }
  return data;
}

async function exportAccountData(userData) {
  const sess = await ensureFreshSession(userData);
  if (!sess?.access_token) {
    throw new Error("not_logged_in");
  }
  return getJson("/v1/me/data-export", sess.access_token);
}

async function deleteCloudAccount(userData) {
  const sess = await ensureFreshSession(userData);
  if (!sess?.access_token) {
    throw new Error("not_logged_in");
  }
  await deleteJson("/v1/me", sess.access_token);
  clearSession(userData);
  return { ok: true };
}

async function postJson(relPath, body) {
  const base = cloudBaseUrl();
  const pathPart = relPath.startsWith("/") ? relPath : `/${relPath}`;
  const url = `${base}${pathPart}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {};
  }
  if (!res.ok) {
    throw new Error(formatHttpError(res.status, data, text));
  }
  return data;
}

async function postJsonAuthed(relPath, accessToken, body = {}) {
  const base = cloudBaseUrl();
  const pathPart = relPath.startsWith("/") ? relPath : `/${relPath}`;
  const url = `${base}${pathPart}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {};
  }
  if (!res.ok) {
    throw new Error(formatHttpError(res.status, data, text));
  }
  return data;
}

/** @type {Promise<object|null> | null} */
let refreshInFlight = null;

function clearRefreshInFlightOnceSettled(promise) {
  promise.finally(() => {
    if (refreshInFlight === promise) {
      refreshInFlight = null;
    }
  });
}

/**
 * @param {string} userData
 * @param {object} session
 * @returns {Promise<object|null>}
 */
async function refreshSessionFromServer(userData, session) {
  try {
    const data = await postJson("/auth/refresh", { refresh_token: session.refresh_token });
    const next = {
      access_token: data.access_token,
      refresh_token: data.refresh_token || session.refresh_token,
      email: session.email,
    };
    if (!writeSession(userData, next)) {
      console.warn("[cloudAuth] refreshed tokens could not be persisted (safeStorage unavailable)");
      return next;
    }
    return readSession(userData);
  } catch (e) {
    if (isTransientRefreshFailure(e)) {
      console.warn("[cloudAuth] refresh skipped (offline):", e.message);
      return session;
    }
    const refreshed = readSession(userData);
    if (refreshed?.access_token) {
      const exp = jwtExpMs(refreshed.access_token);
      if (exp && Date.now() < exp - 30_000) {
        console.info("[cloudAuth] using session refreshed by concurrent caller");
        return refreshed;
      }
    }
    console.warn("[cloudAuth] refresh failed:", e.message);
    clearSession(userData);
    return null;
  }
}

/**
 * Refresh access token if close to expiry; clears session on failure.
 * @returns {object|null} session or null
 */
async function ensureFreshSession(userData) {
  let s = readSession(userData);
  if (!s?.access_token) return null;
  const exp = jwtExpMs(s.access_token);
  if (!exp || Date.now() < exp - 60_000) {
    return s;
  }
  if (!s.refresh_token) {
    clearSession(userData);
    return null;
  }
  if (refreshInFlight) {
    return refreshInFlight;
  }
  refreshInFlight = refreshSessionFromServer(userData, s);
  clearRefreshInFlightOnceSettled(refreshInFlight);
  return refreshInFlight;
}

/** Test-only: reset in-flight refresh dedupe between cases. */
function resetRefreshInFlightForTests() {
  refreshInFlight = null;
}

async function login(userData, email, password) {
  const em = String(email || "").trim().toLowerCase();
  const data = await postJson("/auth/login", { email: em, password: String(password || "") });
  const { accountIdFromAccessToken } = require("./accountProfile");
  const accountId = accountIdFromAccessToken(data.access_token);
  if (
    !writeSession(userData, {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      email: em,
      account_id: accountId,
    })
  ) {
    return { ok: false, error: "Secure storage unavailable on this device." };
  }
  return { ok: true, email: em, account_id: accountId };
}

async function register(userData, email, password, firstName, lastName) {
  const em = String(email || "").trim().toLowerCase();
  const normalizedFirstName = String(firstName || "").trim();
  const normalizedLastName = String(lastName || "").trim();
  const data = await postJson("/auth/register", {
    email: em,
    password: String(password || ""),
    first_name: normalizedFirstName,
    last_name: normalizedLastName,
  });
  if (data.access_token && data.refresh_token) {
    const { accountIdFromAccessToken } = require("./accountProfile");
    const accountId = accountIdFromAccessToken(data.access_token);
    if (
      !writeSession(userData, {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        email: em,
        first_name: normalizedFirstName || null,
        last_name: normalizedLastName || null,
        account_id: accountId,
      })
    ) {
      return { ok: false, error: "Secure storage unavailable on this device." };
    }
    return { ok: true, email: em, account_id: accountId };
  }
  return login(userData, em, password);
}

/**
 * Complete a social sign-in: trade the one-time code from the auth window for a session.
 * @param {string} userData
 * @param {string} code one-time exo_code returned by the provider callback
 */
async function exchangeSocialCode(userData, code) {
  const data = await postJson("/auth/exchange", { code: String(code || "") });
  const { accountIdFromAccessToken } = require("./accountProfile");
  const accountId = accountIdFromAccessToken(data.access_token);
  if (
    !writeSession(userData, {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      email: data.email || null,
      account_id: accountId,
    })
  ) {
    return { ok: false, error: "Secure storage unavailable on this device." };
  }
  return { ok: true, email: data.email || null, account_id: accountId };
}

async function getAuthProviders() {
  return fetchAuthProviders(cloudBaseUrl());
}

/**
 * Ask the cloud for a Stripe Checkout URL (opened in the system browser).
 * Server errors surface as Error(message=error code, e.g. "already_subscribed").
 * @param {string} userData
 * @param {"monthly" | "annual"} interval
 * @returns {Promise<{ checkout_url: string }>}
 */
async function createBillingCheckoutSession(userData, interval) {
  const sess = await ensureFreshSession(userData);
  if (!sess?.access_token) {
    throw new Error("not_logged_in");
  }
  return postJsonAuthed("/v1/billing/checkout-session", sess.access_token, { interval });
}

/**
 * Ask the cloud for a Stripe Customer Portal URL (manage card / cancel).
 * @param {string} userData
 * @returns {Promise<{ portal_url: string }>}
 */
async function createBillingPortalSession(userData) {
  const sess = await ensureFreshSession(userData);
  if (!sess?.access_token) {
    throw new Error("not_logged_in");
  }
  return postJsonAuthed("/v1/billing/portal-session", sess.access_token, {});
}

function logout(userData) {
  void (async () => {
    try {
      const s = readSession(userData);
      if (s?.refresh_token) {
        await postJson("/auth/logout", { refresh_token: s.refresh_token }).catch(() => {});
      }
    } catch {
      /* best-effort server-side refresh revocation */
    }
    try {
      const { clearCloudSortCredentials } = require("./entitlement/sortCredentials");
      // Clears profile-scoped meta; pass device root (resolved inside).
      await clearCloudSortCredentials(userData);
    } catch (err) {
      console.warn("[cloudAuth] clear sort credentials failed:", err && err.message);
    }
  })();
  clearSession(userData);
  return { ok: true };
}

module.exports = {
  cloudBaseUrl,
  sortCredentialsBaseUrl,
  isAuthGateEnabled,
  readSession,
  ensureFreshSession,
  login,
  register,
  logout,
  exchangeSocialCode,
  getAuthProviders,
  migrateLegacyCloudSession,
  fetchProfile,
  createBillingCheckoutSession,
  createBillingPortalSession,
  fetchSortCredentials,
  fetchSortCredentialsConfig,
  exportAccountData,
  deleteCloudAccount,
  getJson,
  postJsonAuthed,
  deleteJson,
  resetRefreshInFlightForTests,
};
