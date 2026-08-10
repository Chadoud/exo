const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");

const {
  nestedBackendExecutable,
  resolveBackendInSlice,
  stageOnedirDirectory,
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
