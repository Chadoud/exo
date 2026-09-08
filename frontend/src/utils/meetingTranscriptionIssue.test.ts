import { describe, expect, it } from "vitest";
import { issueFromGetUserMediaFailure } from "./meetingTranscriptionIssue";

describe("issueFromGetUserMediaFailure", () => {
  it("maps permission denials to mic_denied", () => {
    expect(issueFromGetUserMediaFailure(new DOMException("denied", "NotAllowedError"))).toBe(
      "mic_denied",
    );
    expect(issueFromGetUserMediaFailure(new DOMException("blocked", "SecurityError"))).toBe(
      "mic_denied",
    );
  });

  it("maps everything else to unavailable without using the message", () => {
    expect(
      issueFromGetUserMediaFailure(
        new Error("1007 None. models/gemini-2.5-flash-native-audio"),
      ),
    ).toBe("unavailable");
    expect(issueFromGetUserMediaFailure("not an error")).toBe("unavailable");
  });
});
