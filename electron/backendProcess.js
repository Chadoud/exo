/** Python backend process lifecycle management. */

const path = require("path");
const fs = require("fs");
const http = require("http");
const { spawn, execSync, execFileSync } = require("child_process");
const state = require("./state");
const {
  IS_DEV,
  IS_WIN,
  IS_MAC,
  BACKEND_PORT,
  ELECTRON_CAPTURE_PORT,
  BACKEND_HEALTH_RETRIES,
  BACKEND_PACKAGED_HEALTH_RETRIES,
  BACKEND_PACKAGED_HEALTH_DELAY_MS,
  BACKEND_MAX_CRASHES_BEFORE_GIVE_UP,
  POLL_INTERVAL_MS,
} = require("./constants");
const { readBackendEnvOverrides, readBackendEnvOverridesRaw, writeBackendEnvOverrides } = require("./backendEnvOverrides");
const {
  readGmailRelatedEnvForBackendSpawn,
  readInfomaniakTokenForElectronMain,
} = require("./readGmailDotenvForBackend");
const {
  getCloudSortLlmApiKey,
  migrateCloudSortKeyFromOverrides,
} = require("./entitlement/sortLlmSecretStore");
const {
  readAiProviderEnvForBackendSpawn,
  getManualRemoteLlmApiKey,
  migrateAiKeysFromWritableEnv,
  setManualRemoteLlmApiKey,
} = require("./backendAiSecrets");
const {
  materializeGmailOAuthMirrorForBackend,
  deleteMaterializedGmailOAuthMirror,
  migrateLegacyHomeGmailMirror,
} = require("./gmailOAuthMirrorStore");
const { delay } = require("./utils");
const { resolvePackagedBackendBin } = require("./packagedBackendPath");
const { googleCredentialsFromJsonPath } = require("./googleCredentialsJson");

const STAGING_LLM_CANONICAL_HOST = "https://llm-staging.exosites.ch";

/** Infomaniak exposes LiteLLM on 443; bare ``http://IP:4000`` is blocked off-VPS. */
function normalizeRemoteLlmHost(host) {
  const trimmed = String(host || "").trim().replace(/\/$/, "");
  if (!trimmed) return trimmed;
  if (/^http:\/\/[\d.]+:4000$/i.test(trimmed)) {
    const canonical = String(process.env.EXOSITES_SORT_LLM_CANONICAL_HOST || STAGING_LLM_CANONICAL_HOST)
      .trim()
      .replace(/\/$/, "");
    console.warn(`[backend] rewriting blocked OLLAMA_HOST ${trimmed} -> ${canonical}`);
    return canonical;
  }
  return trimmed;
}

const REMOTE_LLM_ENV_KEYS = [
  "OLLAMA_MODE",
  "OLLAMA_HOST",
  "OLLAMA_BASE_URL",
  "OLLAMA_API_KEY",
  "EXOSITES_REMOTE_LLM",
  "EXOSITES_LLM_MAX_SLOTS",
  "EXOSITES_SORT_MAX_CONCURRENCY",
  "EXOSITES_SORT_QUEUE_URL",
  "OLLAMA_REQUEST_TIMEOUT_S",
  "OLLAMA_MAX_RETRIES",
  "EXOSITES_SORT_CREDENTIALS_MANAGED",
  "EXOSITES_CLOUD_SORT_WORKER",
  "EXOSITES_CLOUD_SORT_WORKER_URL",
  "EXOSITES_SORT_SERVICE_MODE",
  "EXOSITES_CLOUD_SORT_WORKER_TIMEOUT_S",
];

/** Merge dev ``backend/.env`` + userData overrides for remote sort LLM (backend/.env wins over shell). */
function readRemoteLlmEnvForBackendSpawn() {
  const ud = exositesUserDataEnv();
  const backendDir = path.join(__dirname, "..", "backend");
  migrateCloudSortKeyFromOverrides();
  migrateAiKeysFromWritableEnv(ud, {
    // Dev: lift orphan backend/.env keys into safeStorage so chat + voice share one source.
    extraEnvPaths: IS_DEV ? [path.join(__dirname, "..", "backend", ".env")] : [],
  });
  migrateLegacyHomeGmailMirror();
  migrateManualRemoteLlmKeyFromOverrides();

  const merged = {
    ...readDevBackendDotEnv(),
    ...readGmailRelatedEnvForBackendSpawn({
      isDev: IS_DEV,
      backendDir,
      resourcesPath: process.resourcesPath,
      userData: ud,
    }),
    ...readBackendEnvOverrides(),
  };
  const out = {};
  for (const key of REMOTE_LLM_ENV_KEYS) {
    if (key === "OLLAMA_API_KEY") continue;
    const value = merged[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      out[key] = String(value);
    }
  }
  const managed =
    merged.EXOSITES_SORT_CREDENTIALS_MANAGED === "1" ||
    merged.EXOSITES_SORT_CREDENTIALS_MANAGED === 1;
  const apiKey = managed ? getCloudSortLlmApiKey() : getManualRemoteLlmApiKey();
  if (apiKey) out.OLLAMA_API_KEY = apiKey;
  if (out.OLLAMA_HOST) {
    out.OLLAMA_HOST = normalizeRemoteLlmHost(out.OLLAMA_HOST);
  } else if (out.OLLAMA_BASE_URL) {
    out.OLLAMA_HOST = normalizeRemoteLlmHost(out.OLLAMA_BASE_URL);
  }
  return out;
}

/** One-time: user-entered remote LLM key from overrides JSON → safeStorage. */
function migrateManualRemoteLlmKeyFromOverrides() {
  const full = readBackendEnvOverridesRaw();
  const legacy = String(full.OLLAMA_API_KEY || "").trim();
  if (!legacy) return;
  if (full.EXOSITES_SORT_CREDENTIALS_MANAGED === "1" || full.EXOSITES_SORT_CREDENTIALS_MANAGED === 1) {
    return;
  }
  if (!getManualRemoteLlmApiKey()) {
    setManualRemoteLlmApiKey(legacy);
  }
  if (!full.OLLAMA_API_KEY) return;
  const next = { ...full };
  delete next.OLLAMA_API_KEY;
  writeBackendEnvOverrides(next);
}

/** Parse ``KEY=VALUE`` lines from dev ``backend/.env`` (lowest priority vs userData overrides). */
function readDevBackendDotEnv() {
  if (!IS_DEV) return {};
  const envPath = path.join(__dirname, "..", "backend", ".env");
  if (!fs.existsSync(envPath)) return {};
  const out = {};
  try {
    const text = fs.readFileSync(envPath, "utf8");
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (key) out[key] = value;
    }
  } catch (err) {
    console.warn("[backend] read dev .env failed:", err && err.message);
  }
  return out;
}

/**
 * Apply remote/local LLM flags to the Electron main process before setup and ``ollama serve``.
 * Child-process env is merged separately in ``startBackend``.
 */
function syncRemoteLlmEnvForMainProcess() {
  const remoteEnv = readRemoteLlmEnvForBackendSpawn();
  const llmMode = (remoteEnv.OLLAMA_MODE || "").trim();
  if (llmMode) process.env.OLLAMA_MODE = llmMode;
  const remoteLlm = (remoteEnv.EXOSITES_REMOTE_LLM || "").trim();
  if (remoteLlm) process.env.EXOSITES_REMOTE_LLM = remoteLlm;
  const host = (remoteEnv.OLLAMA_HOST || "").trim();
  if (host) process.env.OLLAMA_HOST = host;
  const apiKey = (remoteEnv.OLLAMA_API_KEY || "").trim();
  if (apiKey) process.env.OLLAMA_API_KEY = apiKey;
}

/**
 * Active account profile root — backend `EXOSITES_USER_DATA` + `EXOSITES_DATA_DIR`.
 * Not the device userData root (cloud session lives there).
 */
function exositesUserDataEnv() {
  try {
    const { resolveProfileRoot } = require("./accountProfile");
    const root = resolveProfileRoot();
    return root || undefined;
  } catch {
    return undefined;
  }
}

/** Return the absolute path to the Tesseract executable when discoverable. */
function findTesseractCmd() {
  if (IS_WIN) {
    const candidates = [
      "C:\\Program Files\\Tesseract-OCR\\tesseract.exe",
      "C:\\Program Files (x86)\\Tesseract-OCR\\tesseract.exe",
      path.join(process.env.LOCALAPPDATA || "", "Programs", "Tesseract-OCR", "tesseract.exe"),
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) return p;
    }
    return null;
  }
  if (IS_MAC) {
    const candidates = [
      "/opt/homebrew/bin/tesseract",
      "/usr/local/bin/tesseract",
      "/usr/bin/tesseract",
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) return p;
    }
    try {
      const resolved = execFileSync("which", ["tesseract"], {
        encoding: "utf8",
        timeout: 3000,
      }).trim();
      return resolved || null;
    } catch {
      return null;
    }
  }
  return null;
}

/** Uvicorn args shared by dev launchers. */
function uvicornArgs() {
  return [
    "-m",
    "uvicorn",
    "main:app",
    "--host",
    "127.0.0.1",
    "--port",
    String(BACKEND_PORT),
    // Suppress per-request access lines; warnings/errors still surface.
    "--no-access-log",
  ];
}

/** Pick interpreter for dev (Windows often has `py` but not `python` on PATH). */
function pickPythonForDev() {
  if (IS_WIN) {
    try {
      execSync("py -3 --version", { stdio: "ignore", windowsHide: true, timeout: 8000 });
      return { cmd: "py", prefix: ["-3"] };
    } catch {
      console.warn("[backend] `py -3` not available, using `python`");
      return { cmd: "python", prefix: [] };
    }
  }
  try {
    execSync("python3 --version", { stdio: "ignore", timeout: 8000 });
    return { cmd: "python3", prefix: [] };
  } catch {
    return { cmd: "python", prefix: [] };
  }
}

/**
 * Install / sync backend Python dependencies before spawning uvicorn.
 * Runs synchronously so the backend process starts with all packages present.
 * Non-fatal: if pip fails (e.g. offline, no pip) we log and continue — the
 * startup pre-flight in main.py will surface a clear error if a key package
 * is still missing.
 */
function ensureBackendDeps(backendDir, pythonCmd, pythonPrefix) {
  if (state.backendDepsEnsured) return;
  const reqFile = path.join(backendDir, "requirements.txt");
  if (!fs.existsSync(reqFile)) {
    state.backendDepsEnsured = true;
    return;
  }
  try {
    console.log("[backend] Installing/syncing Python dependencies…");
    /** argv array — avoids shell splitting when paths contain spaces (e.g. …/AI File Manager/…). */
    const args = [
      ...pythonPrefix,
      "-m",
      "pip",
      "install",
      "-r",
      reqFile,
      "--quiet",
      "--disable-pip-version-check",
    ];
    execFileSync(pythonCmd, args, {
      stdio: "pipe",
      windowsHide: true,
      timeout: 120_000,
    });
    console.log("[backend] Python dependencies OK.");
  } catch (e) {
    console.warn("[backend] pip install had warnings/errors (non-fatal):", e.message ?? e);
  } finally {
    state.backendDepsEnsured = true;
  }
}

function pipeBackendLines(stream, logFn) {
  stream?.on("data", (chunk) => {
    for (const line of chunk.toString().split(/\r?\n/)) {
      const trimmed = line.trimEnd();
      if (trimmed) logFn("[backend]", trimmed);
    }
  });
}

function attachBackendProcess(proc) {
  pipeBackendLines(proc.stdout, console.log);
  pipeBackendLines(proc.stderr, console.error);
  proc.on("error", (err) => console.error("[backend] process error:", err));
  proc.on("exit", (code, signal) => {
    console.log("[backend] exited with code", code, signal ?? "");
    if (code !== 0 && code !== null) {
      state.backendCrashCount += 1;
      state.backendLastCrashAt = Date.now();
      if (state.backendCrashCount >= BACKEND_MAX_CRASHES_BEFORE_GIVE_UP) {
        state.backendStartupGiveUp = true;
        console.error(
          "[backend] crashed",
          state.backendCrashCount,
          "times — stopping auto-respawn until Restart service"
        );
        notifyRendererBackendStartupFailed();
      }
    }
    state.backendProcess = null;
    try {
      deleteMaterializedGmailOAuthMirror(exositesUserDataEnv());
    } catch {
      /* ignore */
    }
  });
}

/**
 * macOS Gatekeeper quarantine on the PyInstaller binary prevents spawn from DMG installs.
 * Best-effort chmod + xattr clear before first launch.
 *
 * @param {string} backendBin absolute path to packaged backend executable
 */
function preparePackagedBackendBinary(backendBin) {
  if (IS_DEV || !backendBin || !fs.existsSync(backendBin)) return;
  try {
    fs.chmodSync(backendBin, 0o755);
  } catch (err) {
    console.warn("[backend] chmod failed:", err && err.message);
  }
  if (IS_MAC) {
    try {
      execFileSync("xattr", ["-cr", backendBin], { stdio: "ignore" });
    } catch (err) {
      console.warn("[backend] xattr -cr failed:", err && err.message);
    }
  }
}

/** Clear quarantine on every macOS backend slice shipped in the app bundle. */
function preparePackagedMacBackendSlices(resourcesPath) {
  if (IS_DEV || !IS_MAC || !resourcesPath) return;
  const sliceDirs = [
    path.join(resourcesPath, "backend-x64"),
    path.join(resourcesPath, "backend-arm64"),
    path.join(resourcesPath, "backend"),
  ].filter((p) => p && fs.existsSync(p));

  // Quarantine on any nested dylib/so breaks spawn — clear the whole slice tree.
  for (const slice of sliceDirs) {
    try {
      execFileSync("xattr", ["-cr", slice], { stdio: "ignore" });
    } catch (err) {
      console.warn("[backend] xattr -cr slice failed:", err && err.message);
    }
  }

  const candidates = new Set(
    [resolvePackagedBackendBin(resourcesPath), ...sliceDirs].filter((p) => p && fs.existsSync(p))
  );
  for (const bin of candidates) {
    if (fs.existsSync(bin) && fs.statSync(bin).isFile()) {
      preparePackagedBackendBinary(bin);
    }
  }
}

function notifyRendererBackendStartupFailed() {
  const win = state.mainWindow;
  if (!win || win.isDestroyed()) return;
  try {
    win.webContents.send("exo:backend-startup-failed");
  } catch {
    /* renderer may not be ready */
  }
}

/** Read ``client_id`` from Google Desktop/Web credentials JSON (same shape as ``gmail_oauth_client.json``). */
function clientIdFromGoogleCredentialsJsonPath(jsonPath) {
  return googleCredentialsFromJsonPath(jsonPath).clientId;
}

/**
 * Read integration-config.json from the resources directory.
 * Returns an object with the keys it found; missing/empty keys are omitted.
 * Priority: bundled resources file < .env/overrides (so dev overrides always win).
 */
function readBundledIntegrationConfig() {
  const jsonPath = IS_DEV
    ? path.join(__dirname, "resources", "integration-config.json")
    : path.join(process.resourcesPath, "integration-config.json");
  if (!fs.existsSync(jsonPath)) return {};
  try {
    const raw = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    const out = {};
    for (const [k, v] of Object.entries(raw)) {
      if (k.startsWith("_")) continue; // skip comment fields
      const s = typeof v === "string" ? v.trim() : "";
      if (s) out[k] = s;
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * Google Drive (Electron) uses ``EXOSITES_GOOGLE_OAUTH_CLIENT_ID``; Gmail (Python) uses
 * ``EXOSITES_GOOGLE_CLIENT_ID`` / JSON from the same ``backend/.env``. When the Drive var is unset,
 * copy the Desktop client ID into the main process so one config file is enough.
 * Also copies ``EXOSITES_GOOGLE_CLIENT_SECRET`` when missing so **Web** OAuth clients can complete
 * the token exchange (PKCE + ``client_secret``); Desktop clients ignore the extra field.
 *
 * Dropbox, Microsoft, and Infomaniak client IDs follow the same pattern but read from integration-config.json
 * (bundled at build time) as the lowest-priority source — .env / userData overrides win.
 */
function syncGoogleOauthClientIdForElectronMain() {
  const ud = exositesUserDataEnv();
  const backendDir = path.join(__dirname, "..", "backend");
  // Integration config bundled in the packaged binary — lowest priority.
  const bundledCfg = readBundledIntegrationConfig();
  const merged = {
    // Bundled config first (lowest priority)
    ...bundledCfg,
    ...readGmailRelatedEnvForBackendSpawn({
      isDev: IS_DEV,
      backendDir,
      resourcesPath: process.resourcesPath,
      userData: ud,
    }),
    // userData JSON overrides win over everything
    ...readBackendEnvOverrides(),
  };

  if (!(process.env.EXOSITES_GOOGLE_OAUTH_CLIENT_ID || "").trim()) {
    let cid = (merged.EXOSITES_GOOGLE_CLIENT_ID || "").trim();
    let bundledJsonPath = "";
    if (!cid) {
      bundledJsonPath = (merged.EXOSITES_GOOGLE_OAUTH_CLIENT_JSON || "").trim();
      cid = clientIdFromGoogleCredentialsJsonPath(bundledJsonPath);
    }
    if (!cid) {
      bundledJsonPath = IS_DEV
        ? path.join(__dirname, "resources", "gmail_oauth_client.json")
        : path.join(process.resourcesPath, "gmail_oauth_client.json");
      if (fs.existsSync(bundledJsonPath)) {
        cid = clientIdFromGoogleCredentialsJsonPath(bundledJsonPath);
      }
    }
    if (cid) process.env.EXOSITES_GOOGLE_OAUTH_CLIENT_ID = cid;
  }

  if (!(process.env.EXOSITES_GOOGLE_CLIENT_SECRET || "").trim()) {
    let sec = (merged.EXOSITES_GOOGLE_CLIENT_SECRET || "").trim();
    if (!sec) {
      const jsonPath =
        (merged.EXOSITES_GOOGLE_OAUTH_CLIENT_JSON || "").trim() ||
        (IS_DEV
          ? path.join(__dirname, "resources", "gmail_oauth_client.json")
          : path.join(process.resourcesPath, "gmail_oauth_client.json"));
      sec = googleCredentialsFromJsonPath(jsonPath).clientSecret;
    }
    if (sec) process.env.EXOSITES_GOOGLE_CLIENT_SECRET = sec;
  }

  // Dropbox — .env / overrides win; bundledCfg is the fallback for packaged builds.
  if (!(process.env.EXOSITES_DROPBOX_APP_KEY || "").trim()) {
    const dbxKey = (merged.EXOSITES_DROPBOX_APP_KEY || "").trim();
    if (dbxKey) process.env.EXOSITES_DROPBOX_APP_KEY = dbxKey;
  }

  // Microsoft — same pattern.
  if (!(process.env.EXOSITES_MICROSOFT_OAUTH_CLIENT_ID || "").trim()) {
    const msId = (merged.EXOSITES_MICROSOFT_OAUTH_CLIENT_ID || "").trim();
    if (msId) process.env.EXOSITES_MICROSOFT_OAUTH_CLIENT_ID = msId;
  }
  if (!(process.env.EXOSITES_MICROSOFT_OAUTH_REDIRECT_PORT || "").trim()) {
    const rp = (merged.EXOSITES_MICROSOFT_OAUTH_REDIRECT_PORT || "").trim();
    if (rp) process.env.EXOSITES_MICROSOFT_OAUTH_REDIRECT_PORT = rp;
  }

  // Infomaniak kDrive — same pattern (Electron main reads credentials; backend/.env is synced here).
  if (!(process.env.EXOSITES_INFOMANIAK_CLIENT_ID || "").trim()) {
    const ikId = (merged.EXOSITES_INFOMANIAK_CLIENT_ID || "").trim();
    if (ikId) process.env.EXOSITES_INFOMANIAK_CLIENT_ID = ikId;
  }
  if (!(process.env.EXOSITES_INFOMANIAK_CLIENT_SECRET || "").trim()) {
    const ikSec = (merged.EXOSITES_INFOMANIAK_CLIENT_SECRET || "").trim();
    if (ikSec) process.env.EXOSITES_INFOMANIAK_CLIENT_SECRET = ikSec;
  }
  if (!(process.env.EXOSITES_INFOMANIAK_OAUTH_REDIRECT_PORT || "").trim()) {
    const ikRp = (merged.EXOSITES_INFOMANIAK_OAUTH_REDIRECT_PORT || "").trim();
    if (ikRp) process.env.EXOSITES_INFOMANIAK_OAUTH_REDIRECT_PORT = ikRp;
  }

  // Notion — same pattern (Electron main runs the OAuth flow + token exchange with the secret).
  if (!(process.env.EXOSITES_NOTION_CLIENT_ID || "").trim()) {
    const notionId = (merged.EXOSITES_NOTION_CLIENT_ID || "").trim();
    if (notionId) process.env.EXOSITES_NOTION_CLIENT_ID = notionId;
  }
  if (!(process.env.EXOSITES_NOTION_CLIENT_SECRET || "").trim()) {
    const notionSec = (merged.EXOSITES_NOTION_CLIENT_SECRET || "").trim();
    if (notionSec) process.env.EXOSITES_NOTION_CLIENT_SECRET = notionSec;
  }

  if (!(process.env.EXOSITES_SLACK_CLIENT_ID || "").trim()) {
    const slackId = (merged.EXOSITES_SLACK_CLIENT_ID || "").trim();
    if (slackId) process.env.EXOSITES_SLACK_CLIENT_ID = slackId;
  }
  if (!(process.env.EXOSITES_SLACK_CLIENT_SECRET || "").trim()) {
    const slackSec = (merged.EXOSITES_SLACK_CLIENT_SECRET || "").trim();
    if (slackSec) process.env.EXOSITES_SLACK_CLIENT_SECRET = slackSec;
  }

  // Static Infomaniak API bearer (Electron only — never passed to the Python backend child).
  if (!(process.env.EXOSITES_INFOMANIAK_TOKEN || "").trim()) {
    const ikTok = readInfomaniakTokenForElectronMain({
      isDev: IS_DEV,
      backendDir,
      resourcesPath: process.resourcesPath,
      userData: ud,
    });
    if (ikTok) process.env.EXOSITES_INFOMANIAK_TOKEN = ikTok;
  }

  if (!(process.env.EXOSITES_CLOUD_URL || "").trim()) {
    const cloudUrl = (merged.EXOSITES_CLOUD_URL || "").trim();
    if (cloudUrl) process.env.EXOSITES_CLOUD_URL = cloudUrl;
  }

  if (!(process.env.EXOSITES_SORT_CREDENTIALS_URL || "").trim()) {
    const sortCredsUrl = (merged.EXOSITES_SORT_CREDENTIALS_URL || "").trim();
    if (sortCredsUrl) process.env.EXOSITES_SORT_CREDENTIALS_URL = sortCredsUrl;
  }

  syncRemoteLlmEnvForMainProcess();
}

function startBackend() {
  syncGoogleOauthClientIdForElectronMain();
  if (IS_DEV && process.env.SKIP_BACKEND === "1") {
    console.log("[main] Dev mode: backend managed externally, skipping spawn");
    return;
  }
  if (state.backendProcess && !state.backendProcess.killed) {
    return;
  }

  // Orphan / prior failed-bind listeners keep 7799 busy while Electron thinks
  // there is no managed child — free the port before spawning so we do not
  // pile up "address already in use" uvicorn processes.
  const busyPids = findPortListeners();
  if (busyPids.length > 0) {
    console.warn(
      "[backend] port",
      BACKEND_PORT,
      "already in use before spawn — freeing listeners",
      busyPids.join(","),
    );
    freeBackendPort();
  }

  // Generate a per-run secret shared only between Electron and the backend process.
  // The frontend reads it via IPC (app:getBackendToken) and sends it as X-App-Token
  // so other local processes cannot call the API.
  if (!state.appToken) {
    state.appToken = require("crypto").randomBytes(32).toString("hex");
  }

  // Packaged builds: never allow open localhost API (ignore insecure-local env).
  if (!IS_DEV && process.env.EXOSITES_INSECURE_LOCAL) {
    console.warn(
      "[main] Ignoring EXOSITES_INSECURE_LOCAL in packaged build (app token required)"
    );
    delete process.env.EXOSITES_INSECURE_LOCAL;
  }

  const tesseractCmd = findTesseractCmd();
  const ud = exositesUserDataEnv();
  const backendDir = path.join(__dirname, "..", "backend");
  const resourceDir = IS_DEV ? backendDir : process.resourcesPath;
  if (ud) {
    // Wipe any leftover plaintext mirror from a prior crash, then rematerialize (M2.4).
    deleteMaterializedGmailOAuthMirror(ud);
    materializeGmailOAuthMirrorForBackend(ud);
  }
  const extraEnv = {
    ...(tesseractCmd ? { TESSERACT_CMD: tesseractCmd } : {}),
    ...(ud ? { EXOSITES_USER_DATA: ud, EXOSITES_DATA_DIR: ud } : {}),
    ...(IS_DEV ? { EXOSITES_DEV_BYPASS_ENTITLEMENT: "1" } : {}),
    ...(require("./buildProfile").isUnlimitedEntitlementBuild()
      ? { EXOSITES_UNLIMITED_ENTITLEMENT: "1" }
      : {}),
    EXOSITES_APP_TOKEN: state.appToken,
    EXOSITES_BACKEND_SECRETS_MANAGED: "1",
    // Fail closed if token somehow missing; packaged always requires auth.
    ...(!IS_DEV ? { EXOSITES_REQUIRE_APP_TOKEN: "1" } : {}),
    ...(IS_MAC
      ? {
          EXOSITES_ELECTRON_CAPTURE_URL: `http://127.0.0.1:${ELECTRON_CAPTURE_PORT}/v1/capture/screen`,
        }
      : {}),
    ...readGmailRelatedEnvForBackendSpawn({
      isDev: IS_DEV,
      backendDir,
      resourcesPath: process.resourcesPath,
      userData: ud,
    }),
    ...readRemoteLlmEnvForBackendSpawn(),
    ...readAiProviderEnvForBackendSpawn(),
    /** After overrides: fixed path so Python can load resources/.env (packaged) or dev backend/.env. */
    EXOSITES_BACKEND_RESOURCE_DIR: resourceDir,
  };

  // Never leave the app token on disk (even in dev). Use IPC getBackendToken only.
  if (ud) {
    try {
      const legacyTok = path.join(ud, ".dev-app-token");
      if (fs.existsSync(legacyTok)) fs.unlinkSync(legacyTok);
    } catch {
      /* ignore */
    }
  }

  /** Prefer explicit env / overrides; otherwise use bundled Desktop OAuth JSON next to backend (packaged) or under electron/resources (dev). */
  const bundledGmailJson = IS_DEV
    ? path.join(__dirname, "resources", "gmail_oauth_client.json")
    : path.join(process.resourcesPath, "gmail_oauth_client.json");
  const envTrim = (key) => {
    const v = extraEnv[key] ?? process.env[key];
    return typeof v === "string" ? v.trim() : "";
  };
  const hasGmailClientPair = envTrim("EXOSITES_GOOGLE_CLIENT_ID") && envTrim("EXOSITES_GOOGLE_CLIENT_SECRET");
  if (
    fs.existsSync(bundledGmailJson) &&
    !envTrim("EXOSITES_GOOGLE_OAUTH_CLIENT_JSON") &&
    !hasGmailClientPair
  ) {
    extraEnv.EXOSITES_GOOGLE_OAUTH_CLIENT_JSON = bundledGmailJson;
  }

  if (IS_DEV) {
    const { cmd, prefix } = pickPythonForDev();
    // Ensure all requirements are installed before starting — runs every launch
    // but pip is fast when packages are already present (~0.3 s warm).
    ensureBackendDeps(backendDir, cmd, prefix);
    const args = [...prefix, ...uvicornArgs()];
    const opts = {
      cwd: backendDir,
      shell: false,
      stdio: "pipe",
      env: { ...process.env, ...extraEnv },
    };
    console.log("[main] Spawning backend:", cmd, args.join(" "));
    state.backendProcess = spawn(cmd, args, opts);
    attachBackendProcess(state.backendProcess);
  } else {
    preparePackagedMacBackendSlices(process.resourcesPath);
    const backendBin = resolvePackagedBackendBin(process.resourcesPath);
    if (!backendBin) {
      console.error("[backend] packaged binary not found under", process.resourcesPath);
      return;
    }
    preparePackagedBackendBinary(backendBin);
    console.log("[main] Spawning packaged backend:", backendBin, `(arch ${process.arch})`);
    state.backendProcess = spawn(backendBin, ["--port", String(BACKEND_PORT)], {
      cwd: process.resourcesPath,
      stdio: "pipe",
      env: { ...process.env, ...extraEnv },
    });
    attachBackendProcess(state.backendProcess);
  }

  state.backendSpawnedAt = Date.now();
  console.log("[main] Backend started");
}

/**
 * Force-kill a process and its entire child tree.
 *
 * The backend is a bundled PyInstaller exe (which spawns a child) or a `python`
 * process that may fork workers. A plain `proc.kill()` only signals the direct
 * child, orphaning grandchildren that keep port 7799 bound. On Windows we use
 * `taskkill /T /F`; on POSIX we escalate SIGTERM → SIGKILL.
 *
 * @param {import("child_process").ChildProcess | null} proc
 */
function forceKillTree(proc) {
  if (!proc || typeof proc.pid !== "number") return;
  const { pid } = proc;
  if (IS_WIN) {
    try {
      execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
      return;
    } catch (err) {
      console.warn("[backend] taskkill failed, falling back to signal:", err && err.message);
    }
  }
  try {
    proc.kill("SIGTERM");
  } catch (_) {
    /* already gone */
  }
  const killEscalationMs = IS_DEV ? 400 : 2000;
  setTimeout(() => {
    try {
      if (!proc.killed) proc.kill("SIGKILL");
    } catch (_) {
      /* already gone */
    }
  }, killEscalationMs);
}

/**
 * Best-effort recovery of the backend listen port. When a previous backend was
 * orphaned, the new process cannot bind 7799. We find the PID that owns the port
 * and kill its tree so the respawn can succeed. Implemented per-platform:
 * `netstat`/`taskkill` on Windows, `lsof`/`kill` on macOS/Linux.
 */
function freeBackendPort() {
  const pids = findPortListeners();
  for (const pid of pids) {
    if (pid === String(process.pid)) continue;
    try {
      if (IS_WIN) {
        execFileSync("taskkill", ["/PID", pid, "/T", "/F"], { stdio: "ignore" });
      } else {
        // SIGKILL the listener; its children are reaped by the OS on POSIX.
        execFileSync("kill", ["-9", pid], { stdio: "ignore" });
      }
      console.warn(`[backend] freed port ${BACKEND_PORT} by killing stale PID ${pid}`);
    } catch (_) {
      /* process may have already exited */
    }
  }
}

/** Return the set of PIDs currently listening on the backend port. */
function findPortListeners() {
  const pids = new Set();
  try {
    if (IS_WIN) {
      const out = execSync(`netstat -ano -p tcp | findstr :${BACKEND_PORT}`, {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });
      for (const line of out.split(/\r?\n/)) {
        const match = line.trim().match(/LISTENING\s+(\d+)\s*$/i);
        if (match) pids.add(match[1]);
      }
    } else {
      // -t: terse (PID only), -i: by port, -sTCP:LISTEN: only the listener.
      const out = execSync(`lsof -ti tcp:${BACKEND_PORT} -sTCP:LISTEN`, {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });
      for (const line of out.split(/\r?\n/)) {
        const pid = line.trim();
        if (pid) pids.add(pid);
      }
    }
  } catch (_) {
    // netstat/findstr or lsof exits non-zero when nothing matches — port is free.
  }
  return pids;
}

function killBackend() {
  if (state.backendProcess) {
    forceKillTree(state.backendProcess);
    state.backendProcess = null;
  }
  try {
    deleteMaterializedGmailOAuthMirror(exositesUserDataEnv());
  } catch {
    /* ignore */
  }
}

/** Wait until the backend child has exited (frees the listen port). Used before respawn. */
async function killBackendAndWait(timeoutMs = 8000) {
  const proc = state.backendProcess;
  if (!proc) return;
  await new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      if (state.backendProcess === proc) state.backendProcess = null;
      resolve();
    };
    proc.once("exit", finish);
    try {
      forceKillTree(proc);
    } catch {
      finish();
    }
    // If the tree kill did not surface an exit in time, escalate once more and
    // free the port directly so the respawn is not blocked by an orphan.
    setTimeout(() => {
      if (!settled) {
        freeBackendPort();
        finish();
      }
    }, timeoutMs);
  });
}

function ensureBackendRunning() {
  if (IS_DEV && process.env.SKIP_BACKEND === "1") return;
  if (state.backendStartupGiveUp) return;
  if (!state.backendProcess || state.backendProcess.killed) {
    startBackend();
  }
}

/** Coalesce concurrent restart requests into one kill/spawn/wait cycle. */
let restartBackendInFlight = null;

/** Kill running backend (if any) and start a new process; wait until /health responds. */
async function restartBackend() {
  if (IS_DEV && process.env.SKIP_BACKEND === "1") {
    console.warn("[backend] SKIP_BACKEND=1 — manage uvicorn yourself (e.g. python -m uvicorn main:app --port 7799)");
    return { ok: false, reason: "skip_backend" };
  }
  if (restartBackendInFlight) return restartBackendInFlight;

  restartBackendInFlight = (async () => {
    const coldStartMaxMs = BACKEND_PACKAGED_HEALTH_RETRIES * BACKEND_PACKAGED_HEALTH_DELAY_MS;
    const child = state.backendProcess;
    if (
      !IS_DEV &&
      child &&
      !child.killed &&
      child.exitCode === null &&
      state.backendSpawnedAt > 0
    ) {
      const elapsed = Date.now() - state.backendSpawnedAt;
      if (elapsed < coldStartMaxMs) {
        const remainingRetries = Math.max(
          1,
          Math.ceil((coldStartMaxMs - elapsed) / BACKEND_PACKAGED_HEALTH_DELAY_MS),
        );
        console.log(
          "[backend] Restart skipped — service still in cold start; waiting up to",
          Math.round((remainingRetries * BACKEND_PACKAGED_HEALTH_DELAY_MS) / 1000),
          "s",
        );
        const up = await waitForBackend(remainingRetries, BACKEND_PACKAGED_HEALTH_DELAY_MS);
        return { ok: up, reason: up ? undefined : "starting" };
      }
    }

    state.backendStartupGiveUp = false;
    state.backendCrashCount = 0;
    state.backendLastCrashAt = 0;
    await killBackendAndWait();
    await delay(150);
    startBackend();
    const restartWaitRetries = IS_DEV ? 45 : BACKEND_PACKAGED_HEALTH_RETRIES;
    const restartWaitDelayMs = IS_DEV ? 350 : BACKEND_PACKAGED_HEALTH_DELAY_MS;
    let up = await waitForBackend(restartWaitRetries, restartWaitDelayMs);
    if (!up) {
      // A stale process may still own the port (failed bind / orphaned child).
      // Free it and retry once before giving up.
      console.warn("[backend] /health not ready — freeing port and retrying once");
      await killBackendAndWait();
      freeBackendPort();
      await delay(250);
      startBackend();
      up = await waitForBackend(restartWaitRetries, restartWaitDelayMs);
    }
    if (!up) {
      console.error("[backend] /health did not become ready after restart");
    }
    return { ok: up, reason: up ? undefined : "health_timeout" };
  })();

  try {
    return await restartBackendInFlight;
  } finally {
    restartBackendInFlight = null;
  }
}

/**
 * When Electron spawns the backend, /health must belong to our child — not a stale process
 * still bound to BACKEND_PORT after a failed bind (e.g. WinError 10048).
 */
function healthBelongsToManagedBackend() {
  if (IS_DEV && process.env.SKIP_BACKEND === "1") return true;
  const p = state.backendProcess;
  return p != null && !p.killed && p.exitCode === null;
}

async function waitForBackend(retries = BACKEND_HEALTH_RETRIES, delayMs = POLL_INTERVAL_MS) {
  let warnedForeignHealth = false;
  for (let i = 0; i < retries; i++) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.get(`http://127.0.0.1:${BACKEND_PORT}/health`, resolve);
        req.on("error", reject);
        req.setTimeout(1000, () => {
          req.destroy();
          reject(new Error("timeout"));
        });
      });
      if (!healthBelongsToManagedBackend()) {
        if (!warnedForeignHealth) {
          warnedForeignHealth = true;
          console.warn(
            "[backend] /health responded but this app's Python process is not running — port",
            BACKEND_PORT,
            "may be in use by another instance. Free the port or run `npm run dev:kill-ports`."
          );
        }
        await delay(delayMs);
        continue;
      }
      return true;
    } catch {
      await delay(delayMs);
    }
  }
  return false;
}

/**
 * Cold-start progress from the same spawn timestamp and wait window as managed health checks.
 *
 * @param {boolean} [healthReady]
 * @returns {{ elapsedMs: number; maxWaitMs: number; percent: number }}
 */
function getManagedStartupProgress(healthReady = false) {
  const maxWaitMs = BACKEND_PACKAGED_HEALTH_RETRIES * BACKEND_PACKAGED_HEALTH_DELAY_MS;
  if (healthReady) {
    return { elapsedMs: maxWaitMs, maxWaitMs, percent: 100 };
  }
  const spawnedAt = state.backendSpawnedAt;
  if (!spawnedAt) {
    return { elapsedMs: 0, maxWaitMs, percent: 0 };
  }
  const elapsedMs = Math.min(maxWaitMs, Math.max(0, Date.now() - spawnedAt));
  const percent = Math.min(99, Math.round((elapsedMs / maxWaitMs) * 100));
  return { elapsedMs, maxWaitMs, percent };
}

/**
 * Health check that only succeeds when this app's managed backend child is running.
 * Used by the renderer instead of raw /health (which can succeed on a stale foreign process).
 *
 * @returns {Promise<{ ok: boolean; managed: boolean; reason?: string; startupProgress?: { elapsedMs: number; maxWaitMs: number; percent: number } }>}
 */
async function getManagedBackendStatus() {
  if (IS_DEV && process.env.SKIP_BACKEND === "1") {
    return {
      ok: true,
      managed: false,
      reason: "skip_backend",
      startupProgress: getManagedStartupProgress(true),
    };
  }

  const healthOk = async () => {
    try {
      await new Promise((resolve, reject) => {
        const req = http.get(`http://127.0.0.1:${BACKEND_PORT}/health`, resolve);
        req.on("error", reject);
        req.setTimeout(2500, () => {
          req.destroy();
          reject(new Error("timeout"));
        });
      });
      return true;
    } catch {
      return false;
    }
  };

  const managedStartupMaxMs = BACKEND_PACKAGED_HEALTH_RETRIES * BACKEND_PACKAGED_HEALTH_DELAY_MS;

  if (state.backendStartupGiveUp) {
    if ((await healthOk()) && healthBelongsToManagedBackend()) {
      state.backendStartupGiveUp = false;
      state.backendCrashCount = 0;
      return { ok: true, managed: true, startupProgress: getManagedStartupProgress(true) };
    }
    if (state.backendCrashCount >= BACKEND_MAX_CRASHES_BEFORE_GIVE_UP) {
      return {
        ok: false,
        managed: false,
        reason: "exited",
        startupProgress: getManagedStartupProgress(false),
      };
    }
    return {
      ok: false,
      managed: false,
      reason: "health_timeout",
      startupProgress: getManagedStartupProgress(false),
    };
  }

  if (!healthBelongsToManagedBackend()) {
    ensureBackendRunning();
  }

  if ((await healthOk()) && healthBelongsToManagedBackend()) {
    state.backendCrashCount = 0;
    return { ok: true, managed: true, startupProgress: getManagedStartupProgress(true) };
  }

  if (
    healthBelongsToManagedBackend() &&
    state.backendSpawnedAt > 0 &&
    Date.now() - state.backendSpawnedAt > managedStartupMaxMs
  ) {
    console.warn(
      "[backend] /health still pending after cold-start window — PyInstaller first launch can take several minutes; continuing to wait"
    );
    return {
      ok: false,
      managed: true,
      reason: "starting",
      startupProgress: getManagedStartupProgress(false),
    };
  }

  // Stale listener on 7799 from a previous run blocks our child — recover once.
  if (!healthBelongsToManagedBackend()) {
    freeBackendPort();
    ensureBackendRunning();
    await delay(800);
    if ((await healthOk()) && healthBelongsToManagedBackend()) {
      state.backendCrashCount = 0;
      return { ok: true, managed: true, startupProgress: getManagedStartupProgress(true) };
    }
    return {
      ok: false,
      managed: false,
      reason: "foreign_process",
      startupProgress: getManagedStartupProgress(false),
    };
  }

  return {
    ok: false,
    managed: true,
    reason: "starting",
    startupProgress: getManagedStartupProgress(false),
  };
}

module.exports = {
  startBackend,
  killBackend,
  ensureBackendRunning,
  waitForBackend,
  restartBackend,
  readRemoteLlmEnvForBackendSpawn,
  normalizeRemoteLlmHost,
  syncGoogleOauthClientIdForElectronMain,
  syncRemoteLlmEnvForMainProcess,
  freeBackendPort,
  getManagedBackendStatus,
};
