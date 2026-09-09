// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import SettingsSyncSection from "./SettingsSyncSection";
import { I18nProvider } from "../../i18n/I18nContext";

describe("SettingsSyncSection", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    window.electronAPI = {
      syncGetStatus: vi.fn(async () => ({
        enabled: true,
        lastRunAt: null,
        lastSuccessfulSyncAt: null,
        lastError: null,
      })),
      syncSetEnabled: vi.fn(async () => ({ ok: true })),
      syncRunNow: vi.fn(async () => undefined),
    } as unknown as Window["electronAPI"];
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    window.electronAPI = undefined as unknown as Window["electronAPI"];
  });

  it("has no sync toggle and always shows Sync now when entitled", async () => {
    await act(async () => {
      root.render(
        <I18nProvider locale="en">
          <SettingsSyncSection canUseSync licensed onUpgrade={vi.fn()} />
        </I18nProvider>,
      );
    });
    expect(container.querySelector('[role="switch"]')).toBeNull();
    expect(container.textContent).toContain("Not synced yet");
    expect(container.textContent).toContain("Sync now");
    expect(container.textContent).toContain("Pair mobile device");
    const tile = container.querySelector("[data-exo-app-icon]");
    expect(tile).not.toBeNull();
    expect(tile?.className).toMatch(/bg-white/);
    expect(tile?.className).toMatch(/rounded-\[22%\]/);
    const logo = tile?.querySelector("img");
    expect(logo?.getAttribute("src") ?? "").toMatch(/exo-app-icon\.png/);
    expect(window.electronAPI?.syncSetEnabled).not.toHaveBeenCalled();
  });

  it("still shows last-run and Sync now when worker reports enabled false", async () => {
    window.electronAPI = {
      ...window.electronAPI,
      syncGetStatus: vi.fn(async () => ({
        enabled: false,
        lastRunAt: "2026-01-01T12:00:00.000Z",
        lastSuccessfulSyncAt: null,
        lastError: "sync_master_key_unreadable: unlock",
      })),
    } as unknown as Window["electronAPI"];
    await act(async () => {
      root.render(
        <I18nProvider locale="en">
          <SettingsSyncSection canUseSync licensed onUpgrade={vi.fn()} />
        </I18nProvider>,
      );
    });
    expect(container.querySelector('[role="switch"]')).toBeNull();
    expect(container.textContent).toContain("Sync now");
    expect(container.textContent).toContain("Sync issue:");
    expect(container.textContent).toContain("Pair mobile device");
  });

  it("surfaces pairing key copy when prefs are off after a prior sync", async () => {
    window.electronAPI = {
      ...window.electronAPI,
      syncGetStatus: vi.fn(async () => ({
        enabled: false,
        lastRunAt: "2026-01-01T12:00:00.000Z",
        lastSuccessfulSyncAt: "2026-01-01T12:00:00.000Z",
        lastError: "sync_master_key_unreadable: unlock",
      })),
      syncGetPairingQr: vi.fn(async () => ({ error: "sync_not_enabled" })),
    } as unknown as Window["electronAPI"];
    await act(async () => {
      root.render(
        <I18nProvider locale="en">
          <SettingsSyncSection canUseSync licensed onUpgrade={vi.fn()} />
        </I18nProvider>,
      );
    });
    expect(container.textContent).toContain("Pair mobile device");
    expect(container.textContent).toContain("Can't read the sync key");
    expect(container.textContent).toContain("Do not erase local data");
    expect(container.textContent).not.toContain("scan this QR");
  });

  it("shows a pairing QR without a retry control", async () => {
    const getQr = vi.fn(async () => ({
      dataUrl: "data:image/png;base64,xx",
      expiresAt: "2099-01-01T00:00:00.000Z",
    }));
    window.electronAPI = {
      ...window.electronAPI,
      syncGetStatus: vi.fn(async () => ({
        enabled: true,
        lastRunAt: "2026-01-01T12:00:00.000Z",
        lastSuccessfulSyncAt: "2026-01-01T12:00:00.000Z",
        lastError: null,
      })),
      syncGetPairingQr: getQr,
    } as unknown as Window["electronAPI"];
    await act(async () => {
      root.render(
        <I18nProvider locale="en">
          <SettingsSyncSection canUseSync licensed onUpgrade={vi.fn()} />
        </I18nProvider>,
      );
    });
    expect(container.textContent).toContain("scan this QR");
    expect(container.textContent).not.toContain("Retry QR");
    const qr = container.querySelector('img[alt="Pair mobile device"]');
    expect(qr?.getAttribute("src")).toBe("data:image/png;base64,xx");
    const before = getQr.mock.calls.length;
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(getQr.mock.calls.length).toBeGreaterThan(before);
  });

  it("asks the user to sign in again without a Retry QR control", async () => {
    window.electronAPI = {
      ...window.electronAPI,
      syncGetStatus: vi.fn(async () => ({
        enabled: true,
        lastRunAt: "2026-01-01T12:00:00.000Z",
        lastSuccessfulSyncAt: "2026-01-01T12:00:00.000Z",
        lastError: null,
      })),
      syncGetPairingQr: vi.fn(async () => ({ error: "invalid_token" })),
    } as unknown as Window["electronAPI"];
    await act(async () => {
      root.render(
        <I18nProvider locale="en">
          <SettingsSyncSection canUseSync licensed onUpgrade={vi.fn()} />
        </I18nProvider>,
      );
    });
    expect(container.textContent).toContain("Sign in again");
    expect(container.textContent).toContain("refresh on its own");
    expect(container.textContent).not.toContain("Retry QR");
  });

  it("hides the pairing QR when a later refresh fails", async () => {
    let failNext = false;
    const getQr = vi.fn(async () => {
      if (failNext) return { error: "invalid_token" };
      return {
        dataUrl: "data:image/png;base64,xx",
        expiresAt: "2099-01-01T00:00:00.000Z",
      };
    });
    window.electronAPI = {
      ...window.electronAPI,
      syncGetStatus: vi.fn(async () => ({
        enabled: true,
        lastRunAt: "2026-01-01T12:00:00.000Z",
        lastSuccessfulSyncAt: "2026-01-01T12:00:00.000Z",
        lastError: null,
      })),
      syncGetPairingQr: getQr,
    } as unknown as Window["electronAPI"];
    await act(async () => {
      root.render(
        <I18nProvider locale="en">
          <SettingsSyncSection canUseSync licensed onUpgrade={vi.fn()} />
        </I18nProvider>,
      );
    });
    expect(container.querySelector('img[alt="Pair mobile device"]')).not.toBeNull();
    failNext = true;
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(container.querySelector('img[alt="Pair mobile device"]')).toBeNull();
    expect(container.textContent).toContain("Sign in again");
  });

});
