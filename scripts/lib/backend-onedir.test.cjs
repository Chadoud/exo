const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");

const {
  nestedBackendExecutable,
  resolveBackendInSlice,
  stageOnedirDirectory,
  collectMachOFilesDeepestFirst,
  isFrameworkShortcutPath,
  isInsideFramework,
  repairFrameworkShortcuts,
  codesignArgs,
} = require("./backend-onedir.cjs");

test("nestedBackendExecutable uses platform-specific launcher name", () => {
  assert.equal(
    nestedBackendExecutable("/tmp/slice", "darwin"),
    path.join("/tmp/slice", "backend"),
  );
  assert.equal(
    nestedBackendExecutable("/tmp/slice", "win32"),
    path.join("/tmp/slice", "backend.exe"),
  );
});

test("resolveBackendInSlice supports onedir and legacy one-file", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "exo-onedir-"));
  try {
    const slice = path.join(dir, "backend-arm64");
    fs.mkdirSync(slice);
    const exe = path.join(slice, "backend");
    fs.writeFileSync(exe, "x");
    assert.equal(resolveBackendInSlice(slice, "darwin"), exe);

    const legacy = path.join(dir, "legacy");
    fs.writeFileSync(legacy, "y");
    assert.equal(resolveBackendInSlice(legacy, "darwin"), legacy);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test(
  "collectMachOFilesDeepestFirst skips framework symlinks, keeping only the real binary",
  { skip: process.platform !== "darwin" && "Mach-O detection only applies on macOS" },
  () => {
    // Mirrors Python.framework: Python -> Versions/Current/Python -> Versions/3.x/Python.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "exo-macho-"));
    try {
      const framework = path.join(dir, "Python.framework");
      const versionDir = path.join(framework, "Versions", "3.13");
      fs.mkdirSync(versionDir, { recursive: true });
      const realBinary = path.join(versionDir, "Python");
      fs.copyFileSync(process.execPath, realBinary);
      fs.symlinkSync("3.13", path.join(framework, "Versions", "Current"));
      fs.symlinkSync(path.join("Versions", "Current", "Python"), path.join(framework, "Python"));

      const found = collectMachOFilesDeepestFirst(dir);
      assert.ok(found.includes(realBinary), "real framework binary must be signed");
      assert.ok(
        !found.includes(path.join(framework, "Python")),
        "framework symlink must never be codesigned directly (bundle format is ambiguous)",
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  },
);

test("isFrameworkShortcutPath skips materialized Python.framework/Python", () => {
  assert.equal(isFrameworkShortcutPath("/slice/_internal/Python.framework/Python"), true);
  assert.equal(
    isFrameworkShortcutPath("/slice/_internal/Python.framework/Versions/Current/Python"),
    true,
  );
  assert.equal(
    isFrameworkShortcutPath("/slice/_internal/Python.framework/Versions/3.11/Python"),
    false,
  );
  assert.equal(isFrameworkShortcutPath("/slice/_internal/Python.framework/Versions"), false);
  assert.equal(isFrameworkShortcutPath("/slice/_internal/Python.framework/Resources"), false);
});

test(
  "collectMachOFilesDeepestFirst skips a regular-file Python.framework/Python stub",
  { skip: process.platform !== "darwin" && "Mach-O detection only applies on macOS" },
  () => {
    // CI can materialize the shortcut as a real Mach-O; lstat then does not skip it.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "exo-macho-file-"));
    try {
      const framework = path.join(dir, "Python.framework");
      const versionDir = path.join(framework, "Versions", "3.11");
      fs.mkdirSync(versionDir, { recursive: true });
      const realBinary = path.join(versionDir, "Python");
      fs.copyFileSync(process.execPath, realBinary);
      fs.copyFileSync(process.execPath, path.join(framework, "Python"));
      fs.mkdirSync(path.join(framework, "Versions", "Current"), { recursive: true });
      fs.copyFileSync(process.execPath, path.join(framework, "Versions", "Current", "Python"));

      const found = collectMachOFilesDeepestFirst(dir);
      assert.ok(found.includes(realBinary), "real framework binary must be signed");
      assert.ok(
        !found.includes(path.join(framework, "Python")),
        "materialized framework stub must never be codesigned (bundle format is ambiguous)",
      );
      assert.ok(
        !found.includes(path.join(framework, "Versions", "Current", "Python")),
        "Versions/Current must not be signed when the real Versions/3.x binary exists",
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  },
);

test("repairFrameworkShortcuts turns materialized stubs back into relative symlinks", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "exo-fw-repair-"));
  try {
    const framework = path.join(dir, "Python.framework");
    const versionDir = path.join(framework, "Versions", "3.11");
    fs.mkdirSync(versionDir, { recursive: true });
    fs.writeFileSync(path.join(versionDir, "Python"), "real");
    fs.mkdirSync(path.join(framework, "Versions", "Current"), { recursive: true });
    fs.writeFileSync(path.join(framework, "Versions", "Current", "Python"), "copy");
    fs.writeFileSync(path.join(framework, "Python"), "stub");

    repairFrameworkShortcuts(dir);
    const top = path.join(framework, "Python");
    const current = path.join(framework, "Versions", "Current");
    assert.ok(fs.lstatSync(top).isSymbolicLink());
    assert.ok(fs.lstatSync(current).isSymbolicLink());
    assert.equal(fs.readFileSync(top, "utf8"), "real");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("codesignArgs omits entitlements for framework targets", () => {
  assert.equal(isInsideFramework("/slice/_internal/Python.framework/Versions/3.11/Python"), true);
  assert.equal(isInsideFramework("/slice/backend"), false);
  const withEnts = codesignArgs("ID", "/slice/backend", "/ents.plist");
  assert.ok(withEnts.includes("--entitlements"));
  const noEnts = codesignArgs("ID", "/slice/Python.framework", null);
  assert.ok(!noEnts.includes("--entitlements"));
});

test("stageOnedirDirectory replaces destination with a fresh copy", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "exo-stage-"));
  try {
    const src = path.join(dir, "src");
    const dest = path.join(dir, "dest");
    fs.mkdirSync(src);
    fs.writeFileSync(path.join(src, "backend"), "new");
    fs.writeFileSync(path.join(src, "extra.txt"), "keep");
    fs.mkdirSync(dest);
    fs.writeFileSync(path.join(dest, "stale.txt"), "old");

    stageOnedirDirectory(src, dest);
    assert.equal(fs.readFileSync(path.join(dest, "backend"), "utf8"), "new");
    assert.ok(fs.existsSync(path.join(dest, "extra.txt")));
    assert.ok(!fs.existsSync(path.join(dest, "stale.txt")));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
