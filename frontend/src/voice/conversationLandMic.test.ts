import { describe, expect, it } from "vitest";
import { conversationLandMicAction } from "./conversationLandMic";

describe("conversationLandMicAction", () => {
  it("holds the mute in push-to-talk", () => {
    expect(
      conversationLandMicAction({
        mode: "pushToTalk",
        isListening: true,
        offerPhase: "offering",
      }),
    ).toBe("hold");
  });

  it("holds when the session is not listening", () => {
    expect(
      conversationLandMicAction({
        mode: "conversation",
        isListening: false,
        offerPhase: "offering",
      }),
    ).toBe("hold");
  });

  it("unmutes as soon as the briefing card is up", () => {
    expect(
      conversationLandMicAction({
        mode: "conversation",
        isListening: true,
        offerPhase: "offering",
      }),
    ).toBe("unmute");
  });

  it("unmutes while the briefing is loading or failed", () => {
    expect(
      conversationLandMicAction({
        mode: "conversation",
        isListening: true,
        offerPhase: "loading",
      }),
    ).toBe("unmute");
    expect(
      conversationLandMicAction({
        mode: "conversation",
        isListening: true,
        offerPhase: "error",
      }),
    ).toBe("unmute");
  });

  it("waits briefly on idle so a pending offer frame can arrive", () => {
    expect(
      conversationLandMicAction({
        mode: "conversation",
        isListening: true,
        offerPhase: "idle",
      }),
    ).toBe("unmute_after_grace");
  });
});
