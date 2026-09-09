import { describe, expect, it } from "vitest";
import { splitMeetingNoteLine } from "./meetingNoteLine";

describe("splitMeetingNoteLine", () => {
  it("splits speaker labels from note text", () => {
    expect(splitMeetingNoteLine("Speaker 1: Hello team")).toEqual({
      speaker: "Speaker 1",
      text: "Hello team",
    });
    expect(splitMeetingNoteLine("Alex: I'll send the deck")).toEqual({
      speaker: "Alex",
      text: "I'll send the deck",
    });
  });

  it("leaves unlabeled notes intact", () => {
    expect(splitMeetingNoteLine("just a typed point")).toEqual({
      speaker: null,
      text: "just a typed point",
    });
  });
});
