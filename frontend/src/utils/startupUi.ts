import { STARTUP_SUB_TAB_STORAGE_KEY } from "../constants";

export type StartupSubTab = "today" | "include";

/** Same-tab listeners (command palette) pick up Include → Today without a remount. */
export const STARTUP_SUB_TAB_CHANGE_EVENT = "exosites-startup-subtab";

const TABS: ReadonlySet<string> = new Set(["today", "include"]);

export function loadStartupSubTab(): StartupSubTab {
  try {
    const value = localStorage.getItem(STARTUP_SUB_TAB_STORAGE_KEY);
    if (TABS.has(value ?? "")) return value as StartupSubTab;
  } catch {
    /* ignore */
  }
  return "today";
}

export function persistStartupSubTab(tab: StartupSubTab): void {
  try {
    localStorage.setItem(STARTUP_SUB_TAB_STORAGE_KEY, tab);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent(STARTUP_SUB_TAB_CHANGE_EVENT, { detail: tab }));
}
