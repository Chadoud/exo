import { useMemo } from "react";
import type { CommandItem } from "../components/CommandPalette";
import type { UiLocale } from "../i18n/locale";
import { translate } from "../i18n/translate";
import { modShortcutLabel } from "../utils/platform";
import { getPrimarySettingsSectionDomId } from "../utils/settingsNav";
import { queueTodoSubTab } from "../utils/deferredPanelActions";
import type { MainNavTab } from "./useMainNavItems";

export function useCommandPaletteCommands(
  uiLocale: UiLocale,
  outputDir: string,
  requestTab: (next: MainNavTab) => void,
  openHelpModal: () => void,
  openTour: () => void,
  jumpToSettingsSection?: (sectionId: string) => void,
  openSettingsHome?: () => void,
  options?: { includeAccountSettings?: boolean; cloudSortActive?: boolean }
): CommandItem[] {
  return useMemo((): CommandItem[] => {
    const mod = modShortcutLabel();
    const cmds: CommandItem[] = [
      {
        id: "tab-exo",
        label: translate(uiLocale, "commands.goAiManager"),
        keywords:
          "ai manager exo tesseract sphere voice fullscreen assistant desktop panel status",
        shortcut: `${mod}+1`,
        run: () => requestTab("exo"),
      },
      {
        id: "tab-assistant",
        label: translate(uiLocale, "commands.goAssistant"),
        keywords: "assistant chat mail calendar integrations permissions tools",
        shortcut: `${mod}+2`,
        run: () => requestTab("assistant"),
      },
      {
        id: "tab-queue",
        label: translate(uiLocale, "commands.goSort"),
        keywords: "workspace sort queue classify drop organize",
        shortcut: `${mod}+3`,
        run: () => requestTab("queue"),
      },
      {
        id: "tab-overview",
        label: translate(uiLocale, "commands.goResults"),
        keywords: "results folders tree browse output",
        shortcut: `${mod}+4`,
        run: () => requestTab("overview"),
      },
      {
        id: "tab-history",
        label: translate(uiLocale, "commands.goHistory"),
        keywords: "sessions undo log",
        shortcut: `${mod}+5`,
        run: () => requestTab("history"),
      },
      {
        id: "tab-sources",
        label: translate(uiLocale, "commands.goSources"),
        keywords: "gmail email import external cloud inbox connect oauth",
        shortcut: `${mod}+6`,
        run: () => requestTab("sources"),
      },
      {
        id: "tab-settings",
        label: translate(uiLocale, "commands.goSettings"),
        keywords: "settings preferences models ocr output vision",
        shortcut: `${mod}+7`,
        run: () => (openSettingsHome ?? (() => requestTab("settings")))(),
      },
      {
        id: "tab-memories",
        label: translate(uiLocale, "nav.memories"),
        keywords: "memory second brain facts remember knowledge",
        shortcut: `${mod}+8`,
        run: () => requestTab("memories"),
      },
      {
        id: "tab-tasks",
        label: translate(uiLocale, "nav.todoToday"),
        keywords: "tasks todo today action items reminders due briefing",
        shortcut: `${mod}+9`,
        run: () => {
          queueTodoSubTab("today");
          requestTab("tasks");
        },
      },
      {
        id: "tab-todo-inbox",
        label: translate(uiLocale, "nav.todoInbox"),
        keywords: "inbox pending attention failures reminders review nudges",
        run: () => {
          queueTodoSubTab("inbox");
          requestTab("tasks");
        },
      },
      {
        id: "help",
        label: translate(uiLocale, "commands.help"),
        keywords: "keyboard f1 tips",
        shortcut: "F1",
        run: () => openHelpModal(),
      },
      {
        id: "tour",
        label: translate(uiLocale, "commands.tour"),
        keywords: "onboarding walkthrough spotlight",
        run: () => openTour(),
      },
    ];
    const out = outputDir.trim();
    if (out && typeof window.electronAPI?.openPath === "function") {
      cmds.push({
        id: "open-output",
        label: translate(uiLocale, "commands.openOutput"),
        keywords: "explorer finder reveal directory",
        run: () => void window.electronAPI!.openPath!(out),
      });
    }

    const jump = jumpToSettingsSection;
    if (jump) {
      const add = (id: string, labelKey: string, keywords: string) => {
        cmds.push({
          id: `settings-jump-${id}`,
          label: translate(uiLocale, labelKey),
          keywords,
          run: () => jump(id),
        });
      };
      if (options?.includeAccountSettings) {
        add("account-profile", "commands.settingsGoAccount", "account signin profile");
      }
      add(getPrimarySettingsSectionDomId("models"), "commands.settingsGoModels", "ollama models llm install");
      if (!options?.cloudSortActive) {
        cmds.push({
          id: "settings-jump-download-models",
          label: translate(uiLocale, "commands.settingsGoDownloadModels"),
          keywords: "pull model download ollama",
          run: () => {
            jump(getPrimarySettingsSectionDomId("models"));
            window.dispatchEvent(
              new CustomEvent("exosites-open-model-download", { detail: { role: "sort" as const } })
            );
          },
        });
      }
      add("settings-privacy", "commands.settingsGoPrivacy", "telemetry analytics");
      add(getPrimarySettingsSectionDomId("system"), "commands.settingsGoSystem", "backend ocr health");
      add(getPrimarySettingsSectionDomId("license"), "commands.settingsGoLicense", "trial license key");
      add("sorting-output", "commands.settingsGoOutputFolder", "destination folder output");
      add("sorting-rules", "commands.settingsGoRules", "automation patterns");
      add(getPrimarySettingsSectionDomId("voice"), "commands.settingsGoVoice", "voice interaction microphone push to talk");
      add(getPrimarySettingsSectionDomId("assistantTools"), "commands.settingsGoAssistantTools", "assistant permissions capabilities mail calendar");
      add(getPrimarySettingsSectionDomId("aiProvider"), "commands.settingsGoChatProvider", "gemini chat provider api key");
      cmds.push({
        id: "settings-jump-sources",
        label: translate(uiLocale, "commands.settingsGoIntegrations"),
        keywords: "integrations oauth gmail drive external sources connect",
        run: () => requestTab("sources"),
      });
    }

    return cmds;
  }, [
    requestTab,
    openHelpModal,
    openTour,
    outputDir,
    uiLocale,
    jumpToSettingsSection,
    openSettingsHome,
    options?.includeAccountSettings,
    options?.cloudSortActive,
  ]);
}
