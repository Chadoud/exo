const test = require("node:test");
const assert = require("node:assert/strict");

const { shouldAttemptScreenCapture } = require("./screenCaptureGate");

test("shouldAttemptScreenCapture proceeds on not-determined and granted", () => {
  assert.equal(shouldAttemptScreenCapture("granted"), true);
  assert.equal(shouldAttemptScreenCapture("not-determined"), true);
});

test("shouldAttemptScreenCapture stops when denied or restricted", () => {
  assert.equal(shouldAttemptScreenCapture("denied"), false);
  assert.equal(shouldAttemptScreenCapture("restricted"), false);
});
