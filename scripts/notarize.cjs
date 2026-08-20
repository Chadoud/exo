/**
 * electron-builder `afterSign` hook: re-sign backend slices in the packaged
 * app (copy/merge can break Python.framework), then notarize with Apple.
 *
 * Notarize runs only when ALL of these are present:
 *   APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID
 *
 * Without them (local dev, unsigned CI), this is a no-op so the unsigned build
 * keeps working. `@electron/notarize` is required lazily, after the credential
 * check, so the dependency is only needed on real release runners.
 */
const path = require("path");
const { resignPackagedBackendSlices } = require("./lib/backend-onedir.cjs");

function resignSlicesIfIdentity(appPath) {
  const identity = process.env.MAC_SIGN_IDENTITY || process.env.CSC_NAME;
  if (!identity) return;
  const entitlements = path.join(__dirname, "..", "electron", "entitlements.mac.plist");
  resignPackagedBackendSlices(appPath, identity, entitlements);
}

exports.default = async function notarize(context) {
  const { electronPlatformName, appOutDir } = context;
  if (electronPlatformName !== "darwin") {
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = `${appOutDir}/${appName}.app`;
  resignSlicesIfIdentity(appPath);

  const appleId = process.env.APPLE_ID;
  const appleIdPassword = process.env.APPLE_APP_SPECIFIC_PASSWORD;
  const teamId = process.env.APPLE_TEAM_ID;
  if (!appleId || !appleIdPassword || !teamId) {
    console.log("[notarize] Apple credentials not set — skipping notarization (unsigned build).");
    return;
  }

  const { notarize } = require("@electron/notarize");

  console.log(`[notarize] Submitting ${appPath} to Apple notary service…`);
  await notarize({
    appBundleId: "com.exo.app",
    appPath,
    appleId,
    appleIdPassword,
    teamId,
  });
  console.log("[notarize] Notarization complete.");
};
