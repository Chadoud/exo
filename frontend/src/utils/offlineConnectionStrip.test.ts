import { describe, expect, it } from "vitest";
import {
  shouldShowAppServiceStartupOverlay,
  shouldShowOfflineConnectionStrip,
} from "./offlineConnectionStrip";

describe("shouldShowOfflineConnectionStrip", () => {
  const base = {
    backendOnline: false,
    backendHealthProbing: false,
    isRunning: false,
    hasCurrentJob: false,
    lastHealthOkAt: null as number | null,
    graceMs: 30_000,
    now: 100_000,
  };

  it("hides when backend is online", () => {
    expect(shouldShowOfflineConnectionStrip({ ...base, backendOnline: true })).toBe(false);
  });

  it("hides during startup probing", () => {
    expect(shouldShowOfflineConnectionStrip({ ...base, backendHealthProbing: true })).toBe(false);
  });

  it("hides while the managed service is still starting", () => {
    expect(shouldShowOfflineConnectionStrip({ ...base, backendServiceStarting: true })).toBe(false);
  });

  it("hides while a sort job is running", () => {
    expect(shouldShowOfflineConnectionStrip({ ...base, isRunning: true })).toBe(false);
    expect(shouldShowOfflineConnectionStrip({ ...base, hasCurrentJob: true })).toBe(false);
  });

  it("hides within grace after last successful health", () => {
    expect(
      shouldShowOfflineConnectionStrip({
        ...base,
        lastHealthOkAt: 80_000,
      }),
    ).toBe(false);
  });

  it("hides on desktop managed app (startup overlay handles offline)", () => {
    expect(
      shouldShowOfflineConnectionStrip({
        ...base,
        isDesktopManaged: true,
      }),
    ).toBe(false);
  });

  it("hides when startup failed on desktop", () => {
    expect(
      shouldShowOfflineConnectionStrip({
        ...base,
        backendStartupFailed: true,
      }),
    ).toBe(false);
  });

  it("shows when offline beyond grace with no active job", () => {
    expect(
      shouldShowOfflineConnectionStrip({
        ...base,
        lastHealthOkAt: 10_000,
      }),
    ).toBe(true);
  });
});

describe("shouldShowAppServiceStartupOverlay", () => {
  it("shows on desktop while the local service is booting", () => {
    expect(
      shouldShowAppServiceStartupOverlay({
        isDesktopManaged: true,
        backendOnline: false,
        backendHealthProbing: true,
        backendServiceStarting: false,
      }),
    ).toBe(true);
  });

  it("hides once the service is online", () => {
    expect(
      shouldShowAppServiceStartupOverlay({
        isDesktopManaged: true,
        backendOnline: true,
        backendHealthProbing: false,
        backendServiceStarting: false,
      }),
    ).toBe(false);
  });

  it("shows recovery UI after startup failed", () => {
    expect(
      shouldShowAppServiceStartupOverlay({
        isDesktopManaged: true,
        backendOnline: false,
        backendHealthProbing: false,
        backendServiceStarting: false,
        backendStartupFailed: true,
      }),
    ).toBe(true);
  });

  it("hides a mid-session health flap after the service was already up", () => {
    expect(
      shouldShowAppServiceStartupOverlay({
        isDesktopManaged: true,
        backendOnline: false,
        backendHealthProbing: false,
        backendServiceStarting: true,
        lastHealthOkAt: 80_000,
      }),
    ).toBe(false);
  });

  it("still covers the window on Restart service after a prior healthy session", () => {
    expect(
      shouldShowAppServiceStartupOverlay({
        isDesktopManaged: true,
        backendOnline: false,
        backendHealthProbing: true,
        backendServiceStarting: true,
        lastHealthOkAt: 80_000,
      }),
    ).toBe(true);
  });

  it("covers the window on cold start before any successful health", () => {
    expect(
      shouldShowAppServiceStartupOverlay({
        isDesktopManaged: true,
        backendOnline: false,
        backendHealthProbing: false,
        backendServiceStarting: true,
        lastHealthOkAt: null,
      }),
    ).toBe(true);
  });

  it("covers the window after startup failed even if health succeeded earlier", () => {
    expect(
      shouldShowAppServiceStartupOverlay({
        isDesktopManaged: true,
        backendOnline: false,
        backendHealthProbing: false,
        backendServiceStarting: false,
        backendStartupFailed: true,
        lastHealthOkAt: 80_000,
      }),
    ).toBe(true);
  });
});
