import { useCallback, type Dispatch, type SetStateAction } from "react";
import type { MainNavTab } from "./useMainNavItems";

/**
 * Main-nav tab switching.
 *
 * Leaving a tab never prompts: settings persist as they are edited
 * (see `useAppSettings`), so there is no pending work to confirm.
 */
export function useTabNavigation(options: {
  setTab: Dispatch<SetStateAction<MainNavTab>>;
  refreshTree: () => void | Promise<void>;
}): { requestTab: (next: MainNavTab) => void } {
  const { setTab, refreshTree } = options;

  const requestTab = useCallback(
    (next: MainNavTab) => {
      setTab(next);
      if (next === "overview") void refreshTree();
    },
    [setTab, refreshTree]
  );

  return { requestTab };
}
