const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  updaterAsarFileGlobs,
  verifyUpdaterPackagingConfig,
  assertDynamicImportsCovered,
  REQUIRED_ASAR_PACKAGES,
} = require("./updater-packaging.cjs");

test("updaterAsarFileGlobs includes electron-updater, @noble/ed25519, and qrcode", () => {
  const globs = updaterAsarFileGlobs();
  assert.ok(globs.some((g) => g.startsWith("node_modules/electron-updater/")));
  assert.ok(globs.some((g) => g.startsWith("node_modules/builder-util-runtime/")));
  assert.ok(globs.some((g) => g.startsWith("node_modules/@noble/ed25519/")));
  assert.ok(globs.some((g) => g.startsWith("node_modules/qrcode/")));
  assert.ok(REQUIRED_ASAR_PACKAGES.includes("qrcode"));
});

test("mac electron-builder config bundles electron-updater, @noble/ed25519, and qrcode", () => {
  assert.equal(verifyUpdaterPackagingConfig(), true);
});

test("assertDynamicImportsCovered passes for repo electron/ (@noble covered)", () => {
  const result = assertDynamicImportsCovered();
  assert.equal(result.ok, true);
  assert.ok(result.imports.includes("@noble/ed25519"));
  assert.ok(REQUIRED_ASAR_PACKAGES.includes("@noble/ed25519"));
});

test("assertDynamicImportsCovered fails when uncovered package is imported", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "asar-gate-"));
  fs.writeFileSync(
    path.join(tmp, "sample.js"),
    'async function x() { await import("totally-missing-pkg"); }\n',
    "utf8"
  );
  const result = assertDynamicImportsCovered({ electronDir: tmp });
  assert.equal(result.ok, false);
  assert.ok(result.missing.includes("totally-missing-pkg"));
});
