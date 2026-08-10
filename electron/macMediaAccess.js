/**
 * macOS microphone TCC prompt handling.
 *
 * Chromium's permission-request "allow" is not enough on macOS: the system
 * prompt only appears when the app explicitly asks via AVFoundation. Without
 * this, unsigned builds end up with a silently dead mic (getUserMedia opens a
 * stream that delivers silence) after every reinstall, because ad-hoc
 * signatures give each build a fresh TCC identity.
 */

/**
 * @param {{ getMediaAccessStatus: (type: string) => string, askForMediaAccess: (type: string) => Promise<boolean> }} systemPreferences
 * @returns {Promise<boolean>} whether mic capture may proceed
 */
async function ensureMacMicrophoneAccess(systemPreferences) {
  if (process.platform !== "darwin") return true;
  try {
    const status = systemPreferences.getMediaAccessStatus("microphone");
    if (status === "granted") return true;
    if (status === "not-determined") {
      return await systemPreferences.askForMediaAccess("microphone");
    }
    // denied / restricted: only the user can flip it back.
    console.warn(
      `[main] microphone access is "${status}" — enable Exo under System Settings → Privacy & Security → Microphone`,
    );
    return false;
  } catch (err) {
    // Never let a preferences API failure hard-disable voice.
    console.warn("[main] microphone access check failed:", err && err.message);
    return true;
  }
}

module.exports = { ensureMacMicrophoneAccess };
