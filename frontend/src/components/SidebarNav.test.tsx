// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import SidebarNav from "./SidebarNav";
import type { MainNavItem } from "../hooks/useMainNavItems";

const items: MainNavItem[] = [
  {
    id: "exo",
    label: "Exo",
    icon: "M1 1",
    children: [{ id: "assistant", label: "Chat", icon: "M2 2" }],
  },
  {
    id: "memories",
    label: "Memory",
    icon: "M3 3",
    children: [
      {
        id: "memories",
        navKey: "memories-overview",
        memorySubTab: "overview",
        label: "Overview",
        icon: "M4 4",
      },
    ],
  },
  { id: "sources", label: "Sources", icon: "M5 5" },
];

const baseProps = {
  items,
  memorySubTab: "overview" as const,
  memoryShowAllSections: false,
  todoSubTab: "today" as const,
  todoShowAllSections: false,
  settingsSubTab: "features" as const,
  settingsShowAllSections: false,
  uiLocale: "en" as const,
  isAwaitingApproval: false,
  installingModel: false,
};

describe("SidebarNav dropdowns", () => {
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

  it("keeps every major-tab dropdown closed until click", async () => {
    const onSelect = vi.fn();
    await act(async () => {
      root.render(<SidebarNav {...baseProps} activeTab="exo" onSelect={onSelect} />);
    });
    expect(container.querySelector("#sidebar-subnav-exo")?.hasAttribute("hidden")).toBe(true);
    expect(container.querySelector("#sidebar-subnav-memories")?.hasAttribute("hidden")).toBe(true);

    const exoBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Exo"),
    );
    await act(async () => {
      exoBtn!.click();
    });
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(container.querySelector("#sidebar-subnav-exo")?.hasAttribute("hidden")).toBe(false);
    expect(exoBtn?.getAttribute("aria-expanded")).toBe("true");
  });

  it("expands a major tab on first click and closes it on the second", async () => {
    const onSelect = vi.fn();
    await act(async () => {
      root.render(<SidebarNav {...baseProps} activeTab="exo" onSelect={onSelect} />);
    });
    const memoryBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Memory"),
    );
    expect(memoryBtn).toBeTruthy();

    await act(async () => {
      memoryBtn!.click();
    });
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(container.querySelector("#sidebar-subnav-memories")?.hasAttribute("hidden")).toBe(false);

    await act(async () => {
      memoryBtn!.click();
    });
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(container.querySelector("#sidebar-subnav-memories")?.hasAttribute("hidden")).toBe(true);
  });

  it("keeps an open dropdown when another major tab opens", async () => {
    const onSelect = vi.fn();
    await act(async () => {
      root.render(<SidebarNav {...baseProps} activeTab="exo" onSelect={onSelect} />);
    });
    const exoBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Exo"),
    );
    const memoryBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Memory"),
    );
    await act(async () => {
      exoBtn!.click();
    });
    await act(async () => {
      memoryBtn!.click();
    });
    expect(container.querySelector("#sidebar-subnav-exo")?.hasAttribute("hidden")).toBe(false);
    expect(container.querySelector("#sidebar-subnav-memories")?.hasAttribute("hidden")).toBe(false);

    await act(async () => {
      memoryBtn!.click();
    });
    expect(container.querySelector("#sidebar-subnav-exo")?.hasAttribute("hidden")).toBe(false);
    expect(container.querySelector("#sidebar-subnav-memories")?.hasAttribute("hidden")).toBe(true);
  });

  it("follows an external tab change by opening that major tab without closing others", async () => {
    const onSelect = vi.fn();
    await act(async () => {
      root.render(<SidebarNav {...baseProps} activeTab="exo" onSelect={onSelect} />);
    });
    await act(async () => {
      root.render(<SidebarNav {...baseProps} activeTab="memories" onSelect={onSelect} />);
    });
    expect(container.querySelector("#sidebar-subnav-memories")?.hasAttribute("hidden")).toBe(false);

    await act(async () => {
      root.render(<SidebarNav {...baseProps} activeTab="assistant" onSelect={onSelect} />);
    });
    expect(container.querySelector("#sidebar-subnav-exo")?.hasAttribute("hidden")).toBe(false);
    expect(container.querySelector("#sidebar-subnav-memories")?.hasAttribute("hidden")).toBe(false);
  });
});
