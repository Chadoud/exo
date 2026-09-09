import { useEffect } from "react";
import type { MainNavTab } from "./useMainNavItems";

interface UseCommandPaletteShortcutsArgs {
  helpOpen: boolean;
  setHelpOpen: (open: boolean) => void;
  setCommandPaletteOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  openHelpModal: () => void;
  requestTab: (next: MainNavTab) => void;
  openSettingsHome?: () => void;
  tourOpen: boolean;
  showWelcome: boolean;
  launchSphereSplashOpen: boolean;
  reassignFile: unknown;
  needsCloudAccount: boolean;
}

/** Sidebar order — Mod+1 … Mod+9 jump to matching tab (same labels as nav rail). */
const MOD_TAB_ORDER: MainNavTab[] = [
  "exo",
  "assistant",
  "queue",
  "overview",
  "history",
  "sources",
  "settings",
  "memories",
  "tasks",
];

/**
 * Global shortcuts: command palette (⌘/Ctrl+K), F1 help, ⌘1–⌘7 main tabs, ⌘⇧/? help.
 */
export function useCommandPaletteShortcuts({
  helpOpen,
  setHelpOpen,
  setCommandPaletteOpen,
  openHelpModal,
  requestTab,
  openSettingsHome,
  tourOpen,
  showWelcome,
  launchSphereSplashOpen,
  reassignFile,
  needsCloudAccount,
}: UseCommandPaletteShortcutsArgs): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;

      if (e.key === "F1") {
        e.preventDefault();
        setCommandPaletteOpen(false);
        openHelpModal();
        return;
      }

      if (mod && (e.key === "k" || e.key === "K") && !e.altKey && !e.shiftKey) {
        if (
          helpOpen ||
          tourOpen ||
          showWelcome ||
          launchSphereSplashOpen ||
          reassignFile ||
          needsCloudAccount
        )
          return;
        e.preventDefault();
        setCommandPaletteOpen((o) => !o);
        return;
      }

      if (helpOpen) {
        if (e.key === "Escape") {
          e.preventDefault();
          setHelpOpen(false);
        }
        return;
      }

      const target = e.target as HTMLElement | null;
      const inTextField =
        !!target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);

      if (mod && e.shiftKey && (e.key === "/" || e.key === "?")) {
        e.preventDefault();
        setCommandPaletteOpen(false);
        openHelpModal();
        return;
      }

      if (inTextField && !mod) return;

      if (mod && e.key >= "1" && e.key <= "9" && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        const idx = parseInt(e.key, 10) - 1;
        const next = MOD_TAB_ORDER[idx];
        if (next === "settings" && openSettingsHome) openSettingsHome();
        else if (next) requestTab(next);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [
    helpOpen,
    requestTab,
    openSettingsHome,
    openHelpModal,
    tourOpen,
    showWelcome,
    launchSphereSplashOpen,
    reassignFile,
    needsCloudAccount,
    setHelpOpen,
    setCommandPaletteOpen,
  ]);
}
