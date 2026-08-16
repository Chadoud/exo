import { useState, useLayoutEffect, useRef, useCallback, useMemo, useEffect } from "react";
import type { AppSettings } from "../types/settings";
import type { EntitlementStatus } from "../api";
import type { UseModelsReturn } from "../hooks/useModels";
import OutputFolderSection from "./settings/OutputFolderSection";
import AdvancedClassificationSection from "./settings/AdvancedClassificationSection";
import RemoteLlmSection from "./settings/RemoteLlmSection";
import { canUseProductDebug } from "../utils/productDebugAccess";
import SortInstructionsStrip from "./sort/instructions/SortInstructionsStrip";
import SettingsPrivacySection from "./settings/SettingsPrivacySection";
import SettingsVoiceInteractionSection from "./settings/SettingsVoiceInteractionSection";
import SettingsFeaturesSection from "./settings/SettingsFeaturesSection";
import SettingsMemorySection from "./settings/SettingsMemorySection";
import SettingsSyncSection from "./settings/SettingsSyncSection";
import SettingsAiProviderSection from "./settings/SettingsAiProviderSection";
import SettingsAppLanguageSection from "./settings/SettingsAppLanguageSection";
import ActiveModelSection from "./settings/ActiveModelSection";
import SettingsGroup from "./settings/SettingsGroup";
import ScansAndPhotosSection from "./settings/ScansAndPhotosSection";
import SettingsAppStatus from "./settings/SettingsAppStatus";
import SettingsAppUpdateSection from "./settings/SettingsAppUpdateSection";
import SettingsAccountSection from "./settings/SettingsAccountSection";
import SettingsLicenseSection from "./settings/SettingsLicenseSection";
import SettingsModels from "./SettingsModels";
import SettingsSideNav from "./SettingsSideNav";
import { SECTION_LABEL_CLASS, SECONDARY_BTN_CLASS } from "../utils/styles";
import { SETTINGS_NAV_ENTRIES, firstSettingsSectionIdForTab, isSettingsSectionInTab, settingsNavSectionForTourHighlight, settingsNavTabForEntryId, settingsNavTabForTourHighlight, type SettingsNavTab } from "../utils/settingsNav";
import { filterSettingsSearchResults } from "../utils/settingsPanelSearch";
import { APP_SHELL_GUTTER_X_CLASS } from "../utils/styles";
import { useSettingsPanelScroll } from "../hooks/useSettingsPanelScroll";
import { trialDurationDays } from "../utils/entitlementUi";

const ACCOUNT_NAV_IDS = new Set<string>(["settings-anchor-account", "account-profile"]);
import { useSettingsOcrCatalog } from "../hooks/useSettingsOcrCatalog";
import SectionHeader from "./ui/SectionHeader";
import SelectDropdown, {
  SELECT_DROPDOWN_PANEL_CLASS,
  selectDropdownPlainOptionClassName,
} from "./ui/SelectDropdown";
import { useI18n } from "../i18n/I18nContext";
import { useCloudSortActive } from "../hooks/useCloudSortActive";
import PanelShell from "./ui/PanelShell";
import { getSettingsPanelHeadingKeys } from "../utils/workspacePanelHeadings";

/** Expand "Sorting & output" while the tour highlights any block inside it. */
const SORTING_GENERAL_SECTION_IDS = [
  "settings-anchor-models",
  "sorting-output",
  "sorting-rules",
  "sorting-files",
  "sorting-scans",
  "sorting-classification",
] as const;

function isSettingsPanelSectionVisible(
  sectionId: string,
  activeTab: SettingsNavTab,
  showAllTabs: boolean
): boolean {
  if (showAllTabs) return true;
  return isSettingsSectionInTab(sectionId, activeTab);
}

/** Expand "Sorting & output" while the tour highlights the output folder block. */
const SORTING_OUTPUT_TOUR_HIGHLIGHT_IDS = new Set<string>(["settings-output-folder"]);

const LANGUAGES = [
  "English", "French", "Spanish", "German", "Italian",
  "Portuguese", "Dutch", "Arabic", "Chinese", "Japanese",
];

interface SettingsPanelProps {
  backendOnline: boolean;
  backendHealthProbing: boolean;
  settings: AppSettings;
  modelHook: UseModelsReturn;
  onSettingsPatch: (patch: Partial<AppSettings>) => void;
  /** Expand matching sections while the product tour highlights them. */
  tourHighlightId?: string | null;
  className?: string;
  entitlement: EntitlementStatus | null;
  onEntitlementRefresh: () => void | Promise<void>;
  /** Exposes programmatic scroll-to-section for command palette (registered on mount). */
  onRegisterSettingsScroll?: (scrollTo: (id: string) => void, ready: boolean) => void;
  /** Opens add-model modal (mounted at app root so it works from any tab). */
  openModelDownloadModal: (role: "sort" | "vision") => void;
  /** Opens Gemini API key setup modal (chat/voice). */
  openGeminiSetupModal: () => void;
  onOpenMemoriesTab?: () => void;
  onOpenSourcesTab?: () => void;
  /** Active settings category — controlled from main sidebar. */
  activeNavTab: SettingsNavTab;
  /** Parent Settings nav: every category on one scrollable page. */
  showAllSections?: boolean;
  onNavTabChange: (tab: SettingsNavTab) => void;
  /** Fired when scroll-spy changes section (syncs sidebar highlight in “all sections” mode). */
  onScrollSectionReport?: (sectionId: string) => void;
  onRetryBackend?: () => void | Promise<void>;
}

export default function SettingsPanel({
  backendOnline,
  backendHealthProbing,
  settings,
  modelHook,
  onSettingsPatch,
  tourHighlightId = null,
  className = "",
  entitlement,
  onEntitlementRefresh,
  onRegisterSettingsScroll,
  openModelDownloadModal,
  openGeminiSetupModal,
  onOpenMemoriesTab,
  onOpenSourcesTab,
  activeNavTab,
  showAllSections = false,
  onNavTabChange,
  onScrollSectionReport,
  onRetryBackend,
}: SettingsPanelProps) {
  const { t } = useI18n();
  const showSortDevControls = canUseProductDebug(entitlement);
  const { cloudSortActive } = useCloudSortActive(entitlement);
  const [installedModalRole, setInstalledModalRole] = useState<null | "sort" | "vision">(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollSpyPausedRef = useRef(false);
  const scrollSpyPauseTimerRef = useRef<number | null>(null);
  const prevNavTabRef = useRef(activeNavTab);
  const settingsNavEntries = useMemo(() => {
    let entries = entitlement?.cloudAuthRequired
      ? SETTINGS_NAV_ENTRIES
      : SETTINGS_NAV_ENTRIES.filter((e) => !ACCOUNT_NAV_IDS.has(e.id));
    if (!showSortDevControls) {
      entries = entries.filter((e) => e.id !== "settings-sort-infra-dev");
    }
    return entries;
  }, [entitlement?.cloudAuthRequired, showSortDevControls]);
  const [navFilterQuery, setNavFilterQuery] = useState("");
  const showAllSettingsTabs = showAllSections || navFilterQuery.trim().length > 0;
  const scrollSectionIds = useMemo(() => {
    const scopedEntries = showAllSettingsTabs
      ? settingsNavEntries
      : settingsNavEntries.filter((entry) => entry.tab === activeNavTab);
    return scopedEntries.map((entry) => entry.id);
  }, [settingsNavEntries, activeNavTab, showAllSettingsTabs]);
  const { activeSectionId, scrollToSectionId: scrollToSettingsId, markSectionActive } = useSettingsPanelScroll({
    scrollRef,
    sectionIds: scrollSectionIds,
    scrollSpyPausedRef,
    onActiveSectionChange: onScrollSectionReport,
  });

  const pauseScrollSpy = useCallback((ms = 120) => {
    scrollSpyPausedRef.current = true;
    if (scrollSpyPauseTimerRef.current !== null) {
      window.clearTimeout(scrollSpyPauseTimerRef.current);
    }
    scrollSpyPauseTimerRef.current = window.setTimeout(() => {
      scrollSpyPausedRef.current = false;
      scrollSpyPauseTimerRef.current = null;
    }, ms);
  }, []);

  useEffect(
    () => () => {
      if (scrollSpyPauseTimerRef.current !== null) {
        window.clearTimeout(scrollSpyPauseTimerRef.current);
      }
    },
    []
  );

  const sectionVisible = useCallback(
    (sectionId: string) =>
      isSettingsPanelSectionVisible(sectionId, activeNavTab, showAllSettingsTabs),
    [activeNavTab, showAllSettingsTabs]
  );
  /** Hide duplicate group title when the panel header already names this tab (search shows all headers). */
  const showTabGroupHeader = useCallback(
    (tab: SettingsNavTab) => activeNavTab !== tab || showAllSettingsTabs,
    [activeNavTab, showAllSettingsTabs]
  );
  const showSortingGeneralGroup = useMemo(
    () => SORTING_GENERAL_SECTION_IDS.some((sectionId) => sectionVisible(sectionId)),
    [sectionVisible]
  );
  const {
    ocrSearch,
    setOcrSearch,
    textInstalledLangs,
    effectiveOcrCodes,
    ocrCatalogRows,
    toggleOcrLanguagePack,
    osdOnly,
  } = useSettingsOcrCatalog({ settings, modelHook, onSettingsPatch, t });

  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const toggleSection = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const tourNavSectionId = settingsNavSectionForTourHighlight(tourHighlightId);
  const sideNavActiveId = tourNavSectionId ?? activeSectionId;

  useEffect(() => {
    if (!tourHighlightId) return;
    const tab = settingsNavTabForTourHighlight(tourHighlightId);
    if (tab) onNavTabChange(tab);
  }, [tourHighlightId, onNavTabChange]);

  useLayoutEffect(() => {
    if (showAllSections || navFilterQuery.trim()) return;
    if (prevNavTabRef.current === activeNavTab) return;
    prevNavTabRef.current = activeNavTab;
    const firstSectionId = firstSettingsSectionIdForTab(activeNavTab, settingsNavEntries);
    pauseScrollSpy(150);
    markSectionActive(firstSectionId ?? "");
    const scrollPane = scrollRef.current;
    if (scrollPane) scrollPane.scrollTop = 0;
  }, [activeNavTab, navFilterQuery, settingsNavEntries, markSectionActive, pauseScrollSpy, showAllSections]);

  const tabScopedNavEntries = useMemo(
    () => settingsNavEntries.filter((entry) => entry.tab === activeNavTab),
    [settingsNavEntries, activeNavTab]
  );

  const filteredNavEntries = useMemo(
    () =>
      filterSettingsSearchResults(
        navFilterQuery,
        navFilterQuery.trim() || showAllSections
          ? settingsNavEntries
          : tabScopedNavEntries,
        t,
        sideNavActiveId
      ),
    [settingsNavEntries, tabScopedNavEntries, navFilterQuery, showAllSections, t, sideNavActiveId]
  );

  const jumpToSection = useCallback(
    (id: string, opts?: { behavior?: ScrollBehavior; expandIds?: string[] }) => {
      const tab = settingsNavTabForEntryId(id);
      if (!showAllSections && tab && tab !== activeNavTab) {
        prevNavTabRef.current = tab;
        onNavTabChange(tab);
      }
      if (opts?.expandIds?.length) {
        setCollapsed((prev) => {
          const next = new Set(prev);
          for (const sectionId of opts.expandIds!) next.delete(sectionId);
          return next;
        });
      }
      pauseScrollSpy(180);
      markSectionActive(id);
      requestAnimationFrame(() => {
        scrollToSettingsId(id, { behavior: opts?.behavior ?? "auto" });
      });
    },
    [activeNavTab, markSectionActive, onNavTabChange, pauseScrollSpy, scrollToSettingsId, showAllSections]
  );

  const scrollToSettingsSection = useCallback(
    (id: string) => jumpToSection(id),
    [jumpToSection]
  );

  useEffect(() => {
    onRegisterSettingsScroll?.(scrollToSettingsSection, true);
    return () => onRegisterSettingsScroll?.(() => {}, false);
  }, [onRegisterSettingsScroll, scrollToSettingsSection]);

  const handleNavSelect = useCallback(
    (id: string) => {
      const hit = filteredNavEntries.find((entry) => entry.id === id);
      jumpToSection(id, { expandIds: hit?.expandSectionIds });
    },
    [filteredNavEntries, jumpToSection]
  );

  const [langDropdownOpen, setLangDropdownOpen] = useState(false);
  const langTriggerRef = useRef<HTMLButtonElement>(null);
  const closeLangDropdown = useCallback(() => {
    setLangDropdownOpen(false);
    langTriggerRef.current?.focus();
  }, []);

  const openVisionModelsSettings = useCallback(() => {
    jumpToSection("settings-anchor-models", {
      expandIds: ["installed-models"],
    });
  }, [jumpToSection]);

  useLayoutEffect(() => {
    if (!tourHighlightId) return;
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (tourHighlightId === "settings-system") {
        next.delete("system-status");
        next.delete("ocr");
      }
      if (
        tourHighlightId === "settings-models-overview" ||
        tourHighlightId === "settings-models-active"
      ) {
        next.delete("active-model");
        next.delete("installed-models");
      }
      if (tourHighlightId && SORTING_OUTPUT_TOUR_HIGHLIGHT_IDS.has(tourHighlightId)) {
        next.delete("sorting-output");
      }
      if (tourHighlightId === "settings-vision-fallback") {
        next.delete("ocr");
      }
      return next;
    });
  }, [tourHighlightId]);

  const settingsPanelHeading = useMemo(() => {
    if (navFilterQuery.trim()) {
      return {
        titleKey: "settings.panelSearchTitle",
        subtitleKey: "settings.panelSearchSubtitle",
      };
    }
    return getSettingsPanelHeadingKeys(activeNavTab, showAllSections);
  }, [activeNavTab, navFilterQuery, showAllSections]);

  return (
    <div className={`flex flex-1 min-h-0 w-full min-w-0 ${className}`.trim()}>
      <SettingsSideNav
        items={filteredNavEntries}
        activeId={sideNavActiveId}
        onSelect={handleNavSelect}
        t={t}
        title={t("settings.sideNavTitle")}
        navAriaLabel={t("settings.sideNavAria")}
        searchQuery={navFilterQuery}
        onSearchChange={setNavFilterQuery}
      />
      <div
        ref={scrollRef}
        className={`flex-1 overflow-y-auto overflow-x-hidden min-w-0 py-4 ${APP_SHELL_GUTTER_X_CLASS} pb-10 space-y-10`}
      >
        <PanelShell
          title={t(settingsPanelHeading.titleKey)}
          subtitle={t(settingsPanelHeading.subtitleKey)}
        />

        {sectionVisible("settings-anchor-ai-provider") && (
        <SettingsGroup
          id="settings-anchor-ai-provider"
          title={t("settings.aiProviderGroupTitle")}
          summary={t("settings.aiProviderGroupSummary")}
          description={t("settings.aiProviderGroupDesc")}
          showHeader={showTabGroupHeader("aiAgents")}
        >
          <SettingsAiProviderSection
            settings={settings}
            onSettingsPatch={onSettingsPatch}
            backendOnline={backendOnline}
            onOpenGeminiSetup={openGeminiSetupModal}
            cloudSortActive={cloudSortActive}
          />
          <p className="text-xs text-text-secondary">{t("settings.aiProviderCloudEgressHint")}</p>
        </SettingsGroup>
        )}

        {sectionVisible("settings-anchor-voice") && (
        <SettingsGroup
          id="settings-anchor-voice"
          title={t("settings.voiceGroupTitle")}
          summary={t("settings.voiceGroupSummary")}
          description={t("settings.voiceGroupDesc")}
          showHeader={false}
        >
          <SettingsVoiceInteractionSection settings={settings} onSettingsPatch={onSettingsPatch} />
        </SettingsGroup>
        )}

        {sectionVisible("settings-anchor-features") && (
        <SettingsGroup
          id="settings-anchor-features"
          title={t("settings.featuresGroupTitle")}
          summary={t("settings.featuresGroupSummary")}
          description={t("settings.featuresGroupDesc")}
          showHeader={showTabGroupHeader("features")}
        >
          <SettingsFeaturesSection
            settings={settings}
            onSettingsPatch={onSettingsPatch}
            onOpenSourcesTab={onOpenSourcesTab}
          />
        </SettingsGroup>
        )}

        {sectionVisible("settings-anchor-memory") && (
        <SettingsGroup
          id="settings-anchor-memory"
          title={t("settings.aiMemoryGroupTitle")}
          summary={t("settings.aiMemoryGroupSummary")}
          description={t("settings.aiMemoryGroupDesc")}
          showHeader={false}
        >
          <SettingsMemorySection
            settings={settings}
            onSettingsPatch={onSettingsPatch}
            backendOnline={backendOnline}
            onOpenMemoriesTab={onOpenMemoriesTab}
          />
        </SettingsGroup>
        )}

        {sectionVisible("settings-anchor-models") && (
        <SettingsGroup
          id="settings-anchor-models"
          title={t("settings.aiModelsTitle")}
          summary={cloudSortActive ? t("settings.aiModelsSummaryCloud") : t("settings.aiModelsSummary")}
          description={cloudSortActive ? t("settings.aiModelsDescCloud") : t("settings.aiModelsDesc")}
          showHeader={showTabGroupHeader("fileSorting")}
        >
          <ActiveModelSection
            settings={settings}
            installedModels={modelHook.models}
            collapsed={collapsed}
            onToggleSection={toggleSection}
            onOpenSortDownload={cloudSortActive ? undefined : () => openModelDownloadModal("sort")}
            onOpenSortInstalledBrowse={cloudSortActive ? undefined : () => setInstalledModalRole("sort")}
            onRefreshModels={() => void modelHook.refreshModels()}
            refreshModelsLoading={modelHook.loadingModels}
            cloudSortActive={cloudSortActive}
            entitlement={entitlement}
            backendOnline={backendOnline}
          />
          {!cloudSortActive ? (
            <>
              <div className="flex flex-wrap gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => openModelDownloadModal("sort")}
                  className={SECONDARY_BTN_CLASS}
                >
                  {t("settings.models.downloadSort")}
                </button>
                <button
                  type="button"
                  onClick={() => openModelDownloadModal("vision")}
                  className={SECONDARY_BTN_CLASS}
                >
                  {t("settings.models.downloadVision")}
                </button>
              </div>
              <SettingsModels
                settings={settings}
                modelHook={modelHook}
                onSettingsPatch={onSettingsPatch}
                collapsed={collapsed}
                onToggleSection={toggleSection}
                showActiveModel={false}
                sections={["installed"]}
                spacingAfterActiveModel
                externalInstalledModal={installedModalRole}
                onCloseExternalInstalledModal={() => setInstalledModalRole(null)}
                entitlement={entitlement}
              />
            </>
          ) : null}
        </SettingsGroup>
        )}

        {showSortingGeneralGroup && (
        <SettingsGroup
          id="settings-anchor-general"
          tour="settings-sorting-header"
          title={t("settings.sortingHeading")}
          summary={t("settings.sortingSectionSummary")}
          description={t("settings.sortingHint")}
          showHeader={showTabGroupHeader("fileSorting")}
        >
          {sectionVisible("sorting-output") && (
          <div>
            <SectionHeader
              id="sorting-output"
              label={t("settings.nav.sortingOutputDir")}
              collapsed={collapsed.has("sorting-output")}
              onToggle={toggleSection}
            />
            {!collapsed.has("sorting-output") && (
              <div className="rounded-xl border border-border bg-bg-card p-4 space-y-4">
                <OutputFolderSection local={settings} update={onSettingsPatch} />
                <div className="rounded-lg border border-border-soft bg-bg-secondary/40 px-3 py-2.5 text-xs text-muted leading-relaxed">
                  <span className="font-medium text-text-primary">{t("settings.folderNamesStrong")}</span> {t("settings.folderNamesHint")}{" "}
                  <span className="text-text-primary">{t("settings.uncertain")}</span>. {t("settings.folderNamesSuffix")}
                </div>
              </div>
            )}
          </div>
          )}

          {sectionVisible("sorting-rules") && (
          <div>
            <SectionHeader
              id="sorting-rules"
              label={t("settings.nav.sortingRulesAuto")}
              collapsed={collapsed.has("sorting-rules")}
              onToggle={toggleSection}
            />
            {!collapsed.has("sorting-rules") ? (
              <SortInstructionsStrip
                settings={settings}
                onSettingsPatch={onSettingsPatch}
                backendOnline={backendOnline}
              />
            ) : null}
          </div>
          )}

          {sectionVisible("sorting-files") && (
          <div>
            <SectionHeader
              id="sorting-files"
              label={t("settings.nav.sortingFilesLang")}
              collapsed={collapsed.has("sorting-files")}
              onToggle={toggleSection}
            />
            {!collapsed.has("sorting-files") && (
              <div className="rounded-xl border border-border bg-bg-card p-4 space-y-4">
                <div data-tour="settings-file-mode">
                  <label className={SECTION_LABEL_CLASS}>{t("settings.fileOpMode")}</label>
                  <div className="grid grid-cols-2 gap-2">
                    {(["copy", "move"] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => onSettingsPatch({ mode: m })}
                        className={`py-2 rounded-lg text-sm font-medium border transition-colors capitalize
                        ${settings.mode === m
                          ? "bg-button-primary border-accent text-white"
                          : "bg-bg-secondary border-border text-muted hover:border-accent"
                        }`}
                      >
                        {m === "copy" ? (
                          t("settings.copyMode")
                        ) : (
                          <span className="flex items-center justify-center gap-1.5">
                            <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                            </svg>
                            {t("settings.moveMode")}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                  {settings.mode === "move" && (
                    <p className="text-xs text-warning mt-2">{t("settings.moveWarning")}</p>
                  )}
                </div>

                <div data-tour="settings-folder-language">
                  <label htmlFor="settings-folder-lang" className={SECTION_LABEL_CLASS}>
                    {t("settings.folderNameLanguage")}
                  </label>
                  <SelectDropdown
                    triggerId="settings-folder-lang"
                    open={langDropdownOpen}
                    onOpenChange={(o) => {
                      if (!o) closeLangDropdown();
                      else setLangDropdownOpen(true);
                    }}
                    triggerRef={langTriggerRef}
                    triggerLabel={settings.language}
                    ariaLabel={t("settings.folderNameLanguageAria")}
                    portaled
                  >
                    <div role="listbox" aria-label={t("settings.selectLanguageAria")} className={SELECT_DROPDOWN_PANEL_CLASS}>
                      <div className="max-h-[240px] overflow-y-auto py-1">
                        {LANGUAGES.map((l) => (
                          <button
                            key={l}
                            type="button"
                            role="option"
                            aria-selected={settings.language === l}
                            onClick={() => {
                              onSettingsPatch({ language: l });
                              closeLangDropdown();
                            }}
                            className={selectDropdownPlainOptionClassName(settings.language === l, "compact")}
                          >
                            {l}
                          </button>
                        ))}
                      </div>
                    </div>
                  </SelectDropdown>
                  <p className="text-2xs text-muted mt-1.5 max-w-xl">{t("settings.folderNameLanguageHint")}</p>
                </div>
              </div>
            )}
          </div>
          )}

          {sectionVisible("sorting-scans") && (
            <ScansAndPhotosSection
              settings={settings}
              ocrInfo={modelHook.ocrInfo}
              backendOnline={backendOnline}
              models={modelHook.models}
              loadingModels={modelHook.loadingModels}
              onOpenVisionModelsSettings={openVisionModelsSettings}
              entitlement={entitlement}
              ocrSearch={ocrSearch}
              setOcrSearch={setOcrSearch}
              ocrCatalogRows={ocrCatalogRows}
              textInstalledLangs={textInstalledLangs}
              effectiveOcrCodes={effectiveOcrCodes}
              toggleOcrLanguagePack={toggleOcrLanguagePack}
              onUseAllInstalledOcr={() => onSettingsPatch({ ocrLanguages: [] })}
              osdOnly={osdOnly}
            />
          )}

          {sectionVisible("sorting-classification") && (
            <AdvancedClassificationSection />
          )}
        </SettingsGroup>
        )}

        {entitlement?.cloudAuthRequired && sectionVisible("settings-anchor-account") && (
          <SettingsGroup
            id="settings-anchor-account"
            title={t("settings.accountGroupTitle")}
            summary={t("settings.accountGroupSummary")}
            description={t("settings.accountGroupDesc")}
          >
            <SettingsAccountSection
              entitlement={entitlement}
              onSessionChange={onEntitlementRefresh}
              telemetryOptIn={settings.telemetryOptIn}
              uiLocale={settings.uiLocale}
            />
          </SettingsGroup>
        )}

        {sectionVisible("settings-anchor-privacy") && (
        <SettingsGroup
          id="settings-anchor-privacy"
          title={t("settings.privacyGroupTitle")}
          summary={t("settings.privacyGroupSummary")}
          description={t("settings.privacyGroupDesc")}
        >
          <SettingsPrivacySection
            settings={settings}
            onSettingsPatch={onSettingsPatch}
            backendOnline={backendOnline}
          />
        </SettingsGroup>
        )}

        {sectionVisible("settings-anchor-sync") && (
        <SettingsGroup
          id="settings-anchor-sync"
          title={t("sync.settingsTitle")}
          summary={t("sync.settingsSummary")}
          description={t("sync.settingsDesc")}
        >
          <SettingsSyncSection
            canUseSync={entitlement?.canUseSync !== false}
            licensed={Boolean(entitlement?.licensed || entitlement?.unlimitedBuild)}
            onUpgrade={() => scrollToSettingsSection("settings-anchor-license")}
          />
        </SettingsGroup>
        )}

        {sectionVisible("settings-anchor-license") && (
        <SettingsGroup
          id="settings-anchor-license"
          title={t("settings.licenseTitle")}
          summary={t("settings.licenseSummary")}
          description={t("settings.licenseDesc", { days: trialDurationDays() })}
        >
          <SettingsLicenseSection
            entitlement={entitlement}
            onEntitlementRefresh={onEntitlementRefresh}
          />
        </SettingsGroup>
        )}

        {sectionVisible("settings-anchor-system") && (
        <SettingsGroup
          id="settings-anchor-system"
          tour="settings-system"
          title={t("settings.aboutHelpTitle")}
          summary={t("settings.aboutHelpSummary")}
          description={t("settings.aboutHelpDesc")}
          showHeader={showTabGroupHeader("aboutHelp")}
        >
          <SettingsAppStatus
            backendOnline={backendOnline}
            backendHealthProbing={backendHealthProbing}
            modelCount={modelHook.models.length}
            loadingModels={modelHook.loadingModels}
            entitlement={entitlement}
            onRetryBackend={onRetryBackend}
            onEntitlementRefresh={onEntitlementRefresh}
          />
          {sectionVisible("settings-app-updates") && <SettingsAppUpdateSection />}
          {sectionVisible("settings-app-language") && (
          <div>
            <SectionHeader
              id="settings-app-language"
              label={t("settings.nav.appLanguage")}
              collapsed={collapsed.has("settings-app-language")}
              onToggle={toggleSection}
            />
            {!collapsed.has("settings-app-language") && (
              <div className="rounded-xl border border-border bg-bg-card p-4">
                <SettingsAppLanguageSection settings={settings} onSettingsPatch={onSettingsPatch} />
              </div>
            )}
          </div>
          )}
        </SettingsGroup>
        )}

        {showSortDevControls && sectionVisible("settings-sort-infra-dev") && (
        <SettingsGroup
          id="settings-sort-infra-dev"
          title={t("settings.nav.sortInfraDev")}
          summary={t("remoteLlm.hint")}
        >
          <p className="text-2xs text-muted">{t("sortService.devOnlyLabel")}</p>
          <RemoteLlmSection backendOnline={backendOnline} />
        </SettingsGroup>
        )}
      </div>
    </div>
  );
}
