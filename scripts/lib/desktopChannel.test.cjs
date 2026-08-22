const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { isTestDesktopChannel, testDesktopChannelPayload } = require("./desktopChannel.cjs");

describe("desktopChannel", () => {
  it("defaults to production (not a test channel)", () => {
    assert.equal(isTestDesktopChannel({}), false);
    assert.equal(isTestDesktopChannel({ EXO_CHANNEL: "prod" }), false);
  });

  it("treats EXO_TEST_BUILD or EXO_CHANNEL=test as the tester channel", () => {
    assert.equal(isTestDesktopChannel({ EXO_TEST_BUILD: "1" }), true);
    assert.equal(isTestDesktopChannel({ EXO_CHANNEL: "test" }), true);
  });

  it("names the tester install Exo Test", () => {
    assert.deepEqual(testDesktopChannelPayload("1.1.73"), {
      channel: "test",
      displayName: "Exo Test",
      version: "1.1.73",
    });
  });
});
