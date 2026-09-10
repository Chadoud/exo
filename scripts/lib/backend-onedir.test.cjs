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
  detachFrameworkTopExec,
  codesignArgs,
  resignPackagedBackendSlices,
  runCodesign,
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

test("detachFrameworkTopExec removes the ambiguous Foo.framework/Foo stub", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "exo-fw-detach-"));
  try {
    const framework = path.join(dir, "Python.framework");
    const versionDir = path.join(framework, "Versions", "3.11");
    fs.mkdirSync(versionDir, { recursive: true });
    fs.writeFileSync(path.join(versionDir, "Python"), "real");
    repairFrameworkShortcuts(dir);
    assert.ok(fs.existsSync(path.join(framework, "Python")));
    detachFrameworkTopExec(dir);
    assert.ok(!fs.existsSync(path.join(framework, "Python")));
    assert.ok(fs.existsSync(path.join(versionDir, "Python")));
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

test("resignPackagedBackendSlices is a no-op when the app has no backend slices", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "exo-resign-"));
  try {
    fs.mkdirSync(path.join(dir, "Contents", "Resources"), { recursive: true });
    resignPackagedBackendSlices(dir, "ID", "/ents.plist");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
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

/**
 * A slice signs hundreds of files, each one contacting Apple's timestamp
 * service, so a single blip there must not discard the whole release build.
 */
function withFakeCodesign(script, run) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "exo-codesign-"));
  const counter = path.join(dir, "calls");
  fs.writeFileSync(counter, "");
  const fake = path.join(dir, "codesign");
  fs.writeFileSync(fake, script.replace(/__COUNTER__/g, counter), { mode: 0o755 });
  const previousPath = process.env.PATH;
  process.env.PATH = `${dir}${path.delimiter}${previousPath}`;
  try {
    return run(() => fs.readFileSync(counter, "utf8").trim().split("\n").filter(Boolean).length);
  } finally {
    process.env.PATH = previousPath;
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test("runCodesign retries when the Apple timestamp service is unavailable", () => {
  const script = [
    "#!/bin/sh",
    'echo call >> "__COUNTER__"',
    'if [ "$(wc -l < "__COUNTER__")" -lt 3 ]; then',
    '  echo "target: The timestamp service is not available." >&2',
    "  exit 1",
    "fi",
    "exit 0",
  ].join("\n");

  withFakeCodesign(script, (calls) => {
    runCodesign(["--sign", "id", "/tmp/target"], { backoffMs: 1 });
    assert.equal(calls(), 3, "should retry past the transient failures");
  });
});

test("runCodesign gives up on failures that are not the timestamp service", () => {
  const script = [
    "#!/bin/sh",
    'echo call >> "__COUNTER__"',
    'echo "target: bundle format is ambiguous" >&2',
    "exit 1",
  ].join("\n");

  withFakeCodesign(script, (calls) => {
    assert.throws(() => runCodesign(["--sign", "id", "/tmp/target"], { backoffMs: 1 }));
    assert.equal(calls(), 1, "a real signing error must fail on the first attempt");
  });
});
