import { useCallback, useState } from "react";
import { loadMemorySubTab, persistMemorySubTab, type MemorySubTab } from "../utils/memoryUi";

/** Memory sub-view (Overview / Map / Brief) — synced with sidebar. */
export function useMemorySubTab() {
  const [memorySubTab, setMemorySubTab] = useState<MemorySubTab>(loadMemorySubTab);
  const [memoryShowAllSections, setMemoryShowAllSections] = useState(false);

  const selectMemorySubTab = useCallback((tab: MemorySubTab) => {
    setMemoryShowAllSections(false);
    setMemorySubTab(tab);
    persistMemorySubTab(tab);
  }, []);

  const selectMemoryAllSections = useCallback(() => {
    setMemoryShowAllSections(true);
  }, []);

  return {
    memorySubTab,
    memoryShowAllSections,
    selectMemorySubTab,
    selectMemoryAllSections,
  };
};
