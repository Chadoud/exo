/**
 * Resolve the newest packaged Exo.app under dist-installer/.
 * Walks nested folders (electron-builder universal output varies by version).
 */
const fs = require("fs");
const path = require("path");

/**
 * @param {string} rootDir repo root
 * @returns {string | null}
 */
function findPackagedMacApp(rootDir) {
  const dist = path.join(rootDir, "dist-installer");
  if (!fs.existsSync(dist)) return null;

  const candidates = [];

  /** @param {string} dir */
  function walk(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "Exo.app" || entry.name === "Exo Test.app") {
          candidates.push({ appPath: full, mtime: fs.statSync(full).mtimeMs });
        } else {
          walk(full);
        }
      }
    }
  }

  walk(dist);
  candidates.sort((a, b) => b.mtime - a.mtime);
  return candidates[0]?.appPath ?? null;
}

module.exports = { findPackagedMacApp };
