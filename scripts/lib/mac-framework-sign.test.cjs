const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");

const {
  flattenPythonFrameworks,
  normalizeFrameworkDir,
  normalizeFrameworksInTree,
} = require("./mac-framework-sign.cjs");

function makeFramework(root, { materialized = false } = {}) {
  const framework = path.join(root, "Python.framework");
  const versionDir = path.join(framework, "Versions", "3.11");
  fs.mkdirSync(versionDir, { recursive: true });
  fs.writeFileSync(path.join(versionDir, "Python"), "real-python");
  fs.mkdirSync(path.join(framework, "Resources"), { recursive: true });
  fs.writeFileSync(path.join(framework, "Resources", "empty.txt"), "x");
  if (materialized) {
    fs.writeFileSync(path.join(framework, "Python"), "stub");
    fs.mkdirSync(path.join(framework, "Versions", "Current"), { recursive: true });
    fs.writeFileSync(path.join(framework, "Versions", "Current", "Python"), "copy");
  }
  return framework;
}

test("normalizeFrameworkDir writes Info.plist and turns root entries into versioned symlinks", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "exo-fw-norm-"));
  try {
    const framework = makeFramework(dir, { materialized: true });
    const versionDir = normalizeFrameworkDir(framework);
    assert.equal(versionDir, path.join(framework, "Versions", "3.11"));
    assert.ok(fs.existsSync(path.join(versionDir, "Resources", "Info.plist")));
    assert.match(
      fs.readFileSync(path.join(versionDir, "Resources", "Info.plist"), "utf8"),
      /CFBundlePackageType/,
    );
    assert.ok(fs.lstatSync(path.join(framework, "Python")).isSymbolicLink());
    assert.ok(fs.lstatSync(path.join(framework, "Resources")).isSymbolicLink());
    assert.ok(fs.lstatSync(path.join(framework, "Versions", "Current")).isSymbolicLink());
    assert.equal(fs.readFileSync(path.join(framework, "Python"), "utf8"), "real-python");
    assert.ok(fs.existsSync(path.join(versionDir, "Resources", "empty.txt")));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("flattenPythonFrameworks replaces the framework with a real _internal/Python dylib", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "exo-fw-flat-"));
  try {
    const internals = path.join(dir, "_internal");
    fs.mkdirSync(internals, { recursive: true });
    const framework = makeFramework(internals);
    fs.symlinkSync(path.join("Python.framework", "Versions", "3.11", "Python"), path.join(internals, "Python"));
    assert.equal(flattenPythonFrameworks(dir), true);
    assert.ok(!fs.existsSync(framework));
    const dest = path.join(internals, "Python");
    assert.ok(!fs.lstatSync(dest).isSymbolicLink());
    assert.equal(fs.readFileSync(dest, "utf8"), "real-python");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("normalizeFrameworksInTree finds nested frameworks", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "exo-fw-tree-"));
  try {
    const slice = path.join(dir, "_internal");
    fs.mkdirSync(slice, { recursive: true });
    makeFramework(slice);
    const versionDirs = normalizeFrameworksInTree(dir);
    assert.equal(versionDirs.length, 1);
    assert.ok(versionDirs[0].endsWith(path.join("Versions", "3.11")));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
