import { describe, expect, it } from "vitest";
import {
  assistantSpokeCodegenStudioIntent,
  shouldLaunchVoiceCodegenFallback,
} from "./voiceCodegenFallback";

describe("shouldLaunchVoiceCodegenFallback", () => {
  it("never launches from spoken words — admit door is server-side", () => {
    expect(
      shouldLaunchVoiceCodegenFallback(
        "Create a cool app for our demo",
        "Opening that in Codegen Studio now.",
        { toolName: null, toolSource: null, briefingSection: null },
      ),
    ).toBe(false);
    expect(
      shouldLaunchVoiceCodegenFallback(
        "how can I create a video for social media apps",
        "Opening that in Codegen Studio now.",
        { toolName: null, toolSource: null, briefingSection: null },
      ),
    ).toBe(false);
    expect(
      shouldLaunchVoiceCodegenFallback(
        "No, where is the fucking video you said you would make?",
        "Opening that in Codegen Studio now.",
        { toolName: null, toolSource: null, briefingSection: null },
      ),
    ).toBe(false);
  });
});

describe("assistantSpokeCodegenStudioIntent", () => {
  it("detects the scripted codegen acknowledgment", () => {
    expect(assistantSpokeCodegenStudioIntent("Opening that in Codegen Studio now.")).toBe(true);
  });
});
