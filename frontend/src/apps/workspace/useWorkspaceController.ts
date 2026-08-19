import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { FileEntry, EntitlementStatus } from "../../api";
import type { FolderNode } from "../../api";
import type { UseModelsReturn } from "../../hooks/useModels";
import { useJobReducer } from "../../hooks/useJobReducer";
import { useJobPolling } from "../../hooks/useJobPolling";
import { useSortPipelineActions } from "../../hooks/useSortPipelineActions";
import { useCloudSortActive } from "../../hooks/useCloudSortActive";
import { useWorkspaceMergePrefsBridge } from "../../hooks/useWorkspaceMergePrefsBridge";
import type { MainNavTab } from "../../hooks/useMainNavItems";
import type { UiLocale } from "../../i18n/locale";
import type { AppSettings } from "../../types/settings";
import { getAnalysisModelGap } from "../../utils/analysisModelReadiness";
import { deriveJobView } from "../../utils/jobView";
import { trackSetupMilestone } from "../../telemetry/setupTelemetry";
import { track } from "../../telemetry/client";
import {
  buildJobCompletedProps,
  isOcrEnabledForSort,
} from "../../telemetry/jobTelemetry";
import {
  trackSortStructureCapAppliedIfNeeded,
} from "../../telemetry/sortStructureTelemetry";
import { TelemetryEventNames } from "../../telemetry/schema";
import { APP_DISPLAY_NAME } from "../../constants";
import { translate } from "../../i18n/translate";
import { toastUserError } from "../../utils/userGuidance";
import { syncSortDefaultsToBackend } from "../../utils/syncSortDefaultsToBackend";
import {
  createWorkspaceAssistantBridge,
} from "../shared/bridges/workspaceAssistant";

function sortDurationBucket(startedAtMs: number | null): string {
  if (startedAtMs == null) return "unknown";
  const seconds = (Date.now() - startedAtMs) / 1000;
  if (seconds < 30) return "under_30s";
  if (seconds < 120) return "30s_to_2m";
  if (seconds < 600) return "2m_to_10m";
  return "over_10m";
}

type Tab = MainNavTab;

export function useWorkspaceController(opts: {
  uiLocale: UiLocale;
  settings: AppSettings;
  backendOnline: boolean;
  mainAppReady: boolean;
  entitlement: EntitlementStatus | null;
  refreshEntitlement: () => Promise<void>;
  setTab: Dispatch<SetStateAction<Tab>>;
  modelHook: UseModelsReturn;
  jumpToSettingsSection: (sectionId: string) => void;
  toastEntitlementBlocked: () => void;
  toastCloudAccountRequired: () => void;
  folderTree: FolderNode[];
  refreshTree: () => Promise<void>;
  refreshError: string | null;
  dismissRefreshError: () => void;
  reassignFile: FileEntry | null;
  setReassignFile: Dispatch<SetStateAction<FileEntry | null>>;
}) {
  const {
    uiLocale,
    settings,
    backendOnline,
    mainAppReady,
    entitlement,
    refreshEntitlement,
    setTab,
    modelHook,
    jumpToSettingsSection,
    toastEntitlementBlocked,
    toastCloudAccountRequired,
    folderTree,
    refreshTree,
    refreshError,
    dismissRefreshError,
    reassignFile,
    setReassignFile,
  } = opts;

  const workspaceBridge = useMemo(() => createWorkspaceAssistantBridge(), []);
  const mergePrefs = useWorkspaceMergePrefsBridge();
  const { cloudSortActive } = useCloudSortActive(entitlement);
  const { currentJob, setJob, patchFileByPath, patchFileByEntryId, setAllApproved } =
    useJobReducer();
  const telemetryFirstJobRef = useRef(false);
  const telemetryJobIdRef = useRef<string | null>(null);
  const telemetryJobStartedAtRef = useRef<number | null>(null);
  const telemetryTerminalRef = useRef<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  const { startPolling, stopPolling } = useJobPolling({
    onJob: (job) => {
      setJob(job);
      if (!settings.telemetryOptIn) return;
      if (telemetryJobIdRef.current !== job.id) {
        telemetryJobIdRef.current = job.id;
        telemetryJobStartedAtRef.current = Date.now();
        telemetryTerminalRef.current = null;
      }
      const prev = telemetryTerminalRef.current;
      if (job.status === "done" && prev !== "done") {
        const props = buildJobCompletedProps(
          job,
          sortDurationBucket(telemetryJobStartedAtRef.current),
          isOcrEnabledForSort(settings, modelHook.ocrInfo?.languages)
        );
        if (props) {
          track(settings.telemetryOptIn, settings.uiLocale, TelemetryEventNames.jobCompleted, props);
          trackSortStructureCapAppliedIfNeeded(settings.telemetryOptIn, settings.uiLocale, job);
        }
      }
      if (job.status === "cancelled" && prev !== "cancelled") {
        track(settings.telemetryOptIn, settings.uiLocale, TelemetryEventNames.jobCancelled, {
          tab: "queue",
          follow_up: "user",
        });
      }
      telemetryTerminalRef.current = job.status;
    },
    onTerminal: () => {
      if (settings.outputDir) void refreshTree();
      void refreshEntitlement();
    },
    onError: (err) => {
      toastUserError(translate(uiLocale, "toast.jobRefreshFailed"), err, {
        id: "toast.jobRefreshFailed",
      });
    },
  });

  const jobView = deriveJobView(currentJob);
  const {
    isRunning,
    isAwaitingApproval,
    doneCount,
    totalCount,
    processedCount,
    activeFiles,
    failedFiles,
    fetchFailureCount,
    pendingCount,
    reviewRows,
  } = jobView;

  useEffect(() => {
    if (!mainAppReady || modelHook.loadingModels || !settings.telemetryOptIn) return;
    const { missingSortModel, missingVisionModel } = getAnalysisModelGap(
      settings,
      modelHook.models,
      { remoteSortLlm: cloudSortActive },
    );
    if (missingSortModel || missingVisionModel) return;
    trackSetupMilestone(settings.telemetryOptIn, settings.uiLocale, "model_ready");
  }, [
    mainAppReady,
    modelHook.loadingModels,
    modelHook.models,
    settings,
    cloudSortActive,
    settings.telemetryOptIn,
    settings.uiLocale,
  ]);

  useEffect(() => {
    if (!mainAppReady || !backendOnline) return;
    const handle = window.setTimeout(() => {
      void syncSortDefaultsToBackend(settings, modelHook.ocrInfo?.languages).catch(() => {});
    }, 400);
    return () => window.clearTimeout(handle);
  }, [mainAppReady, backendOnline, settings, modelHook.ocrInfo?.languages]);

  useEffect(() => {
    const base = APP_DISPLAY_NAME;
    if (currentJob?.status === "paused") {
      document.title = `Paused ${currentJob.completed}/${currentJob.total} · ${base}`;
    } else if (isRunning && currentJob) {
      document.title = `${currentJob.completed}/${currentJob.total} · ${base}`;
    } else {
      document.title = base;
    }
    return () => {
      document.title = base;
    };
  }, [isRunning, currentJob]);

  const handleStartNewSort = useCallback(() => {
    setJob(null);
  }, [setJob]);

  const sortPipeline = useSortPipelineActions({
    uiLocale,
    backendOnline,
    settings,
    installedTesseractLangs: modelHook.ocrInfo?.languages,
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
    installedOllamaModels: modelHook.models,
    ollamaModelsLoading: modelHook.loadingModels,
    remoteSortLlm: cloudSortActive,
    jumpToSettingsSection,
    gmailMergePrefsRef: mergePrefs.gmailMergePrefsRef,
  });

  return {
    workspaceBridge,
    reassignFile,
    setReassignFile,
    ...mergePrefs,
    currentJob,
    sessionId,
    setSessionId,
    startPolling,
    folderTree,
    refreshTree,
    refreshError,
    dismissRefreshError,
    isRunning,
    isAwaitingApproval,
    doneCount,
    totalCount,
    processedCount,
    activeFiles,
    failedFiles,
    fetchFailureCount,
    pendingCount,
    reviewRows,
    patchFileByPath,
    patchFileByEntryId,
    setAllApproved,
    handleStartNewSort,
    ...sortPipeline,
  };
}
