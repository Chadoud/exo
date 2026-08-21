/**
 * Primary settings scroll targets (typed keys → DOM ids used by `jumpToSettingsSection`).
 * Prefer this over string literals at call sites so refactors stay aligned with `SETTINGS_NAV_ENTRIES`.
 */
export type PrimarySettingsSectionKey =
  | "account"
  | "aiAgents"
  /** @deprecated Use `aiAgents` — kept for existing jump links. */
  | "chatVoice"
  /** @deprecated Use `aiAgents` — kept for existing jump links. */
  | "aiProvider"
  | "voice"
  | "models"
  | "privacy"
  | "assistantTools"
  | "features"
  | "memory"
  | "system"
  | "license"
  | "general"
  | "about"
  | "visionModels"
  | "ocr";

export const PRIMARY_SETTINGS_SECTION_DOM_IDS: Record<PrimarySettingsSectionKey, string> = {
  account: "settings-anchor-account",
  aiAgents: "settings-anchor-ai-provider",
  chatVoice: "settings-anchor-ai-provider",
  aiProvider: "settings-anchor-ai-provider",
  voice: "settings-anchor-voice",
  models: "settings-anchor-models",
  privacy: "settings-anchor-privacy",
  assistantTools: "settings-anchor-features",
  features: "settings-anchor-features",
  memory: "settings-anchor-memory",
  system: "settings-anchor-system",
  license: "settings-anchor-license",
  general: "settings-anchor-general",
  about: "settings-anchor-system",
  visionModels: "settings-vision-models",
  ocr: "sorting-scans",
};

export function getPrimarySettingsSectionDomId(section: PrimarySettingsSectionKey): string {
  return PRIMARY_SETTINGS_SECTION_DOM_IDS[section];
}

/** Dispatched from deep UI (e.g. integration toasts) to jump into Settings. */
export const OPEN_SETTINGS_SECTION_EVENT = "exosites-open-settings-section";

/** Request navigation to a settings scroll target without prop-drilling `jumpToSettingsSection`. */
export function requestOpenSettingsSection(sectionId: string): void {
  window.dispatchEvent(
    new CustomEvent(OPEN_SETTINGS_SECTION_EVENT, { detail: { sectionId } }),
  );
}

/**
 * Scrolls the settings pane to a primary section (switches tab + scroll as implemented by the caller’s `jump`).
 */
export function openPrimarySettingsSection(
  jumpToSettingsSection: (sectionDomId: string) => void,
  opts: { section: PrimarySettingsSectionKey }
): void {
  jumpToSettingsSection(getPrimarySettingsSectionDomId(opts.section));
}

/** Top-level Settings sidebar tabs — one product area per tab. */
export type SettingsNavTab = "aiAgents" | "features" | "fileSorting" | "privacyAccount" | "aboutHelp";

export const SETTINGS_NAV_TABS: readonly { id: SettingsNavTab; labelKey: string }[] = [
  { id: "aiAgents", labelKey: "settings.navTabAiAgents" },
  { id: "features", labelKey: "settings.navTabFeatures" },
  { id: "fileSorting", labelKey: "settings.navTabFileSorting" },
  { id: "privacyAccount", labelKey: "settings.navTabPrivacyAccount" },
  { id: "aboutHelp", labelKey: "settings.navTabAboutHelp" },
];

/** Left-rail nav + scroll-spy: ids must exist on elements in the Settings scroll pane (top → bottom). */
export type SettingsNavEntry = {
  id: string;
  labelKey: string;
  depth: 0 | 1;
  tab: SettingsNavTab;
};

export const SETTINGS_NAV_ENTRIES: SettingsNavEntry[] = [
  // —— AI agents ——
  { id: "settings-anchor-ai-provider", labelKey: "settings.nav.aiProvider", depth: 0, tab: "aiAgents" },
  { id: "settings-anchor-voice", labelKey: "settings.nav.voice", depth: 0, tab: "aiAgents" },
  { id: "settings-anchor-memory", labelKey: "settings.nav.assistantMemory", depth: 0, tab: "aiAgents" },

  // —— Features ——
  { id: "settings-anchor-features", labelKey: "settings.nav.features", depth: 0, tab: "features" },

  // —— File sorting ——
  { id: "settings-anchor-models", labelKey: "settings.nav.sortingModels", depth: 0, tab: "fileSorting" },
  { id: "sorting-output", labelKey: "settings.nav.sortingOutputDir", depth: 0, tab: "fileSorting" },
  { id: "sorting-rules", labelKey: "settings.nav.sortingRulesAuto", depth: 0, tab: "fileSorting" },
  { id: "sorting-files", labelKey: "settings.nav.sortingFilesLang", depth: 0, tab: "fileSorting" },
  { id: "sorting-scans", labelKey: "settings.nav.sortingScans", depth: 0, tab: "fileSorting" },
  { id: "sorting-classification", labelKey: "settings.nav.sortingFineTune", depth: 0, tab: "fileSorting" },

  // —— Privacy & account ——
  { id: "settings-anchor-account", labelKey: "settings.nav.accountProfile", depth: 0, tab: "privacyAccount" },
  { id: "settings-anchor-privacy", labelKey: "settings.nav.privacyTelemetry", depth: 0, tab: "privacyAccount" },
  { id: "settings-anchor-sync", labelKey: "settings.nav.syncDevices", depth: 0, tab: "privacyAccount" },
  { id: "settings-anchor-license", labelKey: "settings.nav.licenseTrial", depth: 0, tab: "privacyAccount" },
  { id: "license-trial", labelKey: "settings.nav.trial", depth: 1, tab: "privacyAccount" },
  { id: "license-key", labelKey: "settings.nav.licenseKey", depth: 1, tab: "privacyAccount" },

  // —— About & help ——
  { id: "settings-anchor-system", labelKey: "settings.nav.systemDiagnostics", depth: 0, tab: "aboutHelp" },
  { id: "settings-app-updates", labelKey: "settings.nav.appUpdates", depth: 0, tab: "aboutHelp" },
  { id: "settings-app-language", labelKey: "settings.nav.appLanguage", depth: 0, tab: "aboutHelp" },
];

/** Which tab owns a side-nav scroll target. */
export function settingsNavTabForEntryId(entryId: string): SettingsNavTab | null {
  const fromNav = SETTINGS_NAV_ENTRIES.find((entry) => entry.id === entryId)?.tab;
  if (fromNav) return fromNav;

  // DOM-only sections (no side-nav row) still belong to a tab for scroll/filter.
  const domTabMap: Record<string, SettingsNavTab> = {
    "settings-routing": "aiAgents",
    "settings-anchor-general": "fileSorting",
    "sorting-briefing": "fileSorting",
    "settings-sort-infra-dev": "fileSorting",
    "account-profile": "privacyAccount",
    "settings-privacy": "privacyAccount",
    "license-usage": "privacyAccount",
    "system-status": "aboutHelp",
    "settings-app-updates": "aboutHelp",
  };
  return domTabMap[entryId] ?? null;
}

/** Whether a settings section belongs to the active category tab. */
export function isSettingsSectionInTab(sectionId: string, tab: SettingsNavTab): boolean {
  return settingsNavTabForEntryId(sectionId) === tab;
}

/** Gear icon for the top-level Settings sidebar entry. */
export const SETTINGS_PARENT_ICON =
  "M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.431l-1.296 2.247a1.125 1.125 0 0 1-1.37.491l-1.216-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281a1.14 1.14 0 0 0-.645-.87a7.523 7.523 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827a1.125 1.125 0 0 1-.26-1.431l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z";

/** Sidebar icons for each settings category (Heroicons stroke paths). */
export const SETTINGS_SUBTAB_ICONS: Record<SettingsNavTab, string> = {
  aiAgents:
    "M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z",
  features:
    "M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z",
  fileSorting:
    "M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v8.25m19.5 0v.75A2.25 2.25 0 0 1 19.5 17.25h-15a2.25 2.25 0 0 1-2.25-2.25V13.5",
  privacyAccount:
    "M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z",
  aboutHelp:
    "M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z",
};

/** First primary section in a settings category (for sidebar tab switches). */
export function firstSettingsSectionIdForTab(
  tab: SettingsNavTab,
  entries: readonly SettingsNavEntry[] = SETTINGS_NAV_ENTRIES
): string | null {
  return entries.find((entry) => entry.tab === tab && entry.depth === 0)?.id ?? null;
}

/** Tab to show when the product tour highlights a settings block. */
export function settingsNavTabForTourHighlight(
  tourHighlightId: string | null | undefined
): SettingsNavTab | null {
  const sectionId = settingsNavSectionForTourHighlight(tourHighlightId);
  if (!sectionId) return null;
  return settingsNavTabForEntryId(sectionId);
}

const SETTINGS_NAV_TAB_STORAGE_KEY = "exosites.settingsNavTab.v7";

const VALID_SETTINGS_NAV_TABS: readonly SettingsNavTab[] = [
  "aiAgents",
  "features",
  "fileSorting",
  "privacyAccount",
  "aboutHelp",
];

function normalizeSettingsNavTab(value: string | null): SettingsNavTab | null {
  if (!value) return null;
  if (value === "chatVoice" || value === "aiProvider" || value === "aiVoice") return "aiAgents";
  if (value === "advanced") return "aboutHelp";
  if (value === "essentials" || value === "aiModels") return "fileSorting";
  if (VALID_SETTINGS_NAV_TABS.includes(value as SettingsNavTab)) {
    return value as SettingsNavTab;
  }
  return null;
}

/** Restores the last selected settings nav tab (defaults to AI agents). */
export function loadSettingsNavTab(): SettingsNavTab {
  try {
    const stored = sessionStorage.getItem(SETTINGS_NAV_TAB_STORAGE_KEY);
    const normalized = normalizeSettingsNavTab(stored);
    if (normalized) return normalized;
    for (const legacyKey of [
      "exosites.settingsNavTab.v6",
      "exosites.settingsNavTab.v5",
      "exosites.settingsNavTab.v4",
      "exosites.settingsNavTab.v3",
      "exosites.settingsNavTab.v2",
      "exosites.settingsNavTab.v1",
    ]) {
      const fromLegacy = normalizeSettingsNavTab(sessionStorage.getItem(legacyKey));
      if (fromLegacy) return fromLegacy;
    }
  } catch {
    /* ignore */
  }
  return "aiAgents";
}

/** Persists the active settings nav tab for the session. */
export function persistSettingsNavTab(tab: SettingsNavTab): void {
  try {
    sessionStorage.setItem(SETTINGS_NAV_TAB_STORAGE_KEY, tab);
  } catch {
    /* ignore */
  }
}

/** Product-tour highlight ids → settings side-nav section ids (scroll-spy alone mislabels during tour). */
const TOUR_HIGHLIGHT_SETTINGS_NAV_SECTION: Record<string, string> = {
  "settings-system": "settings-anchor-system",
  "settings-models-overview": "settings-anchor-models",
  "settings-output-folder": "sorting-output",
};

/**
 * Side-nav section to highlight while the guided tour focuses a settings block.
 * Returns null when the tour is not on a mapped settings step.
 */
export function settingsNavSectionForTourHighlight(
  tourHighlightId: string | null | undefined
): string | null {
  if (!tourHighlightId) return null;
  return TOUR_HIGHLIGHT_SETTINGS_NAV_SECTION[tourHighlightId] ?? null;
}
