/**
 * PyInstaller onedir staging + macOS codesign helpers.
 *
 * Contract:
 *   macOS:  electron/resources/backend-{arch}/backend   (+ _internal/…)
 *   Windows: electron/resources/backend/backend.exe      (+ _internal/…)
 *   Linux:  electron/resources/backend/backend
 */
const fs = require("fs");
const path = require("path");
const { execFileSync, execSync } = require("child_process");

/**
 * @param {string} sliceDir Directory that holds the onedir payload (or legacy one-file).
 * @param {NodeJS.Platform} [platform]
 * @returns {string} Expected nested executable path.
 */
function nestedBackendExecutable(sliceDir, platform = process.platform) {
  if (platform === "win32") return path.join(sliceDir, "backend.exe");
  return path.join(sliceDir, "backend");
}

/**
 * Resolve the runnable backend inside a staged slice (onedir or legacy one-file).
 * @param {string} slicePath
 * @param {NodeJS.Platform} [platform]
 * @returns {string | null}
 */
function resolveBackendInSlice(slicePath, platform = process.platform) {
  if (!slicePath || !fs.existsSync(slicePath)) return null;
  const st = fs.statSync(slicePath);
  if (st.isFile()) return slicePath; // legacy one-file slice
  const nested = nestedBackendExecutable(slicePath, platform);
  return fs.existsSync(nested) ? nested : null;
}

/**
 * Replace destDir with a fresh recursive copy of srcDir (PyInstaller dist/backend).
 * @param {string} srcDir
 * @param {string} destDir
 */
function stageOnedirDirectory(srcDir, destDir) {
  if (!srcDir || !fs.existsSync(srcDir) || !fs.statSync(srcDir).isDirectory()) {
    throw new Error(`onedir source missing or not a directory: ${srcDir}`);
  }
  const exe = resolveBackendInSlice(srcDir);
  if (!exe) {
    throw new Error(`onedir source has no backend executable under ${srcDir}`);
  }
  fs.rmSync(destDir, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(destDir), { recursive: true });
  fs.cpSync(srcDir, destDir, { recursive: true });
  try {
    fs.chmodSync(nestedBackendExecutable(destDir), 0o755);
  } catch {
    /* Windows */
  }
}

/**
 * Codesign every Mach-O in an onedir slice (inner libs first, launcher last).
 * @param {string} sliceDir
 * @param {string} identity
 * @param {string} entitlementsPath
 */
function codesignMacOnedirSlice(sliceDir, identity, entitlementsPath) {
  if (!fs.existsSync(sliceDir)) {
    throw new Error(`codesign: missing slice ${sliceDir}`);
  }
  const launcher = resolveBackendInSlice(sliceDir, "darwin");
  if (!launcher) {
    throw new Error(`codesign: no backend executable in ${sliceDir}`);
  }

  const machOFiles = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.isFile()) continue;
      let out = "";
      try {
        out = execFileSync("file", ["-b", full], { encoding: "utf8" });
      } catch {
        continue;
      }
      if (out.includes("Mach-O")) machOFiles.push(full);
    }
  };

  if (fs.statSync(sliceDir).isDirectory()) {
    walk(sliceDir);
  } else {
    machOFiles.push(sliceDir);
  }

  // Deepest paths first so nested dylibs are signed before dependents.
  machOFiles.sort((a, b) => b.length - a.length || b.localeCompare(a));

  const signArgs = (filePath) => [
    "--force",
    "--options",
    "runtime",
    "--timestamp",
    "--entitlements",
    entitlementsPath,
    "--sign",
    identity,
    filePath,
  ];

  for (const filePath of machOFiles) {
    execFileSync("codesign", signArgs(filePath), { stdio: "inherit" });
  }

  // Re-sign launcher last and deep-verify.
  execFileSync("codesign", signArgs(launcher), { stdio: "inherit" });
  execFileSync("codesign", ["--verify", "--deep", "--strict", "--verbose=2", launcher], {
    stdio: "inherit",
  });
}

/**
 * @param {string} binPath
 * @param {string} pattern
 * @returns {boolean}
 */
function fileOutputMatches(binPath, pattern) {
  const out = execSync(`file "${binPath}"`, { encoding: "utf8" });
  return out.includes(pattern);
}

module.exports = {
  nestedBackendExecutable,
  resolveBackendInSlice,
  stageOnedirDirectory,
  codesignMacOnedirSlice,
  fileOutputMatches,
};
