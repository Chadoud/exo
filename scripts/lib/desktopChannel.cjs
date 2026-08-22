/**
 * Desktop install channel. Default (unset) stays "Exo" so v* / promote binaries
 * are never renamed. Test channel is opt-in via EXO_TEST_BUILD or EXO_CHANNEL=test.
 */

function envFlagOn(raw) {
  return ["1", "true", "yes", "on"].includes(String(raw || "").trim().toLowerCase());
}

/** @param {NodeJS.ProcessEnv} [env] */
function isTestDesktopChannel(env = process.env) {
  if (envFlagOn(env.EXO_TEST_BUILD)) return true;
  return String(env.EXO_CHANNEL || "").trim().toLowerCase() === "test";
}

/**
 * @param {string} [version]
 * @returns {{ channel: "test"; displayName: "Exo Test"; version: string }}
 */
function testDesktopChannelPayload(version) {
  return {
    channel: "test",
    displayName: "Exo Test",
    version: String(version || ""),
  };
}

module.exports = {
  isTestDesktopChannel,
  testDesktopChannelPayload,
};
