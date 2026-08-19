import { useMemo } from "react";
import type { UiLocale } from "../i18n/locale";
import { translate } from "../i18n/translate";
import type { MemorySubTab } from "../utils/memoryUi";
import type { TodoSubTab } from "../utils/todoUi";
import {
  SETTINGS_NAV_TABS,
  SETTINGS_PARENT_ICON,
  SETTINGS_SUBTAB_ICONS,
  type SettingsNavTab,
} from "../utils/settingsNav";
import { TODO_DONE_ICON, TODO_TAB_ICONS } from "../utils/todoNavIcons";

export { TODO_DONE_ICON };

export type MainNavTab =
  | "queue"
  | "overview"
  | "history"
  | "assistant"
  | "exo"
  | "memories"
  | "tasks"
  | "sources"
  | "settings";

export type MainNavGroup = "files" | "assistant" | "todo" | "settings";

export type MainNavItem = {
  id: MainNavTab;
  label: string;
  icon: string;
  /** Stable React key when several items share the same `id` (e.g. Memory sub-views). */
  navKey?: string;
  /** Memory tab sub-view — sidebar child under Memory; route stays `memories`. */
  memorySubTab?: MemorySubTab;
  /** To Do sub-view — sidebar child under To Do; route stays `tasks`. */
  todoSubTab?: TodoSubTab;
  /** Settings category — sidebar item under Settings; route stays `settings`. */
  settingsSubTab?: SettingsNavTab;
  /** Sidebar section label — non-interactive group header. */
  group?: MainNavGroup;
  /** Optional pill next to the label (e.g. feature preview). */
  badge?: string;
  /**
   * 1-based keyboard shortcut digit (Mod+N) for this item. Decoupled from the
   * sidebar render order because nested items have their own shortcut numbers.
   * Mirrors `MOD_TAB_ORDER`.
   */
  shortcutKey?: number;
  /** Nested sub-tabs rendered indented beneath this item in the sidebar. */
  children?: MainNavItem[];
};

/**
 * Sidebar tab definitions (labels follow UI locale).
 *
 * Assistant zone first (voice, chat, memory, today), then Files (sort + settings).
 * Every id remains an independent `MainNavTab` route.
 */
export function useMainNavItems(uiLocale: UiLocale): MainNavItem[] {
  return useMemo(
    () => [
      {
        id: "exo",
        group: "assistant",
        label: translate(uiLocale, "nav.exo"),
        shortcutKey: 1,
        icon: "M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h10.5a2.25 2.25 0 0 0 2.25-2.25V6.75a2.25 2.25 0 0 0-2.25-2.25H6.75A2.25 2.25 0 0 0 4.5 6.75v10.5a2.25 2.25 0 0 0 2.25 2.25Zm.75-12h9v9h-9v-9Z",
        children: [
          {
            id: "assistant",
            label: translate(uiLocale, "nav.assistant"),
            shortcutKey: 2,
            icon: "M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z",
          },
        ],
      },
      {
        id: "memories",
        group: "assistant",
        label: translate(uiLocale, "nav.memories"),
        shortcutKey: 8,
        icon: "M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z",
        children: [
          {
            id: "memories",
            navKey: "memories-overview",
            memorySubTab: "overview",
            label: translate(uiLocale, "memories.tabs.overview"),
            icon: "M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75Zm0 5.25h.007v.008H3.75V12Zm0 5.25h.007v.008H3.75v-.008Z",
          },
          {
            id: "memories",
            navKey: "memories-map",
            memorySubTab: "map",
            label: translate(uiLocale, "memories.tabs.map"),
            icon: "M9 6.75V15m6-6v8.25m.503-3.498 4.875-2.438c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 0 0-1.006 0L3.622 5.126C2.873 5.5 2.25 6.044 2.25 6.879V19.125c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0Z",
          },
          {
            id: "memories",
            navKey: "memories-activity",
            memorySubTab: "activity",
            label: translate(uiLocale, "memories.tabs.activity"),
            icon: "M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
          },
        ],
      },
      {
        id: "tasks",
        group: "todo",
        label: translate(uiLocale, "nav.todo"),
        shortcutKey: 9,
        icon: "M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
        children: [
          {
            id: "tasks",
            navKey: "tasks-today",
            todoSubTab: "today",
            label: translate(uiLocale, "nav.todoToday"),
            icon: TODO_TAB_ICONS.today,
          },
          {
            id: "tasks",
            navKey: "tasks-inbox",
            todoSubTab: "inbox",
            label: translate(uiLocale, "nav.todoInbox"),
            icon: TODO_TAB_ICONS.inbox,
          },
          {
            id: "tasks",
            navKey: "tasks-done",
            todoSubTab: "done",
            label: translate(uiLocale, "nav.todoDone"),
            icon: TODO_TAB_ICONS.done,
          },
        ],
      },
      {
        id: "queue",
        group: "files",
        label: translate(uiLocale, "nav.queue"),
        shortcutKey: 3,
        icon: "M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 0 1 0 3.75H5.625a1.875 1.875 0 0 1 0-3.75Z",
        children: [
          {
            id: "overview",
            label: translate(uiLocale, "nav.overview"),
            shortcutKey: 4,
            icon: "M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v8.25m19.5 0v.75A2.25 2.25 0 0 1 19.5 17.25h-15a2.25 2.25 0 0 1-2.25-2.25V13.5",
          },
          {
            id: "history",
            label: translate(uiLocale, "nav.history"),
            shortcutKey: 5,
            icon: "M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
          },
        ],
      },
      {
        id: "settings",
        group: "settings",
        label: translate(uiLocale, "nav.settings"),
        shortcutKey: 7,
        icon: SETTINGS_PARENT_ICON,
        children: SETTINGS_NAV_TABS.map(({ id, labelKey }) => ({
          id: "settings" as const,
          navKey: `settings-${id}`,
          settingsSubTab: id as SettingsNavTab,
          label: translate(uiLocale, labelKey),
          icon: SETTINGS_SUBTAB_ICONS[id],
        })),
      },
      {
        id: "sources",
        group: "settings",
        label: translate(uiLocale, "nav.sources"),
        shortcutKey: 6,
        icon: "M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244",
      },
    ],
    [uiLocale],
  );
}

/** Reorder nav items based on first-run persona preference. Default order is assistant-first. */
export function orderNavItemsByPersona(items: MainNavItem[], persona: "files" | "assistant" | null): MainNavItem[] {
  if (persona === "files") {
    const files = items.filter((i) => i.group === "files");
    const settings = items.filter((i) => i.group === "settings");
    const todo = items.filter((i) => i.group === "todo");
    const assistant = items.filter((i) => i.group === "assistant");
    return [...files, ...settings, ...todo, ...assistant];
  }
  return items;
}
