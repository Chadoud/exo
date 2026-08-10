// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import TrialLifecycleModalHost from "./TrialLifecycleModalHost";
import { I18nProvider } from "../i18n/I18nContext";
import type { EntitlementStatus } from "../api";
import { TRIAL_ENDING_NUDGE_SEEN_STORAGE_KEY } from "../constants";

function ent(overrides: Partial<EntitlementStatus>): EntitlementStatus {
  return {
    trialActive: true,
    trialStartedAt: null,
    trialEndsAt: null,
    trialDaysRemaining: 7,
    trialExpired: false,
    licensed: false,
    licenseReason: null,
    canAnalyze: true,
    hasLicenseKey: false,
    ...overrides,
  };
}

describe("TrialLifecycleModalHost", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    localStorage.removeItem(TRIAL_ENDING_NUDGE_SEEN_STORAGE_KEY);
    window.electronAPI = undefined as unknown as Window["electronAPI"];
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("renders nothing before entitlement has loaded", async () => {
    await act(async () => {
      root.render(
        <I18nProvider locale="en">
          <TrialLifecycleModalHost
            entitlement={null}
            activeTab="exo"
            openPrimarySettings={vi.fn()}
          />
        </I18nProvider>,
      );
    });
    expect(container.textContent).toBe("");
  });

  it("shows the nudge once, and never again after it is marked seen", async () => {
    await act(async () => {
      root.render(
        <I18nProvider locale="en">
          <TrialLifecycleModalHost
            entitlement={ent({ trialDaysRemaining: 2 })}
            activeTab="exo"
            openPrimarySettings={vi.fn()}
          />
        </I18nProvider>,
      );
    });
    expect(document.body.textContent).toContain("Continue with free trial");
    expect(localStorage.getItem(TRIAL_ENDING_NUDGE_SEEN_STORAGE_KEY)).toBe("1");

    // Re-render with a fresh mount, same eligible entitlement — must not reappear.
    await act(async () => root.unmount());
    root = createRoot(container);
    await act(async () => {
      root.render(
        <I18nProvider locale="en">
          <TrialLifecycleModalHost
            entitlement={ent({ trialDaysRemaining: 1 })}
            activeTab="exo"
            openPrimarySettings={vi.fn()}
          />
        </I18nProvider>,
      );
    });
    expect(document.body.textContent).not.toContain("Continue with free trial");
  });

  it("shows the gate when the trial has expired", async () => {
    await act(async () => {
      root.render(
        <I18nProvider locale="en">
          <TrialLifecycleModalHost
            entitlement={ent({ trialExpired: true, trialActive: false })}
            activeTab="exo"
            openPrimarySettings={vi.fn()}
          />
        </I18nProvider>,
      );
    });
    expect(document.body.textContent).toContain("Your free trial has ended");
  });

  it("hides the gate while the user is on the Settings tab so they can reach the license field", async () => {
    await act(async () => {
      root.render(
        <I18nProvider locale="en">
          <TrialLifecycleModalHost
            entitlement={ent({ trialExpired: true, trialActive: false })}
            activeTab="settings"
            openPrimarySettings={vi.fn()}
          />
        </I18nProvider>,
      );
    });
    expect(document.body.textContent).not.toContain("Your free trial has ended");
  });

  it("routes the license-key link through openPrimarySettings('license')", async () => {
    const openPrimarySettings = vi.fn();
    await act(async () => {
      root.render(
        <I18nProvider locale="en">
          <TrialLifecycleModalHost
            entitlement={ent({ trialExpired: true, trialActive: false })}
            activeTab="exo"
            openPrimarySettings={openPrimarySettings}
          />
        </I18nProvider>,
      );
    });
    const link = Array.from(document.querySelectorAll("button")).find(
      (b) => b.textContent === "Enter license key instead",
    ) as HTMLButtonElement;
    await act(async () => {
      link.click();
    });
    expect(openPrimarySettings).toHaveBeenCalledWith("license");
  });

  it("shows nothing for licensed or unlimited-build users even if trial fields say expired", async () => {
    await act(async () => {
      root.render(
        <I18nProvider locale="en">
          <TrialLifecycleModalHost
            entitlement={ent({ trialExpired: true, licensed: true })}
            activeTab="exo"
            openPrimarySettings={vi.fn()}
          />
        </I18nProvider>,
      );
    });
    expect(container.textContent).toBe("");
  });
});
