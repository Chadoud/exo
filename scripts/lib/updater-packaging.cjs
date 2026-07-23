/**
 * Runtime npm packages that must ship inside app.asar.
 * package.json excludes all of node_modules by default; these globs re-include:
 * - electron-updater (+ dependency tree) for macOS in-app updates
 * - @noble/ed25519 for update-feed + license signature verification
 * - qrcode (+ dependency tree) for GO SYNC mobile pairing QR
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const NODE_MODULES = path.join(ROOT, "node_modules");

/** Packages that must be present even when dependency walking is unavailable. */
const REQUIRED_ASAR_PACKAGES = ["electron-updater", "@noble/ed25519", "qrcode"];

/** @returns {string[]} */
function updaterRuntimePackageNames() {
  if (!fs.existsSync(NODE_MODULES)) return [...REQUIRED_ASAR_PACKAGES];

  /** @param {string} name @param {string} fromDir @returns {string | null} */
  function resolvePkgDir(name, fromDir) {
    try {
      return path.dirname(require.resolve(`${name}/package.json`, { paths: [fromDir] }));
    } catch {
      return null;
    }
  }

  const seen = new Set();
  const queue = [...REQUIRED_ASAR_PACKAGES];

  while (queue.length) {
    const name = queue.shift();
    if (seen.has(name)) continue;
    const dir = resolvePkgDir(name, NODE_MODULES);
    if (!dir) {
      // Still list required seeds so electron-builder globs are present in CI dry runs.
      if (REQUIRED_ASAR_PACKAGES.includes(name)) seen.add(name);
      continue;
    }
    seen.add(name);
    const pkgJson = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
    const deps = { ...pkgJson.dependencies, ...pkgJson.optionalDependencies };
    for (const dep of Object.keys(deps || {})) queue.push(dep);
  }

  return [...seen].sort();
}

/** @returns {string[]} */
function updaterAsarFileGlobs() {
  return updaterRuntimePackageNames().map((name) => `node_modules/${name}/**/*`);
}

/**
 * @param {string} asarPath
 * @returns {boolean}
 */
function verifyElectronUpdaterInAsar(asarPath) {
  if (!fs.existsSync(asarPath)) {
    console.error(`[updater-packaging] app.asar not found: ${asarPath}`);
    return false;
  }

  let listOutput;
  try {
    listOutput = require("child_process").execSync(`npx --yes asar list "${asarPath}"`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (err) {
    console.error("[updater-packaging] failed to read app.asar:", err.message);
    return false;
  }

  const lines = listOutput.split("\n");
  const hasUpdaterMain = lines.some((line) => /\/node_modules\/electron-updater\//.test(line));
  if (!hasUpdaterMain) {
    console.error("[updater-packaging] electron-updater missing from app.asar — in-app updates will fall back to DMG");
    return false;
  }

  const hasNoble = lines.some((line) => /\/node_modules\/@noble\/ed25519\//.test(line));
  if (!hasNoble) {
    console.error(
      "[updater-packaging] @noble/ed25519 missing from app.asar — update-feed / license verify will fail at runtime",
    );
    return false;
  }

  const hasQrcode = lines.some((line) => /\/node_modules\/qrcode\//.test(line));
  if (!hasQrcode) {
    console.error(
      "[updater-packaging] qrcode missing from app.asar — Sync pairing QR will fail at runtime",
    );
    return false;
  }

  console.log("[updater-packaging] OK electron-updater + @noble/ed25519 + qrcode bundled in app.asar");
  return true;
}

/**
 * Ensure mac electron-builder config merges updater globs into `files`.
 * @returns {boolean}
 */
function verifyUpdaterPackagingConfig() {
  const { electronBuilderConfig } = require("./mac-packaging.cjs");
  const files = electronBuilderConfig().files || [];
  const hasUpdaterGlob = files.some(
    (entry) => typeof entry === "string" && entry.includes("node_modules/electron-updater/")
  );
  const hasNobleGlob = files.some(
    (entry) => typeof entry === "string" && entry.includes("node_modules/@noble/ed25519/")
  );
  const hasQrcodeGlob = files.some(
    (entry) => typeof entry === "string" && entry.includes("node_modules/qrcode/")
  );
  if (!hasUpdaterGlob) {
    console.error("[updater-packaging] mac electron-builder files[] missing electron-updater glob");
    return false;
  }
  if (!hasNobleGlob) {
    console.error("[updater-packaging] mac electron-builder files[] missing @noble/ed25519 glob");
    return false;
  }
  if (!hasQrcodeGlob) {
    console.error("[updater-packaging] mac electron-builder files[] missing qrcode glob");
    return false;
  }
  console.log(
    "[updater-packaging] OK electron-builder files include electron-updater + @noble/ed25519 + qrcode",
  );
  return true;
}

/** Strip line and block comments so JSDoc type imports are ignored. */
function stripJsComments(src) {
  return String(src || "")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/**
 * Scan electron JS sources for runtime dynamic import("pkg") / import('pkg') and ensure
 * bare package names are covered by REQUIRED_ASAR_PACKAGES.
 * Relative imports (./, ../) and node: builtins are allowlisted.
 *
 * @param {{ rootDir?: string, electronDir?: string }} [opts]
 * @returns {{ ok: boolean, imports: string[], missing: string[], errors: string[] }}
 */
function assertDynamicImportsCovered(opts = {}) {
  const electronDir = opts.electronDir || path.join(ROOT, "electron");
  const errors = [];
  /** @type {Set<string>} */
  const found = new Set();

  /** @param {string} dir */
  function walk(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (err) {
      errors.push(`cannot read ${dir}: ${err.message}`);
      return;
    }
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (ent.name === "node_modules" || ent.name === "fixtures") continue;
        walk(full);
        continue;
      }
      if (!ent.isFile() || !ent.name.endsWith(".js")) continue;
      // Skip unit tests — they may import packages only for assertions.
      if (ent.name.endsWith(".test.js")) continue;
      let src;
      try {
        src = stripJsComments(fs.readFileSync(full, "utf8"));
      } catch (err) {
        errors.push(`cannot read ${full}: ${err.message}`);
        continue;
      }
      const re = /\bimport\s*\(\s*(['"])([^'"]+)\1\s*\)/g;
      let m;
      while ((m = re.exec(src))) {
        const spec = m[2];
        if (spec.startsWith(".") || spec.startsWith("/") || spec.startsWith("node:")) continue;
        // Scoped package: @scope/name — take first two segments; else first segment.
        const pkg = spec.startsWith("@")
          ? spec.split("/").slice(0, 2).join("/")
          : spec.split("/")[0];
        found.add(pkg);
      }
    }
  }

  walk(electronDir);

  const required = new Set(REQUIRED_ASAR_PACKAGES);
  const missing = [...found].filter((pkg) => !required.has(pkg)).sort();
  if (missing.length) {
    errors.push(
      `dynamic import(s) not in REQUIRED_ASAR_PACKAGES: ${missing.join(", ")} — add to scripts/lib/updater-packaging.cjs in the same PR`,
    );
  }

  const ok = errors.length === 0;
  if (ok) {
    console.log(
      `[updater-packaging] OK dynamic imports covered (${[...found].sort().join(", ") || "none"})`,
    );
  } else {
    for (const e of errors) console.error(`[updater-packaging] ${e}`);
  }

  return { ok, imports: [...found].sort(), missing, errors };
}

module.exports = {
  REQUIRED_ASAR_PACKAGES,
  updaterRuntimePackageNames,
  updaterAsarFileGlobs,
  verifyElectronUpdaterInAsar,
  verifyUpdaterPackagingConfig,
  assertDynamicImportsCovered,
};
