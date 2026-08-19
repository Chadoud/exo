/**
 * Shared primary-screen capture for renderer IPC and the backend HTTP bridge.
 * Uses Electron desktopCapturer — macOS TCC entry is **EXO**, not Python.
 */

const { desktopCapturer, systemPreferences } = require("electron");
const { shouldAttemptScreenCapture } = require("./screenCaptureGate");

/** Full-screen JPEG for vision tools (web_agent, desktop nav). */
const VISION_THUMBNAIL = { width: 1920, height: 1080 };

/**
 * Capture the primary display as a JPEG buffer.
 *
 * @returns {Promise<{ ok: true, jpeg: Buffer } | { ok: false, error: string }>}
 */
async function capturePrimaryScreenJpeg() {
  if (process.platform === "darwin") {
    const status = systemPreferences.getMediaAccessStatus("screen");
    if (!shouldAttemptScreenCapture(status)) {
      return { ok: false, error: "screen_permission_denied" };
    }
  }

  try {
    const sources = await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize: VISION_THUMBNAIL,
    });
    if (!sources || sources.length === 0) {
      return { ok: false, error: "no_screen_source" };
    }
    const jpeg = sources[0].thumbnail.toJPEG(75);
    return { ok: true, jpeg };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}

module.exports = { capturePrimaryScreenJpeg, shouldAttemptScreenCapture, VISION_THUMBNAIL };
