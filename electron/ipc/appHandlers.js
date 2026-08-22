/** App helpers, entitlement, cloud auth, beta prefs, backend env overrides. */

const path = require("path");
const os = require("os");
const fs = require("fs");
const { ipcMain, app } = require("electron");
const { APP_NAME } = require("../constants");
const { getOcrCapabilities } = require("../setup/runSetup");
const { restartBackend, getManagedBackendStatus } = require("../backendLifecycle");
const state = require("../state");
const {
  readBackendEnvOverridesRaw,
  writeBackendEnvOverrides,
} = require("../backendEnvOverrides");
const {
  getEntitlementState,
  entitlementGateFallback,
  saveLicenseKey,
  clearLicense,
} = require("../entitlement/store");
const { verifyLicenseKey } = require("../entitlement/verify");
const { getMachineFingerprint } = require("../entitlement/machineId");
const { activateLicenseOnline } = require("../entitlement/activateOnline");
const cloudAuth = require("../cloudAuth");
const { syncSortCredentialsFromCloud } = require("../entitlement/sortCredentials");
const { getManualRemoteLlmApiKey, setManualRemoteLlmApiKey } = require("../backendAiSecrets");
const syncWorker = require("../syncWorker");
const { wipeElectronUserDataFiles } = require("../localDataWipe");
const { backendFetch } = require("../backendHttp");
const { deleteMaterializedGmailOAuthMirror } = require("../gmailOAuthMirrorStore");
const cloudSessionPrefs = require("../cloudSessionPrefs");
const {
  alignProfileWithSession,
  activateGuestProfile,
  getActiveProfileId,
  getProfileState,
  resolveProfileRoot,
} = require("../accountProfile");
const {
  getRendererDiagnosticsLogPath,
  appendRendererDiagnosticLine,
} = require("../rendererDiagnostics");
const { isTrustedSender } = require("./senderGuard");

/**
 * After login/logout/wipe: point workers at the active profile and restart backend when the vault changes.
 * @param {string} deviceRoot
 * @param {{ restartBackend?: boolean }} [opts]
 */
async function remountProfileRuntime(deviceRoot, opts = {}) {
  const profileRoot = resolveProfileRoot(deviceRoot);
  try {
    const { clearOauthChromeProfile } = require("../integrations/chromeAutopilot");
    clearOauthChromeProfile(deviceRoot);
  } catch (err) {
    console.warn("[main] oauth-chrome-profile clear skipped:", err?.message || err);
  }
  syncWorker.startSyncWorker(deviceRoot);
  try {
    const whatsappCloudSync = require("../integrations/whatsappCloudSync");
    whatsappCloudSync.resumeIfConfigured(profileRoot);
  } catch (err) {
    console.warn("[main] WhatsApp cloud sync remount skipped:", err?.message || err);
  }
  if (opts.restartBackend !== false) {
    try {
      await restartBackend();
    } catch (err) {
      console.warn("[main] backend restart after profile remount failed:", err?.message || err);
    }
  }
  return profileRoot;
}

/**
 * @param {string} deviceRoot
 */
async function applySessionProfile(deviceRoot) {
  const prevId = getActiveProfileId(deviceRoot);
  const session = cloudAuth.readSession(deviceRoot);
  const aligned = alignProfileWithSession(deviceRoot, session);
  const nextId = aligned.activeId || getActiveProfileId(deviceRoot);
  await remountProfileRuntime(deviceRoot, { restartBackend: prevId !== nextId });
  return aligned;
}

/** @param {import("electron").IpcMainInvokeEvent} event */
function rejectUntrustedSender(event) {
  if (!isTrustedSender(event)) {
    return { ok: false, error: "untrusted_sender" };
  }
  return null;
}

/**
 * Keys that the renderer is allowed to set via backendEnv:setOverrides.
 * Any key not in this set is silently dropped before writing to disk.
 * This prevents the renderer from injecting arbitrary environment variables
 * into the backend process (e.g. PATH, HOME, LD_PRELOAD).
 */
const BACKEND_ENV_OVERRIDE_ALLOWLIST = new Set([
  // Inference
  "OLLAMA_BASE_URL",
  "OLLAMA_HOST",
  "OLLAMA_MODE",
  "OLLAMA_API_KEY",
  "OLLAMA_REQUEST_TIMEOUT_S",
  "OLLAMA_MAX_RETRIES",
  "EXOSITES_REMOTE_LLM",
  "EXOSITES_LLM_MAX_SLOTS",
  "EXOSITES_SORT_CREDENTIALS_MANAGED",
  "OLLAMA_NUM_THREADS",
  "OLLAMA_NARROW_MARGIN",
  // Sort quality
  "EXTRACTION_UNCERTAIN_QUALITY",
  "DOCUMENT_BRIEFING_ENABLE",
  "DOCUMENT_BRIEFING_SKIP_SMALL_TEXT_ENABLE",
  "BRIEFING_SKIP_MAX_TEXT_CHARS",
  "BRIEFING_SKIP_GMAIL_MESSAGE_MAX_TEXT_CHARS",
  "BRIEFING_SKIP_MIN_QUALITY",
  "EXOSITES_SORT_MAX_CONCURRENCY",
  "EXOSITES_ANALYZE_PHASE_TIMING_DEBUG_LOG",
  "EXOSITES_ANALYZE_PHASE_SLOW_LOG_MS",
  // Spreadsheet
  "EXOSITES_SPREADSHEET_PREVIEW_MAX_ROWS",
  "EXOSITES_SPREADSHEET_PREVIEW_MAX_SHEETS",
  // Video
  "EXOSITES_FFMPEG_PATH",
  "EXOSITES_FFPROBE_PATH",
  "EXOSITES_VIDEO_MAX_DURATION_SEC",
  "EXOSITES_VIDEO_MAX_EXTRACT_SEC",
  "EXOSITES_VIDEO_FRAME_COUNT",
  "EXOSITES_VIDEO_MAX_TRANSCRIPT_CHARS",
  "EXOSITES_VIDEO_FFPROBE_TIMEOUT_SEC",
  "EXOSITES_VIDEO_FFMPEG_TIMEOUT_SEC",
  "EXOSITES_VIDEO_STT_ENABLE",
  "EXOSITES_VIDEO_STT_MODEL",
  "EXOSITES_VIDEO_STT_DEVICE",
  "EXOSITES_VIDEO_STT_COMPUTE_TYPE",
  "EXOSITES_VIDEO_STT_LANGUAGE",
  "EXOSITES_VIDEO_METADATA_INCLUDE_AUTHOR",
  "EXOSITES_VIDEO_DEBUG_LOG",
]);

const MANAGED_SORT_CREDENTIAL_KEYS = new Set([
  "OLLAMA_API_KEY",
  "OLLAMA_HOST",
  "OLLAMA_MODE",
  "EXOSITES_REMOTE_LLM",
  "EXOSITES_SORT_CREDENTIALS_MANAGED",
]);

/** Secret override keys redacted in backendEnv:getOverrides responses. */
const SENSITIVE_OVERRIDE_KEYS = new Set(["OLLAMA_API_KEY"]);

function getBackendEnvOverrideAllowlist() {
  const keys = new Set(BACKEND_ENV_OVERRIDE_ALLOWLIST);
  if (app.isPackaged) {
    for (const key of MANAGED_SORT_CREDENTIAL_KEYS) keys.delete(key);
  }
  return keys;
}

/** Strip secret values before returning overrides to the renderer. */
function redactOverridesForRenderer(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out = { ...raw };
  for (const key of SENSITIVE_OVERRIDE_KEYS) {
    if (out[key]) {
      out[`${key}_configured`] = true;
      delete out[key];
    }
  }
  if (getManualRemoteLlmApiKey()) {
    out.OLLAMA_API_KEY_configured = true;
    delete out.OLLAMA_API_KEY;
  }
  return out;
}

/** Route manual remote LLM API key to safeStorage; never persist on overrides JSON. */
function applyManualRemoteLlmKeyFromPayload(filtered) {
  const next = { ...filtered };
  if (Object.prototype.hasOwnProperty.call(next, "OLLAMA_API_KEY")) {
    setManualRemoteLlmApiKey(String(next.OLLAMA_API_KEY || ""));
    delete next.OLLAMA_API_KEY;
  }
  return next;
}

/** Drop legacy plaintext secrets from overrides JSON on every write. */
function stripLegacySensitiveKeysFromDisk(existing) {
  const next = { ...existing };
  for (const key of SENSITIVE_OVERRIDE_KEYS) {
    delete next[key];
  }
  return next;
}

function registerAppHandlers() {
  const { app } = require("electron");
  const deviceRoot = app.getPath("userData");
  // Align vault with cached session (or guest) before workers/backend see paths.
  try {
    const session = cloudAuth.readSession(deviceRoot);
    alignProfileWithSession(deviceRoot, session);
  } catch (err) {
    console.warn("[main] profile align on startup failed:", err?.message || err);
    try {
      activateGuestProfile(deviceRoot);
    } catch {
      /* ignore */
    }
  }
  syncWorker.startSyncWorker(deviceRoot);
  try {
    const whatsappCloudSync = require("../integrations/whatsappCloudSync");
    whatsappCloudSync.resumeIfConfigured();
  } catch (err) {
    console.warn("[main] WhatsApp cloud sync resume skipped:", err?.message || err);
  }
  ipcMain.handle("app:getDefaultOutputDir", async () => {
    try {
      const dir = path.join(os.homedir(), "Documents", `${APP_NAME} Sorted Files`);
      fs.mkdirSync(dir, { recursive: true });
      return dir;
    } catch (err) {
      console.error("[main] Failed to create default output dir:", err);
      return null;
    }
  });

  ipcMain.handle("app:getSystemSpecs", async () => {
    const totalMemBytes = os.totalmem();
    const totalMemGb = Math.round((totalMemBytes / 1024 ** 3) * 10) / 10;
    return {
      platform: process.platform,
      arch: process.arch,
      totalMemBytes,
      totalMemGb,
    };
  });

  ipcMain.handle("app:getInstallLocation", async () => {
    const { getInstallLocationState } = require("../installLocation");
    return getInstallLocationState();
  });

  ipcMain.handle("app:getDisplayName", async () => APP_NAME);

  ipcMain.handle("app:openApplicationsFolder", async () => {
    const { openApplicationsFolder } = require("../installLocation");
    const error = await openApplicationsFolder();
    return { ok: !error, error: error || null };
  });

  ipcMain.handle("app:getOCRCapabilities", async () => {
    return getOcrCapabilities();
  });

  ipcMain.handle("app:restartBackend", () => restartBackend());

  // Trial-ended gate "Quit" action — deliberate full exit, not window close.
  ipcMain.handle("app:quit", (event) => {
    const denied = rejectUntrustedSender(event);
    if (denied) return denied;
    app.quit();
    return { ok: true };
  });

  ipcMain.handle("backend:getStatus", () => getManagedBackendStatus());

  ipcMain.handle("entitlement:getState", async () => {
    try {
      return await getEntitlementState(app.getPath("userData"));
    } catch (err) {
      console.error("[entitlement] getState failed:", err && err.message);
      return entitlementGateFallback();
    }
  });

  ipcMain.handle("entitlement:activateLicense", async (event, licenseKey) => {
    const denied = rejectUntrustedSender(event);
    if (denied) return denied;
    const raw = typeof licenseKey === "string" ? licenseKey.trim() : "";
    const v = await verifyLicenseKey(raw);
    if (!v.ok) {
      return { ok: false, reason: v.reason ?? "invalid" };
    }
    const sess = await cloudAuth.ensureFreshSession(ud());
    const activation = await activateLicenseOnline(
      raw,
      getMachineFingerprint(),
      sess?.access_token,
    );
    if (!activation.ok) {
      return { ok: false, reason: activation.reason };
    }
    saveLicenseKey(app.getPath("userData"), raw);
    const { applySavedLicenseToRuntime } = require("../entitlement/applyLicenseRuntime");
    await applySavedLicenseToRuntime(ud());
    return { ok: true };
  });

  ipcMain.handle("entitlement:clearLicense", async () => {
    clearLicense(app.getPath("userData"));
    const { revokeSavedLicenseRuntime } = require("../entitlement/applyLicenseRuntime");
    await revokeSavedLicenseRuntime(ud());
    return { ok: true };
  });

  ipcMain.handle("entitlement:syncSortCredentials", async (_event, opts) => {
    try {
      const force = Boolean(opts && typeof opts === "object" && opts.force);
      const result = await syncSortCredentialsFromCloud(ud(), { force });
      if (result?.failed) {
        return { ok: false, error: String(result.failed) };
      }
      return { ok: true, ...result };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn("[entitlement] syncSortCredentials IPC failed:", message);
      return { ok: false, error: message };
    }
  });

  const ud = () => app.getPath("userData");

  ipcMain.handle("cloudAuth:register", async (event, email, password, firstName, lastName) => {
    const denied = rejectUntrustedSender(event);
    if (denied) return denied;
    try {
      const result = await cloudAuth.register(ud(), email, password, firstName, lastName);
      if (result && result.ok === false) return result;
      await applySessionProfile(ud());
      try {
        await syncSortCredentialsFromCloud(ud());
      } catch (syncErr) {
        console.warn("[cloudAuth] post-register sort credentials sync failed:", syncErr && syncErr.message);
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  });

  ipcMain.handle("cloudAuth:login", async (event, email, password) => {
    const denied = rejectUntrustedSender(event);
    if (denied) return denied;
    try {
      const result = await cloudAuth.login(ud(), email, password);
      if (result && result.ok === false) return result;
      await applySessionProfile(ud());
      try {
        await syncSortCredentialsFromCloud(ud());
      } catch (syncErr) {
        console.warn("[cloudAuth] post-login sort credentials sync failed:", syncErr && syncErr.message);
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  });

  ipcMain.handle("cloudAuth:logout", async (event) => {
    const denied = rejectUntrustedSender(event);
    if (denied) return denied;
    cloudAuth.logout(ud());
    activateGuestProfile(ud());
    await remountProfileRuntime(ud(), { restartBackend: true });
    return { ok: true };
  });

  ipcMain.handle("cloudAuth:getProviders", async (event) => {
    const denied = rejectUntrustedSender(event);
    if (denied) return denied;
    return cloudAuth.getAuthProviders();
  });

  ipcMain.handle("cloudAuth:social", async (event, provider) => {
    const denied = rejectUntrustedSender(event);
    if (denied) return denied;
    const normalized = provider === "apple" ? "apple" : "google";
    const base = cloudAuth.cloudBaseUrl();
    if (!base) {
      return { ok: false, error: "cloud_url_not_set" };
    }
    const { runSocialLogin } = require("../socialLoginWindow");
    const result = await runSocialLogin(base, normalized);
    if (!result.ok) {
      return result;
    }
    try {
      const exchanged = await cloudAuth.exchangeSocialCode(ud(), result.code);
      if (exchanged && exchanged.ok === false) return exchanged;
      const session = cloudAuth.readSession(ud());
      if (!session?.access_token) {
        console.error("[cloudAuth] social exchange ok but session missing on disk");
        return { ok: false, error: "session_not_saved" };
      }
      await applySessionProfile(ud());
      try {
        await syncSortCredentialsFromCloud(ud());
      } catch (syncErr) {
        console.warn("[cloudAuth] post-social sort credentials sync failed:", syncErr && syncErr.message);
      }
      return { ok: true };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[cloudAuth] social exchange failed:", msg);
      if (/invalid or expired/i.test(msg)) {
        return { ok: false, error: "exchange_failed" };
      }
      if (/server setup incomplete|server_setup/i.test(msg)) {
        return { ok: false, error: "server_setup" };
      }
      return { ok: false, error: "signin_failed" };
    }
  });

  ipcMain.handle("cloudAuth:cancelSocial", async (event) => {
    const denied = rejectUntrustedSender(event);
    if (denied) return denied;
    const { cancelSocialLoginWindow } = require("../socialLoginWindow");
    cancelSocialLoginWindow();
    return { ok: true };
  });

  ipcMain.handle("cloudSessionPrefs:getRememberDevice", () => cloudSessionPrefs.getRememberDevice(ud()));

  ipcMain.handle("cloudSessionPrefs:setRememberDevice", (_event, value) => {
    cloudSessionPrefs.setRememberDevice(ud(), value);
    return { ok: true };
  });

  ipcMain.handle("backendEnv:getOverrides", (event) => {
    const denied = rejectUntrustedSender(event);
    if (denied) return denied;
    return redactOverridesForRenderer(readBackendEnvOverridesRaw());
  });

  ipcMain.handle("backendEnv:setOverrides", async (event, obj) => {
    const denied = rejectUntrustedSender(event);
    if (denied) return denied;
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
      return { ok: false, reason: "invalid_payload" };
    }
    // Strip any key not in the allowlist before persisting.
    const allowlist = getBackendEnvOverrideAllowlist();
    const filtered = Object.fromEntries(
      Object.entries(obj).filter(([k]) => allowlist.has(k))
    );
    const persisted = applyManualRemoteLlmKeyFromPayload(filtered);
    const existing = stripLegacySensitiveKeysFromDisk(readBackendEnvOverridesRaw());
    writeBackendEnvOverrides({ ...existing, ...persisted });
    return restartBackend();
  });

  ipcMain.handle("app:getRendererDiagnosticsLogPath", () => getRendererDiagnosticsLogPath());

  ipcMain.handle("app:appendRendererDiagnostic", (event, payload) => {
    const denied = rejectUntrustedSender(event);
    if (denied) return denied;
    if (payload && typeof payload === "object" && !Array.isArray(payload)) {
      appendRendererDiagnosticLine(/** @type {Record<string, unknown>} */ (payload));
    }
    return { ok: true };
  });

  ipcMain.handle("app:getBackendToken", (event) => {
    const denied = rejectUntrustedSender(event);
    if (denied) return "";
    // M2.3: never return the durable app token to the renderer.
    // HTTP goes through backend:http; voice uses voice:mintWsAuthTicket.
    return "";
  });

  /**
   * Authenticated local-backend proxy (M2.3). Injects X-App-Token in main only.
   * @param {Electron.IpcMainInvokeEvent} event
   * @param {{ path: string; method?: string; headers?: Record<string, string>; body?: string; contentType?: string; bodyBase64?: string }} payload
   */
  ipcMain.handle("backend:http", async (event, payload) => {
    const denied = rejectUntrustedSender(event);
    if (denied) {
      return { ok: false, status: 403, text: JSON.stringify({ detail: "untrusted_sender" }), contentType: "application/json" };
    }
    const pathPath = typeof payload?.path === "string" ? payload.path : "";
    if (!pathPath.startsWith("/")) {
      return { ok: false, status: 400, text: JSON.stringify({ detail: "invalid_path" }), contentType: "application/json" };
    }
    try {
      let rawBody;
      let contentType = typeof payload?.contentType === "string" ? payload.contentType : undefined;
      if (typeof payload?.bodyBase64 === "string" && payload.bodyBase64) {
        rawBody = Buffer.from(payload.bodyBase64, "base64");
      } else if (typeof payload?.body === "string") {
        rawBody = payload.body;
      }
      const res = await backendFetch(pathPath, {
        method: typeof payload?.method === "string" ? payload.method : "GET",
        headers: payload?.headers && typeof payload.headers === "object" ? payload.headers : undefined,
        rawBody,
        contentType,
      });
      return {
        ok: res.ok,
        status: res.status,
        text: res.text,
        contentType: res.contentType,
      };
    } catch (e) {
      return {
        ok: false,
        status: 0,
        text: JSON.stringify({ detail: e instanceof Error ? e.message : String(e) }),
        contentType: "application/json",
      };
    }
  });

  ipcMain.handle("integration:relayAllTokens", async (event) => {
    const denied = rejectUntrustedSender(event);
    if (denied) return denied;
    try {
      const { relayAllConnectedIntegrationTokens } = require("../integrationTokenRelayMain");
      return await relayAllConnectedIntegrationTokens();
    } catch (e) {
      return { ok: false, reason: e instanceof Error ? e.message : String(e) };
    }
  });

  ipcMain.handle("sync:getStatus", () => syncWorker.getSyncStatus(app.getPath("userData")));
  ipcMain.handle("sync:setEnabled", (_event, enabled) => {
    const userData = app.getPath("userData");
    try {
      return syncWorker.setSyncEnabled(userData, enabled);
    } catch (err) {
      return { ok: false, error: String(err?.message ?? err) };
    }
  });
  ipcMain.handle("sync:runNow", async () => {
    const userData = app.getPath("userData");
    return syncWorker.runSyncOnce(userData);
  });
  ipcMain.handle("sync:getPairingQr", async (event) => {
    const denied = rejectUntrustedSender(event);
    if (denied) return denied;
    const userData = app.getPath("userData");
    try {
      return await syncWorker.getPairingQrDataUrl(userData);
    } catch (err) {
      return { ok: false, error: String(err?.message ?? err) };
    }
  });
  ipcMain.handle("sync:copyPairingPayload", async (event) => {
    const denied = rejectUntrustedSender(event);
    if (denied) return denied;
    const userData = app.getPath("userData");
    return syncWorker.copyPairingPayloadToClipboard(userData);
  });

  ipcMain.handle("accountProfile:getState", (event) => {
    const denied = rejectUntrustedSender(event);
    if (denied) return denied;
    return { ok: true, ...getProfileState(app.getPath("userData")) };
  });

  ipcMain.handle("privacy:wipeElectronFiles", (event) => {
    const denied = rejectUntrustedSender(event);
    if (denied) return denied;
    return wipeElectronUserDataFiles(app.getPath("userData"));
  });

  ipcMain.handle("privacy:wipeAllLocalData", async (event) => {
    const denied = rejectUntrustedSender(event);
    if (denied) return denied;

    const userData = app.getPath("userData");
    const cleared = [];

    const backend = await backendFetch("/v1/privacy/wipe-local", {
      method: "POST",
      body: { confirmed: true },
    });
    if (!backend.ok) {
      const detail =
        backend.data &&
        typeof backend.data === "object" &&
        (backend.data.detail || backend.data.error);
      return {
        ok: false,
        detail: detail || `backend_wipe_failed_${backend.status}`,
      };
    }
    if (backend.data && typeof backend.data === "object" && Array.isArray(backend.data.cleared)) {
      cleared.push(...backend.data.cleared);
    }

    deleteMaterializedGmailOAuthMirror(resolveProfileRoot(userData));
    const electron = wipeElectronUserDataFiles(userData);
    if (!electron.ok) {
      return { ok: false, detail: electron.reason || "electron_wipe_failed" };
    }
    cleared.push(...electron.removed.map((name) => `electron:${name}`));
    await remountProfileRuntime(userData, { restartBackend: true });

    return { ok: true, cleared };
  });

  ipcMain.handle("cloudAuth:exportData", async (event) => {
    const denied = rejectUntrustedSender(event);
    if (denied) return denied;
    try {
      const data = await cloudAuth.exportAccountData(app.getPath("userData"));
      return { ok: true, data };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  });

  ipcMain.handle("cloudAuth:deleteAccount", async (event) => {
    const denied = rejectUntrustedSender(event);
    if (denied) return denied;
    const userData = app.getPath("userData");
    try {
      const result = await cloudAuth.deleteCloudAccount(userData);
      if (result && result.ok !== false) {
        activateGuestProfile(userData);
        await remountProfileRuntime(userData, { restartBackend: true });
      }
      return result;
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  });
}

module.exports = { registerAppHandlers };
