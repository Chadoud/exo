import { useCallback, useEffect, useState } from "react";
import {
  loadStartupSubTab,
  persistStartupSubTab,
  STARTUP_SUB_TAB_CHANGE_EVENT,
  type StartupSubTab,
} from "../utils/startupUi";

export function useStartupSubTab() {
  const [startupSubTab, setStartupSubTab] = useState<StartupSubTab>(loadStartupSubTab);

  const selectStartupSubTab = useCallback((tab: StartupSubTab) => {
    persistStartupSubTab(tab);
    setStartupSubTab(tab);
  }, []);

  useEffect(() => {
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<StartupSubTab>).detail;
      if (detail === "today" || detail === "include") setStartupSubTab(detail);
    };
    window.addEventListener(STARTUP_SUB_TAB_CHANGE_EVENT, onChange);
    return () => window.removeEventListener(STARTUP_SUB_TAB_CHANGE_EVENT, onChange);
  }, []);

  return { startupSubTab, selectStartupSubTab };
}
