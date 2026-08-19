import type { MemorySubTab } from "./memoryUi";
import type { TodoSubTab } from "./todoUi";
import { SETTINGS_NAV_TABS, type SettingsNavTab } from "./settingsNav";

/** i18n keys for a workspace panel header row (title + optional subtitle). */
type PanelHeadingKeys = {
  titleKey: string;
  subtitleKey: string;
};

const MEMORY_SUB_TAB_HEADINGS: Record<MemorySubTab, PanelHeadingKeys> = {
  overview: {
    titleKey: "memories.tabs.overview",
    subtitleKey: "memories.tabs.overviewSubtitle",
  },
  activity: {
    titleKey: "memories.tabs.activity",
    subtitleKey: "memories.tabs.activitySubtitle",
  },
  map: {
    titleKey: "memories.tabs.map",
    subtitleKey: "memories.mapPreviewDesc",
  },
};

const SETTINGS_NAV_TAB_SUBTITLE_KEYS: Record<SettingsNavTab, string> = {
  aiAgents: "settings.navTabAiAgentsSubtitle",
  features: "settings.navTabFeaturesSubtitle",
  fileSorting: "settings.navTabFileSortingSubtitle",
  privacyAccount: "settings.navTabPrivacyAccountSubtitle",
  aboutHelp: "settings.navTabAboutHelpSubtitle",
};

const TODO_SUB_TAB_HEADINGS: Record<TodoSubTab, PanelHeadingKeys> = {
  today: {
    titleKey: "nav.todoToday",
    subtitleKey: "todo.tabs.todaySubtitle",
  },
  inbox: {
    titleKey: "nav.todoInbox",
    subtitleKey: "todo.tabs.inboxSubtitle",
  },
  done: {
    titleKey: "nav.todoDone",
    subtitleKey: "todo.tabs.doneSubtitle",
  },
};

/** Panel header keys for the active Memory sub-view (Facts / Activity / Map). */
export function getMemoryPanelHeadingKeys(
  subTab: MemorySubTab,
  showAllSections = false,
): PanelHeadingKeys {
  if (showAllSections) {
    return {
      titleKey: "nav.memories",
      subtitleKey: "memories.allSectionsSubtitle",
    };
  }
  return MEMORY_SUB_TAB_HEADINGS[subTab];
}

/**
 * Panel header keys for the active Settings category tab.
 * Matches sidebar labels in {@link SETTINGS_NAV_TABS}.
 */
export function getSettingsPanelHeadingKeys(
  tab: SettingsNavTab,
  showAllSections = false,
): PanelHeadingKeys {
  if (showAllSections) {
    return {
      titleKey: "nav.settings",
      subtitleKey: "settings.allSectionsSubtitle",
    };
  }
  const tabDef = SETTINGS_NAV_TABS.find((entry) => entry.id === tab);
  return {
    titleKey: tabDef?.labelKey ?? "settings.navTabFileSorting",
    subtitleKey: SETTINGS_NAV_TAB_SUBTITLE_KEYS[tab],
  };
}

/** Panel header keys for the active To Do sub-view. */
export function getTodoPanelHeadingKeys(subTab: TodoSubTab, showAllSections = false): PanelHeadingKeys {
  if (showAllSections) {
    return {
      titleKey: "nav.todo",
      subtitleKey: "todo.allSectionsSubtitle",
    };
  }
  return TODO_SUB_TAB_HEADINGS[subTab];
}
