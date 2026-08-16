/** Window creation and management for both setup and main app windows. */

const path = require("path");
const fs = require("fs");
const { BrowserWindow, screen, shell } = require("electron");
const state = require("./state");
const {
  APP_NAME,
  IS_DEV,
  IS_WIN,
  IS_MAC,
  BACKEND_PORT,
  BACKEND_PACKAGED_HEALTH_RETRIES,
  BACKEND_PACKAGED_HEALTH_DELAY_MS,
} = require("./constants");
const { runSetup } = require("./setup/runSetup");
const { startBackend } = require("./backendProcess");
const { waitForBackend, freeBackendPort } = require("./backendLifecycle");
const { attachMainWindowCloseHandler } = require("./voiceWakeBackground");
const { attachRendererLifecycleDiagnostics } = require("./rendererDiagnostics");

/**
 * Trusted origins for the renderer — anything else must not be navigated to or
 * allowed to open new windows inside the app.
 */
function isTrustedRendererUrl(url) {
  if (!url || url === "about:blank") return true;
  return (
    url.startsWith("file://") ||
    url.startsWith("http://localhost:") ||
    url.startsWith("http://127.0.0.1:")
  );
}

/**
 * Attach navigation guard to a window:
 * - Block `will-navigate` to any URL that is not our own renderer content.
 * - Block new-window creation entirely; open external links in the system browser.
 */
function attachNavigationGuard(win) {
  win.webContents.on("will-navigate", (event, url) => {
    if (!isTrustedRendererUrl(url)) {
      event.preventDefault();
      // Open safe https links in the system browser instead
      try {
        const parsed = new URL(url);
        if (parsed.protocol === "https:") shell.openExternal(url).catch(() => {});
      } catch {
        /* malformed URL — ignore */
      }
    }
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    // Never open new Electron windows from renderer code.
    // Send https/mailto links to the system browser.
    try {
      const parsed = new URL(url);
      if (parsed.protocol === "https:" || parsed.protocol === "mailto:") {
        shell.openExternal(url).catch(() => {});
      }
    } catch {
      /* ignore malformed URL */
    }
    return { action: "deny" };
  });
}

/**
 * Preload must be a real on-disk file — Electron cannot load it from inside app.asar.
 * macOS electron-builder: copied to Resources/ via build.extraResources; also asarUnpack fallback.
 * Windows manual packager: copied to Resources/ by scripts/package-app.js.
 */
function getPreloadPath(filename) {
  if (require("electron").app.isPackaged) {
    const flat = path.join(process.resourcesPath, filename);
    if (fs.existsSync(flat)) return flat;
    const unpacked = path.join(process.resourcesPath, "app.asar.unpacked", "electron", filename);
    if (fs.existsSync(unpacked)) return unpacked;
    console.error("[windows] preload script missing on disk:", filename);
    return flat;
  }
  return path.join(__dirname, filename);
}

/** file:// loads make macOS show a generic folder proxy icon unless cleared. */
function hideMacDocumentProxyIcon(win) {
  if (!IS_MAC || !win) return;
  const clear = () => {
    try {
      win.setRepresentedFilename("");
    } catch {
      /* ignore */
    }
  };
  clear();
  win.webContents.on("did-finish-load", clear);
}

async function createSetupWindow() {
  const setupIcon = IS_WIN
    ? path.join(__dirname, "assets", "icon-win.png")
    : path.join(__dirname, "assets", "icon.png");

  state.setupWindow = new BrowserWindow({
    title: APP_NAME,
    width: 600,
    height: 720,
    resizable: false,
    frame: false,
    transparent: false,
    backgroundColor: "#120e32",
    center: true,
    ...(IS_MAC ? { titleBarStyle: "hiddenInset" } : {}),
    webPreferences: {
      preload: getPreloadPath("preload-setup.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    ...(fs.existsSync(setupIcon) ? { icon: setupIcon } : {}),
  });

  attachNavigationGuard(state.setupWindow);

  hideMacDocumentProxyIcon(state.setupWindow);

  state.setupWindow.webContents.once("did-finish-load", () => {
    runSetup().catch((err) => {
      console.error("[setup] Uncaught error in runSetup:", err);
      state.setupWindow?.webContents
        ?.executeJavaScript(`setProgress(100); showLaunchBtn()`)
        .catch(() => {});
    });
  });

  state.setupWindow.on("closed", () => {
    state.setupWindow = null;
  });

  attachRendererLifecycleDiagnostics(state.setupWindow, { label: "setup" });

  await state.setupWindow.loadFile(path.join(__dirname, "setup.html"));
}

/**
 * Prefer full usable desktop height and a wider default width on first creation.
 * Uses `workArea` so OS taskbars / notches stay visible.
 *
 * @returns {{ x: number; y: number; width: number; height: number }}
 */
function defaultMainWindowBounds() {
  const { workArea } = screen.getPrimaryDisplay();
  const { x: wx, y: wy, width: wW, height: wH } = workArea;

  const startupWidth = Math.min(wW, Math.max(980, Math.round(wW * 0.92)));
  const startupHeight = wH;

  return {
    x: Math.round(wx + (wW - startupWidth) / 2),
    y: wy,
    width: startupWidth,
    height: startupHeight,
  };
}

/**
 * @param {{ startHidden?: boolean }} [options]
 *   startHidden — create the window without showing it (clap-to-launch background start);
 *   a double-clap or tray "Open" reveals it later.
 */
async function createMainWindow(options = {}) {
  const { startHidden = false, deferShow = false } = options;
  const iconPath = IS_WIN
    ? path.join(__dirname, "assets", "icon-win.png")
    : path.join(__dirname, "assets", "icon.png");

  const { x, y, width, height } = defaultMainWindowBounds();

  state.mainWindow = new BrowserWindow({
    title: APP_NAME,
    x,
    y,
    width,
    height,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    show: !startHidden && !deferShow,
    skipTaskbar: startHidden,
    ...(IS_MAC ? { titleBarStyle: "hiddenInset" } : {}),
    backgroundColor: "#0f0b2e",
    webPreferences: {
      preload: getPreloadPath("preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      offscreen: false,
      /** Default on — disable only while clap-wake mic sampling needs full-rate timers. */
      backgroundThrottling: true,
    },
    ...(fs.existsSync(iconPath) ? { icon: iconPath } : {}),
  });

  state.mainWindow.setMenuBarVisibility(false);

  if (IS_DEV) {
    // Must match Vite `server.host` (127.0.0.1) — `localhost` can resolve to IPv6 while Vite is IPv4-only.
    await state.mainWindow.loadURL("http://127.0.0.1:5173");
    if (process.env.ELECTRON_OPEN_DEVTOOLS === "1") {
      state.mainWindow.webContents.openDevTools();
    }
  } else {
    await state.mainWindow.loadFile(
      path.join(__dirname, "..", "frontend", "dist", "index.html")
    );
  }

  attachNavigationGuard(state.mainWindow);
  hideMacDocumentProxyIcon(state.mainWindow);
  attachMainWindowCloseHandler(state.mainWindow);
  attachRendererLifecycleDiagnostics(state.mainWindow, { label: "main" });
  // Detach orphaned Codegen preview overlays when the host renderer reloads
  // (Cmd+R skips React unmount cleanup, otherwise leaving the native view stuck).
  require("./ipc/codegenHandlers").attachCodegenPreviewHostCleanup(state.mainWindow);

  state.mainWindow.on("closed", () => {
    state.mainWindow = null;
  });
}

/**
 * Full main-app startup: close setup window (if any), start Python backend,
 * open main window. Renderer probes /health via getManagedBackendStatus.
 */
async function startMainAppFlow(options = {}) {
  await freeBackendPort({ force: true });
  startBackend();

  await createMainWindow({ ...options, deferShow: true });

  if (state.setupWindow) {
    state.setupWindow.close();
    state.setupWindow = null;
  }

  if (!options.startHidden && state.mainWindow && !state.mainWindow.isDestroyed()) {
    state.mainWindow.show();
  }

  void waitForBackend(
    IS_DEV ? 60 : BACKEND_PACKAGED_HEALTH_RETRIES,
    IS_DEV ? 350 : BACKEND_PACKAGED_HEALTH_DELAY_MS
  ).then(async (up) => {
    if (up) {
      console.log("[main] Backend ready");
      try {
        const cloudAuth = require("./cloudAuth");
        const { syncSortCredentialsFromCloud, getSortServiceSurface } = require("./entitlement/sortCredentials");
        const userData = require("electron").app.getPath("userData");
        if (cloudAuth.isAuthGateEnabled()) {
          const sess = await cloudAuth.ensureFreshSession(userData);
          if (sess?.access_token) {
            const { attachOfflineLicenseToCloudAccount } = require("./entitlement/applyLicenseRuntime");
            await attachOfflineLicenseToCloudAccount(userData).catch(() => {});
            if (!getSortServiceSurface(userData).sortServiceConfigured) {
              await syncSortCredentialsFromCloud(userData);
            }
          }
        }
      } catch (err) {
        console.warn("[main] post-startup sort credentials sync failed:", err && err.message);
      }
    } else {
      console.warn("[main] Backend still starting — renderer shows startup UI until /health is up");
    }
  });

  if (options.startHidden) {
    const { ensureTray } = require("./voiceWakeBackground");
    ensureTray();
  }
}

/** Alias kept for backward compatibility with IPC handlers that call launchMainApp. */
const launchMainApp = startMainAppFlow;

module.exports = { createSetupWindow, createMainWindow, startMainAppFlow, launchMainApp };
