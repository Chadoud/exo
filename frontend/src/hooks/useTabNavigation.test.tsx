// @vitest-environment jsdom
import { act, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { DEFAULT_APP_SETTINGS } from "../settings/appSettingsHydration";
import type { AppSettings } from "../types/settings";
import { useTabNavigation } from "./useTabNavigation";
import type { MainNavTab } from "./useMainNavItems";

interface Snapshot {
  tab: MainNavTab;
  settings: AppSettings;
  requestTab: (next: MainNavTab) => void;
  changeASetting: () => void;
}

/**
 * The navigation contract every tab switch depends on. `requestTab` has a dozen
 * callers and had no coverage, so these assertions exist to catch a regression
 * around the removal of the leave-Settings prompt.
 */
describe("tab navigation", () => {
  let container: HTMLDivElement;
  let root: Root;
  let refreshTree: ReturnType<typeof vi.fn>;
  let latest: Snapshot | null = null;

  function Harness({ publish }: { publish: (snapshot: Snapshot) => void }) {
    const [tab, setTab] = useState<MainNavTab>("exo");
    const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
    const { requestTab } = useTabNavigation({ setTab, refreshTree });
    publish({
      tab,
      settings,
      requestTab,
      changeASetting: () => setSettings((s) => ({ ...s, outputDir: "/tmp/changed-by-user" })),
    });
    return null;
  }

  function mount() {
    act(() => {
      root.render(<Harness publish={(snapshot) => (latest = snapshot)} />);
    });
  }

  function enterSettings() {
    mount();
    act(() => latest?.requestTab("settings"));
    expect(latest?.tab).toBe("settings");
  }

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    refreshTree = vi.fn();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    latest = null;
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("switches to the requested tab", () => {
    mount();
    act(() => latest?.requestTab("history"));
    expect(latest?.tab).toBe("history");
  });

  it("refreshes the folder tree when landing on Overview", () => {
    mount();
    act(() => latest?.requestTab("overview"));
    expect(latest?.tab).toBe("overview");
    expect(refreshTree).toHaveBeenCalledTimes(1);
  });

  it("does not refresh the folder tree for other tabs", () => {
    mount();
    act(() => latest?.requestTab("history"));
    expect(refreshTree).not.toHaveBeenCalled();
  });

  it("leaves Settings immediately when nothing changed", () => {
    enterSettings();
    act(() => latest?.requestTab("exo"));
    expect(latest?.tab).toBe("exo");
  });

  it("still refreshes the folder tree when leaving Settings for Overview", () => {
    enterSettings();
    act(() => latest?.requestTab("overview"));
    expect(latest?.tab).toBe("overview");
    expect(refreshTree).toHaveBeenCalledTimes(1);
  });

  it("leaves Settings immediately after a setting changed", () => {
    enterSettings();
    act(() => latest?.changeASetting());

    act(() => latest?.requestTab("exo"));
    expect(latest?.tab).toBe("exo");
  });

  it("keeps the changed setting after leaving", () => {
    enterSettings();
    act(() => latest?.changeASetting());

    act(() => latest?.requestTab("exo"));
    expect(latest?.settings.outputDir).toBe("/tmp/changed-by-user");
  });
});
