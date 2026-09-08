"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { describe, it, beforeEach, afterEach } = require("node:test");

const { getRememberDevice, setRememberDevice } = require("./cloudSessionPrefs");

/** @type {string} */
let tmp;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "exo-session-prefs-"));
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("cloudSessionPrefs", () => {
  it("defaults to signed-out on quit when no prefs file exists", () => {
    assert.equal(getRememberDevice(tmp), false);
  });

  it("returns true only after the user opts in", () => {
    setRememberDevice(tmp, true);
    assert.equal(getRememberDevice(tmp), true);
  });

  it("keeps an explicit opt-out", () => {
    setRememberDevice(tmp, false);
    assert.equal(getRememberDevice(tmp), false);
  });

  it("treats a missing rememberDevice key as opt-out", () => {
    fs.writeFileSync(path.join(tmp, "cloud_session_prefs.json"), JSON.stringify({}), "utf8");
    assert.equal(getRememberDevice(tmp), false);
  });
});
