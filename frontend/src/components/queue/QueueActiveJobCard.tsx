import type { FileEntry, Job } from "../../api";
import { useMemo } from "react";
import { useI18n } from "../../i18n/I18nContext";
import { formatIntegerApostropheThousands } from "../../utils/format";
import { isApplePlatform } from "../../utils/platform";
import { SECONDARY_BTN_CLASS } from "../../utils/styles";
import InsightCard from "../ui/InsightCard";
import DestinationFolderDonut from "../DestinationFolderDonut";
import { Spinner } from "../Spinner";
import { JOB_STATUS_STYLE } from "./queuePanelConstants";
import { GmailJobProgressBlock, type PrepProgressMode } from "./GmailJobProgressBlock";
import { useQueueJobTimer } from "../../hooks/useQueueJobTimer";
import type { DestinationCountRow } from "../../utils/destinationFolderLegendColor";
import {
  DropboxBrandIcon,
  GmailBrandIcon,
  GoogleDriveBrandIcon,
  ICloudBrandIcon,
  InfomaniakBrandIcon,
  InfomaniakMailBrandIcon,
  OneDriveBrandIcon,
  OutlookBrandIcon,
  S3BrandIcon,
  SlackBrandIcon,
} from "../../externalSources/ExternalSourceBrandIcons";
import { deriveSortJobSources, type SortJobSourceId } from "./deriveSortJobSources";
import { QueueCancelJobButton } from "./QueueCancelJobButton";
import { SortStructureFlowPreview } from "../sort/structure/SortStructureFlowPreview";
import type { SortStructureModule } from "../../types/sortStructure";

const SORT_JOB_SOURCE_TITLE_KEY: Record<SortJobSourceId, string> = {
  local: "queue.sortSourceLocal",
  gmail: "queue.sortSourceGmail",
  "google-drive": "queue.sortSourceDrive",
  outlook: "queue.sortSourceOutlook",
  dropbox: "queue.sortSourceDropbox",
  onedrive: "queue.sortSourceOneDrive",
  s3: "queue.sortSourceS3",
  slack: "queue.sortSourceSlack",
  icloud: "queue.sortSourceICloud",
  infomaniak: "queue.sortSourceInfomaniak",
  "infomaniak-mail": "queue.sortSourceInfomaniakMail",
};

function SortJobSourceChip({ source, label }: { source: SortJobSourceId; label: string }) {
  const icon = (() => {
    switch (source) {
      case "local":
        return (
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-black/[0.06] dark:border-white/10 bg-bg-card shadow-sm"
            aria-hidden
          >
            <svg
              className="w-4 h-4 text-text-primary/80"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 17.25v1.007a3 3 0 0 0 .879 2.121M9 17.25H4.125c-.621 0-1.125-.504-1.125-1.125v-9.75C3 5.504 3.504 5 4.125 5h15.75c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125H15m-6 0v-1.5m0 1.5h6m-6 0H9m3 0h3"
              />
            </svg>
          </div>
        );
      case "gmail":
        return <GmailBrandIcon compact />;
      case "google-drive":
        return <GoogleDriveBrandIcon compact />;
      case "dropbox":
        return <DropboxBrandIcon compact />;
      case "onedrive":
        return <OneDriveBrandIcon compact />;
      case "outlook":
        return <OutlookBrandIcon compact />;
      case "s3":
        return <S3BrandIcon compact />;
      case "slack":
        return <SlackBrandIcon compact />;
      case "icloud":
        return <ICloudBrandIcon compact />;
      case "infomaniak-mail":
        return <InfomaniakMailBrandIcon compact />;
      case "infomaniak":
        return <InfomaniakBrandIcon compact />;
    }
  })();

  return (
    <li className="shrink-0 list-none">
      <span className="inline-flex" title={label}>
        <span className="sr-only">{label}</span>
        {icon}
      </span>
    </li>
  );
}

interface QueueActiveJobCardProps {
  currentJob: Job;
  /** Set when the user used **Run sort** (import/fetch time before the job record exists). */
  sortRunStartedAtMs: number | null;
  settingsOutputDir: string | undefined;
  isRunning: boolean;
  totalCount: number;
  processedCount: number;
  failedFiles: FileEntry[];
  /** Gmail ``attachments.get`` failures during import (not pipeline errors). */
  fetchFailureCount: number;
  sessionId: string | null;
  showGmailJobProgressCard: boolean;
  isGmailImportJob: boolean;
  showJobSnapshotSection: boolean;
  gmailImportStillFetching: boolean;
  driveImportStillFetching: boolean;
  driveListingDiscovered: number | null;
  /** Total non-folder files in the Drive source before filter/cap — context for "of N in Drive". */
  driveFilesInSource: number | null;
  gmailMessagesListEstimate: number | null;
  jobSnapshotTotalDisplay: number;
  pipelineCountTotal: number;
  pipelineRemaining: number;
  jobPipelineDisplayPct: number;
  midStatLabel: string;
  midStatValue: number;
  isApplyOrCompletePhase: boolean;
  uncertainCount: number;
  destFolderInsights: { display: DestinationCountRow[]; full: DestinationCountRow[] };
  /** Level cards from the structure template for this job (read-only during run). */
  structureModules: SortStructureModule[];
  prepProgressMode: PrepProgressMode;
  gmailMaxJobLabel: string | null;
  onPause: () => Promise<void>;
  onResume: () => Promise<void>;
  onCancel: () => Promise<void>;
  onRetryFailed: () => Promise<void>;
  onRetryDriveDownloads: () => Promise<void>;
  onUndoAll: () => Promise<void>;
  onStartNewSort: () => void;
}

/**
 * Status header, job controls, output folder chip, metrics strip, and Gmail pipeline bar for the active job.
 */
export function QueueActiveJobCard({
  currentJob,
  sortRunStartedAtMs,
  settingsOutputDir,
  isRunning,
  totalCount,
  processedCount,
  failedFiles,
  fetchFailureCount,
  sessionId,
  showGmailJobProgressCard,
  isGmailImportJob,
  showJobSnapshotSection,
  gmailImportStillFetching,
  driveImportStillFetching,
  driveListingDiscovered,
  driveFilesInSource,
  gmailMessagesListEstimate,
  jobSnapshotTotalDisplay,
  pipelineCountTotal,
  pipelineRemaining,
  jobPipelineDisplayPct,
  midStatLabel,
  midStatValue,
  isApplyOrCompletePhase,
  uncertainCount,
  destFolderInsights,
  structureModules,
  prepProgressMode,
  gmailMaxJobLabel,
  onPause,
  onResume,
  onCancel,
  onRetryFailed,
  onRetryDriveDownloads,
  onUndoAll,
  onStartNewSort,
}: QueueActiveJobCardProps) {
  const { t } = useI18n();
  const statusLabel = (s: string) => t(`queue.jobStatus.${s}`);
  const phaseHint = (p: string) => t(`queue.phase.${p}`);

  const jobStyle = JOB_STATUS_STYLE[currentJob.status] ?? JOB_STATUS_STYLE.done;
  const jobElapsedLabel = useQueueJobTimer(currentJob, { sortRunStartedAtMs });
  const jobActiveForTimer = currentJob?.status === "running";
  const failedSortCount = failedFiles.length;
  const failedFetchCount = fetchFailureCount;
  const hasFailedMetricHighlight = failedSortCount > 0 || failedFetchCount > 0;
  const sortFailedPct = totalCount > 0 ? Math.round((failedSortCount / totalCount) * 100) : 0;

  const outRaw = currentJob.config?.output_dir?.trim() || settingsOutputDir?.trim();
  const jobOutputDir = outRaw && outRaw.length > 0 ? outRaw : null;
  const jobOutputFolderTitle = (() => {
    if (!jobOutputDir) return null;
    const normalized = jobOutputDir.replace(/[/\\]+$/, "");
    const seg = normalized.split(/[/\\]/);
    return seg[seg.length - 1] || normalized;
  })();

  const sortSources = useMemo(() => deriveSortJobSources(currentJob), [currentJob]);
  const driveDownloadFailedCount =
    sortSources.includes("google-drive") ? (currentJob.drive_import_failed_file_ids?.length ?? 0) : 0;

  const destinationFoldersBlock =
    totalCount > 0 ? (
      <InsightCard
        id="queue-donut-folders-heading"
        title={t("queue.destFoldersTitle")}
        subtitle={t("queue.destFoldersSubtitle")}
        helpHint={t("queue.destFoldersHelp")}
      >
        <DestinationFolderDonut
          items={destFolderInsights.display}
          itemsFull={destFolderInsights.full}
          embedded
        />
      </InsightCard>
    ) : null;

  const classifyProgressBlock = showGmailJobProgressCard ? (
    <div className="space-y-1.5 w-full min-w-0 min-h-0">
      <GmailJobProgressBlock
        showGmailJobProgressCard={showGmailJobProgressCard}
        currentJob={currentJob}
        totalCount={totalCount}
        gmailMessagesListEstimate={gmailMessagesListEstimate}
        driveImportStillFetching={driveImportStillFetching}
        driveListingDiscovered={driveListingDiscovered}
        prepProgressMode={prepProgressMode}
        processedCount={processedCount}
        pipelineCountTotal={pipelineCountTotal}
        pipelineRemaining={pipelineRemaining}
        jobPipelineDisplayPct={jobPipelineDisplayPct}
        phaseHint={phaseHint}
      />
    </div>
  ) : null;

  const structureConfigBlock =
    structureModules.length > 0 ? (
      <div className="space-y-2 pt-1" data-testid="queue-structure-config-preview">
        <p className="text-2xs font-semibold uppercase tracking-wider text-muted">
          {t("settings.sortStructure.title")}
        </p>
        <SortStructureFlowPreview modules={structureModules} />
      </div>
    ) : null;

  return (
    <div className={`rounded-xl border overflow-hidden ${jobStyle.ring}`}>
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2" aria-live="polite" aria-atomic="true">
          <span className={`w-2 h-2 rounded-full shrink-0 ${jobStyle.dot}`} aria-hidden />
          <span className={`text-sm font-semibold ${jobStyle.text}`}>{statusLabel(currentJob.status)}</span>
          {(isRunning || totalCount > 0) && (
            <span className="text-xs text-muted">
              ·{" "}
              {gmailImportStillFetching && totalCount === 0
                ? t("queue.headerGmailFetching")
                : driveImportStillFetching && totalCount === 0
                  ? driveListingDiscovered != null
                    ? driveFilesInSource != null && driveFilesInSource > driveListingDiscovered
                      ? t("queue.headerDriveDiscoveringOf", {
                          count: formatIntegerApostropheThousands(driveListingDiscovered),
                          total: formatIntegerApostropheThousands(driveFilesInSource),
                        })
                      : t("queue.headerDriveDiscovering", {
                          count: formatIntegerApostropheThousands(driveListingDiscovered),
                        })
                    : t("queue.headerDriveFetching")
                  : driveFilesInSource != null && driveFilesInSource > jobSnapshotTotalDisplay
                    ? jobSnapshotTotalDisplay === 1
                      ? t("queue.headerFileCountOneOf", { total: formatIntegerApostropheThousands(driveFilesInSource) })
                      : t("queue.headerFileCountOf", {
                          count: formatIntegerApostropheThousands(jobSnapshotTotalDisplay),
                          total: formatIntegerApostropheThousands(driveFilesInSource),
                        })
                    : jobSnapshotTotalDisplay === 1
                      ? t("queue.headerFileCountOne")
                      : t("queue.headerFileCount", {
                          count: formatIntegerApostropheThousands(jobSnapshotTotalDisplay),
                        })}
            </span>
          )}
          {jobElapsedLabel != null && (
            <span
              className="text-xs text-muted tabular-nums ml-1"
              title={jobActiveForTimer ? t("queue.elapsedRunning") : t("queue.elapsedFrozen")}
            >
              · {jobElapsedLabel}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {currentJob.status === "running" && (
            <button
              onClick={onPause}
              title={t("queue.pauseTitle")}
              className={`flex items-center gap-1.5 ${SECONDARY_BTN_CLASS}`}
            >
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
              </svg>
              {t("queue.pause")}
            </button>
          )}
          {currentJob.status === "paused" && (
            <button
              onClick={onResume}
              title={t("queue.resumeTitle")}
              className={`flex items-center gap-1.5 ${SECONDARY_BTN_CLASS}`}
            >
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7L8 5z" />
              </svg>
              {t("queue.resume")}
            </button>
          )}
          {(currentJob.status === "running" ||
            currentJob.status === "paused" ||
            currentJob.status === "awaiting_approval") && <QueueCancelJobButton onCancel={onCancel} />}
          {currentJob.status === "done" && (
            <button
              type="button"
              onClick={onStartNewSort}
              title={t("queue.newSortTitle")}
              className={`flex items-center gap-1.5 ${SECONDARY_BTN_CLASS}`}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              {t("queue.newSort")}
            </button>
          )}
          {currentJob.status === "done" && sessionId && (
            <button
              onClick={onUndoAll}
              title={t("queue.undoSessionTitle")}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-error-line text-error hover:bg-error-soft transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3"
                />
              </svg>
              {t("queue.undoAll")}
            </button>
          )}
          {failedFiles.length > 0 && (
            <button
              onClick={onRetryFailed}
              title={
                failedFiles.length === 1
                  ? t("queue.retryFailedTitleOne")
                  : t("queue.retryFailedTitle", { count: failedFiles.length })
              }
              className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-warning-line text-warning hover:bg-warning-soft transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
                />
              </svg>
              Retry ({failedFiles.length})
            </button>
          )}
          {driveDownloadFailedCount > 0 && window.electronAPI && (
            <button
              onClick={onRetryDriveDownloads}
              title={`Re-download ${driveDownloadFailedCount} Drive file${driveDownloadFailedCount === 1 ? "" : "s"} that failed to import`}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-warning-line text-warning hover:bg-warning-soft transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
                />
              </svg>
              Retry downloads ({driveDownloadFailedCount})
            </button>
          )}
        </div>
      </div>

      {jobOutputDir && jobOutputFolderTitle && (
        <div className="border-t border-border-mid px-4 pt-3 pb-3 space-y-2">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
            <p className="text-2xs font-semibold uppercase tracking-wider text-muted">{t("queue.sortedFilesFolder")}</p>
          </div>
          <div className="rounded-xl border border-border bg-bg-card shadow-sm px-3 py-2.5">
            <div className="flex flex-col gap-3 min-w-0 sm:flex-row sm:items-stretch sm:gap-4">
              {sortSources.length > 0 ? (
                <div className="flex flex-col gap-2 shrink-0 sm:min-w-[8.5rem] sm:border-r sm:border-border-mid sm:pr-4">
                  <p className="text-2xs font-semibold uppercase tracking-wider text-muted m-0">{t("queue.sortJobSources")}</p>
                  <ul
                    className="flex flex-row flex-wrap items-center gap-2 m-0 p-0"
                    aria-label={t("queue.sortJobSourcesAria")}
                  >
                    {sortSources.map((src) => (
                      <SortJobSourceChip
                        key={src}
                        source={src}
                        label={t(SORT_JOB_SOURCE_TITLE_KEY[src])}
                      />
                    ))}
                  </ul>
                </div>
              ) : null}
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <p className="text-2xs font-semibold uppercase tracking-wider text-muted m-0">{t("queue.sortJobDestination")}</p>
                <button
                  type="button"
                  onClick={() => void window.electronAPI?.openPath(jobOutputDir)}
                  className="flex items-center gap-3 w-full min-w-0 flex-1 text-left rounded-lg -mx-0.5 px-1 py-0.5 hover:bg-hover-overlay/80 transition-colors group"
                  title={
                    window.electronAPI
                      ? isApplePlatform()
                        ? t("queue.openOutputFinder")
                        : t("queue.openOutputExplorer")
                      : jobOutputDir
                  }
                >
                  <div className="w-9 h-9 rounded-lg border border-accent-line/40 bg-accent-light flex items-center justify-center shrink-0">
                    <svg className="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v8.25m19.5 0v.75A2.25 2.25 0 0 1 19.5 17.25h-15a2.25 2.25 0 0 1-2.25-2.25V13.5"
                      />
                    </svg>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-text-primary truncate group-hover:text-accent transition-colors">
                      {jobOutputFolderTitle}
                    </p>
                    <p className="text-3xs text-muted truncate font-mono mt-0.5" title={jobOutputDir}>
                      {jobOutputDir}
                    </p>
                  </div>
                  <svg
                    className="w-4 h-4 shrink-0 text-muted group-hover:text-accent transition-colors"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                    aria-hidden
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5M18 10.5h2.25m-2.25 0V8.25m2.25 3V6a2.25 2.25 0 0 0-2.25-2.25H15M10.5 18v-4.125A2.25 2.25 0 0 1 12.75 11.625h4.125a.375.375 0 0 1 .375.375V18M10.5 3.75h6.375c.621 0 1.125.504 1.125 1.125v4.125M7.5 18h.375a.375.375 0 0 0 .375-.375V14.25"
                    />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showJobSnapshotSection && (
        <div className="border-t border-border-mid px-4 pt-4 pb-4">
          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
              <p className="text-2xs font-semibold uppercase tracking-wider text-muted">{t("queue.jobSnapshot")}</p>
              <p className="text-3xs text-muted tabular-nums">
                {totalCount === 0 && gmailImportStillFetching && gmailMaxJobLabel !== null
                  ? currentJob?.gmail_import_content === "attachments"
                    ? t("queue.perJobGmailPendingAttachments", { max: gmailMaxJobLabel })
                    : t("queue.perJobGmailPendingMessages", { max: gmailMaxJobLabel })
                  : jobSnapshotTotalDisplay === 1
                    ? t("queue.perJobFilesOne")
                    : t("queue.perJobFiles", {
                        count: formatIntegerApostropheThousands(jobSnapshotTotalDisplay),
                      })}
              </p>
            </div>

            <div
              className="flex gap-2 items-stretch overflow-x-auto snap-x snap-mandatory -mx-0.5 px-0.5 sm:flex-wrap sm:overflow-visible [scrollbar-width:thin]"
              role="group"
              aria-label={t("queue.jobMetricsAria")}
            >
              <div
                className="rounded-xl border border-border bg-bg-card px-3 py-2 shadow-sm flex flex-col min-w-[calc(50%-0.25rem)] min-h-[5rem] sm:min-w-0 sm:flex-1 snap-start shrink-0 sm:shrink basis-0"
                title={isGmailImportJob ? t("queue.tileTotalGmailHelp") : undefined}
              >
                <div className="flex items-baseline justify-between gap-2 min-h-[0.875rem] shrink-0">
                  <span className="text-2xs uppercase tracking-wider text-muted font-semibold">
                    {t("queue.metricTotal")}
                  </span>
                  {(gmailImportStillFetching || driveImportStillFetching) && isRunning ? (
                    <span
                      className="flex items-center gap-1 text-3xs text-muted tabular-nums shrink-0 max-w-[min(11rem,55%)]"
                      title={t("queue.metricTotalFetchingTitle")}
                    >
                      <Spinner className="w-3 h-3 text-accent shrink-0" aria-hidden />
                      <span className="normal-case font-medium text-text-primary/90 truncate">
                        {t("queue.metricTotalFetching")}
                      </span>
                    </span>
                  ) : (
                    <span className="text-3xs text-muted tabular-nums shrink-0 invisible select-none" aria-hidden>
                      0%
                    </span>
                  )}
                </div>
                <div className="flex-1 flex items-center min-h-0">
                  <span className="text-xl font-bold tabular-nums leading-none text-text-primary">
                    {formatIntegerApostropheThousands(jobSnapshotTotalDisplay)}
                  </span>
                </div>
              </div>
              {(
                [
                  {
                    label: midStatLabel,
                    value: midStatValue,
                    color: midStatValue > 0 ? "text-success" : "text-muted",
                    border: "border-success-line/30",
                    tileTitle: isApplyOrCompletePhase
                      ? t("queue.tileSortedHelp")
                      : t("queue.tileClassifiedHelp"),
                    showPct: true,
                  },
                  {
                    label: t("queue.metricUncertain"),
                    value: uncertainCount,
                    color: uncertainCount > 0 ? "text-text-primary" : "text-muted",
                    border: uncertainCount > 0 ? "border-border-mid" : "border-border",
                    tileTitle: t("queue.tileUncertainHelp"),
                    showPct: true,
                  },
                ] as const
              ).map(({ label, value, color, border, tileTitle, showPct }) => {
                const pct = totalCount > 0 ? Math.round((value / totalCount) * 100) : 0;
                return (
                  <div
                    key={label}
                    title={tileTitle ?? undefined}
                    className={`rounded-xl border ${border} bg-bg-card px-3 py-2 shadow-sm flex flex-col min-w-[calc(50%-0.25rem)] min-h-[5rem] sm:min-w-0 sm:flex-1 snap-start shrink-0 sm:shrink basis-0`}
                  >
                    <div className="flex items-baseline justify-between gap-2 min-h-[0.875rem] shrink-0">
                      <span className="text-2xs uppercase tracking-wider text-muted font-semibold">{label}</span>
                      {showPct ? (
                        <span
                          className="text-3xs text-muted tabular-nums shrink-0"
                          title={
                            totalCount === 1
                              ? t("queue.pctOfJobOne", { pct })
                              : t("queue.pctOfJob", {
                                  pct,
                                  count: formatIntegerApostropheThousands(totalCount),
                                })
                          }
                        >
                          {totalCount > 0 ? `${pct}%` : "—"}
                        </span>
                      ) : (
                        <span className="text-3xs text-muted tabular-nums shrink-0 invisible select-none" aria-hidden>
                          0%
                        </span>
                      )}
                    </div>
                    <div className="flex-1 flex items-center min-h-0">
                      <span className={`text-xl font-bold tabular-nums leading-none ${color}`}>
                        {formatIntegerApostropheThousands(value)}
                      </span>
                    </div>
                  </div>
                );
              })}
              <div
                title={t("queue.tileFailedHelp")}
                className={`rounded-xl border ${
                  hasFailedMetricHighlight ? "border-error-line/40" : "border-border"
                } bg-bg-card px-3 py-2 shadow-sm flex flex-col min-w-[calc(50%-0.25rem)] min-h-[5rem] sm:min-w-0 sm:flex-1 snap-start shrink-0 sm:shrink basis-0`}
              >
                <div className="flex items-baseline justify-between gap-2 min-h-[0.875rem] shrink-0">
                  <span className="text-2xs uppercase tracking-wider text-muted font-semibold">
                    {t("queue.metricFailed")}
                  </span>
                  <span
                    className="text-3xs text-muted tabular-nums shrink-0"
                    title={
                      totalCount > 0 && failedSortCount > 0
                        ? totalCount === 1
                          ? t("queue.pctOfJobOne", { pct: sortFailedPct })
                          : t("queue.pctOfJob", {
                              pct: sortFailedPct,
                              count: formatIntegerApostropheThousands(totalCount),
                            })
                        : undefined
                    }
                  >
                    {totalCount > 0 && failedSortCount > 0 ? `${sortFailedPct}%` : "—"}
                  </span>
                </div>
                <div className="flex-1 flex flex-col justify-center gap-1.5 min-h-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-3xs text-muted font-medium">{t("queue.metricFailedSort")}</span>
                    <span
                      className={`text-lg font-bold tabular-nums leading-none ${
                        failedSortCount > 0 ? "text-error" : "text-muted"
                      }`}
                    >
                      {formatIntegerApostropheThousands(failedSortCount)}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-3xs text-muted font-medium">{t("queue.metricFailedFetch")}</span>
                    <span
                      className={`text-lg font-bold tabular-nums leading-none ${
                        failedFetchCount > 0 ? "text-error" : "text-muted"
                      }`}
                    >
                      {formatIntegerApostropheThousands(failedFetchCount)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {structureConfigBlock}

            {classifyProgressBlock}
          </div>

          {destinationFoldersBlock ? <div className="mt-4">{destinationFoldersBlock}</div> : null}
        </div>
      )}

      {showGmailJobProgressCard && !showJobSnapshotSection && (
        <div className="border-t border-border-mid px-4 pb-4 pt-1 space-y-1.5">
          <GmailJobProgressBlock
            showGmailJobProgressCard={showGmailJobProgressCard}
            currentJob={currentJob}
            totalCount={totalCount}
            gmailMessagesListEstimate={gmailMessagesListEstimate}
            driveImportStillFetching={driveImportStillFetching}
            driveListingDiscovered={driveListingDiscovered}
            prepProgressMode={prepProgressMode}
            processedCount={processedCount}
            pipelineCountTotal={pipelineCountTotal}
            pipelineRemaining={pipelineRemaining}
            jobPipelineDisplayPct={jobPipelineDisplayPct}
            phaseHint={phaseHint}
          />
        </div>
      )}
    </div>
  );
}
