/**
 * Resolve the packaged PyInstaller backend for the current OS/arch.
 *
 * PyInstaller onedir bundles are arch-specific and cannot be merged with `lipo`.
 * Universal macOS builds ship `backend-x64/` and `backend-arm64/` side by side.
 *
 * Contract:
 *   macOS:  Resources/backend-{arch}/backend
 *   Windows: Resources/backend/backend.exe
 *   Linux:  Resources/backend/backend
 *
 * Keep this module self-contained (no scripts/ imports) — it ships inside the app.
 */

const fs = require("fs");
const path = require("path");

/**
 * @param {string} slicePath onedir directory or legacy one-file path
 * @param {NodeJS.Platform} [platform]
 * @returns {string | null}
 */
function resolveBackendInSlice(slicePath, platform = process.platform) {
  if (!slicePath || !fs.existsSync(slicePath)) return null;
  const st = fs.statSync(slicePath);
  if (st.isFile()) return slicePath;
  const nested =
    platform === "win32"
      ? path.join(slicePath, "backend.exe")
      : path.join(slicePath, "backend");
  return fs.existsSync(nested) ? nested : null;
}

/**
 * @param {string} resourcesPath Electron `process.resourcesPath`
 * @param {NodeJS.Platform} [platform]
 * @param {string} [arch] process.arch
 * @returns {string | null} Absolute path to the backend executable, or null if missing.
 */
function resolvePackagedBackendBin(resourcesPath, platform = process.platform, arch = process.arch) {
  if (!resourcesPath) return null;

  if (platform === "win32") {
    const nested = resolveBackendInSlice(path.join(resourcesPath, "backend"), "win32");
    if (nested) return nested;
    const legacy = path.join(resourcesPath, "backend.exe");
    return fs.existsSync(legacy) ? legacy : null;
  }

  if (platform === "darwin") {
    const sliceName = arch === "arm64" ? "backend-arm64" : "backend-x64";
    const sliced = resolveBackendInSlice(path.join(resourcesPath, sliceName), "darwin");
    if (sliced) return sliced;

    const legacyFlat = path.join(resourcesPath, "backend");
    if (fs.existsSync(legacyFlat) && fs.statSync(legacyFlat).isFile()) return legacyFlat;

    return resolveBackendInSlice(legacyFlat, "darwin");
  }

  return resolveBackendInSlice(path.join(resourcesPath, "backend"), platform);
}

module.exports = { resolvePackagedBackendBin, resolveBackendInSlice };
