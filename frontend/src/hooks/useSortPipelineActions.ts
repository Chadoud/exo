import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { toast } from "sonner";
import {
  api,
  EntitlementBlockedError,
  type DriveStreamStartRequest,
  type EntitlementStatus,
  type FileEntry,
  type GmailAnalyzeSlice,
  type Job,
} from "../api";
import { useJobReviewActions } from "./useJobReviewActions";
import type { GmailMergePrefs } from "../components/workspace/GmailWorkspaceSortBlock";
import type { AppSettings } from "../types/settings";
import type { UiLocale } from "../i18n/locale";
import { effectiveMinConfidenceForJob } from "../utils/automationPreset";
import {
  documentBriefingRequestField,
} from "../utils/sortSystemPromptPayload";
import { sortClassifyPayloadForJob } from "../utils/sortClassifyPayload";
import { buildAnalyzeOcrPayload } from "../utils/tesseractLang";
import { translate } from "../i18n/translate";
import type { MainNavTab } from "./useMainNavItems";
import { getAnalysisModelGap, type BrowserUploadContext } from "../utils/analysisModelReadiness";
import { resolveSortModelForJob } from "../utils/sortChatInstalledModels";
import { hasElectronBridge } from "../utils/platform";
import { hasEntitlementIpc } from "../utils/electronDesktop";
import { allPathsUsableForLocalBackend } from "../utils/localBackendPaths";
import { toastUserError } from "../utils/userGuidance";
import { isLocalAssistantReady } from "../utils/localAssistantReady";
import { track } from "../telemetry/client";
import { TelemetryEventNames } from "../telemetry/schema";
import {
  buildJobStartedProps,
  isOcrEnabledForSort,
} from "../telemetry/jobTelemetry";
import { trackSortBlocked } from "../telemetry/sortTelemetry";
import { trackSortStructureEnabled } from "../telemetry/sortStructureTelemetry";
import { getPrimarySettingsSectionDomId } from "../utils/settingsNav";

type Tab = MainNavTab;

function isAbortError(e: unknown): boolean {
  if (e instanceof DOMException && e.name === "AbortError") return true;
  return typeof e === "object" && e !== null && "name" in e && (e as Error).name === "AbortError";
}

/**
 * Fire-and-forget: silently kick a backend restart so the next user attempt succeeds.
 * Debounced at module level — only one restart IPC in-flight at a time.
 * Does nothing if Electron IPC is unavailable or a restart is already running.
 */
let _kickInFlight = false;
function kickSilentBackendRestart(): void {
  if (!hasEntitlementIpc()) return;
  if (typeof window.electronAPI?.restartBackend !== "function") return;
  if (_kickInFlight) return;
  _kickInFlight = true;
  void window.electronAPI.restartBackend().finally(() => { _kickInFlight = false; });
}

export function useSortPipelineActions(opts: {
  uiLocale: UiLocale;
  backendOnline: boolean;
  backendHealthProbing?: boolean;
  backendServiceStarting?: boolean;
  settings: AppSettings;
  installedTesseractLangs: string[] | undefined;
  entitlement: EntitlementStatus | null;
  refreshEntitlement: () => Promise<void>;
  toastEntitlementBlocked: () => void;
  toastCloudAccountRequired: () => void;
  setTab: Dispatch<SetStateAction<Tab>>;
  setSessionId: Dispatch<SetStateAction<string | null>>;
  currentJob: Job | null;
  setJob: (job: Job | null) => void;
  sessionId: string | null;
  startPolling: (jobId: string) => void;
  stopPolling: () => void;
  patchFileByEntryId: (entryId: string, patch: Partial<FileEntry>) => void;
  refreshTree: () => Promise<void>;
  telemetryFirstJobRef: MutableRefObject<boolean>;
  installedOllamaModels: string[];
  ollamaModelsLoading: boolean;
  /** When true, sort LLM is on the cloud server — skip local model install gates. */
  remoteSortLlm?: boolean;
  jumpToSettingsSection: (sectionId: string) => void;
  /** When set and merge is enabled, desktop path sorts also import the configured Gmail slice in one job. */
  gmailMergePrefsRef: MutableRefObject<GmailMergePrefs | null>;
}) {
  const {
    uiLocale,
    backendOnline,
    backendHealthProbing = false,
    backendServiceStarting = false,
    settings,
    installedTesseractLangs,
    entitlement,
    refreshEntitlement,
    toastEntitlementBlocked,
    toastCloudAccountRequired,
    setTab,
    setSessionId,
    currentJob,
    setJob,
    sessionId,
    startPolling,
    stopPolling,
    patchFileByEntryId,
    refreshTree,
    telemetryFirstJobRef,
    installedOllamaModels,
    ollamaModelsLoading,
    remoteSortLlm = false,
    jumpToSettingsSection,
    gmailMergePrefsRef,
  } = opts;
  const serviceReady = isLocalAssistantReady({
    backendOnline,
    backendHealthProbing,
    backendServiceStarting,
  });

  const emitJobStartedTelemetry = useCallback(
    (paths: string[], gmailForRun: GmailAnalyzeSlice | null, driveStream = false) => {
      if (!settings.telemetryOptIn) return;
      const props = buildJobStartedProps({
        paths,
        gmailForRun,
        driveStream,
        ocrUsed: isOcrEnabledForSort(settings, installedTesseractLangs),
      });
      track(settings.telemetryOptIn, settings.uiLocale, TelemetryEventNames.jobStarted, props);
      trackSortStructureEnabled(settings.telemetryOptIn, settings.uiLocale, settings);
      if (!telemetryFirstJobRef.current) {
        telemetryFirstJobRef.current = true;
        track(settings.telemetryOptIn, settings.uiLocale, TelemetryEventNames.firstDrop, {
          tab: "queue",
        });
      }
    },
    [settings, installedTesseractLangs, telemetryFirstJobRef, uiLocale]
  );

  const sortModelForJob = useCallback(
    () => resolveSortModelForJob(installedOllamaModels, settings.model),
    [installedOllamaModels, settings.model],
  );

  const blockIfAnalysisModelsNotReady = useCallback((): boolean => {
    if (ollamaModelsLoading && !remoteSortLlm) return false;
    const { missingSortModel, missingVisionModel } = getAnalysisModelGap(
      settings,
      installedOllamaModels,
      { remoteSortLlm }
    );
    if (!missingSortModel && !missingVisionModel) return false;

    if (remoteSortLlm && missingSortModel) {
      toast.message(translate(uiLocale, "sortService.title"), {
        description: translate(uiLocale, "sortService.unavailableDetail"),
        duration: 14000,
        action: {
          label: translate(uiLocale, "sortService.checkAgain"),
          onClick: () => jumpToSettingsSection("settings-anchor-models"),
        },
      });
      trackSortBlocked(settings.telemetryOptIn, settings.uiLocale, "model_not_ready");
      return true;
    }

    let descKey: "queue.sortNeedsBothModelsDesc" | "queue.sortNeedsSortModelDesc" | "queue.sortNeedsVisionModelDesc";
    if (missingSortModel && missingVisionModel) descKey = "queue.sortNeedsBothModelsDesc";
    else if (missingSortModel) descKey = "queue.sortNeedsSortModelDesc";
    else descKey = "queue.sortNeedsVisionModelDesc";

    const visionOnly = !missingSortModel && missingVisionModel;
    const sectionId = getPrimarySettingsSectionDomId(visionOnly ? "visionModels" : "models");
    const actionKey = visionOnly ? "queue.sortOpenVisionModels" : "queue.sortOpenAiModels";

    toast.message(translate(uiLocale, "queue.sortNeedsModelsTitle"), {
      description: translate(uiLocale, descKey),
      duration: 14000,
      action: {
        label: translate(uiLocale, actionKey),
        onClick: () => {
          window.dispatchEvent(
            new CustomEvent("exosites-open-model-download", {
              detail: { role: visionOnly ? ("vision" as const) : ("sort" as const) },
            })
          );
          jumpToSettingsSection(sectionId);
        },
      },
    });
    trackSortBlocked(settings.telemetryOptIn, settings.uiLocale, "model_not_ready");
    return true;
  }, [
    ollamaModelsLoading,
    settings,
    installedOllamaModels,
    remoteSortLlm,
    uiLocale,
    jumpToSettingsSection,
    settings.telemetryOptIn,
    settings.uiLocale,
  ]);

  const enqueueLocalAnalyzeJob = useCallback(
    async (
      paths: string[],
      gmailForRun: GmailAnalyzeSlice | null,
      opts?: { signal?: AbortSignal; importSources?: string[] }
    ) => {
      if (gmailForRun !== null) {
        if (!hasElectronBridge() || !allPathsUsableForLocalBackend(paths)) {
          trackSortBlocked(settings.telemetryOptIn, settings.uiLocale, "local_paths_need_desktop");
          toast.message(translate(uiLocale, "queue.localPathsNeedDesktop"), { duration: 11000 });
          return;
        }
      }
      try {
        const ocrPayload = buildAnalyzeOcrPayload(settings, installedTesseractLangs);
        const baseBody = {
          file_paths: paths,
          output_dir: settings.outputDir,
          model: sortModelForJob(),
          mode: settings.mode,
          language: settings.language,
          vision_model: settings.visionModel.trim() || undefined,
          rules: settings.rules.filter((r) => r.enabled && r.pattern.trim()),
          on_collision: settings.onCollision,
          min_confidence: effectiveMinConfidenceForJob(settings),
          ...ocrPayload,
          ...sortClassifyPayloadForJob(settings),
          ...documentBriefingRequestField(settings),
          ...(opts?.importSources?.length ? { import_sources: opts.importSources } : {}),
        };

        const signal = opts?.signal;
        const { job_id, session_id } =
          gmailForRun !== null
            ? await api.analyzeWithSources({ ...baseBody, gmail: gmailForRun }, { signal })
            : await api.analyze(baseBody, { signal });
        setSessionId(session_id);
        startPolling(job_id);
        setTab("queue");
        emitJobStartedTelemetry(paths, gmailForRun);
      } catch (e) {
        if (isAbortError(e)) return;
        if (e instanceof EntitlementBlockedError) {
          toastEntitlementBlocked();
          void refreshEntitlement();
          return;
        }
        toastUserError("Could not start sort", e);
      }
    },
    [
      settings,
      installedTesseractLangs,
      startPolling,
      setTab,
      setSessionId,
      uiLocale,
      refreshEntitlement,
      toastEntitlementBlocked,
      emitJobStartedTelemetry,
      sortModelForJob,
    ]
  );

  const assertDriveStreamPreconditions = useCallback((): boolean => {
    if (!serviceReady) {
      trackSortBlocked(settings.telemetryOptIn, settings.uiLocale, "offline");
      kickSilentBackendRestart();
      toast.message(translate(uiLocale, "toast.dropWhileOfflineTitle"), {
        description: translate(uiLocale, "toast.dropWhileOfflineDesc"),
        duration: 9000,
      });
      return false;
    }
    if (entitlement?.cloudAuthRequired && !entitlement.cloudLoggedIn) {
      trackSortBlocked(settings.telemetryOptIn, settings.uiLocale, "cloud_auth_required");
      toastCloudAccountRequired();
      return false;
    }
    if (entitlement && !entitlement.canAnalyze) {
      trackSortBlocked(settings.telemetryOptIn, settings.uiLocale, "entitlement_blocked");
      toastEntitlementBlocked();
      return false;
    }
    if (!settings.outputDir.trim()) {
      trackSortBlocked(settings.telemetryOptIn, settings.uiLocale, "no_output_folder");
      toast.message(translate(uiLocale, "toast.chooseOutputFolderTitle"), {
        description: translate(uiLocale, "toast.chooseOutputFolderDesc"),
        duration: 8000,
      });
      jumpToSettingsSection("sorting-output");
      return false;
    }
    if (blockIfAnalysisModelsNotReady()) return false;
    return true;
  }, [
    serviceReady,
    uiLocale,
    entitlement,
    toastCloudAccountRequired,
    toastEntitlementBlocked,
    settings.outputDir,
    settings.telemetryOptIn,
    settings.uiLocale,
    jumpToSettingsSection,
    blockIfAnalysisModelsNotReady,
  ]);

  const assertLocalAnalyzePreconditions = useCallback(
    (paths: string[]): boolean => {
      if (!assertDriveStreamPreconditions()) {
        return false;
      }
      if (!paths.length) {
        trackSortBlocked(settings.telemetryOptIn, settings.uiLocale, "empty_selection");
        return false;
      }
      if (hasElectronBridge() && !allPathsUsableForLocalBackend(paths)) {
        trackSortBlocked(settings.telemetryOptIn, settings.uiLocale, "local_paths_need_desktop");
        toast.message(translate(uiLocale, "queue.localPathsNeedDesktop"), { duration: 11000 });
        return false;
      }
      return true;
    },
    [assertDriveStreamPreconditions, settings.telemetryOptIn, settings.uiLocale, uiLocale]
  );

  const gmailSliceFromMergeRef = useCallback(
    (paths: string[]): GmailAnalyzeSlice | null => {
      const merge = gmailMergePrefsRef.current;
      if (
        !merge?.enabled ||
        !hasElectronBridge() ||
        !allPathsUsableForLocalBackend(paths)
      ) {
        return null;
      }
      return {
        gmail_query: merge.gmail_query,
        max_messages: merge.max_messages,
        gmail_import_content: merge.gmail_import_content,
      };
    },
    [gmailMergePrefsRef]
  );

  const handleFiles = useCallback(
    async (paths: string[]) => {
      if (!assertLocalAnalyzePreconditions(paths)) return;
      const slice = gmailSliceFromMergeRef(paths);
      await enqueueLocalAnalyzeJob(paths, slice);
    },
    [assertLocalAnalyzePreconditions, gmailSliceFromMergeRef, enqueueLocalAnalyzeJob]
  );

  const startExplicitLocalSort = useCallback(
    async (
      paths: string[],
      gmailForRun: GmailAnalyzeSlice | null,
      opts?: { signal?: AbortSignal; importSources?: string[] }
    ) => {
      if (!assertLocalAnalyzePreconditions(paths)) return;
      await enqueueLocalAnalyzeJob(paths, gmailForRun, opts);
    },
    [assertLocalAnalyzePreconditions, enqueueLocalAnalyzeJob]
  );

  const startProgressiveDriveSort = useCallback(
    async (
      initialFilePaths: string[],
      opts?: {
        signal?: AbortSignal;
        gmailSlice?: GmailAnalyzeSlice | null;
        importSources?: string[];
      }
    ) => {
      if (!assertDriveStreamPreconditions()) {
        return null;
      }
      if (hasElectronBridge() && initialFilePaths.length > 0 && !allPathsUsableForLocalBackend(initialFilePaths)) {
        trackSortBlocked(settings.telemetryOptIn, settings.uiLocale, "local_paths_need_desktop");
        toast.message(translate(uiLocale, "queue.localPathsNeedDesktop"), { duration: 11000 });
        return null;
      }
      try {
        const ocrPayload = buildAnalyzeOcrPayload(settings, installedTesseractLangs);
        const body: DriveStreamStartRequest = {
          initial_file_paths: initialFilePaths,
          output_dir: settings.outputDir,
          model: sortModelForJob(),
          mode: settings.mode,
          language: settings.language,
          vision_model: settings.visionModel.trim() || undefined,
          rules: settings.rules.filter((r) => r.enabled && r.pattern.trim()),
          on_collision: settings.onCollision,
          min_confidence: effectiveMinConfidenceForJob(settings),
          ...ocrPayload,
          ...sortClassifyPayloadForJob(settings),
          ...documentBriefingRequestField(settings),
          ...(opts?.gmailSlice
            ? {
                gmail: {
                  gmail_query: opts.gmailSlice.gmail_query,
                  max_messages: opts.gmailSlice.max_messages,
                  gmail_import_content: opts.gmailSlice.gmail_import_content,
                },
              }
            : {}),
          ...(opts?.importSources?.length ? { import_sources: opts.importSources } : {}),
        };
        const { job_id, session_id } = await api.analyzeDriveStream(body, { signal: opts?.signal });
        setSessionId(session_id);
        startPolling(job_id);
        setTab("queue");
        emitJobStartedTelemetry(initialFilePaths, opts?.gmailSlice ?? null, true);
        return { job_id, session_id };
      } catch (e) {
        if (isAbortError(e)) return null;
        if (e instanceof EntitlementBlockedError) {
          toastEntitlementBlocked();
          void refreshEntitlement();
          return null;
        }
        toastUserError("Could not start sort", e);
        return null;
      }
    },
    [
      assertDriveStreamPreconditions,
      settings,
      installedTesseractLangs,
      startPolling,
      setTab,
      setSessionId,
      uiLocale,
      refreshEntitlement,
      toastEntitlementBlocked,
      emitJobStartedTelemetry,
      sortModelForJob,
    ]
  );

  const handleBrowserFiles = useCallback(
    async (files: File[], context?: BrowserUploadContext) => {
      void context;
      if (!serviceReady) {
        trackSortBlocked(settings.telemetryOptIn, settings.uiLocale, "offline");
        kickSilentBackendRestart();
        toast.message(translate(uiLocale, "toast.dropWhileOfflineTitle"), {
          description: translate(uiLocale, "toast.dropWhileOfflineDesc"),
          duration: 9000,
        });
        return;
      }
      if (!files.length) {
        trackSortBlocked(settings.telemetryOptIn, settings.uiLocale, "empty_selection");
        return;
      }
      if (entitlement?.cloudAuthRequired && !entitlement.cloudLoggedIn) {
        trackSortBlocked(settings.telemetryOptIn, settings.uiLocale, "cloud_auth_required");
        toastCloudAccountRequired();
        return;
      }
      if (entitlement && !entitlement.canAnalyze) {
        trackSortBlocked(settings.telemetryOptIn, settings.uiLocale, "entitlement_blocked");
        toastEntitlementBlocked();
        return;
      }
      if (!settings.outputDir.trim()) {
        trackSortBlocked(settings.telemetryOptIn, settings.uiLocale, "no_output_folder");
        toast.message(translate(uiLocale, "toast.chooseOutputFolderTitle"), {
          description: translate(uiLocale, "toast.chooseOutputFolderDesc"),
          duration: 8000,
        });
        jumpToSettingsSection("sorting-output");
        return;
      }

      if (blockIfAnalysisModelsNotReady()) return;

      try {
        const ocrPayload = buildAnalyzeOcrPayload(settings, installedTesseractLangs);
        const { job_id, session_id } = await api.analyzeUpload(files, {
          output_dir: settings.outputDir,
          model: sortModelForJob(),
          mode: settings.mode,
          language: settings.language,
          vision_model: settings.visionModel.trim() || undefined,
          rules: settings.rules.filter((r) => r.enabled && r.pattern.trim()),
          on_collision: settings.onCollision,
          min_confidence: effectiveMinConfidenceForJob(settings),
          ...ocrPayload,
          ...sortClassifyPayloadForJob(settings),
          ...documentBriefingRequestField(settings),
        });
        setSessionId(session_id);
        startPolling(job_id);
        setTab("queue");
        emitJobStartedTelemetry([], null);
      } catch (e) {
        if (e instanceof EntitlementBlockedError) {
          toastEntitlementBlocked();
          void refreshEntitlement();
          return;
        }
        toastUserError("Could not start sort", e);
      }
    },
    [
      serviceReady,
      settings,
      installedTesseractLangs,
      startPolling,
      jumpToSettingsSection,
      setTab,
      setSessionId,
      uiLocale,
      entitlement,
      refreshEntitlement,
      toastEntitlementBlocked,
      toastCloudAccountRequired,
      telemetryFirstJobRef,
      blockIfAnalysisModelsNotReady,
      emitJobStartedTelemetry,
      sortModelForJob,
    ]
  );

  const reviewActions = useJobReviewActions({
    currentJob,
    sessionId,
    setJob,
    startPolling,
    stopPolling,
    patchFileByEntryId,
    refreshTree,
    settings,
  });

  return {
    handleFiles,
    startExplicitLocalSort,
    startProgressiveDriveSort,
    handleBrowserFiles,
    ...reviewActions,
  };
}
