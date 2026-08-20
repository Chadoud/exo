import { describe, expect, it } from "vitest";
import { isLocalAssistantReady, shouldNotifyJobPollError } from "./localAssistantReady";

describe("isLocalAssistantReady", () => {
  it("requires a live service that is not starting", () => {
    expect(isLocalAssistantReady({ backendOnline: true })).toBe(true);
    expect(isLocalAssistantReady({ backendOnline: false })).toBe(false);
    expect(isLocalAssistantReady({ backendOnline: true, backendHealthProbing: true })).toBe(false);
    expect(isLocalAssistantReady({ backendOnline: true, backendServiceStarting: true })).toBe(false);
  });
});

describe("shouldNotifyJobPollError", () => {
  it("stays quiet while the wait overlay is already showing", () => {
    expect(shouldNotifyJobPollError({ backendOnline: true })).toBe(true);
    expect(shouldNotifyJobPollError({ backendOnline: false })).toBe(false);
    expect(shouldNotifyJobPollError({ backendOnline: true, backendHealthProbing: true })).toBe(false);
    expect(shouldNotifyJobPollError({ backendOnline: true, backendServiceStarting: true })).toBe(false);
  });
});
