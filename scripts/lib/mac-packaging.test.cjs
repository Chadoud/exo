const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");

const { minimatch } = require("minimatch");
const {
  backendSliceName,
  packagingMode,
  stageBackendSlices,
  verifyBackendSlices,
  dmgArtifactName,
  UNIVERSAL_X64_ARCH_FILES,
  MAC_BACKEND_SIGN_IGNORE,
  electronBuilderConfig,
} = require("./mac-packaging.cjs");

function writeOnedirSlice(dir, sliceName) {
  const slice = path.join(dir, sliceName);
  fs.mkdirSync(slice, { recursive: true });
  fs.writeFileSync(path.join(slice, "backend"), "x");
  return slice;
}

test("backendSliceName maps arch to resource name", () => {
  assert.equal(backendSliceName("x64"), "backend-x64");
  assert.equal(backendSliceName("arm64"), "backend-arm64");
});

test("packagingMode reflects EXO_MAC_UNIVERSAL", () => {
  assert.equal(packagingMode({ EXO_MAC_UNIVERSAL: "1" }), "universal");
  assert.match(packagingMode({ EXO_MAC_UNIVERSAL: "0" }), /^native-/);
});

test("x64ArchFiles covers both backend slices including PIL .dylibs", () => {
  const cfg = electronBuilderConfig({ EXO_MAC_UNIVERSAL: "1" });
  assert.equal(cfg.mac.x64ArchFiles, UNIVERSAL_X64_ARCH_FILES);
  const opts = { matchBase: true };
  const covered = [
    "Contents/Resources/backend-arm64/backend",
    "Contents/Resources/backend-arm64/_internal/AppKit/_AppKit.cpython-311-darwin.so",
    "Contents/Resources/backend-arm64/_internal/PIL/.dylibs/libXau.6.dylib",
    "Contents/Resources/backend-x64/_internal/PIL/.dylibs/libXau.6.dylib",
  ];
  for (const file of covered) {
    assert.equal(minimatch(file, UNIVERSAL_X64_ARCH_FILES, opts), true, file);
  }
  assert.equal(
    minimatch(
      "Contents/Frameworks/Electron Framework.framework/Versions/A/Electron Framework",
      UNIVERSAL_X64_ARCH_FILES,
      opts,
    ),
    false,
  );
  const shortcut =
    "/Users/runner/work/exo/exo/dist-installer/mac-universal/Exo.app/Contents/Resources/backend-x64/_internal/Python.framework/Python";
  assert.ok(
    MAC_BACKEND_SIGN_IGNORE.some((pattern) => new RegExp(pattern).test(shortcut)),
    "electron-builder must skip the Python.framework shortcut",
  );
  assert.deepEqual(cfg.mac.signIgnore, MAC_BACKEND_SIGN_IGNORE);
});

test("dmgArtifactName is arch-specific unless universal", () => {
  assert.equal(dmgArtifactName({ EXO_MAC_UNIVERSAL: "1" }), "Exo-universal.${ext}");
  assert.match(dmgArtifactName({ EXO_MAC_UNIVERSAL: "0" }), /^Exo-(x64|arm64)\.\$\{ext\}$/);
});

test("stageBackendSlices keeps one onedir slice for native builds", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "exo-mac-pack-"));
  writeOnedirSlice(dir, "backend-x64");
  writeOnedirSlice(dir, "backend-arm64");

  const nativeArch = process.arch === "arm64" ? "arm64" : "x64";
  stageBackendSlices(dir, { EXO_MAC_UNIVERSAL: "0" });

  const kept = path.join(dir, backendSliceName(nativeArch));
  const removed = path.join(dir, backendSliceName(nativeArch === "arm64" ? "x64" : "arm64"));
  assert.ok(fs.existsSync(path.join(kept, "backend")));
  assert.ok(!fs.existsSync(removed));

  fs.rmSync(dir, { recursive: true, force: true });
});

test("verifyBackendSlices rejects duplicate slices in native mode", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "exo-mac-verify-"));
  writeOnedirSlice(dir, "backend-x64");
  writeOnedirSlice(dir, "backend-arm64");

  const nativeArch = process.arch === "arm64" ? "arm64" : "x64";
  const env = { EXO_MAC_UNIVERSAL: "0" };
  assert.equal(verifyBackendSlices(dir, { env, strictArch: false }), false);

  fs.rmSync(path.join(dir, backendSliceName(nativeArch === "arm64" ? "x64" : "arm64")), {
    recursive: true,
    force: true,
  });
  assert.equal(verifyBackendSlices(dir, { env, strictArch: false }), true);

  fs.rmSync(dir, { recursive: true, force: true });
});
