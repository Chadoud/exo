"use strict";

const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const {
  decideRestartRecovery,
  decideRestartSkip,
  decideStatusPollRecovery,
  shouldFreeBackendPort,
} = require("./backendPortRecovery");

describe("decideRestartRecovery", () => {
  it("does not free the port when /health is up after a failed managed wait", () => {
    const decision = decideRestartRecovery({ healthUp: true, waitSucceeded: false });
    assert.equal(decision.ok, true);
    assert.equal(decision.freePort, false);
  });

  it("frees the port only when /health is actually down", () => {
    const decision = decideRestartRecovery({ healthUp: false, waitSucceeded: false });
    assert.equal(decision.ok, false);
    assert.equal(decision.freePort, true);
  });

  it("keeps a successful wait without freeing", () => {
    const decision = decideRestartRecovery({ healthUp: true, waitSucceeded: true });
    assert.equal(decision.ok, true);
    assert.equal(decision.freePort, false);
  });
});

describe("decideRestartSkip", () => {
  it("skips kill/spawn when an unmanaged listener is already healthy", () => {
    const decision = decideRestartSkip({ healthUp: true, hasManagedChild: false });
    assert.equal(decision.skipRestart, true);
    assert.equal(decision.reason, "adopted_listener");
  });

  it("skips recycle when this app owns a healthy child", () => {
    const decision = decideRestartSkip({ healthUp: true, hasManagedChild: true });
    assert.equal(decision.skipRestart, true);
    assert.equal(decision.reason, "already_up");
  });

  it("does not skip when health is down", () => {
    const decision = decideRestartSkip({ healthUp: false, hasManagedChild: false });
    assert.equal(decision.skipRestart, false);
  });
});

describe("decideStatusPollRecovery", () => {
  it("never spawns a duplicate while a listener is still starting after a failed health probe", () => {
    const decision = decideStatusPollRecovery({ healthUp: false, listenerCount: 1 });
    assert.equal(decision.spawn, false);
    assert.equal(decision.reason, "starting");
  });

  it("spawns only when the port is free and health is down", () => {
    const decision = decideStatusPollRecovery({ healthUp: false, listenerCount: 0 });
    assert.equal(decision.spawn, true);
  });

  it("is ok when health is up", () => {
    const decision = decideStatusPollRecovery({ healthUp: true, listenerCount: 1 });
    assert.equal(decision.ok, true);
  });
});

describe("shouldFreeBackendPort", () => {
  it("refuses to kill a listener that still serves /health", () => {
    assert.equal(shouldFreeBackendPort({ healthUp: true }), false);
  });

  it("allows a boot-time force clear even if health is up", () => {
    assert.equal(shouldFreeBackendPort({ healthUp: true, force: true }), true);
  });

  it("allows free when health is down", () => {
    assert.equal(shouldFreeBackendPort({ healthUp: false }), true);
  });
});
