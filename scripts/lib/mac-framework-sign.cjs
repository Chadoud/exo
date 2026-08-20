/**
 * Make PyInstaller Python.framework look like a real macOS framework so
 * codesign/notarize can seal it. Signing the .framework root stays ambiguous
 * when Resources/Python sit at the root next to Versions/.
 */
const fs = require("fs");
const path = require("path");

const FRAMEWORK_SUFFIX = ".framework";

function frameworkName(frameworkDir) {
  return path.basename(frameworkDir).slice(0, -FRAMEWORK_SUFFIX.length);
}

function frameworkVersionName(frameworkDir) {
  const versionsDir = path.join(frameworkDir, "Versions");
  if (!fs.existsSync(versionsDir)) return null;
  return (
    fs.readdirSync(versionsDir).find((name) => {
      if (name === "Current") return false;
      return fs.statSync(path.join(versionsDir, name)).isDirectory();
    }) || null
  );
}

function frameworkInfoPlist(fwName, version) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key>
  <string>${fwName}</string>
  <key>CFBundleIdentifier</key>
  <string>org.python.python</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>${fwName}</string>
  <key>CFBundlePackageType</key>
  <string>FMWK</string>
  <key>CFBundleShortVersionString</key>
  <string>${version}</string>
  <key>CFBundleVersion</key>
  <string>${version}</string>
</dict>
</plist>
`;
}

function writeFrameworkInfoPlist(versionDir, fwName, version) {
  const resources = path.join(versionDir, "Resources");
  fs.mkdirSync(resources, { recursive: true });
  const plist = path.join(resources, "Info.plist");
  if (!fs.existsSync(plist)) fs.writeFileSync(plist, frameworkInfoPlist(fwName, version));
}

function ensureSymlink(linkPath, relativeTarget) {
  const existing = fs.lstatSync(linkPath, { throwIfNoEntry: false });
  if (existing?.isSymbolicLink() && fs.readlinkSync(linkPath) === relativeTarget) return;
  if (existing) fs.rmSync(linkPath, { recursive: true, force: true });
  fs.symlinkSync(relativeTarget, linkPath);
}

function relocateRootEntry(frameworkDir, versionDir, name) {
  const rootPath = path.join(frameworkDir, name);
  const dest = path.join(versionDir, name);
  const st = fs.lstatSync(rootPath, { throwIfNoEntry: false });
  if (!st || st.isSymbolicLink()) return;
  if (!fs.existsSync(dest)) {
    fs.renameSync(rootPath, dest);
    return;
  }
  if (st.isDirectory()) {
    for (const child of fs.readdirSync(rootPath)) {
      const from = path.join(rootPath, child);
      const to = path.join(dest, child);
      if (!fs.existsSync(to)) fs.renameSync(from, to);
    }
  }
  fs.rmSync(rootPath, { recursive: true, force: true });
}

/**
 * Canonical layout: Versions/<ver>/{Python,Resources}, Current → ver,
 * root Python/Resources/Headers → Versions/Current/…
 * @returns {string | null} version directory to codesign as a bundle
 */
function normalizeFrameworkDir(frameworkDir) {
  const fwName = frameworkName(frameworkDir);
  let version = frameworkVersionName(frameworkDir);
  const versionsDir = path.join(frameworkDir, "Versions");
  if (!version) {
    fs.mkdirSync(path.join(versionsDir, "A"), { recursive: true });
    version = "A";
    for (const name of fs.readdirSync(frameworkDir)) {
      if (name === "Versions") continue;
      relocateRootEntry(frameworkDir, path.join(versionsDir, "A"), name);
    }
  }
  const versionDir = path.join(versionsDir, version);
  ensureSymlink(path.join(versionsDir, "Current"), version);
  for (const name of [fwName, "Resources", "Headers"]) {
    relocateRootEntry(frameworkDir, versionDir, name);
    const dest = path.join(versionDir, name);
    if (fs.existsSync(dest)) {
      ensureSymlink(path.join(frameworkDir, name), path.join("Versions", "Current", name));
    }
  }
  writeFrameworkInfoPlist(versionDir, fwName, version);
  return versionDir;
}

function collectFrameworkDirs(rootDir) {
  const bundles = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (fs.lstatSync(full).isSymbolicLink()) continue;
      if (!entry.isDirectory()) continue;
      if (entry.name.endsWith(FRAMEWORK_SUFFIX)) bundles.push(full);
      walk(full);
    }
  };
  if (fs.existsSync(rootDir)) walk(rootDir);
  return bundles.sort((a, b) => b.length - a.length || b.localeCompare(a));
}

/** @returns {string[]} version dirs to sign as framework bundles */
function normalizeFrameworksInTree(rootDir) {
  return collectFrameworkDirs(rootDir)
    .map((dir) => normalizeFrameworkDir(dir))
    .filter(Boolean);
}

/**
 * Replace `_internal/Python` → framework symlink with a real dylib and delete
 * Python.framework. Notary rejects the framework-wrapped dylib even when
 * `codesign --verify` passes.
 */
function flattenPythonFrameworks(sliceDir) {
  const internals = path.join(sliceDir, "_internal");
  const framework = path.join(internals, "Python.framework");
  if (!fs.existsSync(framework)) return false;
  const versionDir = normalizeFrameworkDir(framework);
  const realPython = path.join(versionDir, frameworkName(framework));
  if (!fs.existsSync(realPython)) {
    throw new Error(`flatten: missing ${realPython}`);
  }
  const dest = path.join(internals, "Python");
  const existing = fs.lstatSync(dest, { throwIfNoEntry: false });
  if (existing) fs.rmSync(dest, { recursive: true, force: true });
  fs.copyFileSync(realPython, dest);
  fs.chmodSync(dest, 0o755);
  fs.rmSync(framework, { recursive: true, force: true });
  return true;
}

module.exports = {
  frameworkName,
  frameworkVersionName,
  frameworkInfoPlist,
  normalizeFrameworkDir,
  collectFrameworkDirs,
  normalizeFrameworksInTree,
  flattenPythonFrameworks,
};
