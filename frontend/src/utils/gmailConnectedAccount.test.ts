import { describe, expect, it } from "vitest";
import { resolveGmailAccountLine } from "./gmailConnectedAccount";

describe("resolveGmailAccountLine", () => {
  it("hides the line when Gmail is disconnected", () => {
    expect(
      resolveGmailAccountLine({
        connected: false,
        email: "you@gmail.com",
        probeFailed: true,
      }),
    ).toEqual({ kind: "hidden" });
  });

  it("shows the mailbox when the probe returns an address", () => {
    expect(
      resolveGmailAccountLine({
        connected: true,
        email: "  you@gmail.com  ",
        probeFailed: false,
      }),
    ).toEqual({ kind: "address", email: "you@gmail.com" });
  });

  it("hides while connected and still waiting", () => {
    expect(
      resolveGmailAccountLine({
        connected: true,
        email: null,
        probeFailed: false,
      }),
    ).toEqual({ kind: "hidden" });
  });

  it("shows the fail copy when connected but the probe missed", () => {
    expect(
      resolveGmailAccountLine({
        connected: true,
        email: null,
        probeFailed: true,
      }),
    ).toEqual({ kind: "unknown" });
  });
});
