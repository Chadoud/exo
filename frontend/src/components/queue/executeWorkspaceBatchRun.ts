import { toast } from "sonner";
import type { Dispatch, SetStateAction } from "react";
import { api } from "../../api";
import type { GmailAnalyzeSlice } from "../../api";
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
  buildGmailAnalyzeSliceFromMerge,
  buildJobFilePaths,
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
  syntheticVoiceGoogleDriveMergePrefs,
  type WorkspaceVoiceBatchTrigger,
} from "./workspaceBatchLogic";
import { workspaceBatchDesktopUnavailableMessageKey } from "./workspaceBatchDesktopGate";
import {
  buildDriveStreamingArm,
  buildDropboxStreamingArm,
  buildICloudStreamingArm,
  buildInfomaniakMailStreamingArm,
  buildInfomaniakStreamingArm,
  buildOneDriveStreamingArm,
  buildOutlookStreamingArm,
  buildS3StreamingArm,
  buildSlackStreamingArm,
} from "./workspaceBatchStreamingArms";
import { buildWorkspaceImportSources } from "./workspaceBatchImportSources";
import type { SortJobSourceId } from "./deriveSortJobSources";
import { runProgressiveCloudImportLoop } from "./runProgressiveCloudImportLoop";

type TFunction = (key: string, params?: Record<string, string | number>) => string;

/** User aborted after analyze already returned a job id — cancel that job so Run sort is not a lie. */
function cancelIfStarted(jobId: string | null | undefined): void {
  if (!jobId) return;
  void api.cancelJob(jobId).catch(() => {
    /* job may already be gone */
  });
}

interface ExecuteWorkspaceBatchRunParams {
  signal: AbortSignal;
  voiceTrigger?: WorkspaceVoiceBatchTrigger;
  t: TFunction;
  stagedPaths: string[];
  includeLocalInRun: boolean;
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
  onStartProgressiveDriveSort?: (
    initialFilePaths: string[],
    opts?: {
      signal?: AbortSignal;
      gmailSlice?: GmailAnalyzeSlice | null;
      importSources?: SortJobSourceId[];
    },
  ) => Promise<{ job_id: string; session_id: string } | null>;
  onStartExplicitLocalSort: (
    paths: string[],
    gmail: GmailAnalyzeSlice | null,
    opts?: { signal?: AbortSignal; importSources?: SortJobSourceId[] },
  ) => Promise<string | null>;
  onStartGmailOnlySort?: (
    slice: GmailAnalyzeSlice,
    opts?: { signal?: AbortSignal },
  ) => Promise<string | null>;
  workspaceGmailMailOnlyRunnerRef: { current: ((opts?: { signal?: AbortSignal }) => Promise<string | null>) | null };
  setSortRunStartedAtMs: (ms: number | null) => void;
  setPreviewCount: (count: number | null) => void;
  setStagedPaths: Dispatch<SetStateAction<string[]>>;
}

/**
 * Run the workspace **Run sort** pipeline: progressive cloud imports, local analyze, Gmail-only.
 */
export async function executeWorkspaceBatchRun(params: ExecuteWorkspaceBatchRunParams): Promise<string | null> {
  const {
    signal: ac,
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
  } = params;

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
  const slice = buildGmailAnalyzeSliceFromMerge(gmailMergePrefsSnapshot);
  const wantsLocal = wantsStagedLocal(includeLocalInRun, stagedPaths.length);
  const runT0 = typeof performance !== "undefined" ? performance.now() : 0;
  const gmailMax = gmailOn ? Math.max(0, Math.round(gmailMergePrefsSnapshot?.max_messages ?? 0)) : 0;

  const importSources = buildWorkspaceImportSources({
    includeLocalInRun,
    stagedPathCount: stagedPaths.length,
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
  });

  setSortRunStartedAtMs(Date.now());

  type StreamingArmRunner = (jobId: string, sealStream: boolean) => Promise<"ok" | "abort">;

  const streamingArms: StreamingArmRunner[] = [];
  if (driveOn) {
    const adapter = buildDriveStreamingArm(effectiveDriveMergePrefs!, t, ac);
    streamingArms.push((jobId, sealStream) =>
      runProgressiveCloudImportLoop(jobId, ac, adapter, { sealStream }),
    );
  }
  if (dropboxOn) {
    const adapter = buildDropboxStreamingArm(dropboxMergePrefsSnapshot!, t, ac);
    streamingArms.push((jobId, sealStream) =>
      runProgressiveCloudImportLoop(jobId, ac, adapter, { sealStream }),
    );
  }
  if (oneDriveOn) {
    const adapter = buildOneDriveStreamingArm(oneDriveMergePrefsSnapshot!, t, ac);
    streamingArms.push((jobId, sealStream) =>
      runProgressiveCloudImportLoop(jobId, ac, adapter, { sealStream }),
    );
  }
  if (outlookOn) {
    const adapter = buildOutlookStreamingArm(outlookMergePrefsSnapshot!, t, ac);
    streamingArms.push((jobId, sealStream) =>
      runProgressiveCloudImportLoop(jobId, ac, adapter, { sealStream }),
    );
  }
  if (infomaniakMailOn) {
    const adapter = buildInfomaniakMailStreamingArm(infomaniakMailMergePrefsSnapshot!, t, ac);
    streamingArms.push((jobId, sealStream) =>
      runProgressiveCloudImportLoop(jobId, ac, adapter, { sealStream }),
    );
  }
  if (s3On) {
    const adapter = buildS3StreamingArm(s3MergePrefsSnapshot!, t, ac);
    streamingArms.push((jobId, sealStream) =>
      runProgressiveCloudImportLoop(jobId, ac, adapter, { sealStream }),
    );
  }
  if (slackOn) {
    const adapter = buildSlackStreamingArm(slackMergePrefsSnapshot!, t, ac);
    streamingArms.push((jobId, sealStream) =>
      runProgressiveCloudImportLoop(jobId, ac, adapter, { sealStream }),
    );
  }
  if (icloudOn) {
    const adapter = buildICloudStreamingArm(icloudMergePrefsSnapshot!, t, ac);
    streamingArms.push((jobId, sealStream) =>
      runProgressiveCloudImportLoop(jobId, ac, adapter, { sealStream }),
    );
  }
  if (infomaniakOn) {
    const adapter = buildInfomaniakStreamingArm(infomaniakMergePrefsSnapshot!, t, ac);
    streamingArms.push((jobId, sealStream) =>
      runProgressiveCloudImportLoop(jobId, ac, adapter, { sealStream }),
    );
  }

  try {
    if (streamingArms.length > 0) {
      if (!onStartProgressiveDriveSort) {
        setSortRunStartedAtMs(null);
        return null;
      }
      const initial = buildJobFilePaths(wantsLocal, stagedPaths, []);
      const started = await onStartProgressiveDriveSort(initial, {
        signal: ac,
        gmailSlice: gmailOn ? slice : undefined,
        importSources,
      });
      if (ac.aborted) {
        cancelIfStarted(started?.job_id);
        return null;
      }
      if (!started) {
        setSortRunStartedAtMs(null);
        return null;
      }

      for (let i = 0; i < streamingArms.length; i++) {
        const outcome = await streamingArms[i](started.job_id, i === streamingArms.length - 1);
        if (outcome === "abort") {
          setSortRunStartedAtMs(null);
          return null;
        }
      }

      if (wantsLocal) setStagedPaths([]);
      return started.job_id;
    }

    const jobFilePaths = buildJobFilePaths(wantsLocal, stagedPaths, []);
    const hasFilePaths = jobFilePaths.length > 0;

    if (!hasFilePaths && !gmailOn) {
      setSortRunStartedAtMs(null);
      toast.message(t("queue.workspaceBatchNothingSelected"));
      return null;
    }

    if (hasFilePaths && slice) {
      setPreviewCount(jobFilePaths.length);
      if (isDriveMergeDebugOn()) {
        driveMergeDebug("workspaceAnalyzeStart", { pathCount: jobFilePaths.length, includesGmail: true });
      }
      const jobId = await onStartExplicitLocalSort(jobFilePaths, slice, { signal: ac, importSources });
      if (ac.aborted) {
        cancelIfStarted(jobId);
        return null;
      }
      if (wantsLocal && jobId) setStagedPaths([]);
      return jobId;
    }
    if (hasFilePaths) {
      setPreviewCount(jobFilePaths.length);
      if (isDriveMergeDebugOn()) {
        driveMergeDebug("workspaceAnalyzeStart", { pathCount: jobFilePaths.length, includesGmail: false });
      }
      const jobId = await onStartExplicitLocalSort(jobFilePaths, null, { signal: ac, importSources });
      if (ac.aborted) {
        cancelIfStarted(jobId);
        return null;
      }
      if (wantsLocal && jobId) setStagedPaths([]);
      return jobId;
    }
    if (gmailOn && !hasFilePaths) {
      if (isDriveMergeDebugOn()) {
        driveMergeDebug("workspaceGmailOnlyStart", { gmailMax });
      }
      const startGmail = onStartGmailOnlySort && slice
        ? (opts?: { signal?: AbortSignal }) => onStartGmailOnlySort(slice, opts)
        : workspaceGmailMailOnlyRunnerRef.current;
      if (startGmail) {
        const jobId = await startGmail({ signal: ac });
        if (ac.aborted) {
          cancelIfStarted(jobId);
          return null;
        }
        return jobId;
      }
      if (!ac.aborted) {
        setSortRunStartedAtMs(null);
        toast.message(t("queue.workspaceBatchGmailUnavailable"));
      }
      return null;
    }
    return null;
  } catch (err) {
    setSortRunStartedAtMs(null);
    throw err;
  } finally {
    if (isDriveMergeDebugOn()) {
      driveMergeDebug("workspaceRunDone", {
        totalMs: typeof performance !== "undefined" ? Math.round(performance.now() - runT0) : undefined,
        aborted: ac.aborted,
      });
    }
    if (ac.aborted) {
      setSortRunStartedAtMs(null);
    }
  }
}

/** Pre-flight checks before starting a workspace batch run. Returns false when the run should not start. */
export function validateWorkspaceBatchPreflight(
  params: Pick<
    ExecuteWorkspaceBatchRunParams,
    | "t"
    | "stagedPaths"
    | "includeLocalInRun"
    | "gmailMergePrefsSnapshot"
    | "driveMergePrefsSnapshot"
    | "dropboxMergePrefsSnapshot"
    | "oneDriveMergePrefsSnapshot"
    | "outlookMergePrefsSnapshot"
    | "s3MergePrefsSnapshot"
    | "slackMergePrefsSnapshot"
    | "icloudMergePrefsSnapshot"
    | "infomaniakMergePrefsSnapshot"
    | "infomaniakMailMergePrefsSnapshot"
  > & { voiceTrigger?: WorkspaceVoiceBatchTrigger },
): boolean {
  const {
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
  } = params;

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

  if (
    !wantsLocal &&
    !gmailOn &&
    !driveOn &&
    !dropboxOn &&
    !oneDriveOn &&
    !outlookOn &&
    !s3On &&
    !slackOn &&
    !icloudOn &&
    !infomaniakOn &&
    !infomaniakMailOn
  ) {
    toast.message(t("queue.workspaceBatchNothingSelected"));
    return false;
  }

  const desktopGate = workspaceBatchDesktopUnavailableMessageKey({
    driveOn,
    dropboxOn,
    oneDriveOn,
    outlookOn,
    infomaniakMailOn,
  });
  if (desktopGate) {
    toast.message(t(desktopGate));
    return false;
  }

  return true;
}
