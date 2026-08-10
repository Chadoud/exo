/**
 * Manual Electron packager — bypasses electron-builder's winCodeSign requirement.
 * Produces: dist-app/<productName>/ (folder with <productName>.exe on Windows)
 * Users double-click the app to launch it.
 *
 * Run on Windows: node scripts/package-app.js
 * (For macOS use: npm run package:mac)
 */

const fs = require("fs");
const path = require("path");
const { execFileSync, execSync } = require("child_process");

const IS_WIN = process.platform === "win32";
const ELECTRON_EXE = IS_WIN ? "electron.exe" : "Electron";
const { stageOnedirDirectory, resolveBackendInSlice } = require("./lib/backend-onedir.cjs");

const ROOT = path.join(__dirname, "..");
const PKG_PATH = path.join(ROOT, "package.json");
const PKG = JSON.parse(fs.readFileSync(PKG_PATH, "utf8"));
const PRODUCT_NAME = PKG.build?.productName || PKG.name || "Exo";

if (!IS_WIN) {
  console.error("\nThis manual packager is for Windows only.");
  console.error("On macOS, use: npm run package:mac\n");
  process.exit(1);
}

const UNLIMITED_BUILD = ["1", "true", "yes", "on"].includes(
  String(process.env.EXO_UNLIMITED_BUILD || "").trim().toLowerCase(),
);
const DIST_ROOT = UNLIMITED_BUILD ? "dist-app-unlimited" : "dist-app";
const INSTALLER_ROOT = UNLIMITED_BUILD ? "dist-installer-unlimited" : "dist-installer";
const APP_EXE = `${PRODUCT_NAME}.exe`;
const DIST = path.join(ROOT, DIST_ROOT, PRODUCT_NAME);
const ELECTRON_DIST = path.join(ROOT, "node_modules", "electron", "dist");

console.log(
  `\n=== ${PRODUCT_NAME} — Manual Packager${UNLIMITED_BUILD ? " (unlimited entitlement)" : ""} ===\n`,
);

execSync("bash scripts/prepare-release-resources.sh", { cwd: ROOT, stdio: "inherit" });

// ── 1. Clean output ───────────────────────────────────────────────────────
if (fs.existsSync(DIST)) {
  fs.rmSync(DIST, { recursive: true });
  console.log("✓ Cleaned previous build");
}
fs.mkdirSync(DIST, { recursive: true });

// ── 2. Copy Electron runtime ──────────────────────────────────────────────
console.log("Copying Electron runtime...");
copyDir(ELECTRON_DIST, DIST);
// Rename Electron binary → product name (see package.json build.productName)
const appExePath = path.join(DIST, APP_EXE);
fs.renameSync(path.join(DIST, ELECTRON_EXE), appExePath);
applyWindowsExeIcon(appExePath);
console.log("✓ Electron runtime copied");

// ── 3. Pack app source into app.asar ─────────────────────────────────────
console.log("Packing app source into ASAR...");
const appSrcDir = path.join(ROOT, "app-src");
if (fs.existsSync(appSrcDir)) fs.rmSync(appSrcDir, { recursive: true });
fs.mkdirSync(appSrcDir, { recursive: true });

// Copy electron/ and frontend/dist/ into a staging folder
copyDir(path.join(ROOT, "electron"), path.join(appSrcDir, "electron"));
copyDir(path.join(ROOT, "frontend", "dist"), path.join(appSrcDir, "frontend", "dist"));

// Copy package.json (Electron needs it for "main" field)
const minPkg = { name: PKG.name, version: PKG.version, main: PKG.main };
fs.writeFileSync(path.join(appSrcDir, "package.json"), JSON.stringify(minPkg, null, 2));

// Use @electron/asar to pack
const asarBin = path.join(ROOT, "node_modules", ".bin", "asar");
const asarOut = path.join(DIST, "resources", "app.asar");
fs.mkdirSync(path.dirname(asarOut), { recursive: true });
execSync(`"${asarBin}" pack "${appSrcDir}" "${asarOut}"`, { stdio: "inherit" });
fs.rmSync(appSrcDir, { recursive: true });
// Remove default_app.asar if present (it takes precedence otherwise)
const defaultAsar = path.join(DIST, "resources", "default_app.asar");
if (fs.existsSync(defaultAsar)) fs.unlinkSync(defaultAsar);
console.log("✓ app.asar created");

// ── 4. Copy preload scripts OUTSIDE the asar into resources/ ─────────────
// Electron requires preload scripts to be real on-disk files.
// main.js uses process.resourcesPath to find them when packaged.
const resourcesDir = path.join(DIST, "resources");
for (const preloadFile of ["preload.js", "preload-setup.js"]) {
  const src = path.join(ROOT, "electron", preloadFile);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(resourcesDir, preloadFile));
    console.log(`✓ ${preloadFile} copied to resources/`);
  } else {
    console.warn(`⚠ ${preloadFile} not found in electron/`);
  }
}

// ── 5. Copy backend onedir into resources ────────────────────────────────
const backendSrcDir = path.join(ROOT, "electron", "resources", "backend");
const backendDestDir = path.join(resourcesDir, "backend");
if (resolveBackendInSlice(backendSrcDir, "win32")) {
  stageOnedirDirectory(backendSrcDir, backendDestDir);
  console.log("✓ backend/ onedir copied to resources");
} else {
  console.warn("⚠ electron/resources/backend/ not found — run PyInstaller first");
}

const gmailOAuthSrc = path.join(ROOT, "electron", "resources", "gmail_oauth_client.json");
if (fs.existsSync(gmailOAuthSrc)) {
  fs.copyFileSync(gmailOAuthSrc, path.join(resourcesDir, "gmail_oauth_client.json"));
  console.log("✓ gmail_oauth_client.json copied to resources (end users can use Connect Gmail only)");
} else {
  console.log("ℹ No electron/resources/gmail_oauth_client.json — Gmail needs .env or user-placed JSON (see backend/.env.example)");
}

// integration-config.json carries the bundled Dropbox/Microsoft/Infomaniak client IDs.
// backendProcess.readBundledIntegrationConfig() reads it from process.resourcesPath when
// packaged, so it must land beside the backend binary (matches the electron-builder config).
const integrationConfigSrc = path.join(ROOT, "electron", "resources", "integration-config.json");
if (fs.existsSync(integrationConfigSrc)) {
  fs.copyFileSync(integrationConfigSrc, path.join(resourcesDir, "integration-config.json"));
  console.log("✓ integration-config.json copied to resources (bundled connector client IDs)");
} else {
  console.log("ℹ No electron/resources/integration-config.json — connectors need .env / userData overrides");
}

if (UNLIMITED_BUILD) {
  const markerPath = path.join(resourcesDir, "unlimited-entitlement.marker");
  fs.writeFileSync(
    markerPath,
    `profile=unlimited-entitlement\nversion=${PKG.version}\n`,
    "utf8",
  );
  console.log("✓ unlimited-entitlement.marker written (no trial day limit in this build)");
}

// ── 6. Verify packaged resources ───────────────────────────────────────────
const resourcesDirFinal = path.join(DIST, "resources");
execSync(`node scripts/verify-packaged-app.cjs "${resourcesDirFinal}"`, {
  cwd: ROOT,
  stdio: "inherit",
});

console.log("\n✓ Done!\n");
console.log(`App is at: ${DIST}`);
console.log(`Launch: "${path.join(DIST, APP_EXE)}"`);
if (UNLIMITED_BUILD) {
  console.log(`\nUnlimited build — export folder: ${path.join(ROOT, DIST_ROOT, PRODUCT_NAME)}`);
  console.log(`Installer output (after Inno Setup): ${path.join(ROOT, INSTALLER_ROOT)}`);
} else {
  console.log(`\nTo distribute: zip the entire '${PRODUCT_NAME}' folder.`);
}

// ── Helpers ───────────────────────────────────────────────────────────────
/** Embed electron/assets/icon.ico into Exo.exe (manual packager skips electron-builder). */
function applyWindowsExeIcon(exePath) {
  const iconPath = path.join(ROOT, "electron", "assets", "icon.ico");
  if (!fs.existsSync(iconPath)) {
    console.warn("⚠ icon.ico missing — run npm install (postinstall renders icons)");
    return;
  }
  let rceditBin;
  try {
    rceditBin = require.resolve("rcedit/bin/rcedit-x64.exe");
  } catch {
    console.warn("⚠ rcedit not installed — Exo.exe will keep the default Electron icon");
    return;
  }
  const version = String(PKG.version || "1.0.0");
  execFileSync(rceditBin, [exePath, "--set-icon", iconPath], { stdio: "inherit" });
  execFileSync(
    rceditBin,
    [exePath, "--set-file-version", version, "--set-product-version", version],
    { stdio: "inherit" },
  );
  console.log(`✓ App icon embedded in ${APP_EXE}`);
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else if (entry.isSymbolicLink()) {
      if (IS_WIN) {
        // Skip symlinks on Windows — requires elevated privileges to create
      } else {
        // Preserve symlinks on macOS/Linux (required for Electron to work)
        const target = fs.readlinkSync(srcPath);
        if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
        fs.symlinkSync(target, destPath);
      }
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}
