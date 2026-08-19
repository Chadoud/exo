/**
 * macOS Screen Recording: denied/restricted cannot show a prompt.
 * not-determined must still call desktopCapturer so the OS can ask.
 * @param {string} status
 * @returns {boolean}
 */
function shouldAttemptScreenCapture(status) {
  return status !== "denied" && status !== "restricted";
}

module.exports = { shouldAttemptScreenCapture };
