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
    window.electronAPI = undefined as unknown as Window["electronAPI"];
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const render = async (props?: {
    onEnterLicenseKey?: () => void;
    onContinueLimited?: () => void;
  }) => {
    await act(async () => {
      root.render(
        <I18nProvider locale="en">
          <TrialEndedGateModal
            onEnterLicenseKey={props?.onEnterLicenseKey ?? vi.fn()}
            onContinueLimited={props?.onContinueLimited ?? vi.fn()}
          />
        </I18nProvider>,
      );
    });
  };

  it("has no implicit dismiss — no close icon, Esc and backdrop click are inert", async () => {
    await render();

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

  it("offers limited access as an explicit choice and routes it to the caller", async () => {
    const onContinueLimited = vi.fn();
    await render({ onContinueLimited });

    const continueButton = Array.from(document.querySelectorAll("button")).find(
      (b) => b.textContent === "Continue with limited access",
    ) as HTMLButtonElement;
    expect(continueButton).toBeTruthy();

    await act(async () => {
      continueButton.click();
    });
    expect(onContinueLimited).toHaveBeenCalledTimes(1);
  });

  it("always shows a subscribe path", async () => {
    await render();
    expect(document.body.textContent).toContain("Subscribe");
  });

  it("routes the license-key link to the caller-provided handler", async () => {
    const onEnterLicenseKey = vi.fn();
    await render({ onEnterLicenseKey });
    const link = Array.from(document.querySelectorAll("button")).find(
      (b) => b.textContent === "Enter license key instead",
    ) as HTMLButtonElement;
    await act(async () => {
      link.click();
    });
    expect(onEnterLicenseKey).toHaveBeenCalledTimes(1);
  });
});
