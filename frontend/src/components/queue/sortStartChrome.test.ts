import { describe, expect, it } from "vitest";
import { resolveSortStartChrome } from "./sortStartChrome";

describe("resolveSortStartChrome", () => {
  it("treats a live job as job even if starting leftover is true", () => {
    expect(
      resolveSortStartChrome({
        hasJob: true,
        starting: true,
        awaitingFirstJob: true,
        stoppedReason: "failed",
      }),
    ).toBe("job");
  });

  it("is in-flight while start is running or waiting for the first job card", () => {
    expect(
      resolveSortStartChrome({
        hasJob: false,
        starting: true,
        awaitingFirstJob: false,
        stoppedReason: null,
      }),
    ).toBe("inFlight");
    expect(
      resolveSortStartChrome({
        hasJob: false,
        starting: false,
        awaitingFirstJob: true,
        stoppedReason: null,
      }),
    ).toBe("inFlight");
  });

  it("does not treat a leftover file count as in-flight after start settled", () => {
    expect(
      resolveSortStartChrome({
        hasJob: false,
        starting: false,
        awaitingFirstJob: false,
        stoppedReason: "failed",
      }),
    ).toBe("stopped");
    expect(
      resolveSortStartChrome({
        hasJob: false,
        starting: false,
        awaitingFirstJob: false,
        stoppedReason: null,
      }),
    ).toBe("idle");
  });
});
