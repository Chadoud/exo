/** Python backend process lifecycle management. */

const path = require("path");
const fs = require("fs");
const { spawn, execSync, execFileSync } = require("child_process");
const state = require("./state");
const {
  IS_DEV,
  IS_WIN,
  IS_MAC,
  BACKEND_PORT,
  ELECTRON_CAPTURE_PORT,
  BACKEND_MAX_CRASHES_BEFORE_GIVE_UP,
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
  reconcileGmailOAuthMirrorAfterBackendExit,
  migrateLegacyHomeGmailMirror,
} = require("./gmailOAuthMirrorStore");
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
    if (state.backendProcess === proc) {
      state.backendProcess = null;
    }
    try {
      reconcileGmailOAuthMirrorAfterBackendExit(
        exositesUserDataEnv(),
        findPortListeners().size > 0,
      );
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
  if (state.backendProcess && state.backendProcess.exitCode === null) {
    return;
  }

  const busyPids = findPortListeners();
  if (busyPids.size > 0) {
    // Never SIGKILL a live listener from spawn — that drops in-flight Sort /
    // Gmail import (`fetch failed`). Recovery belongs in getManagedBackendStatus
    // only when /health is actually down.
    console.warn(
      "[backend] port",
      BACKEND_PORT,
      "already in use — not spawning another listener",
      [...busyPids].join(","),
    );
    return;
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
 * Return the set of PIDs currently listening on the backend port.
 * Kept here (not in backendLifecycle.js) — `startBackend`/`attachBackendProcess`
 * call it directly, and backendLifecycle.js imports it back, so moving it too
 * would create a require cycle between the two files.
 */
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

module.exports = {
  startBackend,
  findPortListeners,
  exositesUserDataEnv,
  readRemoteLlmEnvForBackendSpawn,
  normalizeRemoteLlmHost,
  syncGoogleOauthClientIdForElectronMain,
  syncRemoteLlmEnvForMainProcess,
};
