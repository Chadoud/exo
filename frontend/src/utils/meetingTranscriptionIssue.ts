/** User-safe meeting STT failure — never carry Gemini / WebSocket text. */
export type MeetingTranscriptionIssue = "mic_denied" | "unavailable";

export function issueFromGetUserMediaFailure(err: unknown): MeetingTranscriptionIssue {
  if (
    err instanceof DOMException &&
    (err.name === "NotAllowedError" || err.name === "SecurityError")
  ) {
    return "mic_denied";
  }
  return "unavailable";
}
