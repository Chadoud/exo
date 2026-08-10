/**
 * Electron main process entry point — thin orchestrator.
 * All heavy logic lives in dedicated modules:
 *   electron/ollama.js          — Ollama helpers
 *   electron/backendProcess.js  — Python backend lifecycle
 *   electron/setup/runSetup.js  — Setup wizard
 *   electron/windows.js         — Window creation
 *   electron/ipcHandlers.js     — IPC entry; handlers in electron/ipc/*.js
 *   electron/state.js           — Shared mutable state
 *   electron/constants.js       — All constants
 */

const { app, session, BrowserWindow, nativeImage } = require("electron");

// WebGL/canvas: prefer D3D11 ANGLE on Windows (fewer black/missing canvas issues than default GL).
if (process.platform === "win32") {
  try {
    app.commandLine.appendSwitch("use-angle", "d3d11");
  } catch (_) {
    /* ignore */
  }
}
const path = require("path");
const fs = require("fs");
const state = require("./state");
const { APP_NAME, IS_MAC, IS_DEV } = require("./constants");
const { registerHandlers } = require("./ipcHandlers");
const { createSetupWindow, createMainWindow, startMainAppFlow } = require("./windows");
const { killBackend, ensureBackendRunning, syncGoogleOauthClientIdForElectronMain, syncRemoteLlmEnvForMainProcess } = require("./backendProcess");
const { migrateAiKeysFromWritableEnv } = require("./backendAiSecrets");
const { isUnlimitedEntitlementBuild } = require("./buildProfile");
const { startBackendCaptureServer, stopBackendCaptureServer } = require("./backendCaptureServer");
const { needsSetup } = require("./setup/runSetup");
const { ensureOllamaRunning } = require("./ollama");
const cloudAuth = require("./cloudAuth");
const {
  registerSocialAuthProtocol,
  handleSocialAuthCallbackUrl,
} = require("./socialAuthCallback");
const { handleBillingDeepLinkUrl } = require("./billingDeepLink");
const cloudSessionPrefs = require("./cloudSessionPrefs");
const { registerAppLifecycleHooks, showMainWindow, setClapToLaunchMode } = require("./voiceWakeBackground");
const { getClapToLaunchEnabled, launchedAsClapBackground, syncLoginItem } = require("./clapPrefs");
const { installMainProcessGuards } = require("./mainProcessDiagnostics");

app.setName(APP_NAME);

if (isUnlimitedEntitlementBuild()) {
  process.env.EXOSITES_UNLIMITED_ENTITLEMENT = "1";
}

// Catch main-process crashes before anything else can throw uncaught.
installMainProcessGuards();

/** First-party UI: dev server, packaged index.html, or devtools. */
function isAppContentUrl(url) {
  if (url === undefined || url === null) return true;
  if (typeof url !== "string") return false;
  if (url === "" || url === "about:blank") return true;
  return (
    url.startsWith("file://") ||
    url.startsWith("http://localhost") ||
    url.startsWith("http://127.0.0.1") ||
    url.startsWith("devtools://")
  );
}

function isMediaPermission(permission) {
  return (
    permission === "media" ||
    permission === "microphone" ||
    permission === "audioCapture"
  );
}

// exo://auth/callback — system browser hands OAuth back to the app (must register before ready on macOS).
registerSocialAuthProtocol();

app.on("open-url", (event, url) => {
  event.preventDefault();
  if (handleSocialAuthCallbackUrl(url)) {
    showMainWindow();
    return;
  }
  handleBillingDeepLinkUrl(url, { showMainWindow });
});

// Register all IPC handlers before any window opens.
registerHandlers();
registerAppLifecycleHooks();

// ── Single instance lock ──────────────────────────────────────────────────────
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, commandLine) => {
    const protocolUrl = commandLine.find((arg) => typeof arg === "string" && arg.startsWith("exo://"));
    if (protocolUrl && handleSocialAuthCallbackUrl(protocolUrl)) {
      showMainWindow();
      return;
    }
    if (protocolUrl && handleBillingDeepLinkUrl(protocolUrl, { showMainWindow })) {
      return;
    }
    if (state.mainWindow) {
      showMainWindow();
      return;
    }
    const win = state.setupWindow;
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
}

// ── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  // Bundled cloud URL + OAuth client IDs must be in process.env before any window IPC.
  syncGoogleOauthClientIdForElectronMain();

  // Align local vault with cached session (or guest) before secrets/backend paths resolve.
  try {
    const {
      alignProfileWithSession,
      setProfileChangeListener,
      resolveProfileRoot,
    } = require("./accountProfile");
    const deviceRoot = app.getPath("userData");
    const session = cloudAuth.readSession(deviceRoot);
    alignProfileWithSession(deviceRoot, session);

    setProfileChangeListener(({ activeId, profileRoot }) => {
      try {
        const { BrowserWindow } = require("electron");
        const payload = { activeId, profileRoot };
        for (const win of BrowserWindow.getAllWindows()) {
          if (!win.isDestroyed()) {
            win.webContents.send("account-profile:changed", payload);
          }
        }
      } catch (err) {
        console.warn("[main] account-profile broadcast failed:", err && err.message);
      }
    });

    // Lift plaintext AI keys into safeStorage (profile vault + legacy flat userData).
    const profileRoot = resolveProfileRoot(deviceRoot);
    migrateAiKeysFromWritableEnv(profileRoot, {
      extraEnvPaths: [
        path.join(deviceRoot, ".env"),
        ...(IS_DEV ? [path.join(__dirname, "..", "backend", ".env")] : []),
      ],
    });
  } catch (err) {
    console.warn("[main] profile/AI key startup failed:", err && err.message);
    try {
      require("./accountProfile").activateGuestProfile(app.getPath("userData"));
    } catch {
      /* ignore */
    }
  }

  try {
    /**
     * Synchronous permission checks run before getUserMedia can show a prompt.
     * Without this, the packaged app (file://) often denies mic access while the
     * same page in a normal browser (http://localhost) still works.
     */
    session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
      if (!isMediaPermission(permission)) {
        return null;
      }
      try {
        const u = webContents.getURL() || "";
        if (!u || u === "about:blank" || isAppContentUrl(u)) {
          return true;
        }
      } catch (_) {
        return true;
      }
      return null;
    });
    } catch (err) {
    console.warn("[main] setPermissionCheckHandler failed:", err);
  }

  try {
    session.defaultSession.setPermissionRequestHandler((wc, permission, callback, details) => {
      const url = typeof details?.requestingUrl === "string" ? details.requestingUrl : "";
      if (!isMediaPermission(permission) || !isAppContentUrl(url)) {
        return callback(false);
      }
      // macOS: trigger the OS-level TCC prompt before letting capture proceed
      // (Chromium alone never prompts, leaving a silently dead mic).
      const { systemPreferences } = require("electron");
      const { ensureMacMicrophoneAccess } = require("./macMediaAccess");
      void ensureMacMicrophoneAccess(systemPreferences).then(callback);
    });
  } catch (err) {
    console.warn("[main] setPermissionRequestHandler failed:", err);
  }

  // Content-Security-Policy for the renderer.
  // script-src: only local sources (file://, localhost dev server) — never eval or inline scripts.
  // connect-src: only the local Python backend and local dev server (Vite HMR).
  // object-src / base-uri: locked down to prevent data-uri and base-tag attacks.
  try {
    const { IS_DEV: devMode, BACKEND_PORT: backendPort } = require("./constants");
    const backendOrigin = `http://127.0.0.1:${backendPort}`;
    const cloudApiOrigin = "https://api.exosites.ch";
    const sentryConnect = " https://*.ingest.sentry.io https://*.ingest.us.sentry.io";
    const csp = [
      `default-src 'self' file:`,
      devMode
        ? `style-src 'self' 'unsafe-inline' file: https://fonts.googleapis.com`
        : `style-src 'self' 'unsafe-inline' file: https://fonts.googleapis.com`,
      devMode
        ? `script-src 'self' 'unsafe-eval' http://localhost:5173 http://127.0.0.1:5173`
        : `script-src 'self'`,
      devMode
        ? `connect-src 'self' ${backendOrigin} ${cloudApiOrigin}${sentryConnect} ws://127.0.0.1:7799 ws://localhost:7799 http://localhost:5173 ws://localhost:5173 ws://127.0.0.1:5173 http://127.0.0.1:5173`
        : `connect-src 'self' ${backendOrigin} ${cloudApiOrigin}${sentryConnect} ws://127.0.0.1:7799 ws://localhost:7799`,
      `img-src 'self' data: file: blob:`,
      devMode
        ? `font-src 'self' data: file: https://fonts.gstatic.com`
        : `font-src 'self' data: file: https://fonts.gstatic.com`,
      `media-src 'self' file: blob:`,
      `object-src 'none'`,
      `base-uri 'none'`,
      `form-action 'none'`,
    ].join("; ");

    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      const url = typeof details.url === "string" ? details.url : "";
      // Do not inject CSP on Vite / local HTTP during dev — Vite relies on inline + HMR scripts
      // that a strict script-src would block, leaving a blank window.
      if (
        devMode &&
        (url.startsWith("http://127.0.0.1:") || url.startsWith("http://localhost:"))
      ) {
        callback({ responseHeaders: details.responseHeaders });
        return;
      }
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          "Content-Security-Policy": [csp],
        },
      });
    });
  } catch (err) {
    console.warn("[main] CSP setup failed:", err);
  }

  // Shared secret for backend HTTP + loopback screen capture (must exist before spawn).
  if (!state.appToken) {
    state.appToken = require("crypto").randomBytes(32).toString("hex");
  }
  if (IS_MAC) {
    startBackendCaptureServer();
  }

  // Dock icon must come from .icns — PNG fills the bitmap edge-to-edge and renders oversized/square.
  if (IS_MAC && app.dock) {
    const icnsPath = app.isPackaged
      ? path.join(process.resourcesPath, "icon.icns")
      : path.join(__dirname, "assets", "icon.icns");
    if (fs.existsSync(icnsPath)) {
      try {
        const image = nativeImage.createFromPath(icnsPath);
        if (!image.isEmpty()) app.dock.setIcon(image);
      } catch (err) {
        console.warn("[main] dock.setIcon failed:", err && err.message);
      }
    }
  }

  // Clap-to-launch: when enabled, keep the OS login item in sync and decide whether
  // this run should start hidden (launched by that login item after a reboot/login).
  const clapEnabled = getClapToLaunchEnabled();
  const startHidden = clapEnabled && launchedAsClapBackground();
  if (clapEnabled) {
    syncLoginItem(true);
    setClapToLaunchMode(true);
  }

  syncRemoteLlmEnvForMainProcess();

  const setup = await needsSetup();

  if (setup) {
    await createSetupWindow();
  } else {
    const ollamaOk = await ensureOllamaRunning();
    if (!ollamaOk) console.warn("[main] Ollama could not be started automatically.");
    await startMainAppFlow({ startHidden });
  }

  try {
    const { initAutoUpdates } = require("./autoUpdater");
    initAutoUpdates(app);
  } catch (err) {
    console.warn("[main] auto-update init failed:", err && err.message);
  }

  app.on("activate", async () => {
    ensureBackendRunning();
    const main = state.mainWindow;
    if (main && !main.isDestroyed()) {
      showMainWindow();
      return;
    }
    if (BrowserWindow.getAllWindows().length === 0) {
      await createMainWindow();
    }
  });
}).catch((err) => {
  console.error("[startup]", err);
  app.quit();
});

if (IS_DEV) {
  let devForceExitTimer = null;
  const quitFromSignal = () => {
    killBackend();
    stopBackendCaptureServer();
    if (app.isReady()) {
      state.isAppQuitting = true;
      app.quit();
      // Graceful quit can hang if a window or backend child ignores SIGTERM — don't block the terminal.
      devForceExitTimer = setTimeout(() => {
        console.warn("[dev] forcing app.exit after signal");
        app.exit(0);
      }, 1500);
    } else {
      app.exit(0);
    }
  };
  app.on("will-quit", () => {
    if (devForceExitTimer) clearTimeout(devForceExitTimer);
  });
  process.on("SIGINT", quitFromSignal);
  process.on("SIGTERM", quitFromSignal);
}

app.on("window-all-closed", () => {
  killBackend();
  app.quit();
});

app.on("before-quit", () => {
  stopBackendCaptureServer();
  try {
    const { cleanupCodegenOnQuit } = require("./ipc/codegenHandlers");
    cleanupCodegenOnQuit();
  } catch (_) {
    /* ignore */
  }
  try {
    const { unregisterPushToTalk } = require("./pushToTalk");
    unregisterPushToTalk();
  } catch (_) {
    /* ignore */
  }
  try {
    const { deleteMaterializedGmailOAuthMirror } = require("./gmailOAuthMirrorStore");
    const { resolveProfileRoot } = require("./accountProfile");
    deleteMaterializedGmailOAuthMirror(resolveProfileRoot(app.getPath("userData")));
  } catch (_) {
    /* ignore */
  }
  killBackend();
  try {
    const userData = app.getPath("userData");
    if (cloudAuth.isAuthGateEnabled() && !cloudSessionPrefs.getRememberDevice(userData)) {
      cloudAuth.logout(userData);
    }
  } catch (_) {
    /* ignore */
  }
});
