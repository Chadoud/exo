import { useCallback } from "react";
import OutputFolderBanner from "./OutputFolderBanner";
import SortFlowStrip from "./SortFlowStrip";
import { QueuePanelHeader } from "./queue/QueuePanelHeader";
import { QueueNoSortModelBanner } from "./queue/QueueNoSortModelBanner";
import { QueueCloudSortSyncBanner } from "./queue/QueueCloudSortSyncBanner";
import { QueueDesktopWorkspaceSection } from "./queue/QueueDesktopWorkspaceSection";
import { QueueWebImportSection } from "./queue/QueueWebImportSection";
import { QueuePanelJobSection } from "./queue/QueuePanelJobSection";
import { SortWizard } from "./queue/SortWizard";
import { QueueSortSendingCluster } from "./queue/QueueSortSendingCluster";
import { useQueuePanelController } from "./queue/useQueuePanelController";
import type { QueuePanelProps } from "./queue/queuePanelProps";
import type { AppSettings } from "../types/settings";
import { useCloudSortActive } from "../hooks/useCloudSortActive";

export default function QueuePanel(props: QueuePanelProps) {
  const {
    settings,
    telemetryOptIn,
    uiLocale,
    backendOnline,
    backendHealthProbing,
    backendServiceStarting = false,
    sortFlow,
    canStartSort = true,
    needsCloudAccount = false,
    entitlement,
    onEntitlementRefresh,
    onOpenSortModelDownload,
    workspaceExternalSources,
    visuallyHidden = false,
    actions,
    setSettings,
  } = props;

  const { cloudSortActive } = useCloudSortActive(entitlement);

  const patchSettings = useCallback(
    (patch: Partial<AppSettings>) => {
      setSettings((previous) => ({ ...previous, ...patch }));
    },
    [setSettings],
  );

  const controller = useQueuePanelController(props);
  const {
    sortIntroHint,
    showDesktopWorkspaceStrip,
    showSortWizard,
    sortStartInFlight,
    t,
    workspaceBatch,
    prepStallHint,
    prepStallTranslationKey,
  } = controller;

  const {
    onFiles,
    onBrowserFiles,
    onPause,
    onResume,
    onRetryFailed,
    onRetryDriveDownloads,
    onApproveAll,
    onRejectAll,
    onApplyApproved,
    onUpdateReviewRow,
    onUndoEntry,
    onUndoAll,
    onReassignFile,
    onOpenOutputSettings,
    onOpenAccountSettings,
    onOpenLicenseSettings,
    onGoToOverview,
    onGoToHistory,
  } = actions;

  const {
    onOpenFolder,
    onRevealFile,
  } = props;

  return (
    <div
      className={visuallyHidden ? "space-y-4 hidden" : "space-y-4"}
      aria-hidden={visuallyHidden ? true : undefined}
    >
      {!settings.outputDir?.trim() ? (
        <OutputFolderBanner onClick={onOpenOutputSettings} />
      ) : null}
      {!needsCloudAccount && !cloudSortActive && !settings.model?.trim() ? (
        <QueueNoSortModelBanner onOpenSortModelDownload={onOpenSortModelDownload} />
      ) : null}
      {cloudSortActive && entitlement?.sortSyncLastError?.trim() ? (
        <QueueCloudSortSyncBanner
          errorMessage={entitlement.sortSyncLastError.trim()}
          backendOnline={backendOnline}
          onEntitlementRefresh={onEntitlementRefresh}
        />
      ) : null}

      <SortFlowStrip
        jobCompleted={sortFlow.jobCompleted}
        onOpenTour={sortFlow.onOpenTour}
        onOpenSortingSettings={sortFlow.onOpenSortingSettings}
      />

      <QueuePanelHeader
        backendOnline={backendOnline}
        backendHealthProbing={backendHealthProbing}
        backendServiceStarting={backendServiceStarting}
        needsCloudAccount={needsCloudAccount}
        canStartSort={canStartSort}
        sortIntroHint={sortIntroHint}
        onOpenAccountSettings={onOpenAccountSettings}
        onOpenLicenseSettings={onOpenLicenseSettings}
      />

      {showSortWizard ? (
        <SortWizard
          workspaceExternalSources={workspaceExternalSources}
          onSettingsPatch={patchSettings}
          backendOnline={backendOnline}
          onFiles={onFiles}
          onBrowserFiles={onBrowserFiles}
          {...controller}
        />
      ) : null}

      {sortStartInFlight ? (
        <QueueSortSendingCluster
          previewCount={workspaceBatch.previewCount}
          stallVisible={prepStallHint}
          stallTranslationKey={prepStallTranslationKey}
          onCancel={workspaceBatch.handleCancelWorkspaceBatchStart}
          t={t}
        />
      ) : null}

      {!showSortWizard && showDesktopWorkspaceStrip ? (
        <QueueDesktopWorkspaceSection
          workspaceExternalSources={workspaceExternalSources}
          {...controller}
        />
      ) : null}

      {!showSortWizard ? (
        <QueueWebImportSection
          workspaceExternalSources={workspaceExternalSources}
          onFiles={onFiles}
          onBrowserFiles={onBrowserFiles}
          {...controller}
        />
      ) : null}

      <QueuePanelJobSection
        telemetryOptIn={telemetryOptIn}
        uiLocale={uiLocale}
        onPause={onPause}
        onResume={onResume}
        onRetryFailed={onRetryFailed}
        onRetryDriveDownloads={onRetryDriveDownloads}
        onUndoAll={onUndoAll}
        onUpdateReviewRow={onUpdateReviewRow}
        onApproveAll={onApproveAll}
        onRejectAll={onRejectAll}
        onApplyApproved={onApplyApproved}
        onUndoEntry={onUndoEntry}
        onReassignFile={onReassignFile}
        onGoToOverview={onGoToOverview}
        onGoToHistory={onGoToHistory}
        onOpenOutputSettings={onOpenOutputSettings}
        onOpenFolder={onOpenFolder}
        onRevealFile={onRevealFile}
        onFolderViewModeChange={(mode) => patchSettings({ folderViewMode: mode })}
        {...controller}
      />
    </div>
  );
}
