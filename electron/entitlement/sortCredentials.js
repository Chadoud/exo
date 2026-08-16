const fs = require("fs");
const path = require("path");
const cloudAuth = require("../cloudAuth");
const {
  readBackendEnvOverridesRaw,
  writeBackendEnvOverrides,
} = require("../backendEnvOverrides");
const { readRemoteLlmEnvForBackendSpawn, normalizeRemoteLlmHost } = require("../backendProcess");
const { restartBackend } = require("../backendLifecycle");
const {
  getCloudSortLlmApiKey,
  setCloudSortLlmApiKey,
  clearCloudSortLlmApiKey,
  migrateCloudSortKeyFromOverrides,
} = require("./sortLlmSecretStore");
const { getManualRemoteLlmApiKey } = require("../backendAiSecrets");

const META_FILE = "sort_credentials_meta.json";
const REFRESH_SKEW_MS = 5 * 60 * 1000;
const PROBE_TIMEOUT_MS = 8_000;
/** Avoid hammering the credentials broker when the gateway is down. */
const SYNC_FAIL_COOLDOWN_MS = 30_000;
/** Min interval between cheap broker config probes (no key mint). */
const CONFIG_PROBE_MIN_MS = 15 * 60 * 1000;
const DEFAULT_CLOUD_LLM_MAX_SLOTS = 2;
const MAX_CLOUD_LLM_MAX_SLOTS = 8;
const DEFAULT_CLOUD_SORT_MAX_CONCURRENCY = 1;
const MAX_CLOUD_SORT_MAX_CONCURRENCY = 8;

/**
 * Align desktop admission with the VPS per-key parallel limit from sort credentials.
 * @param {Record<string, unknown> | null | undefined} creds
 * @returns {string}
 */
function resolveCloudLlmMaxSlots(creds) {
  const raw =
    creds?.llm_max_slots ??
    creds?.max_parallel_requests ??
    creds?.max_parallel ??
    process.env.SORT_LLM_MAX_PARALLEL ??
    DEFAULT_CLOUD_LLM_MAX_SLOTS;
  const parsed = Number.parseInt(String(raw), 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return String(DEFAULT_CLOUD_LLM_MAX_SLOTS);
  }
  return String(Math.min(MAX_CLOUD_LLM_MAX_SLOTS, parsed));
}

/**
 * Parallel analyze workers for cloud sort (one file row at a time by default).
 * @param {Record<string, unknown> | null | undefined} creds
 * @returns {string}
 */
function resolveCloudSortMaxConcurrency(creds) {
  const raw =
    creds?.sort_max_concurrency ??
    process.env.SORT_CLOUD_SORT_CONCURRENCY ??
    DEFAULT_CLOUD_SORT_MAX_CONCURRENCY;
  const parsed = Number.parseInt(String(raw), 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return String(DEFAULT_CLOUD_SORT_MAX_CONCURRENCY);
  }
  const slots = Number.parseInt(resolveCloudLlmMaxSlots(creds), 10);
  const cap = Number.isFinite(slots) && slots > 0 ? slots : MAX_CLOUD_SORT_MAX_CONCURRENCY;
  return String(Math.min(MAX_CLOUD_SORT_MAX_CONCURRENCY, cap, parsed));
}

/**
 * @param {string} host
 * @param {string} token
 * @returns {Promise<boolean>}
 */
async function remoteSortTokenWorks(host, token) {
  const base = String(host || "").replace(/\/$/, "");
  const key = String(token || "").trim();
  if (!base || !key) return false;
  try {
    const res = await fetch(`${base}/v1/models`, {
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    return res.status === 200;
  } catch {
    return false;
  }
}

function metaPath(userData) {
  return path.join(userData, META_FILE);
}

/** Meta/secrets live under the active profile; `deviceRoot` is app userData. */
function profileDataRoot(deviceRoot) {
  return require("../accountProfile").resolveProfileRoot(deviceRoot);
}

function readMeta(userData) {
  try {
    const raw = fs.readFileSync(metaPath(userData), "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function writeMeta(userData, meta) {
  const p = metaPath(userData);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(meta, null, 2), "utf8");
}

function recordSyncFailure(userData, message) {
  const prev = readMeta(userData) || {};
  writeMeta(userData, {
    ...prev,
    last_sync_failed_at: Date.now(),
    last_sync_error: String(message || "sync_failed"),
  });
}

function clearSyncFailure(userData) {
  const prev = readMeta(userData);
  if (!prev) return;
  const next = { ...prev };
  delete next.last_sync_failed_at;
  delete next.last_sync_error;
  writeMeta(userData, next);
}

/**
 * @param {string} userData
 * @returns {string | null}
 */
function getSortSyncLastError(userData) {
  const meta = readMeta(profileDataRoot(userData));
  return typeof meta?.last_sync_error === "string" ? meta.last_sync_error : null;
}

function clearMeta(userData) {
  try {
    fs.unlinkSync(metaPath(userData));
  } catch {
    /* ignore */
  }
}

function resolveSortLlmApiKey(rawOverrides, meta) {
  migrateCloudSortKeyFromOverrides();
  const managed =
    rawOverrides.EXOSITES_SORT_CREDENTIALS_MANAGED === "1" ||
    rawOverrides.EXOSITES_SORT_CREDENTIALS_MANAGED === 1 ||
    Boolean(meta?.managed);
  if (managed) {
    return getCloudSortLlmApiKey();
  }
  const manual = getManualRemoteLlmApiKey();
  if (manual) return manual;
  return String(rawOverrides.OLLAMA_API_KEY || "").trim();
}

function credentialsStillValid(meta) {
  if (!meta?.expires_at) return false;
  return Date.now() < Number(meta.expires_at) - REFRESH_SKEW_MS;
}

/**
 * @param {{ force?: boolean, meta?: object | null, tokenWorks?: boolean, configRevisionStale?: boolean }} input
 */
function shouldUseCachedCredentials(input) {
  if (input.force) return false;
  if (!credentialsStillValid(input.meta)) return false;
  if (!input.tokenWorks) return false;
  if (input.configRevisionStale) return false;
  return true;
}

function resolveSortServiceModeDetail(raw, meta) {
  const mode = String(raw.EXOSITES_SORT_SERVICE_MODE || meta?.sort_service_mode || "").toLowerCase();
  if (mode === "cloud_full" || mode === "cloud_worker" || mode === "vps") return "cloud_full";
  if (String(raw.EXOSITES_CLOUD_SORT_WORKER || "") === "1") return "cloud_full";
  const remote =
    raw.EXOSITES_REMOTE_LLM === "1" ||
    raw.EXOSITES_REMOTE_LLM === 1 ||
    String(raw.OLLAMA_MODE || "").toLowerCase() === "remote";
  return remote ? "cloud" : "local";
}

async function sortConfigRevisionStale(userData, meta) {
  const deviceRoot = userData;
  const dataRoot = profileDataRoot(deviceRoot);
  const localRev = String(meta?.credentials_config_revision || "").trim();
  if (!localRev) return true;

  const lastProbe = Number(meta?.config_probed_at) || 0;
  if (Date.now() - lastProbe < CONFIG_PROBE_MIN_MS) {
    return false;
  }

  let remote;
  try {
    remote = await cloudAuth.fetchSortCredentialsConfig(deviceRoot);
  } catch (err) {
    console.warn(
      "[sortCredentials] config probe failed:",
      err instanceof Error ? err.message : String(err)
    );
    return false;
  }

  const prev = readMeta(dataRoot) || {};
  writeMeta(dataRoot, {
    ...prev,
    config_probed_at: Date.now(),
  });

  const remoteRev = String(remote?.credentials_config_revision || "").trim();
  if (!remoteRev) return false;
  return remoteRev !== localRev;
}

/**
 * Remove cloud-managed sort credentials from backend overrides (logout / entitlement loss).
 * @param {string} userData device userData root
 */
async function clearCloudSortCredentials(userData) {
  clearMeta(profileDataRoot(userData));
  clearCloudSortLlmApiKey();
  const raw = readBackendEnvOverridesRaw();
  if (raw.EXOSITES_SORT_CREDENTIALS_MANAGED !== "1" && raw.EXOSITES_SORT_CREDENTIALS_MANAGED !== 1) {
    return { cleared: false };
  }
  const next = { ...raw };
  delete next.OLLAMA_HOST;
  delete next.OLLAMA_MODE;
  delete next.EXOSITES_REMOTE_LLM;
  delete next.EXOSITES_SORT_CREDENTIALS_MANAGED;
  delete next.EXOSITES_LLM_MAX_SLOTS;
  delete next.EXOSITES_SORT_MAX_CONCURRENCY;
  delete next.EXOSITES_SORT_QUEUE_URL;
  delete next.EXOSITES_CLOUD_SORT_WORKER;
  delete next.EXOSITES_CLOUD_SORT_WORKER_URL;
  delete next.EXOSITES_SORT_SERVICE_MODE;
  writeBackendEnvOverrides(next);
  await restartBackend();
  return { cleared: true };
}

/**
 * Pull short-lived sort LLM credentials from the cloud API and apply to the backend.
 * @param {string} userData
 * @param {{ force?: boolean }} [options]
 */
async function syncSortCredentialsFromCloud(userData, options = {}) {
  const force = options.force === true;
  if (!cloudAuth.isAuthGateEnabled()) {
    return { skipped: "gate_disabled" };
  }

  // Auth session is on device root; meta/secrets live under the active profile.
  const deviceRoot = userData;
  const dataRoot = profileDataRoot(deviceRoot);

  const sess = await cloudAuth.ensureFreshSession(deviceRoot);
  if (!sess?.access_token) {
    clearCloudSortCredentials(dataRoot);
    return { skipped: "not_logged_in" };
  }

  const meta = readMeta(dataRoot);
  const raw = readBackendEnvOverridesRaw();
  const existingHost = String(raw.OLLAMA_HOST || "").trim();
  const existingKey = resolveSortLlmApiKey(raw, meta);

  const lastFailedAt = Number(meta?.last_sync_failed_at) || 0;
  if (
    lastFailedAt > 0 &&
    Date.now() - lastFailedAt < SYNC_FAIL_COOLDOWN_MS &&
    !existingKey
  ) {
    return {
      failed: meta?.last_sync_error || "sync_cooldown",
      skipped: "cooldown",
    };
  }

  if (credentialsStillValid(meta)) {
    const works = await remoteSortTokenWorks(existingHost, existingKey);
    let configRevisionStale = false;
    if (!force && works) {
      configRevisionStale = await sortConfigRevisionStale(deviceRoot, meta);
    }
    if (shouldUseCachedCredentials({ force, meta, tokenWorks: works, configRevisionStale })) {
      return { ok: true, skipped: "still_valid", expires_at: meta.expires_at };
    }
    if (works && configRevisionStale) {
      console.info("[sortCredentials] broker config changed — refreshing credentials");
    } else if (!works) {
      console.warn("[sortCredentials] cached token rejected by gateway — refreshing");
    }
  }

  let creds;
  try {
    creds = await cloudAuth.fetchSortCredentials(deviceRoot);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn("[sortCredentials] cloud fetch failed:", message);
    recordSyncFailure(dataRoot, message);
    return { failed: message };
  }

  if (!creds?.endpoint || !creds?.token) {
    recordSyncFailure(dataRoot, "invalid_credentials_payload");
    return { failed: "invalid_credentials_payload" };
  }

  const nextSlots = resolveCloudLlmMaxSlots(creds);
  const nextSortConcurrency = resolveCloudSortMaxConcurrency(creds);
  const queueUrl = String(creds.queue_url || "").trim();
  const next = {
    ...raw,
    OLLAMA_MODE: "remote",
    EXOSITES_REMOTE_LLM: "1",
    OLLAMA_HOST: normalizeRemoteLlmHost(String(creds.endpoint).replace(/\/$/, "")),
    EXOSITES_SORT_CREDENTIALS_MANAGED: "1",
    EXOSITES_LLM_MAX_SLOTS: nextSlots,
    EXOSITES_SORT_MAX_CONCURRENCY: nextSortConcurrency,
  };
  setCloudSortLlmApiKey(String(creds.token));
  if (queueUrl) {
    next.EXOSITES_SORT_QUEUE_URL = normalizeRemoteLlmHost(queueUrl.replace(/\/$/, ""));
  } else {
    delete next.EXOSITES_SORT_QUEUE_URL;
  }

  const sortMode = String(creds.sort_service_mode || "cloud").toLowerCase();
  if (sortMode === "cloud_full" || sortMode === "cloud_worker" || sortMode === "vps") {
    next.EXOSITES_CLOUD_SORT_WORKER = "1";
    next.EXOSITES_SORT_SERVICE_MODE = sortMode;
    const workerUrl = String(
      creds.sort_worker_url || `${next.OLLAMA_HOST}/v1/sort/worker`
    ).trim();
    next.EXOSITES_CLOUD_SORT_WORKER_URL = normalizeRemoteLlmHost(workerUrl.replace(/\/$/, ""));
  } else {
    delete next.EXOSITES_CLOUD_SORT_WORKER;
    delete next.EXOSITES_SORT_SERVICE_MODE;
    delete next.EXOSITES_CLOUD_SORT_WORKER_URL;
  }

  const expiresIn = Number(creds.expires_in) > 0 ? Number(creds.expires_in) : 86_400;
  const expiresAt = Date.now() + expiresIn * 1000;

  const prevHost = String(raw.OLLAMA_HOST || "").replace(/\/$/, "");
  const prevKey = resolveSortLlmApiKey(raw, meta);
  const prevSlots = String(raw.EXOSITES_LLM_MAX_SLOTS || "");
  const prevSortConcurrency = String(raw.EXOSITES_SORT_MAX_CONCURRENCY || "");
  const prevQueue = String(raw.EXOSITES_SORT_QUEUE_URL || "").replace(/\/$/, "");
  const nextQueue = String(next.EXOSITES_SORT_QUEUE_URL || "").replace(/\/$/, "");
  const prevWorker = String(raw.EXOSITES_CLOUD_SORT_WORKER || "") === "1";
  const nextWorker = String(next.EXOSITES_CLOUD_SORT_WORKER || "") === "1";
  const prevWorkerUrl = String(raw.EXOSITES_CLOUD_SORT_WORKER_URL || "").replace(/\/$/, "");
  const nextWorkerUrl = String(next.EXOSITES_CLOUD_SORT_WORKER_URL || "").replace(/\/$/, "");
  const prevSortMode = String(raw.EXOSITES_SORT_SERVICE_MODE || "").toLowerCase();
  const nextSortMode = String(next.EXOSITES_SORT_SERVICE_MODE || "").toLowerCase();
  const nextKey = String(creds.token);
  const changed =
    prevHost !== next.OLLAMA_HOST ||
    prevKey !== nextKey ||
    raw.EXOSITES_SORT_CREDENTIALS_MANAGED !== "1" ||
    prevSlots !== nextSlots ||
    prevSortConcurrency !== nextSortConcurrency ||
    prevQueue !== nextQueue ||
    prevWorker !== nextWorker ||
    prevWorkerUrl !== nextWorkerUrl ||
    prevSortMode !== nextSortMode;

  writeBackendEnvOverrides(next);
  writeMeta(dataRoot, {
    expires_at: expiresAt,
    endpoint: next.OLLAMA_HOST,
    managed: true,
    credentials_config_revision:
      String(creds.credentials_config_revision || "").trim() || undefined,
    sort_service_mode: sortMode,
    sort_worker_url: next.EXOSITES_CLOUD_SORT_WORKER_URL || undefined,
    config_probed_at: Date.now(),
    entitled_models: Array.isArray(creds.models)
      ? creds.models.filter((m) => typeof m === "string" && m.trim())
      : [],
  });
  clearSyncFailure(dataRoot);

  if (changed) {
    await restartBackend();
    return { ok: true, restarted: true, expires_at: expiresAt };
  }

  return { ok: true, restarted: false, expires_at: expiresAt };
}

/**
 * @param {string} userData
 */
function getSortServiceSurface(userData) {
  const raw = readBackendEnvOverridesRaw();
  const spawnEnv = readRemoteLlmEnvForBackendSpawn();
  const meta = readMeta(profileDataRoot(userData));
  const managed =
    raw.EXOSITES_SORT_CREDENTIALS_MANAGED === "1" ||
    raw.EXOSITES_SORT_CREDENTIALS_MANAGED === 1 ||
    spawnEnv.EXOSITES_SORT_CREDENTIALS_MANAGED === "1" ||
    Boolean(meta?.managed);
  const remote =
    managed ||
    String(raw.OLLAMA_MODE || spawnEnv.OLLAMA_MODE || "").toLowerCase() === "remote" ||
    String(raw.EXOSITES_REMOTE_LLM || spawnEnv.EXOSITES_REMOTE_LLM || "") === "1";
  const host = String(raw.OLLAMA_HOST || spawnEnv.OLLAMA_HOST || "").trim();
  const apiKey = String(spawnEnv.OLLAMA_API_KEY || resolveSortLlmApiKey(raw, meta) || "").trim();
  const configured = remote && Boolean(host && apiKey);
  return {
    sortServiceMode: remote ? "cloud" : "local",
    sortServiceModeDetail: resolveSortServiceModeDetail(raw, meta),
    sortServiceConfigured: configured,
    sortCredentialsManaged: managed,
    sortCredentialsExpiresAt: meta?.expires_at ?? null,
    sortCredentialsConfigRevision: meta?.credentials_config_revision ?? null,
    sortEntitledModels: Array.isArray(meta?.entitled_models)
      ? meta.entitled_models.filter((m) => typeof m === "string" && m.trim())
      : [],
  };
}

module.exports = {
  syncSortCredentialsFromCloud,
  clearCloudSortCredentials,
  getSortServiceSurface,
  getSortSyncLastError,
  credentialsStillValid,
  shouldUseCachedCredentials,
  remoteSortTokenWorks,
  resolveCloudLlmMaxSlots,
  resolveCloudSortMaxConcurrency,
  sortConfigRevisionStale,
};
