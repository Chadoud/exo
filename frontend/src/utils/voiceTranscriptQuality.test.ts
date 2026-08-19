import { describe, expect, it } from "vitest";
import {
  appendStreamingVoiceInputTranscript,
  isJunkVoiceTranscript,
  isVoiceTranscriptNoisePlaceholder,
  shouldCommitVoiceUserTranscript,
} from "./voiceTranscriptQuality";

describe("voiceTranscriptQuality", () => {
  it("drops noise tags and comma fragments at turn_complete", () => {
    expect(isJunkVoiceTranscript("<noise>")).toBe(true);
    expect(isJunkVoiceTranscript(" Also,")).toBe(true);
    expect(isJunkVoiceTranscript(" Sure.")).toBe(false);
  });

  it("keeps short time answers at turn_complete", () => {
    expect(isJunkVoiceTranscript("midi")).toBe(false);
    expect(isJunkVoiceTranscript("à midi")).toBe(false);
    expect(isJunkVoiceTranscript("15h")).toBe(false);
  });

  it("keeps short partial STT while streaming", () => {
    expect(isVoiceTranscriptNoisePlaceholder("Peux-tu")).toBe(false);
    expect(isVoiceTranscriptNoisePlaceholder("<noise>")).toBe(true);
    let live = "";
    live = appendStreamingVoiceInputTranscript(live, "Peux-tu");
    live = appendStreamingVoiceInputTranscript(live, " me montrer mon calendrier.");
    expect(live.trim()).toBe("Peux-tu me montrer mon calendrier.");
  });

  it("keeps a richer snapshot when Gemini drops a proper noun", () => {
    const richer = "start sorting the files within Hilal files.";
    expect(
      appendStreamingVoiceInputTranscript(richer, "start sorting the files within files."),
    ).toBe(richer);
  });

  it("rejects briefing echo from an earlier assistant bubble (legacy path)", () => {
    const recent = [
      "The stock market is up, with the Dow higher and SpaceX seeing a significant jump on its debut.",
    ];
    expect(
      shouldCommitVoiceUserTranscript(
        "SpaceX seeing a significant jump on its debut",
        "",
        recent,
        { briefingActive: false, msSinceBriefingEnded: 10_000 },
      ),
    ).toBe(false);
  });

  it("blocks user commits while briefing is active", () => {
    expect(
      shouldCommitVoiceUserTranscript(
        "stop the briefing",
        "",
        [],
        { briefingActive: true, msSinceBriefingEnded: 10_000 },
      ),
    ).toBe(false);
  });
});
