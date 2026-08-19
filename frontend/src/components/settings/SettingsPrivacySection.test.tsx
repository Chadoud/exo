// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import SettingsPrivacySection from "./SettingsPrivacySection";
import { I18nProvider } from "../../i18n/I18nContext";
import type { AppSettings } from "../../types/settings";
import { DEFAULT_APP_SETTINGS } from "../../hooks/useAppSettings";

const baseSettings: AppSettings = {
  ...DEFAULT_APP_SETTINGS,
  telemetryOptIn: true,
  crashReportsOptIn: true,
};

describe("SettingsPrivacySection", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("renders diagnostics objection toggles", async () => {
    const onSettingsPatch = vi.fn();
    await act(async () => {
      root.render(
        <I18nProvider locale="en">
          <SettingsPrivacySection
            settings={baseSettings}
            onSettingsPatch={onSettingsPatch}
            backendOnline
          />
        </I18nProvider>,
      );
    });
    expect(container.textContent).toContain("Usage analytics");
    expect(container.textContent).toContain("Crash reports");
    expect(container.textContent).toContain("periodically reads recent inbox threads");
    const boxes = container.querySelectorAll('input[type="checkbox"]');
    expect(boxes.length).toBeGreaterThanOrEqual(2);
  });

  it("calls onSettingsPatch when usage analytics is unchecked", async () => {
    const onSettingsPatch = vi.fn();
    await act(async () => {
      root.render(
        <I18nProvider locale="en">
          <SettingsPrivacySection
            settings={baseSettings}
            onSettingsPatch={onSettingsPatch}
            backendOnline
          />
        </I18nProvider>,
      );
    });
    const analyticsBox = container.querySelectorAll('input[type="checkbox"]')[0] as HTMLInputElement;
    await act(async () => {
      analyticsBox.click();
    });
    expect(onSettingsPatch).toHaveBeenCalledWith({ telemetryOptIn: false });
  });

  it("shows local wipe confirm label after first click", async () => {
    await act(async () => {
      root.render(
        <I18nProvider locale="en">
          <SettingsPrivacySection
            settings={baseSettings}
            onSettingsPatch={vi.fn()}
            backendOnline
          />
        </I18nProvider>,
      );
    });
    const wipeBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Erase this account"),
    );
    expect(wipeBtn).toBeTruthy();
    await act(async () => {
      wipeBtn?.click();
    });
    expect(container.textContent).toContain("Confirm erase");
  });

  it("does not offer erasing other accounts on this Mac", async () => {
    await act(async () => {
      root.render(
        <I18nProvider locale="en">
          <SettingsPrivacySection
            settings={baseSettings}
            onSettingsPatch={vi.fn()}
            backendOnline
          />
        </I18nProvider>,
      );
    });
    expect(container.textContent).toContain("Erase this account");
    expect(container.textContent).not.toContain("Erase all local accounts");
    expect(container.textContent).not.toContain("Erase all accounts on this Mac");
  });
});
