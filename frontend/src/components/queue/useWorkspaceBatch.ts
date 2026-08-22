import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { toast } from "sonner";
import { api, type GmailAnalyzeSlice, type Job } from "../../api";
import { hasElectronBridge } from "../../utils/platform";
import type { GmailMergePrefs } from "../workspace/GmailWorkspaceSortBlock";
import type { DriveMergePrefs } from "../workspace/DriveWorkspaceSortBlock";
import type { DropboxMergePrefs } from "../workspace/DropboxWorkspaceSortBlock";
import type { OneDriveMergePrefs } from "../workspace/oneDriveWorkspaceImportResolve";
import type { OutlookMergePrefs } from "../workspace/outlookWorkspaceImportResolve";
import type { S3MergePrefs } from "../workspace/s3WorkspaceImportResolve";
import type { SlackMergePrefs } from "../workspace/slackWorkspaceImportResolve";
import type { ICloudMergePrefs } from "../workspace/icloudWorkspaceImportResolve";
import type { InfomaniakMergePrefs } from "../workspace/infomaniakWorkspaceImportResolve";
import type { InfomaniakMailMergePrefs } from "../workspace/InfomaniakMailWorkspaceSortBlock";
import { driveMergeDebug, isDriveMergeDebugOn } from "../workspace/driveMergeDebug";
import {
  computeWorkspaceBatchButtonDisabled,
  isDriveMergeOn,
  isDropboxMergeOn,
  isOneDriveMergeOn,
  isOutlookMergeOn,
  isS3MergeOn,
  isSlackMergeOn,
  isICloudMergeOn,
  isInfomaniakMergeOn,
  isInfomaniakMailMergeOn,
  isGmailMergeOn,
  wantsStagedLocal,
  resolveWorkspacePrepStallMessageKey,
  WORKSPACE_PREP_STALL_MESSAGE,
  syntheticVoiceGoogleDriveMergePrefs,
  type WorkspaceVoiceBatchTrigger,
  type WorkspacePrepStallMessageKey,
} from "./workspaceBatchLogic";
import type { SortStartStoppedReason } from "./sortStartChrome";
import { buildSelectedSourcesSummary } from "./buildSelectedSourcesSummary";
import {
  executeWorkspaceBatchRun,
  validateWorkspaceBatchPreflight,
} from "./executeWorkspaceBatchRun";
import type { WorkspaceAssistantBridge } from "../../apps/shared/bridges/workspaceAssistant";

interface UseWorkspaceBatchParams {
  t: (key: string, params?: Record<string, string | number>) => string;
  currentJob: Job | null;
  /** From ``QueuePanel`` sort gating. */
  sortInputDisabled: boolean;
  sortInputDisabledReason: string | undefined;
  gmailMergePrefsSnapshot: GmailMergePrefs | null;
  driveMergePrefsSnapshot: DriveMergePrefs | null;
  dropboxMergePrefsSnapshot: DropboxMergePrefs | null;
  oneDriveMergePrefsSnapshot: OneDriveMergePrefs | null;
  outlookMergePrefsSnapshot: OutlookMergePrefs | null;
  s3MergePrefsSnapshot: S3MergePrefs | null;
  slackMergePrefsSnapshot: SlackMergePrefs | null;
  icloudMergePrefsSnapshot: ICloudMergePrefs | null;
  infomaniakMergePrefsSnapshot: InfomaniakMergePrefs | null;
  infomaniakMailMergePrefsSnapshot: InfomaniakMailMergePrefs | null;
  onStartExplicitLocalSort: (
    paths: string[],
    gmail: GmailAnalyzeSlice | null,
    opts?: { signal?: AbortSignal; importSources?: string[] },
  ) => Promise<string | null>;
  onStartProgressiveDriveSort?: (
    initialFilePaths: string[],
    opts?: {
      signal?: AbortSignal;
      gmailSlice?: GmailAnalyzeSlice | null;
      importSources?: string[];
    },
  ) => Promise<{ job_id: string; session_id: string } | null>;
  onStartGmailOnlySort?: (
    slice: GmailAnalyzeSlice,
    opts?: { signal?: AbortSignal },
  ) => Promise<string | null>;
  workspaceGmailMailOnlyRunnerRef: MutableRefObject<
    ((opts?: { signal?: AbortSignal }) => Promise<string | null>) | null
  >;
  /** Wired by Queue panel so voice can invoke the same **Run sort** pipeline with optional Drive defaults. */
  workspaceAssistantBridge?: WorkspaceAssistantBridge;
}

/**
 * Staging paths, “include local in run,” and the workspace **Run sort** batch (local + optional Gmail + optional Drive import).
 */
export function useWorkspaceBatch({
  t,
  currentJob,
  sortInputDisabled,
  sortInputDisabledReason,
  gmailMergePrefsSnapshot,
  driveMergePrefsSnapshot,
  dropboxMergePrefsSnapshot,
  oneDriveMergePrefsSnapshot,
  outlookMergePrefsSnapshot,
  s3MergePrefsSnapshot,
  slackMergePrefsSnapshot,
  icloudMergePrefsSnapshot,
  infomaniakMergePrefsSnapshot,
  infomaniakMailMergePrefsSnapshot,
  onStartProgressiveDriveSort,
  onStartGmailOnlySort,
  onStartExplicitLocalSort,
  workspaceGmailMailOnlyRunnerRef,
  workspaceAssistantBridge,
}: UseWorkspaceBatchParams) {
  const desktop = hasElectronBridge();
  const [stagedPaths, setStagedPaths] = useState<string[]>([]);
  const [includeLocalInRun, setIncludeLocalInRun] = useState(false);
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [workspaceBatchStarting, setWorkspaceBatchStarting] = useState(false);
  /** Wall-clock ms when user clicked **Run sort**; used to include import/fetch in job elapsed time. */
  const [sortRunStartedAtMs, setSortRunStartedAtMs] = useState<number | null>(null);
  const [workspacePrepGmailInBatch, setWorkspacePrepGmailInBatch] = useState(false);
  const [workspacePrepStallMessageKey, setWorkspacePrepStallMessageKey] = useState<WorkspacePrepStallMessageKey>(
    () => WORKSPACE_PREP_STALL_MESSAGE.default,
  );
  const [sortStartStoppedReason, setSortStartStoppedReason] = useState<SortStartStoppedReason | null>(
    null,
  );
  const [awaitingFirstJob, setAwaitingFirstJob] = useState(false);
  const [pendingStartJobId, setPendingStartJobId] = useState<string | null>(null);
  const workspaceBatchAbortRef = useRef<AbortController | null>(null);
  const [workspaceSourcesRevealRequested, setWorkspaceSourcesRevealRequested] = useState(false);

  useEffect(() => {
    if (currentJob) {
      setPreviewCount(null);
      setSortStartStoppedReason(null);
      setAwaitingFirstJob(false);
      setPendingStartJobId(null);
    }
  }, [currentJob]);

  useEffect(() => {
    setWorkspaceSourcesRevealRequested(false);
  }, [currentJob?.id]);

  const addStagedPaths = useCallback((paths: string[]) => {
    setStagedPaths((prev) => {
      const next = new Set(prev);
      for (const p of paths) {
        const trimmed = p.trim();
        if (trimmed) next.add(trimmed);
      }
      return [...next];
    });
  }, []);

  const handleCancelWorkspaceBatchStart = useCallback(() => {
    workspaceBatchAbortRef.current?.abort();
    workspaceBatchAbortRef.current = null;
    setWorkspaceBatchStarting(false);
    setPreviewCount(null);
    setAwaitingFirstJob(false);
    const jobId = pendingStartJobId;
    setPendingStartJobId(null);
    if (jobId) {
      void api.cancelJob(jobId).catch(() => {
        /* job may already be gone */
      });
    }
    setSortStartStoppedReason("canceled");
    toast.message(t("queue.workspaceBatchCancelledToast"), { duration: 4000 });
  }, [t, pendingStartJobId]);

  /** Stop listing/import without toast — use when the user cancels from the job card while prep is still running. */
  const abortWorkspaceBatchStartSilently = useCallback(() => {
    workspaceBatchAbortRef.current?.abort();
    workspaceBatchAbortRef.current = null;
    setWorkspaceBatchStarting(false);
    setPreviewCount(null);
    setWorkspacePrepGmailInBatch(false);
    setWorkspacePrepStallMessageKey(WORKSPACE_PREP_STALL_MESSAGE.default);
    setAwaitingFirstJob(false);
    const jobId = pendingStartJobId;
    setPendingStartJobId(null);
    if (jobId) {
      void api.cancelJob(jobId).catch(() => {
        /* job may already be gone */
      });
    }
    setSortStartStoppedReason("canceled");
  }, [pendingStartJobId]);

  const handleRunWorkspaceBatch = useCallback(
    async (voiceTrigger?: WorkspaceVoiceBatchTrigger) => {
      if (workspaceBatchStarting) return;

      const gmailOn = isGmailMergeOn(gmailMergePrefsSnapshot);
      const effectiveDriveMergePrefs: DriveMergePrefs | null =
        voiceTrigger?.forceGoogleDrive &&
        !(driveMergePrefsSnapshot && isDriveMergeOn(driveMergePrefsSnapshot))
          ? syntheticVoiceGoogleDriveMergePrefs()
          : driveMergePrefsSnapshot;
      const driveOn = isDriveMergeOn(effectiveDriveMergePrefs);
      const dropboxOn = isDropboxMergeOn(dropboxMergePrefsSnapshot);
      const oneDriveOn = isOneDriveMergeOn(oneDriveMergePrefsSnapshot);
      const outlookOn = isOutlookMergeOn(outlookMergePrefsSnapshot);
      const s3On = isS3MergeOn(s3MergePrefsSnapshot);
      const slackOn = isSlackMergeOn(slackMergePrefsSnapshot);
      const icloudOn = isICloudMergeOn(icloudMergePrefsSnapshot);
      const infomaniakOn = isInfomaniakMergeOn(infomaniakMergePrefsSnapshot);
      const infomaniakMailOn = isInfomaniakMailMergeOn(infomaniakMailMergePrefsSnapshot);
      const wantsLocal = wantsStagedLocal(includeLocalInRun, stagedPaths.length);
      const gmailMax = gmailOn ? Math.max(0, Math.round(gmailMergePrefsSnapshot?.max_messages ?? 0)) : 0;

      if (
        !validateWorkspaceBatchPreflight({
          t,
          stagedPaths,
          includeLocalInRun,
          gmailMergePrefsSnapshot,
          driveMergePrefsSnapshot,
          dropboxMergePrefsSnapshot,
          oneDriveMergePrefsSnapshot,
          outlookMergePrefsSnapshot,
          s3MergePrefsSnapshot,
          slackMergePrefsSnapshot,
          icloudMergePrefsSnapshot,
          infomaniakMergePrefsSnapshot,
          infomaniakMailMergePrefsSnapshot,
          voiceTrigger,
        })
      ) {
        return;
      }

      const ac = new AbortController();
      workspaceBatchAbortRef.current = ac;
      setSortStartStoppedReason(null);
      setAwaitingFirstJob(false);
      setPendingStartJobId(null);
      setWorkspaceSourcesRevealRequested(false);
      setWorkspacePrepGmailInBatch(Boolean(gmailOn && gmailMax > 0));
      setWorkspacePrepStallMessageKey(
        resolveWorkspacePrepStallMessageKey({
          gmailOn,
          driveOn,
          dropboxOn,
          oneDriveOn,
          outlookOn,
          s3On,
          slackOn,
          icloudOn,
          infomaniakOn,
          infomaniakMailOn,
          wantsLocal,
        }),
      );
      setWorkspaceBatchStarting(true);
      if (isDriveMergeDebugOn()) {
        driveMergeDebug("workspaceRunStart", {
          driveOn,
          gmailOn,
          wantsLocal,
          stagedLocalCount: stagedPaths.length,
          gmailMax,
        });
      }

      let startedJobId: string | null = null;
      try {
        startedJobId = await executeWorkspaceBatchRun({
          signal: ac.signal,
          voiceTrigger,
          t,
          stagedPaths,
          includeLocalInRun,
          gmailMergePrefsSnapshot,
          driveMergePrefsSnapshot,
          dropboxMergePrefsSnapshot,
          oneDriveMergePrefsSnapshot,
          outlookMergePrefsSnapshot,
          s3MergePrefsSnapshot,
          slackMergePrefsSnapshot,
          icloudMergePrefsSnapshot,
          infomaniakMergePrefsSnapshot,
          infomaniakMailMergePrefsSnapshot,
          onStartProgressiveDriveSort,
          onStartGmailOnlySort,
          onStartExplicitLocalSort,
          workspaceGmailMailOnlyRunnerRef,
          setSortRunStartedAtMs,
          setPreviewCount,
          setStagedPaths,
        });
      } catch {
        startedJobId = null;
      } finally {
        setWorkspaceBatchStarting(false);
        setWorkspacePrepGmailInBatch(false);
        setWorkspacePrepStallMessageKey(WORKSPACE_PREP_STALL_MESSAGE.default);
        if (ac.signal.aborted) {
          setPreviewCount(null);
          setAwaitingFirstJob(false);
          setPendingStartJobId(null);
        } else if (startedJobId) {
          setPendingStartJobId(startedJobId);
          setAwaitingFirstJob(true);
        } else {
          setPreviewCount(null);
          setAwaitingFirstJob(false);
          setPendingStartJobId(null);
          setSortStartStoppedReason((prev) => prev ?? "failed");
        }
        if (workspaceBatchAbortRef.current === ac) {
          workspaceBatchAbortRef.current = null;
        }
      }
    },
    [
      gmailMergePrefsSnapshot,
      driveMergePrefsSnapshot,
      dropboxMergePrefsSnapshot,
      oneDriveMergePrefsSnapshot,
      outlookMergePrefsSnapshot,
      s3MergePrefsSnapshot,
      slackMergePrefsSnapshot,
      icloudMergePrefsSnapshot,
      infomaniakMergePrefsSnapshot,
      infomaniakMailMergePrefsSnapshot,
      includeLocalInRun,
      stagedPaths,
      onStartProgressiveDriveSort,
      onStartGmailOnlySort,
      onStartExplicitLocalSort,
      workspaceGmailMailOnlyRunnerRef,
      t,
      workspaceBatchStarting,
    ],
  );

  useEffect(() => {
    if (!workspaceAssistantBridge) return;
    workspaceAssistantBridge.registerRunBatch(handleRunWorkspaceBatch);
    return () => {
      workspaceAssistantBridge.registerRunBatch(null);
    };
  }, [workspaceAssistantBridge, handleRunWorkspaceBatch]);

  const workspaceBatchDisabled = computeWorkspaceBatchButtonDisabled({
    sortInputDisabled,
    workspaceBatchStarting,
    includeLocalInRun,
    stagedPathsLength: stagedPaths.length,
    gmailMergeEnabled: Boolean(gmailMergePrefsSnapshot?.enabled),
    driveMergeEnabled: isDriveMergeOn(driveMergePrefsSnapshot),
    dropboxMergeEnabled: isDropboxMergeOn(dropboxMergePrefsSnapshot),
    oneDriveMergeEnabled: isOneDriveMergeOn(oneDriveMergePrefsSnapshot),
    outlookMergeEnabled: isOutlookMergeOn(outlookMergePrefsSnapshot),
    s3MergeEnabled: isS3MergeOn(s3MergePrefsSnapshot),
    slackMergeEnabled: isSlackMergeOn(slackMergePrefsSnapshot),
    icloudMergeEnabled: isICloudMergeOn(icloudMergePrefsSnapshot),
    infomaniakMergeEnabled: isInfomaniakMergeOn(infomaniakMergePrefsSnapshot),
    infomaniakMailMergeEnabled: isInfomaniakMailMergeOn(infomaniakMailMergePrefsSnapshot),
  });

  const workspaceRunBatchDisabledHint = useMemo(() => {
    if (!workspaceBatchDisabled) return undefined;
    if (sortInputDisabled) return sortInputDisabledReason ?? t("queue.workspaceBatchNothingSelected");
    if (workspaceBatchStarting) return t("queue.workspaceRunBatchStarting");
    return t("queue.workspaceBatchNothingSelected");
  }, [
    workspaceBatchDisabled,
    sortInputDisabled,
    sortInputDisabledReason,
    workspaceBatchStarting,
    t,
  ]);

  const selectedSourcesSummary = useMemo(
    () =>
      buildSelectedSourcesSummary({
        t,
        includeLocalInRun,
        stagedPathsLength: stagedPaths.length,
        gmailMergePrefsSnapshot,
        driveMergePrefsSnapshot,
        dropboxMergePrefsSnapshot,
        oneDriveMergePrefsSnapshot,
        outlookMergePrefsSnapshot,
        s3MergePrefsSnapshot,
        slackMergePrefsSnapshot,
        icloudMergePrefsSnapshot,
        infomaniakMergePrefsSnapshot,
        infomaniakMailMergePrefsSnapshot,
      }),
    [
      t,
      includeLocalInRun,
      stagedPaths.length,
      gmailMergePrefsSnapshot,
      driveMergePrefsSnapshot,
      dropboxMergePrefsSnapshot,
      oneDriveMergePrefsSnapshot,
      outlookMergePrefsSnapshot,
      s3MergePrefsSnapshot,
      slackMergePrefsSnapshot,
      icloudMergePrefsSnapshot,
      infomaniakMergePrefsSnapshot,
      infomaniakMailMergePrefsSnapshot,
    ],
  );

  const hasSourceSelected = selectedSourcesSummary.length > 0;

  return {
    desktop,
    sortRunStartedAtMs,
    stagedPaths,
    setStagedPaths,
    includeLocalInRun,
    setIncludeLocalInRun,
    previewCount,
    setPreviewCount,
    workspaceBatchStarting,
    awaitingFirstJob,
    sortStartStoppedReason,
    workspacePrepGmailInBatch,
    workspacePrepStallMessageKey,
    workspaceBatchAbortRef,
    workspaceSourcesRevealRequested,
    setWorkspaceSourcesRevealRequested,
    addStagedPaths,
    handleCancelWorkspaceBatchStart,
    abortWorkspaceBatchStartSilently,
    handleRunWorkspaceBatch,
    workspaceBatchDisabled,
    workspaceRunBatchDisabledHint,
    selectedSourcesSummary,
    hasSourceSelected,
  };
}
