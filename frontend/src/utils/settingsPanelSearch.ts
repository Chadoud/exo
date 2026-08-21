import { ASSISTANT_FEATURE_DEFINITIONS } from "../systemCommands/assistantFeatureCatalog";
import type { SettingsNavEntry } from "./settingsNav";

type SettingsSearchResult = SettingsNavEntry & {
  /** Collapsible subsection ids to expand before scrolling. */
  expandSectionIds: string[];
};

type TranslateFn = (key: string, vars?: Record<string, string | number>) => string;

/** i18n keys whose translated text is searchable per scroll-target id. */
const SECTION_CONTENT_KEYS: Record<string, readonly string[]> = {
  "settings-anchor-account": ["settings.accountGroupTitle", "settings.accountGroupSummary"],
  "account-profile": ["settings.nav.accountOverview"],
  "settings-anchor-ai-provider": [
    "settings.nav.chatGemini",
    "settings.aiProviderGroupSummary",
    "settings.aiProviders.providerBlurb.gemini",
    "settings.aiProviders.sections.geminiDesc",
    "settings.aiProviders.sections.altChatTitle",
    "settings.aiProviders.apiKey",
  ],
  "settings-routing": ["settings.routingHeading", "settings.routingSummary"],
  "settings-anchor-voice": [
    "settings.voiceGroupTitle",
    "settings.voiceGroupSummary",
    "settings.voiceInteractionLegend",
    "settings.voiceModeConversationTitle",
    "settings.voiceModePttTitle",
    "settings.voiceAutoStartLabel",
    "settings.pttShortcutLabel",
    "settings.voiceControlClapToWakeLabel",
    "settings.doubleClapSensitivityTitle",
  ],
  "settings-anchor-models": [
    "settings.aiModelsTitle",
    "settings.aiModelsSummary",
    "settings.aiModelsDesc",
    "settings.nav.sortingModels",
    "settings.activeModels.sectionTitle",
    "settings.activeModels.sectionTitleCloud",
    "settings.activeModels.visionTitle",
    "settings.models.installedTitle",
    "settings.models.visionBlock",
    "settings.nav.downloadModels",
  ],
  "settings-anchor-privacy": [
    "settings.privacyGroupTitle",
    "settings.privacyGroupSummary",
    "settings.privacyTelemetryLabel",
    "settings.privacyTelemetryDisclosure",
    "settings.privacyCrashLabel",
    "settings.privacyCrashDisclosure",
    "settings.privacyFeedbackTitle",
    "settings.privacyTitle",
  ],
  "settings-privacy": [
    "settings.privacyTelemetryLabel",
    "settings.privacyTelemetryDisclosure",
    "settings.privacyCrashLabel",
    "settings.privacyFeedbackTitle",
  ],
  "settings-anchor-features": [
    "settings.featuresGroupTitle",
    "settings.featuresGroupSummary",
    "settings.assistantMasterLabel",
    "settings.featuresMasterHint",
    "settings.assistantAccessReadOption",
    "settings.assistantAccessReadWriteOption",
    "settings.assistantAgentLabel",
  ],
  "settings-anchor-memory": ["settings.nav.assistantMemory"],
  "settings-anchor-system": [
    "settings.systemTitle",
    "settings.systemSummary",
    "settings.systemDesc",
    "settings.nav.systemDiagnostics",
    "settings.aboutHelpTitle",
    "settings.aboutHelpSummary",
    "settings.aboutHelpDesc",
    "settings.navTabAboutHelp",
    "settings.navTabAboutHelpSubtitle",
    "settings.nav.appStatus",
    "settings.appStatus.localService",
    "settings.appStatus.sortService",
    "settings.appStatus.footer",
  ],
  "system-status": [
    "settings.systemTitle",
    "settings.nav.systemDiagnostics",
    "settings.nav.appStatus",
    "settings.aboutHelpTitle",
    "settings.appStatus.localService",
    "settings.appStatus.sortService",
  ],
  "settings-app-language": [
    "settings.nav.appLanguage",
    "settings.appLanguageLabel",
    "settings.aboutHelpTitle",
  ],
  "settings-app-updates": [
    "settings.nav.appUpdates",
    "settings.appUpdates.title",
    "settings.appUpdates.check",
    "settings.aboutHelpTitle",
  ],
  "settings-sort-infra-dev": ["settings.nav.sortInfraDev", "remoteLlm.title"],
  "settings-anchor-sync": ["sync.settingsTitle", "sync.settingsSummary"],
  "settings-anchor-license": [
    "settings.licenseTitle",
    "settings.licenseSummary",
    "settings.nav.licenseTrial",
  ],
  "license-trial": ["settings.nav.trial", "settings.licenseQuotaHeading"],
  "license-key": ["settings.nav.licenseKey", "settings.licenseKeyLabel"],
  "license-usage": ["settings.nav.licenseKey"],
  "settings-anchor-general": [
    "settings.sortingHeading",
    "settings.sortingSectionSummary",
    "settings.sortingHint",
  ],
  "sorting-output": [
    "settings.nav.sortingOutputDir",
    "settings.folderNamesHint",
    "settings.folderNamesStrong",
  ],
  "sorting-rules": [
    "settings.nav.sortingRulesAuto",
    "settings.outputRules",
    "sortInstructionsStrip.title",
    "sortInstructionsStrip.rulesButton",
    "sortInstructionsStrip.structureButton",
    "sortInstructionsStrip.customButton",
    "settings.sortInstructions.expertSummary",
    "settings.sortStructure.title",
  ],
  "sorting-briefing": [
    "settings.nav.sortingBriefing",
    "settings.documentBriefingTitle",
    "settings.documentBriefingHint",
  ],
  "sorting-classification": [
    "settings.nav.sortingFineTune",
    "settings.sortingClassificationSummary",
  ],
  "sorting-files": [
    "settings.nav.sortingFilesLang",
    "settings.fileOpMode",
    "settings.copyMode",
    "settings.moveMode",
    "settings.folderNameLanguage",
  ],
  "sorting-scans": [
    "settings.nav.sortingScans",
    "settings.scans.ready",
    "settings.scans.manageLanguages",
    "settings.ocrPacks",
    "settings.ocrSearchPlaceholder",
  ],
};

/** Subsections that must be expanded so the scroll target is visible. */
const EXPAND_SECTIONS_FOR_NAV_ID: Record<string, readonly string[]> = {
  "settings-anchor-models": ["active-model", "installed-models"],
  "settings-anchor-system": ["system-status"],
  "sorting-output": ["sorting-output"],
  "sorting-rules": ["sorting-rules"],
  "sorting-classification": ["sorting-classification"],
  "sorting-files": ["sorting-files"],
  "settings-app-language": ["settings-app-language"],
};

function textMatchesQuery(text: string, query: string): boolean {
  return text.toLowerCase().includes(query);
}

function entryMatchesQuery(
  entry: SettingsNavEntry,
  query: string,
  t: TranslateFn
): boolean {
  const label = t(entry.labelKey);
  if (textMatchesQuery(label, query) || textMatchesQuery(entry.id, query)) {
    return true;
  }
  const keys = SECTION_CONTENT_KEYS[entry.id] ?? [];
  for (const key of keys) {
    if (textMatchesQuery(t(key), query)) return true;
  }
  if (entry.id === "settings-anchor-features") {
    for (const feature of ASSISTANT_FEATURE_DEFINITIONS) {
      const titleKey = `settings.features.${feature.id}.title`;
      const bodyKey = `settings.features.${feature.id}.body`;
      if (textMatchesQuery(t(titleKey), query) || textMatchesQuery(t(bodyKey), query)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Filter settings nav entries by section title, subsection titles, and in-section copy (i18n).
 * When the query is empty, returns all entries unchanged.
 * Non-matching active sections are not pinned into results.
 */
export function filterSettingsSearchResults(
  query: string,
  navEntries: SettingsNavEntry[],
  t: TranslateFn,
  _activeSectionId: string
): SettingsSearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return navEntries.map((entry) => ({
      ...entry,
      expandSectionIds: [...(EXPAND_SECTIONS_FOR_NAV_ID[entry.id] ?? [])],
    }));
  }

  return navEntries
    .filter((entry) => entryMatchesQuery(entry, q, t))
    .map((entry) => ({
      ...entry,
      expandSectionIds: [...(EXPAND_SECTIONS_FOR_NAV_ID[entry.id] ?? [])],
    }));
}
