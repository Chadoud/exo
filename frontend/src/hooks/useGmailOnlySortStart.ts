import { useCallback, type Dispatch, type SetStateAction } from "react";
import { toast } from "sonner";
import { EntitlementBlockedError, type GmailAnalyzeSlice } from "../api";
import { gmailImportSort } from "../api/gmail";
import { relayConnectorTokens } from "../assistant/connectorContext";
import type { AppSettings } from "../types/settings";
import type { UiLocale } from "../i18n/locale";
import { translate } from "../i18n/translate";
import { effectiveMinConfidenceForJob } from "../utils/automationPreset";
import { documentBriefingRequestField } from "../utils/sortSystemPromptPayload";
import { sortClassifyPayloadForJob } from "../utils/sortClassifyPayload";
import { buildAnalyzeOcrPayload } from "../utils/tesseractLang";
import { resolveSortModelForJob } from "../utils/sortChatInstalledModels";
import { toastUserError } from "../utils/userGuidance";
import type { MainNavTab } from "./useMainNavItems";

function isAbortError(e: unknown): boolean {
  if (e instanceof DOMException && e.name === "AbortError") return true;
  return typeof e === "object" && e !== null && "name" in e && (e as Error).name === "AbortError";
}

function gmailImportBody(
  slice: GmailAnalyzeSlice,
  settings: AppSettings,
  installedTesseractLangs: string[] | undefined,
  installedOllamaModels: string[],
) {
  return {
    gmail_query: slice.gmail_query,
    max_messages: slice.max_messages,
    gmail_import_content: slice.gmail_import_content,
    output_dir: settings.outputDir,
    model: resolveSortModelForJob(installedOllamaModels, settings.model),
    mode: settings.mode,
    language: settings.language,
    vision_model: settings.visionModel.trim() || undefined,
    rules: settings.rules.filter((r) => r.enabled && r.pattern.trim()),
    on_collision: settings.onCollision,
    min_confidence: effectiveMinConfidenceForJob(settings),
    ...buildAnalyzeOcrPayload(settings, installedTesseractLangs),
    ...sortClassifyPayloadForJob(settings),
    ...documentBriefingRequestField(settings),
  };
}

/**
 * Gmail-only Run sort. Lives on the workspace controller so Review does not
 * depend on the Sources card still being mounted (that card used to unregister
 * the mail runner and return no job).
 */
export function useGmailOnlySortStart(opts: {
  uiLocale: UiLocale;
  backendOnline: boolean;
  settings: AppSettings;
  installedTesseractLangs: string[] | undefined;
  installedOllamaModels: string[];
  setTab: Dispatch<SetStateAction<MainNavTab>>;
  setSessionId: Dispatch<SetStateAction<string | null>>;
  startPolling: (jobId: string) => void;
  refreshEntitlement: () => Promise<void>;
  toastEntitlementBlocked: () => void;
}) {
  const {
    uiLocale,
    backendOnline,
    settings,
    installedTesseractLangs,
    installedOllamaModels,
    setTab,
    setSessionId,
    startPolling,
    refreshEntitlement,
    toastEntitlementBlocked,
  } = opts;

  return useCallback(
    async (
      slice: GmailAnalyzeSlice,
      startOpts?: { signal?: AbortSignal },
    ): Promise<string | null> => {
      if (!backendOnline || !settings.outputDir.trim()) {
        toast.message(translate(uiLocale, "queue.gmailNeedOutputDir"));
        return null;
      }
      const signal = startOpts?.signal;
      try {
        await relayConnectorTokens();
        const { job_id, session_id } = await gmailImportSort(
          gmailImportBody(slice, settings, installedTesseractLangs, installedOllamaModels),
          { signal },
        );
        setSessionId(session_id);
        startPolling(job_id);
        setTab("queue");
        return job_id;
      } catch (e) {
        if (signal?.aborted || isAbortError(e)) return null;
        if (e instanceof EntitlementBlockedError) {
          toastEntitlementBlocked();
          void refreshEntitlement();
          return null;
        }
        toastUserError(translate(uiLocale, "queue.gmailImportFailed"), e);
        return null;
      }
    },
    [
      backendOnline,
      settings,
      installedTesseractLangs,
      installedOllamaModels,
      uiLocale,
      setSessionId,
      startPolling,
      setTab,
      toastEntitlementBlocked,
      refreshEntitlement,
    ],
  );
}
