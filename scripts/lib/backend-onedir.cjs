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
const {
  collectFrameworkDirs,
  normalizeFrameworksInTree,
} = require("./mac-framework-sign.cjs");

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
  // verbatimSymlinks keeps Python.framework's relative symlinks intact; the default
  // resolves them to absolute build-machine paths, which breaks codesign
  // ("unsealed contents") and would dangle on end-user machines.
  fs.cpSync(srcDir, destDir, { recursive: true, verbatimSymlinks: true });
  try {
    fs.chmodSync(nestedBackendExecutable(destDir), 0o755);
  } catch {
    /* Windows */
  }
}

/**
 * True for framework shortcut paths codesign treats as an ambiguous bundle.
 * Never skip Versions/<x.y>/… — only the top-level Foo.framework/Foo stub
 * and a materialized Versions/Current chain.
 */
function isFrameworkShortcutPath(filePath) {
  const parts = filePath.split(path.sep);
  const fw = parts.findIndex((part) => part.endsWith(".framework"));
  if (fw < 0 || fw === parts.length - 1) return false;
  const fwName = parts[fw].slice(0, -".framework".length);
  const after = parts.slice(fw + 1);
  if (after.length === 1) return after[0] === fwName;
  return after[0] === "Versions" && after[1] === "Current";
}

/**
 * Find every Mach-O file under a slice, deepest paths first (so nested
 * dylibs get signed before the binaries that depend on them).
 * @param {string} sliceDir
 * @returns {string[]}
 */

function collectMachOFilesDeepestFirst(sliceDir) {
  const machOFiles = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      // Frameworks (e.g. Python.framework/Python) expose their real binary
      // through a "Versions/Current/..." symlink chain. `readdirSync`'s
      // Dirent type can follow that chain on some Node/APFS combinations,
      // making the symlink look like a plain file — codesign then fails
      // with "bundle format is ambiguous" because it's signing a framework
      // shortcut path instead of the real one. lstat is the source of
      // truth: never sign or recurse through a symlink directly, only the
      // real file it points at (which this walk visits on its own).
      if (fs.lstatSync(full).isSymbolicLink()) continue;
      if (isFrameworkShortcutPath(full)) continue;
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

  machOFiles.sort((a, b) => b.length - a.length || b.localeCompare(a));
  return machOFiles;
}

function isInsideFramework(filePath) {
  return filePath.split(path.sep).some((part) => part.endsWith(".framework"));
}

/** Recreate Foo.framework/Foo and Versions/Current as relative symlinks. */
function repairFrameworkShortcuts(rootDir) {
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (fs.lstatSync(full).isSymbolicLink()) continue;
      if (!entry.isDirectory()) continue;
      if (!entry.name.endsWith(".framework")) {
        walk(full);
        continue;
      }
      const fwName = entry.name.slice(0, -".framework".length);
      const versionsDir = path.join(full, "Versions");
      if (!fs.existsSync(versionsDir)) continue;
      const version = fs
        .readdirSync(versionsDir)
        .find((name) => name !== "Current" && fs.statSync(path.join(versionsDir, name)).isDirectory());
      if (!version) continue;
      const currentLink = path.join(versionsDir, "Current");
      if (fs.existsSync(currentLink) && !fs.lstatSync(currentLink).isSymbolicLink()) {
        fs.rmSync(currentLink, { recursive: true, force: true });
      }
      if (!fs.existsSync(currentLink)) fs.symlinkSync(version, currentLink);
      const top = path.join(full, fwName);
      if (fs.existsSync(top) && !fs.lstatSync(top).isSymbolicLink()) {
        fs.rmSync(top, { recursive: true, force: true });
      }
      if (!fs.existsSync(top)) {
        fs.symlinkSync(path.join("Versions", "Current", fwName), top);
      }
    }
  };
  walk(rootDir);
}

/** Remove Foo.framework/Foo so codesign can treat the directory as a framework. */
function detachFrameworkTopExec(rootDir) {
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (fs.lstatSync(full).isSymbolicLink()) continue;
      if (!entry.isDirectory()) continue;
      if (!entry.name.endsWith(".framework")) {
        walk(full);
        continue;
      }
      const top = path.join(full, entry.name.slice(0, -".framework".length));
      if (fs.existsSync(top)) fs.rmSync(top, { recursive: true, force: true });
    }
  };
  walk(rootDir);
}

function codesignArgs(identity, targetPath, entitlementsPath) {
  const args = ["--force", "--options", "runtime", "--timestamp", "--sign", identity];
  if (entitlementsPath) args.push("--entitlements", entitlementsPath);
  args.push(targetPath);
  return args;
}

/**
 * Codesign every Mach-O in an onedir slice (inner libs first, launcher last).
 * Sign Versions/<x.y> as the framework bundle — not Python.framework itself
 * (codesign reports "bundle format is ambiguous" on the root).
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

  const versionDirs = normalizeFrameworksInTree(sliceDir);
  const machOFiles = collectMachOFilesDeepestFirst(sliceDir).filter(
    (filePath) => !isInsideFramework(filePath),
  );

  for (const filePath of machOFiles) {
    execFileSync("codesign", codesignArgs(identity, filePath, entitlementsPath), {
      stdio: "inherit",
    });
  }

  for (const versionDir of versionDirs) {
    execFileSync("codesign", codesignArgs(identity, versionDir, null), { stdio: "inherit" });
  }
  for (const frameworkDir of collectFrameworkDirs(sliceDir)) {
    try {
      execFileSync("codesign", codesignArgs(identity, frameworkDir, null), { stdio: "inherit" });
      execFileSync("codesign", ["--verify", "--deep", "--strict", frameworkDir], {
        stdio: "inherit",
      });
    } catch (err) {
      execSync(`ls -la "${frameworkDir}" "${frameworkDir}/Versions"`, { stdio: "inherit" });
      throw err;
    }
  }
  normalizeFrameworksInTree(sliceDir);

  execFileSync("codesign", codesignArgs(identity, launcher, entitlementsPath), {
    stdio: "inherit",
  });
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
  collectMachOFilesDeepestFirst,
  codesignMacOnedirSlice,
  fileOutputMatches,
  isFrameworkShortcutPath,
  isInsideFramework,
  repairFrameworkShortcuts,
  detachFrameworkTopExec,
  codesignArgs,
};
