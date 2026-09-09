// @vitest-environment jsdom
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { I18nProvider } from "../../i18n/I18nContext";
import { DEFAULT_APP_SETTINGS } from "../../settings/appSettingsHydration";
import type { AppSettings } from "../../types/settings";
import { SortInstructionsPromptEditor } from "./SortInstructionsPromptEditor";
import { readSortPromptDraft } from "./sortPromptDraft";

vi.mock("../../api/sortPromptMeta", () => ({
  fetchSortPromptDefault: () => Promise.resolve("BUILTIN"),
}));
vi.mock("../../hooks/useCloudSortActive", () => ({
  useCloudSortActive: () => ({ cloudSortActive: false }),
}));

/**
 * The editor unmounts on ordinary navigation — leaving Settings, collapsing the
 * section, switching sort mode — and Save is the only writer to
 * `sortSystemPrompt`, so typed text used to disappear with it.
 */
describe("custom sort instructions survive the editor unmounting", () => {
  let container: HTMLDivElement;
  let root: Root;
  let settings: AppSettings;
  let patch: ReturnType<typeof vi.fn>;

  function mount() {
    act(() => {
      root.render(
        <I18nProvider locale="en">
          <SortInstructionsPromptEditor
            settings={settings}
            onSettingsPatch={patch}
            backendOnline={false}
            embedded
          />
        </I18nProvider>,
      );
    });
  }

  function textarea(): HTMLTextAreaElement {
    const el = container.querySelector("textarea");
    if (!el) throw new Error("editor textarea not rendered");
    return el;
  }

  function type(value: string) {
    const el = textarea();
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )?.set;
      setter?.call(el, value);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  function button(label: string): HTMLButtonElement {
    const match = [...container.querySelectorAll("button")].find((b) =>
      (b.textContent ?? "").toLowerCase().includes(label.toLowerCase()),
    );
    if (!match) throw new Error(`no button matching ${label}`);
    return match as HTMLButtonElement;
  }

  beforeEach(() => {
    localStorage.clear();
    settings = { ...DEFAULT_APP_SETTINGS, sortSystemPrompt: "" };
    patch = vi.fn();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    localStorage.clear();
  });

  it("brings typed text back after the editor unmounts and remounts", () => {
    mount();
    type("Invoices go in Finance");

    act(() => root.unmount());
    root = createRoot(container);
    mount();

    expect(textarea().value).toBe("Invoices go in Finance");
  });

  it("does not let an unsaved draft reach the classifier", () => {
    mount();
    type("Invoices go in Finance");

    expect(patch).not.toHaveBeenCalled();
    expect(settings.sortSystemPrompt).toBe("");
  });

  it("says the draft is unsaved so nobody assumes it is live", () => {
    mount();
    type("Invoices go in Finance");

    expect(container.textContent).toContain("Unsaved edits");
  });

  it("clears the parked draft once saved", () => {
    mount();
    type("Invoices go in Finance");

    act(() => button("Save").click());

    expect(patch).toHaveBeenCalledWith({ sortSystemPrompt: "Invoices go in Finance" });
    expect(readSortPromptDraft()).toBeNull();
  });

  it("clears the parked draft on revert and restores the saved text", () => {
    settings = { ...settings, sortSystemPrompt: "Saved rules" };
    mount();
    type("half-typed change");

    act(() => button("Revert edits").click());

    expect(textarea().value).toBe("Saved rules");
    expect(readSortPromptDraft()).toBeNull();
  });

  it("keeps showing the saved text when nothing was typed", () => {
    settings = { ...settings, sortSystemPrompt: "Saved rules" };
    mount();

    act(() => root.unmount());
    root = createRoot(container);
    mount();

    expect(textarea().value).toBe("Saved rules");
    expect(container.textContent).not.toContain("Unsaved edits");
  });
});
