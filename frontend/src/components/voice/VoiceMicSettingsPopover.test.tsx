// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { I18nProvider } from "../../i18n/I18nContext";
import { DEFAULT_APP_SETTINGS } from "../../settings/appSettingsHydration";
import { VoiceMicSettingsPopover } from "./VoiceMicSettingsPopover";

describe("VoiceMicSettingsPopover", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
        unobserve() {}
      },
    );
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  const renderPopover = async (onOpenFullVoiceSettings?: () => void) => {
    await act(async () => {
      root.render(
        <I18nProvider locale="en">
          <VoiceMicSettingsPopover
            settings={DEFAULT_APP_SETTINGS}
            onSettingsPatch={vi.fn()}
            onOpenFullVoiceSettings={onOpenFullVoiceSettings}
          />
        </I18nProvider>,
      );
    });
    return container.querySelector("button") as HTMLButtonElement;
  };

  const openWithClick = async (trigger: HTMLButtonElement, detail: number) => {
    await act(async () => {
      trigger.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail }));
    });
  };

  it("keeps the title sticky and the full-settings action in a persistent footer", async () => {
    const trigger = await renderPopover(vi.fn());
    await openWithClick(trigger, 1);

    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.hasAttribute("aria-modal")).toBe(false);
    expect(trigger.getAttribute("aria-haspopup")).toBe("dialog");
    expect(dialog?.className).toMatch(/overflow-hidden/);
    expect(dialog?.className).toMatch(/flex-col/);

    const heading = dialog?.querySelector("h2");
    expect(heading?.textContent).toContain("Microphone settings");
    const header = heading?.parentElement;
    expect(header?.className).toMatch(/shrink-0/);
    const close = header?.querySelector('[aria-label="Close"]');
    expect(close).not.toBeNull();
    expect(close?.className).toMatch(/min-h-11/);
    expect(close?.className).toMatch(/min-w-11/);

    const body = header?.nextElementSibling;
    expect(body?.className).toMatch(/overflow-y-auto/);
    expect(body?.textContent).not.toContain("Open all voice settings");

    const footer = body?.nextElementSibling;
    expect(footer?.className).toMatch(/shrink-0/);
    expect(footer?.textContent).toContain("Open all voice settings");
  });

  it("returns focus to the gear after Escape", async () => {
    const trigger = await renderPopover();
    trigger.focus();
    await openWithClick(trigger, 0);
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("does not move focus back to the gear on outside click", async () => {
    const outside = document.createElement("button");
    outside.type = "button";
    outside.textContent = "outside";
    document.body.appendChild(outside);

    const trigger = await renderPopover();
    await openWithClick(trigger, 1);
    const radio = document.querySelector('input[type="radio"]:checked') as HTMLInputElement;
    radio.focus();
    expect(document.activeElement).toBe(radio);

    await act(async () => {
      outside.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).not.toBe(trigger);
    outside.remove();
  });

  it("moves keyboard-open focus to the checked mode radio", async () => {
    const trigger = await renderPopover();
    await openWithClick(trigger, 0);
    const radio = document.querySelector('input[type="radio"]:checked');
    expect(document.activeElement).toBe(radio);
  });
});
