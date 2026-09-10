#!/usr/bin/env node
/**
 * Fail closed if desktop release version sources disagree.
 *
 * Usage:
 *   node scripts/validate-release-version.mjs              # use package.json version
 *   node scripts/validate-release-version.mjs --version 1.2.3
 *   node scripts/validate-release-version.mjs --version 1.2.3 --latest-mac-yml path/to/latest-mac.yml
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

/**
 * @param {string[]} argv
 * @returns {{ version: string | null, latestMacYml: string | null, root: string }}
 */
export function parseArgs(argv, root = ROOT) {
  let version = null;
  let latestMacYml = null;
  let requireCommitted = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--version" || a === "-v") {
      version = String(argv[++i] || "").trim();
    } else if (a === "--latest-mac-yml") {
      latestMacYml = String(argv[++i] || "").trim();
    } else if (a === "--require-committed") {
      requireCommitted = true;
    } else if (a === "--root") {
      root = path.resolve(String(argv[++i] || root));
    }
  }
  return { version, latestMacYml, root, requireCommitted };
}

/** Every file this script reads a version out of. */
export const VERSION_FILES = [
  "package.json",
  "frontend/package.json",
  "frontend/src/appVersion.ts",
  "installer.iss",
  "installer-test.iss",
  "CHANGELOG.md",
];

/**
 * This script reads the working tree, but a tag captures the commit. 1.1.75
 * shipped a tag whose installer-test.iss still said 1.1.74: the file was
 * correct on disk and simply never staged, so the check passed locally and
 * failed in CI. Anything uncommitted here means the tag would not match what
 * was just validated.
 * @param {string} root
 * @returns {string[]} version files with uncommitted changes
 */
export function findUncommittedVersionFiles(root, run = spawnSync) {
  const res = run("git", ["status", "--porcelain", "--", ...VERSION_FILES], {
    cwd: root,
    encoding: "utf8",
  });
  if (res.status !== 0) return [];
  return String(res.stdout || "")
    .split("\n")
    .map((line) => line.slice(3).trim())
    .filter(Boolean);
}

/**
 * @param {string} raw
 * @returns {string | null}
 */
export function normalizeSemver(raw) {
  const s = String(raw || "")
    .trim()
    .replace(/^v/i, "");
  if (!/^\d+\.\d+\.\d+$/.test(s)) return null;
  return s;
}

/**
 * @param {string} root
 * @param {string} expected
 * @returns {{ ok: true, version: string } | { ok: false, errors: string[] }}
 */
export function validateReleaseVersion(root, expected) {
  const version = normalizeSemver(expected);
  const errors = [];
  if (!version) {
    return { ok: false, errors: [`invalid semver: ${JSON.stringify(expected)}`] };
  }

  const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

  try {
    const pkg = JSON.parse(read("package.json"));
    if (String(pkg.version || "") !== version) {
      errors.push(`package.json version is ${JSON.stringify(pkg.version)}, expected ${version}`);
    }
  } catch (e) {
    errors.push(`package.json: ${e instanceof Error ? e.message : String(e)}`);
  }

  try {
    const fe = JSON.parse(read("frontend/package.json"));
    if (String(fe.version || "") !== version) {
      errors.push(`frontend/package.json version is ${JSON.stringify(fe.version)}, expected ${version}`);
    }
  } catch (e) {
    errors.push(`frontend/package.json: ${e instanceof Error ? e.message : String(e)}`);
  }

  try {
    const ts = read("frontend/src/appVersion.ts");
    const m = ts.match(/export const APP_VERSION = "([^"]+)";/);
    if (!m) {
      errors.push("frontend/src/appVersion.ts: APP_VERSION export not found");
    } else if (m[1] !== version) {
      errors.push(`frontend/src/appVersion.ts APP_VERSION is ${JSON.stringify(m[1])}, expected ${version}`);
    }
  } catch (e) {
    errors.push(`frontend/src/appVersion.ts: ${e instanceof Error ? e.message : String(e)}`);
  }

  for (const issRel of ["installer.iss", "installer-test.iss"]) {
    try {
      const iss = read(issRel);
      const m = iss.match(/#define AppVersion "([^"]+)"/);
      if (!m) {
        errors.push(`${issRel}: #define AppVersion "..." not found`);
      } else if (m[1] !== version) {
        errors.push(`${issRel} AppVersion is ${JSON.stringify(m[1])}, expected ${version}`);
      }
    } catch (e) {
      errors.push(`${issRel}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  try {
    const changelog = read("CHANGELOG.md");
    const header = `## [${version}]`;
    const idx = changelog.indexOf(header);
    if (idx < 0) {
      errors.push(`CHANGELOG.md missing section ${header}`);
    } else {
      const rest = changelog.slice(idx + header.length);
      const next = rest.search(/\n## \[/);
      const body = (next >= 0 ? rest.slice(0, next) : rest).trim();
      if (!body) {
        errors.push(`CHANGELOG.md section ${header} is empty`);
      }
    }
  } catch (e) {
    errors.push(`CHANGELOG.md: ${e instanceof Error ? e.message : String(e)}`);
  }

  if (errors.length) return { ok: false, errors };
  return { ok: true, version };
}

/**
 * @param {string} ymlPath
 * @param {string} expected
 * @returns {string | null} error message or null
 */
export function validateLatestMacYmlVersion(ymlPath, expected) {
  const version = normalizeSemver(expected);
  if (!version) return `invalid expected version: ${JSON.stringify(expected)}`;
  try {
    const text = fs.readFileSync(ymlPath, "utf8");
    const m = text.match(/^version:\s*(\S+)\s*$/m);
    if (!m) return `${ymlPath}: no version: field`;
    const found = normalizeSemver(m[1]);
    if (found !== version) {
      return `${ymlPath}: version is ${JSON.stringify(m[1])}, expected ${version}`;
    }
    return null;
  } catch (e) {
    return `${ymlPath}: ${e instanceof Error ? e.message : String(e)}`;
  }
}

function main() {
  const { version: argVersion, latestMacYml, root, requireCommitted } = parseArgs(
    process.argv.slice(2),
  );
  let expected = argVersion;
  if (!expected) {
    try {
      expected = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version;
    } catch (e) {
      console.error("[validate-release-version] cannot read package.json:", e);
      process.exit(1);
    }
  }

  const result = validateReleaseVersion(root, expected);
  if (!result.ok) {
    console.error("[validate-release-version] FAILED:");
    for (const err of result.errors) console.error(`  - ${err}`);
    process.exit(1);
  }

  if (latestMacYml) {
    const ymlErr = validateLatestMacYmlVersion(latestMacYml, result.version);
    if (ymlErr) {
      console.error("[validate-release-version] FAILED:");
      console.error(`  - ${ymlErr}`);
      process.exit(1);
    }
  }

  if (requireCommitted) {
    const dirty = findUncommittedVersionFiles(root);
    if (dirty.length) {
      console.error("[validate-release-version] FAILED — version files not committed:");
      for (const file of dirty) console.error(`  - ${file}`);
      console.error("Commit these before tagging; the tag records the commit, not your disk.");
      process.exit(1);
    }
  }

  console.log(`[validate-release-version] OK — ${result.version}`);
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  main();
}
