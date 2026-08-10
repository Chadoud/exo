const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { resolvePackagedBackendBin } = require("./packagedBackendPath");

function writeNested(root, sliceName, exeName = "backend") {
  const dir = path.join(root, sliceName);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, exeName), "");
  return path.join(dir, exeName);
}

test("resolvePackagedBackendBin picks arch onedir slice on macOS", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "exo-backend-"));
  try {
    const x64 = writeNested(root, "backend-x64");
    const arm64 = writeNested(root, "backend-arm64");
    assert.equal(resolvePackagedBackendBin(root, "darwin", "x64"), x64);
    assert.equal(resolvePackagedBackendBin(root, "darwin", "arm64"), arm64);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("resolvePackagedBackendBin falls back to legacy one-file backend on macOS", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "exo-backend-"));
  try {
    const legacy = path.join(root, "backend");
    fs.writeFileSync(legacy, "");
    assert.equal(resolvePackagedBackendBin(root, "darwin", "x64"), legacy);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("resolvePackagedBackendBin prefers nested Windows onedir over flat exe", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "exo-backend-"));
  try {
    const nested = writeNested(root, "backend", "backend.exe");
    fs.writeFileSync(path.join(root, "backend.exe"), "");
    assert.equal(resolvePackagedBackendBin(root, "win32", "x64"), nested);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("resolvePackagedBackendBin falls back to flat Windows backend.exe", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "exo-backend-"));
  try {
    const legacy = path.join(root, "backend.exe");
    fs.writeFileSync(legacy, "");
    assert.equal(resolvePackagedBackendBin(root, "win32", "x64"), legacy);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
