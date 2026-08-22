import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  normalizeSemver,
  validateReleaseVersion,
  validateLatestMacYmlVersion,
} from "./validate-release-version.mjs";

function writeFixture(root, version, { emptyChangelog = false } = {}) {
  fs.mkdirSync(path.join(root, "frontend", "src"), { recursive: true });
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ version }, null, 2));
  fs.writeFileSync(path.join(root, "frontend", "package.json"), JSON.stringify({ version }, null, 2));
  fs.writeFileSync(
    path.join(root, "frontend", "src", "appVersion.ts"),
    `export const APP_VERSION = "${version}";\n`
  );
  fs.writeFileSync(path.join(root, "installer.iss"), `#define AppVersion "${version}"\n`);
  fs.writeFileSync(path.join(root, "installer-test.iss"), `#define AppVersion "${version}"\n`);
  const body = emptyChangelog ? "" : "\n- note\n";
  fs.writeFileSync(path.join(root, "CHANGELOG.md"), `# Changelog\n\n## [${version}]${body}\n## [0.0.1]\n- old\n`);
}

test("normalizeSemver strips v prefix", () => {
  assert.equal(normalizeSemver("v1.2.3"), "1.2.3");
  assert.equal(normalizeSemver("1.2"), null);
});

test("validateReleaseVersion accepts aligned sources", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "relver-ok-"));
  writeFixture(root, "1.2.3");
  const out = validateReleaseVersion(root, "1.2.3");
  assert.equal(out.ok, true);
  assert.equal(out.version, "1.2.3");
});

test("validateReleaseVersion fails on drift", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "relver-bad-"));
  writeFixture(root, "1.2.3");
  fs.writeFileSync(path.join(root, "frontend", "src", "appVersion.ts"), `export const APP_VERSION = "9.9.9";\n`);
  const out = validateReleaseVersion(root, "1.2.3");
  assert.equal(out.ok, false);
  assert.ok(out.errors.some((e) => e.includes("appVersion")));
});

test("validateReleaseVersion fails on empty changelog section", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "relver-cl-"));
  writeFixture(root, "1.2.3", { emptyChangelog: true });
  const out = validateReleaseVersion(root, "1.2.3");
  assert.equal(out.ok, false);
  assert.ok(out.errors.some((e) => e.includes("empty")));
});

test("validateLatestMacYmlVersion", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "relver-yml-"));
  const p = path.join(dir, "latest-mac.yml");
  fs.writeFileSync(p, "version: 1.2.3\npath: Exo.zip\n");
  assert.equal(validateLatestMacYmlVersion(p, "1.2.3"), null);
  assert.match(validateLatestMacYmlVersion(p, "1.2.4") || "", /expected 1\.2\.4/);
});
