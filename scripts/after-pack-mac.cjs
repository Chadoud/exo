/**
 * electron-builder afterPack: flatten/sign backend slices before the app is
 * sealed. afterSign must not rewrite those files (breaks the app signature).
 */
const path = require("path");
const { resignPackagedBackendSlices } = require("./lib/backend-onedir.cjs");

exports.default = async function afterPackMac(context) {
  if (context.electronPlatformName !== "darwin") return;
  const identity = process.env.MAC_SIGN_IDENTITY || process.env.CSC_NAME;
  if (!identity) return;
  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(context.appOutDir, `${appName}.app`);
  const entitlements = path.join(__dirname, "..", "electron", "entitlements.mac.plist");
  resignPackagedBackendSlices(appPath, identity, entitlements);
};
