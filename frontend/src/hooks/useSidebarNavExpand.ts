import { useCallback, useState } from "react";
import type { MainNavItem, MainNavTab } from "./useMainNavItems";
import {
  addExpandedNavId,
  removeExpandedNavId,
  sidebarParentIdForTab,
} from "../utils/sidebarNavExpand";

/**
 * Independent dropdowns for sidebar major tabs.
 * Opening one does not close others; a re-click only closes that tab.
 * Shortcuts add the matching parent without collapsing the rest.
 */
export function useSidebarNavExpand(items: MainNavItem[], activeTab: MainNavTab) {
  const [expandedIds, setExpandedIds] = useState<MainNavTab[]>([]);
  const [syncedTab, setSyncedTab] = useState(activeTab);

  if (activeTab !== syncedTab) {
    setSyncedTab(activeTab);
    const parent = sidebarParentIdForTab(items, activeTab);
    if (parent) setExpandedIds(addExpandedNavId(expandedIds, parent));
  }

  const isExpanded = useCallback((id: MainNavTab) => expandedIds.includes(id), [expandedIds]);

  const onParentActivate = useCallback(
    (id: MainNavTab): "expand" | "collapse" => {
      if (expandedIds.includes(id)) {
        setExpandedIds(removeExpandedNavId(expandedIds, id));
        return "collapse";
      }
      setExpandedIds(addExpandedNavId(expandedIds, id));
      return "expand";
    },
    [expandedIds],
  );

  return { expandedIds, isExpanded, onParentActivate };
}
