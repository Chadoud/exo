/**
 * macOS desktop packaging — single source of truth for native vs universal builds.
 *
 * Native (default): one PyInstaller slice + Exo-{arm64|x64}.dmg
 * Universal (EXO_MAC_UNIVERSAL=1): both slices + Exo-universal.dmg (CI / public release)
 */
const fs = require("fs");
const path = require("path");
const {
  resolveBackendInSlice,
  fileOutputMatches,
} = require("./backend-onedir.cjs");

/** @typedef {'x64' | 'arm64'} MacArch */

/**
 * @param {MacArch} arch
 * @returns {string}
 */
function backendSliceName(arch) {
  return arch === "arm64" ? "backend-arm64" : "backend-x64";
}

/**
 * @returns {MacArch}
 */
function hostNativeArch() {
  return process.arch === "arm64" ? "arm64" : "x64";
}

/**
 * @param {Record<string, string | undefined>} [env]
 * @returns {boolean}
 */
function isUniversalBuild(env = process.env) {
  return env.EXO_MAC_UNIVERSAL === "1";
}

/**
 * @param {Record<string, string | undefined>} [env]
 * @returns {'universal' | 'native-x64' | 'native-arm64'}
 */
function packagingMode(env = process.env) {
  return isUniversalBuild(env) ? "universal" : `native-${hostNativeArch()}`;
}

/**
 * PyInstaller target arch for the non-host slice when building universal locally.
 * @returns {string}
 */
function otherPyInstallerTargetArch() {
  return hostNativeArch() === "arm64" ? "x86_64" : "arm64";
}

/**
 * @param {Record<string, string | undefined>} [env]
 * @returns {string}
 */
function dmgArtifactName(env = process.env) {
  if (isUniversalBuild(env)) return "Exo-universal.${ext}";
  return `Exo-${hostNativeArch()}.\${ext}`;
}

function macSharedExtraResources() {
  return [
    { from: "electron/preload.js", to: "preload.js" },
    { from: "electron/preload-setup.js", to: "preload-setup.js" },
    {
      from: "electron/resources/gmail_oauth_client.json",
      to: "gmail_oauth_client.json",
      filter: ["**/*"],
    },
    {
      from: "electron/resources/integration-config.json",
      to: "integration-config.json",
      filter: ["**/*"],
    },
  ];
}

/**
 * Both PyInstaller slices are extraResources in every arch temp app. Identical
 * Mach-O files must match this glob or @electron/universal throws.
 * `{*,.*}` is required: minimatch defaults skip dotdirs such as PIL/.dylibs
 * and we cannot pass `{ dot: true }` through electron-builder.
 */
const UNIVERSAL_X64_ARCH_FILES =
  "{Contents/Resources/backend-*/**/{*,.*}/**,Contents/Resources/backend-*/**/{*,.*}}";

/** Regexes for electron-builder: do not re-sign pre-signed onedir slices. */
const MAC_BACKEND_SIGN_IGNORE = [
  "/Contents/Resources/backend-x64/",
  "/Contents/Resources/backend-arm64/",
];

/**
 * @param {Record<string, string | undefined>} [env]
 * @returns {Array<{ from: string; to: string; filter?: string[] }>}
 */
function macBackendExtraResources(env = process.env) {
  if (isUniversalBuild(env)) {
    return [
      { from: "electron/resources/backend-x64", to: "backend-x64" },
      { from: "electron/resources/backend-arm64", to: "backend-arm64" },
    ];
  }
  const slice = backendSliceName(hostNativeArch());
  return [{ from: `electron/resources/${slice}`, to: slice }];
}

/**
 * electron-builder config fragment (merged with package.json `build`).
 * @param {Record<string, string | undefined>} [env]
 */
function electronBuilderConfig(env = process.env) {
  const pkg = require(path.join(__dirname, "..", "..", "package.json"));
  const baseBuild = pkg.build || {};
  const { updaterAsarFileGlobs } = require("./updater-packaging.cjs");
  return {
    ...baseBuild,
    files: [...(baseBuild.files || []), ...updaterAsarFileGlobs()],
    dmg: {
      ...baseBuild.dmg,
      artifactName: dmgArtifactName(env),
    },
    mac: {
      ...baseBuild.mac,
      extraResources: [...macSharedExtraResources(), ...macBackendExtraResources(env)],
      x64ArchFiles: UNIVERSAL_X64_ARCH_FILES,
      // Slices are already signed by codesignMacOnedirSlice. electron-builder's
      // walk hits Python.framework/Python ("bundle format is ambiguous").
      signIgnore: MAC_BACKEND_SIGN_IGNORE,
    },
  };
}

/**
 * Stage backend slices under electron/resources before packaging.
 * Native builds keep a single slice; universal requires both.
 *
 * @param {string} resourcesDir
 * @param {Record<string, string | undefined>} [env]
 */
function stageBackendSlices(resourcesDir, env = process.env) {
  const x64 = path.join(resourcesDir, "backend-x64");
  const arm64 = path.join(resourcesDir, "backend-arm64");
  const legacy = path.join(resourcesDir, "backend");

  if (isUniversalBuild(env)) {
    if (!resolveBackendInSlice(x64, "darwin") || !resolveBackendInSlice(arm64, "darwin")) {
      throw new Error(
        "Universal macOS build requires electron/resources/backend-x64 and backend-arm64 onedir slices"
      );
    }
    return;
  }

  const native = hostNativeArch();
  const target = path.join(resourcesDir, backendSliceName(native));
  const unused = path.join(resourcesDir, backendSliceName(native === "arm64" ? "x64" : "arm64"));

  if (!resolveBackendInSlice(target, "darwin") && fs.existsSync(legacy)) {
    fs.rmSync(target, { recursive: true, force: true });
    if (fs.statSync(legacy).isDirectory()) {
      fs.cpSync(legacy, target, { recursive: true });
    } else {
      fs.mkdirSync(target, { recursive: true });
      fs.copyFileSync(legacy, path.join(target, "backend"));
    }
  }
  if (!resolveBackendInSlice(target, "darwin")) {
    throw new Error(`Missing native backend slice: ${path.basename(target)}`);
  }
  if (fs.existsSync(unused)) {
    fs.rmSync(unused, { recursive: true, force: true });
  }
}

/**
 * Verify packaged macOS backend slices (count + optional CPU arch).
 *
 * @param {string} resourcesDir
 * @param {{ env?: Record<string, string | undefined>; strictArch?: boolean }} [options]
 * @returns {boolean}
 */
function verifyBackendSlices(resourcesDir, options = {}) {
  const env = options.env ?? process.env;
  const strictArch = options.strictArch ?? isUniversalBuild(env);
  const mode = packagingMode(env);
  const x64 = path.join(resourcesDir, "backend-x64");
  const arm64 = path.join(resourcesDir, "backend-arm64");
  const x64Exe = resolveBackendInSlice(x64, "darwin");
  const arm64Exe = resolveBackendInSlice(arm64, "darwin");
  const log = (msg) => console.log(`[mac-packaging] ${msg}`);
  const fail = (msg) => {
    console.error(`[mac-packaging] ${msg}`);
    return false;
  };

  if (mode === "native-x64" || mode === "native-arm64") {
    const expectedExe = mode === "native-arm64" ? arm64Exe : x64Exe;
    const unexpectedPath = mode === "native-arm64" ? x64 : arm64;
    const label = mode === "native-arm64" ? "backend-arm64" : "backend-x64";
    if (!expectedExe) return fail(`Missing ${label} (native build)`);
    log(`OK ${label}`);
    if (fs.existsSync(unexpectedPath)) {
      return fail(`Unexpected ${path.basename(unexpectedPath)} in native build`);
    }
    if (strictArch) {
      const pattern = mode === "native-arm64" ? "arm64" : "x86_64";
      if (!fileOutputMatches(expectedExe, pattern)) return fail(`${label} arch mismatch`);
    }
    return true;
  }

  if (!x64Exe || !arm64Exe) {
    return fail("Missing backend-x64 and/or backend-arm64 (universal build)");
  }
  log("OK backend-x64");
  log("OK backend-arm64");
  if (strictArch) {
    if (!fileOutputMatches(x64Exe, "x86_64")) return fail("backend-x64 arch mismatch");
    if (!fileOutputMatches(arm64Exe, "arm64")) return fail("backend-arm64 arch mismatch");
    if (fileOutputMatches(x64Exe, "universal binary")) {
      return fail("backend-x64 must be thin x86_64, not lipo universal");
    }
  }
  return true;
}

/**
 * Copy primary DMG to dist-installer/Exo.dmg (website + handoff alias).
 * Prefers universal when present; otherwise native DMG for this host CPU.
 *
 * @param {string} distDir
 */
function copyPrimaryDmgAlias(distDir) {
  if (!fs.existsSync(distDir)) {
    throw new Error("dist-installer/ missing");
  }

  const dmgs = fs
    .readdirSync(distDir)
    .filter((name) => name.endsWith(".dmg") && name !== "Exo.dmg")
    .map((name) => ({
      name,
      filePath: path.join(distDir, name),
      mtime: fs.statSync(path.join(distDir, name)).mtimeMs,
      universal: /universal/i.test(name),
      nativeArch: new RegExp(`-${hostNativeArch()}\\.dmg$`, "i").test(name),
    }));

  if (dmgs.length === 0) {
    throw new Error("No .dmg found in dist-installer/");
  }

  const universal = dmgs.find((d) => d.universal);
  const native = dmgs.find((d) => d.nativeArch);
  const newest = [...dmgs].sort((a, b) => b.mtime - a.mtime)[0];
  const primary = universal || native || newest;

  fs.copyFileSync(primary.filePath, path.join(distDir, "Exo.dmg"));
  console.log(`[mac-packaging] Exo.dmg ← ${primary.name}`);
}

module.exports = {
  backendSliceName,
  hostNativeArch,
  isUniversalBuild,
  packagingMode,
  otherPyInstallerTargetArch,
  dmgArtifactName,
  UNIVERSAL_X64_ARCH_FILES,
  MAC_BACKEND_SIGN_IGNORE,
  macSharedExtraResources,
  macBackendExtraResources,
  electronBuilderConfig,
  stageBackendSlices,
  verifyBackendSlices,
  copyPrimaryDmgAlias,
};
