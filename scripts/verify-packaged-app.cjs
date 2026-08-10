#!/usr/bin/env node
/**
 * Post-packaging checks for macOS .app bundles (and optional Windows folder layout).
 *
 * Usage:
 *   node scripts/verify-packaged-app.cjs
 *   node scripts/verify-packaged-app.cjs path/to/Exo.app
 *   node scripts/verify-packaged-app.cjs path/to/Exo/resources  # Windows manual packager
 */
const fs = require("fs");
const path = require("path");

const { findPackagedMacApp } = require("./find-packaged-mac-app.cjs");
const { isUniversalBuild, verifyBackendSlices } = require("./lib/mac-packaging.cjs");
const {
  verifyElectronUpdaterInAsar,
  assertDynamicImportsCovered,
} = require("./lib/updater-packaging.cjs");

const ROOT = path.join(__dirname, "..");
const arg = process.argv[2];

function findDefaultMacAppBundle() {
  return findPackagedMacApp(ROOT);
}

let resourcesDir;
let label;

if (arg && arg.endsWith(".app")) {
  resourcesDir = path.join(arg, "Contents", "Resources");
  label = arg;
} else if (arg && fs.existsSync(path.join(arg, "preload.js"))) {
  resourcesDir = arg;
  label = arg;
} else {
  const appBundle = findDefaultMacAppBundle();
  if (!appBundle) {
    console.error("[verify-packaged-app] No Exo.app found under dist-installer/ — pass a path or run package:mac first");
    process.exit(1);
  }
  resourcesDir = path.join(appBundle, "Contents", "Resources");
  label = appBundle;
}

const required = ["preload.js", "preload-setup.js", "integration-config.json"];
const recommended = ["gmail_oauth_client.json"];

const STRICT_RELEASE = process.env.STRICT_RELEASE === "1" || process.env.STRICT_RELEASE === "true";

function verifyGmailOAuthBundled(resourcesDir) {
  const p = path.join(resourcesDir, "gmail_oauth_client.json");
  if (fs.existsSync(p)) {
    console.log("[verify-packaged-app] OK gmail_oauth_client.json");
    return true;
  }
  const msg =
    "[verify-packaged-app] Missing gmail_oauth_client.json — Google/Gmail connect will show oauth_not_configured";
  if (STRICT_RELEASE) {
    console.error(`${msg} (STRICT_RELEASE)`);
    return false;
  }
  console.warn(`[verify-packaged-app] WARN ${msg}`);
  return true;
}

function verifyMacBackendSlices(resourcesDir) {
  const strictArch = isUniversalBuild() || process.env.EXO_MAC_VERIFY_SLICE_ARCH === "1";
  return verifyBackendSlices(resourcesDir, { strictArch });
}

let failed = false;

// Fail closed if Electron main gained a dynamic import without an asar packaging entry.
if (!assertDynamicImportsCovered().ok) failed = true;

if (!fs.existsSync(resourcesDir)) {
  console.error(`[verify-packaged-app] Resources not found: ${resourcesDir}`);
  process.exit(1);
}

console.log(`[verify-packaged-app] Checking ${label}`);

for (const file of required) {
  const p = path.join(resourcesDir, file);
  if (!fs.existsSync(p)) {
    console.error(`[verify-packaged-app] Missing required: ${p}`);
    failed = true;
  } else {
    console.log(`[verify-packaged-app] OK ${file}`);
  }
}

for (const file of recommended) {
  const p = path.join(resourcesDir, file);
  if (file === "gmail_oauth_client.json") continue;
  if (!fs.existsSync(p)) {
    const msg = `[verify-packaged-app] ${STRICT_RELEASE ? "Missing required (STRICT_RELEASE)" : "WARN missing optional"}: ${file}`;
    if (STRICT_RELEASE) {
      console.error(msg);
      failed = true;
    } else {
      console.warn(msg);
    }
  } else {
    console.log(`[verify-packaged-app] OK ${file}`);
  }
}

if (!verifyGmailOAuthBundled(resourcesDir)) failed = true;

const { resolveBackendInSlice } = require("./lib/backend-onedir.cjs");
const winBackend = resolveBackendInSlice(path.join(resourcesDir, "backend"), "win32");
const legacyWinExe = path.join(resourcesDir, "backend.exe");
if (winBackend || fs.existsSync(legacyWinExe)) {
  console.log("[verify-packaged-app] OK backend.exe");
} else if (process.platform === "darwin" || (arg && arg.endsWith(".app"))) {
  if (!verifyMacBackendSlices(resourcesDir)) failed = true;
} else if (!resolveBackendInSlice(path.join(resourcesDir, "backend"))) {
  console.warn("[verify-packaged-app] WARN missing backend binary");
}

if (process.platform === "darwin" || (arg && arg.endsWith(".app"))) {
  const asarPath = path.join(resourcesDir, "app.asar");
  if (!verifyElectronUpdaterInAsar(asarPath)) failed = true;
}

// exo:// protocol must be registered for Google sign-in handoff.
if (arg && arg.endsWith(".app")) {
  const plistPath = path.join(arg, "Contents", "Info.plist");
  if (fs.existsSync(plistPath)) {
    const plist = fs.readFileSync(plistPath, "utf8");
    if (!plist.includes("<string>exo</string>")) {
      console.error("[verify-packaged-app] Info.plist missing exo:// URL scheme");
      failed = true;
    } else {
      console.log("[verify-packaged-app] OK exo:// URL scheme");
    }
  }
}

process.exit(failed ? 1 : 0);
