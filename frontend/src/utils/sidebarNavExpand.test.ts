import { describe, expect, it } from "vitest";
import type { MainNavItem } from "../hooks/useMainNavItems";
import {
  addExpandedNavId,
  hasSidebarDropdown,
  removeExpandedNavId,
  sidebarParentIdForTab,
} from "./sidebarNavExpand";

const items: MainNavItem[] = [
  {
    id: "exo",
    label: "Exo",
    icon: "x",
    children: [{ id: "assistant", label: "Chat", icon: "c" }],
  },
  {
    id: "memories",
    label: "Memory",
    icon: "m",
    children: [{ id: "memories", navKey: "memories-map", memorySubTab: "map", label: "Map", icon: "p" }],
  },
  { id: "sources", label: "Sources", icon: "s" },
];

describe("sidebarNavExpand", () => {
  it("treats only parents with children as dropdowns", () => {
    expect(hasSidebarDropdown(items[0]!)).toBe(true);
    expect(hasSidebarDropdown(items[2]!)).toBe(false);
  });

  it("maps a child route back to its major tab", () => {
    expect(sidebarParentIdForTab(items, "assistant")).toBe("exo");
    expect(sidebarParentIdForTab(items, "memories")).toBe("memories");
    expect(sidebarParentIdForTab(items, "sources")).toBeNull();
  });

  it("adds and removes expanded ids without touching the others", () => {
    const opened = addExpandedNavId(["exo"], "memories");
    expect(opened).toEqual(["exo", "memories"]);
    expect(addExpandedNavId(opened, "exo")).toBe(opened);
    expect(removeExpandedNavId(opened, "exo")).toEqual(["memories"]);
  });
});
