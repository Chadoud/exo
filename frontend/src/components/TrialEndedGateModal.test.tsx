// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import TrialEndedGateModal from "./TrialEndedGateModal";
import { I18nProvider } from "../i18n/I18nContext";

describe("TrialEndedGateModal", () => {
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
    vi.useRealTimers();
  });

  it("has no dismiss affordance — no close icon, Esc and backdrop click are inert", async () => {
    const onEnterLicenseKey = vi.fn();
    window.electronAPI = { quitApp: vi.fn() } as unknown as Window["electronAPI"];
    await act(async () => {
      root.render(
        <I18nProvider locale="en">
          <TrialEndedGateModal onEnterLicenseKey={onEnterLicenseKey} />
        </I18nProvider>,
      );
    });

    expect(document.querySelector('[aria-label="Close"]')).toBeNull();

    const backdrop = document.querySelector(".fixed.inset-0") as HTMLElement;
    await act(async () => {
      backdrop.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();
  });

  it("omits the Quit button entirely when no quit bridge exists (web build)", async () => {
    window.electronAPI = undefined as unknown as Window["electronAPI"];
    await act(async () => {
      root.render(
        <I18nProvider locale="en">
          <TrialEndedGateModal onEnterLicenseKey={vi.fn()} />
        </I18nProvider>,
      );
    });
    expect(document.body.textContent).not.toContain("Quit");
    expect(document.body.textContent).toContain("Subscribe");
  });

  it("disables Quit synchronously so a second click cannot double-invoke the bridge", async () => {
    let resolveQuit: (() => void) | undefined;
    const quitApp = vi.fn(
      () =>
        new Promise<{ ok: boolean }>((resolve) => {
          resolveQuit = () => resolve({ ok: true });
        }),
    );
    window.electronAPI = { quitApp } as unknown as Window["electronAPI"];
    await act(async () => {
      root.render(
        <I18nProvider locale="en">
          <TrialEndedGateModal onEnterLicenseKey={vi.fn()} />
        </I18nProvider>,
      );
    });

    const quitButton = Array.from(document.querySelectorAll("button")).find(
      (b) => b.textContent === "Quit",
    ) as HTMLButtonElement;

    await act(async () => {
      quitButton.click();
      quitButton.click();
    });

    expect(quitApp).toHaveBeenCalledTimes(1);
    resolveQuit?.();
  });

  it("re-enables Quit with a fallback message if the IPC never resolves", async () => {
    vi.useFakeTimers();
    window.electronAPI = {
      quitApp: vi.fn(() => new Promise(() => {})),
    } as unknown as Window["electronAPI"];
    await act(async () => {
      root.render(
        <I18nProvider locale="en">
          <TrialEndedGateModal onEnterLicenseKey={vi.fn()} />
        </I18nProvider>,
      );
    });

    const quitButton = Array.from(document.querySelectorAll("button")).find(
      (b) => b.textContent === "Quit",
    ) as HTMLButtonElement;
    await act(async () => {
      quitButton.click();
    });
    expect(document.body.textContent).toContain("Quitting");

    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(document.body.textContent).toContain("Couldn't quit automatically");
  });

  it("routes the license-key link to the caller-provided handler", async () => {
    const onEnterLicenseKey = vi.fn();
    window.electronAPI = undefined as unknown as Window["electronAPI"];
    await act(async () => {
      root.render(
        <I18nProvider locale="en">
          <TrialEndedGateModal onEnterLicenseKey={onEnterLicenseKey} />
        </I18nProvider>,
      );
    });
    const link = Array.from(document.querySelectorAll("button")).find(
      (b) => b.textContent === "Enter license key instead",
    ) as HTMLButtonElement;
    await act(async () => {
      link.click();
    });
    expect(onEnterLicenseKey).toHaveBeenCalledTimes(1);
  });
});
