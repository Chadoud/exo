import { useRef, useState, useEffect, useMemo, useCallback } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { folderDestinationCounts } from "../../utils/folderDestinationSummary";
import { OTHER_REASON_LABEL, topNWithOtherRows } from "../../utils/topNWithOther";
import { useI18n } from "../../i18n/I18nContext";
import { isLocalAssistantReady } from "../../utils/localAssistantReady";
import type { QueuePanelProps } from "./queuePanelProps";
import { useWorkspaceBatch } from "./useWorkspaceBatch";
import { useSortWizard } from "./useSortWizard";
import { WORKSPACE_PREP_STALL_MESSAGE } from "./workspaceBatchLogic";
import { resolveSortStartChrome } from "./sortStartChrome";
import { usePostRunCardState } from "./usePostRunCardState";
import { useQueueJobMetrics } from "./useQueueJobMetrics";
import type { PrepProgressMode } from "./GmailJobProgressBlock";

/** Hooks and derived UI state for the queue panel — keeps QueuePanel.tsx as composition only. */
export function useQueuePanelController(props: QueuePanelProps) {
  const { t } = useI18n();
  const {
    settings,
    backendOnline,
    backendHealthProbing,
    backendServiceStarting = false,
    canStartSort = true,
    needsCloudAccount = false,
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
    workspaceGmailMailOnlyRunnerRef,
    workspaceAssistantBridge,
    tourHighlightId = null,
    job,
    actions,
  } = props;

  const {
    currentJob,
    sessionId,
    isRunning,
    isAwaitingApproval,
    totalCount,
    processedCount,
    failedFiles,
    fetchFailureCount,
    reviewRows,
  } = job;

  const { showPostRunCard, dismissPostRunPermanent, hidePostRunForSessionAfterCta } = usePostRunCardState(
    currentJob,
    totalCount
  );

  const {
    onStartExplicitLocalSort,
    onStartProgressiveDriveSort,
    onCancel,
    onOpenOutputSettings,
  } = actions;

  const serviceReady = isLocalAssistantReady({
    backendOnline,
    backendHealthProbing,
    backendServiceStarting,
  });
  const sortInputDisabled = isRunning || !serviceReady || !canStartSort;
  const sortInputDisabledReason = useMemo(() => {
    if (backendHealthProbing || backendServiceStarting) return t("queue.connecting");
    if (!backendOnline) return t("queue.offlineRetry");
    if (needsCloudAccount) return t("queue.cloudAccountRequiredHint");
    if (!canStartSort) return t("queue.entitlementDisabledHint");
    if (isRunning) return t("queue.jobBlocking");
    return undefined;
  }, [
    backendHealthProbing,
    backendServiceStarting,
    backendOnline,
    needsCloudAccount,
    canStartSort,
    isRunning,
    t,
  ]);

  const workspaceBatch = useWorkspaceBatch({
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
    onStartExplicitLocalSort: onStartExplicitLocalSort ?? (async () => null),
    onStartProgressiveDriveSort,
    workspaceGmailMailOnlyRunnerRef,
    workspaceAssistantBridge,
  });

  const handleCancelJob = useCallback(async () => {
    if (workspaceBatch.workspaceBatchStarting) {
      workspaceBatch.abortWorkspaceBatchStartSilently();
    }
    await onCancel();
  }, [workspaceBatch, onCancel]);

  const jobMetrics = useQueueJobMetrics({
    currentJob,
    isRunning,
    totalCount,
    processedCount,
    reviewRows,
    t,
  });

  const [prepStallHint, setPrepStallHint] = useState(false);
  const listParentRef = useRef<HTMLDivElement>(null);

  const jobFinishedUi =
    !!currentJob && currentJob.status === "done" && currentJob.phase === "done";

  const sendingWithoutJobYet = workspaceBatch.previewCount !== null && !currentJob;
  const sortStartChrome = resolveSortStartChrome({
    hasJob: !!currentJob,
    starting: workspaceBatch.workspaceBatchStarting,
    awaitingFirstJob: workspaceBatch.awaitingFirstJob,
    stoppedReason: workspaceBatch.sortStartStoppedReason,
  });
  const sortStartInFlight = sortStartChrome === "inFlight";

  const prepStallTranslationKey = useMemo(() => {
    if (workspaceBatch.workspaceBatchStarting) return workspaceBatch.workspacePrepStallMessageKey;
    if (sortStartInFlight) return WORKSPACE_PREP_STALL_MESSAGE.sending;
    return WORKSPACE_PREP_STALL_MESSAGE.default;
  }, [
    workspaceBatch.workspaceBatchStarting,
    sortStartInFlight,
    workspaceBatch.workspacePrepStallMessageKey,
  ]);

  const prepProgressMode: PrepProgressMode = useMemo(() => {
    if (workspaceBatch.workspaceBatchStarting) return "starting";
    if (sortStartInFlight) return "sending";
    if (currentJob && isRunning && processedCount === 0 && totalCount > 0) return "queued";
    return "off";
  }, [
    workspaceBatch.workspaceBatchStarting,
    sortStartInFlight,
    currentJob,
    isRunning,
    processedCount,
    totalCount,
  ]);

  useEffect(() => {
    if (!sortStartInFlight) {
      setPrepStallHint(false);
      return;
    }
    setPrepStallHint(false);
    const id = window.setTimeout(() => setPrepStallHint(true), 8000);
    return () => window.clearTimeout(id);
  }, [sortStartInFlight]);

  const hideWorkspaceCardsRow =
    !workspaceBatch.workspaceSourcesRevealRequested &&
    (sortStartInFlight ||
      isRunning ||
      currentJob?.status === "paused" ||
      currentJob?.status === "awaiting_approval" ||
      !!currentJob?.worker_active ||
      currentJob?.status === "done");

  const hideSortInstructionsStrip = sortStartInFlight || !!currentJob;

  const showDesktopWorkspaceStrip = workspaceBatch.desktop && !hideWorkspaceCardsRow;

  const rowVirtualizer = useVirtualizer({
    count: jobMetrics.files.length,
    getScrollElement: () => listParentRef.current,
    estimateSize: () => 60,
    overscan: 8,
  });

  const destFolderInsights = useMemo(() => {
    const approvalFolderSummary = folderDestinationCounts(reviewRows);
    return topNWithOtherRows(approvalFolderSummary, 5, (tail) => ({
      folder: OTHER_REASON_LABEL,
      count: tail.reduce((s, r) => s + r.count, 0),
    }));
  }, [reviewRows]);

  const sortIntroHint = useMemo(
    () => (
      <>
        {t("queue.sortIntroBefore")}
        <button type="button" onClick={onOpenOutputSettings} className="text-accent hover:underline font-medium">
          {t("queue.openSettings")}
        </button>
        {t("queue.sortIntroAfter")}
      </>
    ),
    [t, onOpenOutputSettings]
  );

  const focusDropZoneAfterPostRun = useCallback(() => {
    workspaceBatch.setWorkspaceSourcesRevealRequested(true);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        document
          .querySelector<HTMLElement>('[data-tour="workspace-sort-sources"]')
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
        document
          .querySelector<HTMLElement>('[data-tour="drop-zone"]')
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    });
  }, [workspaceBatch.setWorkspaceSourcesRevealRequested]);

  const startNewSort = useCallback(() => {
    actions.onStartNewSort();
    focusDropZoneAfterPostRun();
  }, [actions, focusDropZoneAfterPostRun]);

  const sortWizard = useSortWizard({
    currentJob,
    hasSourceSelected: workspaceBatch.hasSourceSelected,
    tourHighlightId,
  });

  useEffect(() => {
    if (sortStartInFlight) sortWizard.setWizardStep(3);
  }, [sortStartInFlight, sortWizard.setWizardStep]);

  const showSortWizard = sortStartChrome !== "job";

  return {
    t,
    settings,
    sortIntroHint,
    showPostRunCard,
    dismissPostRunPermanent,
    hidePostRunForSessionAfterCta,
    focusDropZoneAfterPostRun,
    startNewSort,
    sortInputDisabled,
    sortInputDisabledReason,
    workspaceBatch,
    handleCancelJob,
    jobMetrics,
    prepStallHint,
    prepStallTranslationKey,
    prepProgressMode,
    listParentRef,
    rowVirtualizer,
    destFolderInsights,
    hideWorkspaceCardsRow,
    hideSortInstructionsStrip,
    showDesktopWorkspaceStrip,
    showSortWizard,
    sortStartChrome,
    sortStartInFlight,
    sortWizard,
    sendingWithoutJobYet,
    jobFinishedUi,
    currentJob,
    sessionId,
    isRunning,
    isAwaitingApproval,
    totalCount,
    processedCount,
    failedFiles,
    fetchFailureCount,
    reviewRows,
  };
}

export type QueuePanelController = ReturnType<typeof useQueuePanelController>;
