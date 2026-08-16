"use strict";

const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { describe, it } = require("node:test");
const {
  materializedMirrorPath,
  deleteMaterializedGmailOAuthMirror,
  reconcileGmailOAuthMirrorAfterBackendExit,
  legacyHomeMirrorPath,
} = require("./gmailOAuthMirrorStore");

describe("gmailOAuthMirrorStore paths", () => {
  it("materializedMirrorPath lives under userData", () => {
    const userData = path.join(os.tmpdir(), "exo-user");
    assert.equal(
      materializedMirrorPath(userData),
      path.join(userData, "gmail_oauth.json"),
    );
  });

  it("legacyHomeMirrorPath uses ~/.ai-file-sorter", () => {
    assert.match(legacyHomeMirrorPath(), /\.ai-file-sorter[\\/]+gmail_oauth\.json$/);
  });
});

describe("reconcileGmailOAuthMirrorAfterBackendExit", () => {
  it("keeps an existing mirror when another process still holds the port", () => {
    const userData = fs.mkdtempSync(path.join(os.tmpdir(), "gmail-hold-"));
    const mirrorPath = materializedMirrorPath(userData);
    try {
      fs.writeFileSync(mirrorPath, '{"refresh_token":"rt"}', "utf8");
      reconcileGmailOAuthMirrorAfterBackendExit(userData, true);
      assert.equal(fs.readFileSync(mirrorPath, "utf8"), '{"refresh_token":"rt"}');
    } finally {
      fs.rmSync(userData, { recursive: true, force: true });
    }
  });

  it("wipes the mirror when the listen port is free", () => {
    const userData = fs.mkdtempSync(path.join(os.tmpdir(), "gmail-free-"));
    const mirrorPath = materializedMirrorPath(userData);
    try {
      fs.writeFileSync(mirrorPath, "{}", "utf8");
      reconcileGmailOAuthMirrorAfterBackendExit(userData, false);
      assert.ok(!fs.existsSync(mirrorPath));
    } finally {
      fs.rmSync(userData, { recursive: true, force: true });
    }
  });
});
