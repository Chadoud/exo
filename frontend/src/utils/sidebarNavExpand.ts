import type { MainNavItem, MainNavTab } from "../hooks/useMainNavItems";

/** Major tab that owns a dropdown of minor tabs. */
export function hasSidebarDropdown(item: MainNavItem): boolean {
  return Boolean(item.children?.length);
}

/** Parent major-tab id for the current route, or null when the tab has no dropdown. */
export function sidebarParentIdForTab(
  items: MainNavItem[],
  activeTab: MainNavTab,
): MainNavTab | null {
  for (const item of items) {
    if (!hasSidebarDropdown(item)) continue;
    if (item.id === activeTab) return item.id;
    if (item.children?.some((child) => child.id === activeTab)) return item.id;
  }
  return null;
}

export function addExpandedNavId(ids: MainNavTab[], id: MainNavTab): MainNavTab[] {
  if (ids.includes(id)) return ids;
  return [...ids, id];
}

export function removeExpandedNavId(ids: MainNavTab[], id: MainNavTab): MainNavTab[] {
  return ids.filter((item) => item !== id);
}
