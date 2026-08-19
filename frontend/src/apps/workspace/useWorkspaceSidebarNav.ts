import { useCallback, useEffect, useState } from "react";
import { SETTINGS_SHOW_ALL_SECTIONS_EVENT } from "../../constants";
import type { EntitlementStatus } from "../../api";
import type { MainNavTab } from "../../hooks/useMainNavItems";
import { useMemorySubTab } from "../../hooks/useMemorySubTab";
import { useTodoSubTab } from "../../hooks/useTodoSubTab";
import { useSettingsSubTab } from "../../hooks/useSettingsSubTab";
import { openPrimarySettingsSection, settingsNavTabForEntryId } from "../../utils/settingsNav";
import { queueMemoryNeedsReview, consumeQueuedTodoSubTab } from "../../utils/deferredPanelActions";
import type { MemorySubTab } from "../../utils/memoryUi";
import { memorySubTabForScrollSection } from "../../utils/memoryUi";
import type { TodoSubTab } from "../../utils/todoUi";
import { todoSubTabForScrollSection } from "../../utils/todoUi";
import { pickTodoLandingTab } from "../../utils/todoNavigation";
import type { SettingsNavTab } from "../../utils/settingsNav";

type Tab = MainNavTab;

interface UseWorkspaceSidebarNavParams {
  tab: Tab;
  requestTab: (tab: Tab) => void;
  entitlement: EntitlementStatus | null;
  jumpToSettingsSection: (sectionId: string) => void;
  registerSettingsSubTabSelector: (select: (tab: SettingsNavTab) => void) => void;
  todoAttentionCounts?: { inbox: number; replies: number };
}

/**
 * Sidebar tab selection, sub-tab routing, and deferred panel actions for the workspace shell.
 */
export function useWorkspaceSidebarNav({
  tab,
  requestTab,
  entitlement,
  jumpToSettingsSection,
  registerSettingsSubTabSelector,
  todoAttentionCounts = { inbox: 0, replies: 0 },
}: UseWorkspaceSidebarNavParams) {
  const {
    memorySubTab,
    memoryShowAllSections,
    selectMemorySubTab,
    selectMemoryAllSections,
  } = useMemorySubTab();
  const { todoSubTab, todoShowAllSections, selectTodoSubTab } = useTodoSubTab();
  const {
    settingsSubTab,
    settingsShowAllSections,
    selectSettingsSubTab,
    selectSettingsAllSections,
  } = useSettingsSubTab();

  const [settingsHighlightedSubTab, setSettingsHighlightedSubTab] = useState<SettingsNavTab | null>(
    null,
  );
  const [memoryHighlightedSubTab, setMemoryHighlightedSubTab] = useState<MemorySubTab | null>(null);
  const [todoHighlightedSubTab, setTodoHighlightedSubTab] = useState<TodoSubTab | null>(null);

  const reportSettingsScrollSection = useCallback(
    (sectionId: string) => {
      if (!settingsShowAllSections) return;
      const tab = settingsNavTabForEntryId(sectionId);
      if (tab) setSettingsHighlightedSubTab(tab);
    },
    [settingsShowAllSections],
  );

  const reportMemoryScrollSection = useCallback(
    (sectionId: string) => {
      if (!memoryShowAllSections) return;
      const subTab = memorySubTabForScrollSection(sectionId);
      if (subTab) setMemoryHighlightedSubTab(subTab);
    },
    [memoryShowAllSections],
  );

  const reportTodoScrollSection = useCallback(
    (sectionId: string) => {
      if (!todoShowAllSections) return;
      const subTab = todoSubTabForScrollSection(sectionId);
      if (subTab) setTodoHighlightedSubTab(subTab);
    },
    [todoShowAllSections],
  );

  useEffect(() => {
    registerSettingsSubTabSelector(selectSettingsSubTab);
  }, [registerSettingsSubTabSelector, selectSettingsSubTab]);

  useEffect(() => {
    const onShowAllSettings = () => selectSettingsAllSections();
    window.addEventListener(SETTINGS_SHOW_ALL_SECTIONS_EVENT, onShowAllSettings);
    return () => window.removeEventListener(SETTINGS_SHOW_ALL_SECTIONS_EVENT, onShowAllSettings);
  }, [selectSettingsAllSections]);

  const handleSidebarNavSelect = useCallback(
    (
      nextTab: Tab,
      nextMemorySubTab?: MemorySubTab,
      nextSettingsSubTab?: SettingsNavTab,
      nextTodoSubTab?: TodoSubTab,
      openAllSections?: boolean,
    ) => {
      if (openAllSections && nextTab === "memories") {
        selectMemoryAllSections();
        setMemoryHighlightedSubTab(null);
      } else if (nextMemorySubTab) {
        selectMemorySubTab(nextMemorySubTab);
        setMemoryHighlightedSubTab(null);
      }

      if (openAllSections && nextTab === "tasks") {
        // Parent To Do is not an all-sections dump — land on last or urgent tab.
        selectTodoSubTab(pickTodoLandingTab(todoSubTab, todoAttentionCounts));
        setTodoHighlightedSubTab(null);
      } else if (nextTodoSubTab) {
        selectTodoSubTab(nextTodoSubTab);
        setTodoHighlightedSubTab(null);
      }

      if (openAllSections && nextTab === "settings") {
        selectSettingsAllSections();
        setSettingsHighlightedSubTab(null);
      } else if (nextSettingsSubTab) {
        selectSettingsSubTab(nextSettingsSubTab);
        setSettingsHighlightedSubTab(null);
      }

      requestTab(nextTab);
    },
    [
      requestTab,
      selectMemoryAllSections,
      selectMemorySubTab,
      selectSettingsAllSections,
      selectSettingsSubTab,
      selectTodoSubTab,
      todoAttentionCounts,
      todoSubTab,
    ],
  );

  const openTodoSubTab = useCallback(
    (subTab: TodoSubTab) => {
      selectTodoSubTab(subTab);
      requestTab("tasks");
    },
    [requestTab, selectTodoSubTab],
  );

  const openMemoryNeedsReview = useCallback(() => {
    queueMemoryNeedsReview();
    selectMemorySubTab("overview");
    requestTab("memories");
  }, [requestTab, selectMemorySubTab]);

  useEffect(() => {
    const queued = consumeQueuedTodoSubTab();
    if (!queued) return;
    selectTodoSubTab(queued);
    requestTab("tasks");
  }, [requestTab, selectTodoSubTab]);

  const openProfileFromSidebar = useCallback(() => {
    if (entitlement?.cloudAuthRequired) {
      jumpToSettingsSection("account-profile");
      return;
    }
    openPrimarySettingsSection(jumpToSettingsSection, { section: "license" });
  }, [entitlement?.cloudAuthRequired, jumpToSettingsSection]);

  const profileTabActive =
    tab === "settings" && settingsSubTab === "privacyAccount" && !settingsShowAllSections;

  const openMemoriesSubTab = useCallback(
    (nextMemorySubTab: MemorySubTab) => {
      selectMemorySubTab(nextMemorySubTab);
      requestTab("memories");
    },
    [requestTab, selectMemorySubTab],
  );

  return {
    memorySubTab,
    memoryShowAllSections,
    todoSubTab,
    todoShowAllSections,
    settingsSubTab,
    settingsShowAllSections,
    settingsHighlightedSubTab,
    memoryHighlightedSubTab,
    todoHighlightedSubTab,
    selectSettingsSubTab,
    profileTabActive,
    handleSidebarNavSelect,
    openTodoSubTab,
    openMemoryNeedsReview,
    openProfileFromSidebar,
    openMemoriesSubTab,
    reportSettingsScrollSection,
    reportMemoryScrollSection,
    reportTodoScrollSection,
  };
};
