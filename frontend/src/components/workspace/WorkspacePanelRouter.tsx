import { Suspense, useCallback, useMemo, type ComponentProps, type MutableRefObject } from "react";
import type { AppSettings } from "../../types/settings";
import type { FileEntry, Job, FolderNode } from "../../api";
import type { UseModelsReturn } from "../../hooks/useModels";
import type { MainNavTab } from "../../hooks/useMainNavItems";
import type { EntitlementStatus } from "../../api";
import type { GmailAnalyzeSlice } from "../../api";
import type { MemorySubTab } from "../../utils/memoryUi";
import type { TodoSubTab } from "../../utils/todoUi";
import type { TodoFeed } from "../../hooks/useTodoFeed";
import type { SettingsNavTab } from "../../utils/settingsNav";
import type { UseVoiceSessionReturn } from "../../hooks/useVoiceSession";
import type { UseBriefingOfferUiReturn } from "../../hooks/useBriefingOfferUi";
import type { WorkspaceExternalSourcesSectionProps } from "./WorkspaceExternalSourcesSection";
import type { GmailMergePrefs } from "./GmailWorkspaceSortBlock";
import type { DriveMergePrefs } from "./DriveWorkspaceSortBlock";
import type { DropboxMergePrefs } from "./DropboxWorkspaceSortBlock";
import type { OneDriveMergePrefs } from "./oneDriveWorkspaceImportResolve";
import type { OutlookMergePrefs } from "./outlookWorkspaceImportResolve";
import type { S3MergePrefs } from "./s3WorkspaceImportResolve";
import type { SlackMergePrefs } from "./slackWorkspaceImportResolve";
import type { ICloudMergePrefs } from "./icloudWorkspaceImportResolve";
import type { InfomaniakMergePrefs } from "./infomaniakWorkspaceImportResolve";
import type { InfomaniakMailMergePrefs } from "./InfomaniakMailWorkspaceSortBlock";
import type { WorkspaceAssistantBridge } from "../../apps/shared/bridges/workspaceAssistant";
import { EXO_INTRO_STORAGE_KEY } from "../../constants";
import { openPrimarySettingsSection } from "../../utils/settingsNav";
import { createQueueSettingsNavigation } from "../../utils/queueSettingsNavigation";
import PanelRouteFallback from "./PanelRouteFallback";
import {
  LazyAssistantWorkspacePanel,
  LazyExoPanel,
  LazyExternalSourcesPanel,
  LazyHistoryPanel,
  LazyMemoriesPanel,
  LazyOverviewPanel,
  LazyQueuePanel,
  LazySettingsPanel,
  LazyTasksPanel,
} from "./workspaceLazyPanels";
import { queueOpenMeetingModal, queueStartActivityCapture } from "../../utils/deferredPanelActions";
import type QueuePanel from "../QueuePanel";
import type OverviewPanel from "../OverviewPanel";

type Tab = MainNavTab;

interface WorkspacePanelRouterProps {
  tab: Tab;
  requestTab: (t: Tab) => void;
  memorySubTab: MemorySubTab;
  memoryShowAllSections: boolean;
  openMemoriesSubTab: (nextMemorySubTab: MemorySubTab) => void;
  todoSubTab: TodoSubTab;
  todoShowAllSections: boolean;
  openTodoSubTab: (subTab: TodoSubTab) => void;
  openMemoryNeedsReview: () => void;
  todoFeed: TodoFeed;
  sidebarCompact?: boolean;
  settingsSubTab: SettingsNavTab;
  settingsShowAllSections: boolean;
  onSettingsSubTabChange: (tab: SettingsNavTab) => void;
  onSettingsScrollSectionReport?: (sectionId: string) => void;
  onMemoryScrollSectionReport?: (sectionId: string) => void;
  onTodoScrollSectionReport?: (sectionId: string) => void;
  scrollRootRef?: React.RefObject<HTMLElement | null>;
  needsCloudAccount: boolean;
  suppressAssistantPermissionPrompt?: boolean;
  deferAssistantPermissionPrompt?: boolean;
  refreshEntitlement: () => void | Promise<void>;
  settingsHydrated: boolean;
  backendOnline: boolean;
  backendHealthProbing: boolean;
  backendServiceStarting?: boolean;
  handleRetryBackend?: () => void | Promise<void>;
  openHelpModal: () => void;
  isAwaitingApproval: boolean;
  modelHook: UseModelsReturn;
  settings: ComponentProps<typeof QueuePanel>["settings"];
  entitlement: EntitlementStatus | null;
  currentJob: Job | null;
  sessionId: string | null;
  isRunning: boolean;
  totalCount: number;
  processedCount: number;
  failedFiles: ComponentProps<typeof QueuePanel>["job"]["failedFiles"];
  fetchFailureCount: ComponentProps<typeof QueuePanel>["job"]["fetchFailureCount"];
  reviewRows: ComponentProps<typeof QueuePanel>["job"]["reviewRows"];
  handleFiles: ComponentProps<typeof QueuePanel>["actions"]["onFiles"];
  startExplicitLocalSort: (
    paths: string[],
    gmail: GmailAnalyzeSlice | null,
    opts?: { signal?: AbortSignal }
  ) => Promise<string | null>;
  startProgressiveDriveSort: (
    initialFilePaths: string[],
    opts?: { signal?: AbortSignal; gmailSlice?: GmailAnalyzeSlice | null }
  ) => Promise<{ job_id: string; session_id: string } | null>;
  startGmailOnlySort: (
    slice: GmailAnalyzeSlice,
    opts?: { signal?: AbortSignal }
  ) => Promise<string | null>;
  handleBrowserFiles: ComponentProps<typeof QueuePanel>["actions"]["onBrowserFiles"];
  workspaceGmailMailOnlyRunnerRef: MutableRefObject<
    ((opts?: { signal?: AbortSignal }) => Promise<string | null>) | null
  >;
  workspaceAssistantBridge: WorkspaceAssistantBridge;
  handlePause: ComponentProps<typeof QueuePanel>["actions"]["onPause"];
  handleResume: ComponentProps<typeof QueuePanel>["actions"]["onResume"];
  handleCancel: ComponentProps<typeof QueuePanel>["actions"]["onCancel"];
  handleRetryFailed: ComponentProps<typeof QueuePanel>["actions"]["onRetryFailed"];
  handleRetryDriveDownloads: ComponentProps<typeof QueuePanel>["actions"]["onRetryDriveDownloads"];
  handleApplyApproved: ComponentProps<typeof QueuePanel>["actions"]["onApplyApproved"];
  patchFileByPath: ComponentProps<typeof QueuePanel>["actions"]["onUpdateReviewRow"];
  handleUndoEntry: ComponentProps<typeof QueuePanel>["actions"]["onUndoEntry"];
  handleUndoAll: ComponentProps<typeof QueuePanel>["actions"]["onUndoAll"];
  handleStartNewSort: ComponentProps<typeof QueuePanel>["actions"]["onStartNewSort"];
  setReassignFile: (f: FileEntry | null) => void;
  setAllApproved: (v: boolean) => void;
  folderTree: FolderNode[];
  folderViewMode: AppSettings["folderViewMode"];
  setFolderViewMode: (mode: AppSettings["folderViewMode"]) => void;
  refreshTree: () => void | Promise<void>;
  refreshError: string | null;
  dismissRefreshError: () => void;
  handleOpenFolder: ComponentProps<typeof OverviewPanel>["onOpenFolder"];
  handleRevealFile: ComponentProps<typeof OverviewPanel>["onRevealFile"];
  doneCount: number;
  activeFiles: ComponentProps<typeof OverviewPanel>["activeFiles"];
  pendingCount: number;
  lastHealthOkAt: number | null;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
  tourHighlightId: string | null;
  openTour: () => void;
  registerSettingsScroll: (scrollTo: (id: string) => void, ready: boolean) => void;
  jumpToSettingsSection: (sectionId: string) => void;
  openModelDownloadModal: (role: "sort" | "vision") => void;
  openGeminiSetupModal: () => void;
  workspaceExternalSources: WorkspaceExternalSourcesSectionProps;
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
  shellVoiceSession: UseVoiceSessionReturn;
  briefingOffer: UseBriefingOfferUiReturn;
  setVisualAnalysisSuspended?: (suspended: boolean) => void;
  openVoiceInteractionSettings: () => void;
  exoChromeRevealed: boolean;
  onExoChromeRevealed: () => void;
  /** Hold Tesseract launch until local service startup overlay dismisses. */
  deferTesseractIntro?: boolean;
  /** AI Manager center column — used to anchor PTT overlay on the Exo tab. */
  exoCenterAnchorRef?: MutableRefObject<HTMLDivElement | null>;
}

/**
 * Renders the active workspace tab panel (Sort, Overview, Exo, Settings, etc.).
 */
export default function WorkspacePanelRouter(props: WorkspacePanelRouterProps) {
  const {
    tab,
    requestTab,
    memorySubTab,
    memoryShowAllSections,
    openMemoriesSubTab,
    todoSubTab,
    todoShowAllSections,
    openTodoSubTab,
    openMemoryNeedsReview,
    todoFeed,
    sidebarCompact = false,
    settingsSubTab,
    settingsShowAllSections,
    onSettingsSubTabChange,
    onSettingsScrollSectionReport,
    onMemoryScrollSectionReport,
    onTodoScrollSectionReport,
    scrollRootRef,
    needsCloudAccount,
    suppressAssistantPermissionPrompt = false,
    deferAssistantPermissionPrompt = false,
    refreshEntitlement,
    settingsHydrated,
    backendOnline,
    backendHealthProbing,
    backendServiceStarting = false,
    handleRetryBackend,
    openHelpModal: _openHelpModal,
    isAwaitingApproval,
    modelHook,
    settings,
    entitlement,
    currentJob,
    sessionId,
    isRunning,
    totalCount,
    processedCount,
    failedFiles,
    fetchFailureCount,
    reviewRows,
    handleFiles,
    startExplicitLocalSort,
    startProgressiveDriveSort,
    startGmailOnlySort,
    handleBrowserFiles,
    workspaceGmailMailOnlyRunnerRef,
    workspaceAssistantBridge,
    handlePause,
    handleResume,
    handleCancel,
    handleRetryFailed,
    handleRetryDriveDownloads,
    handleApplyApproved,
    patchFileByPath,
    handleUndoEntry,
    handleUndoAll,
    handleStartNewSort,
    setReassignFile,
    setAllApproved,
    folderTree,
    folderViewMode,
    setFolderViewMode,
    refreshTree,
    refreshError,
    dismissRefreshError,
    handleOpenFolder,
    handleRevealFile,
    doneCount,
    activeFiles,
    pendingCount,
    lastHealthOkAt: _lastHealthOkAt,
    setSettings,
    tourHighlightId,
    openTour,
    registerSettingsScroll,
    jumpToSettingsSection,
    openModelDownloadModal,
    openGeminiSetupModal,
    workspaceExternalSources,
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
    shellVoiceSession,
    briefingOffer,
    setVisualAnalysisSuspended,
    openVoiceInteractionSettings,
    exoChromeRevealed,
    onExoChromeRevealed,
    deferTesseractIntro = false,
    exoCenterAnchorRef,
  } = props;

  /** Keep Workspace mounted during an active job so switching tabs does not tear down Gmail/import UI,
   * or while on Exo so voice-triggered Sort/Drive delegation can invoke the Queue batch ref. */
  const keepQueuePanelMounted = useMemo(() => {
    if (tab === "queue") return true;
    if (tab === "exo") return true;
    if (!currentJob) return false;
    return currentJob.status !== "done" && currentJob.status !== "cancelled";
  }, [tab, currentJob]);

  const handleSettingsPatch = useCallback(
    (patch: Partial<AppSettings>) => {
      setSettings((previous) => ({ ...previous, ...patch }));
    },
    [setSettings],
  );

  const queueSettingsNavigation = useMemo(
    () => createQueueSettingsNavigation(jumpToSettingsSection),
    [jumpToSettingsSection]
  );

  const handleOpenSortModelDownload = useCallback(() => {
    openModelDownloadModal("sort");
    queueSettingsNavigation.onOpenSortModelSettings();
  }, [openModelDownloadModal, queueSettingsNavigation]);

  return (
    <>
      {keepQueuePanelMounted && (
        <Suspense fallback={<PanelRouteFallback />}>
          <LazyQueuePanel
          visuallyHidden={tab !== "queue"}
          settings={settings}
          setSettings={setSettings}
          telemetryOptIn={settings.telemetryOptIn}
          uiLocale={settings.uiLocale}
          backendOnline={backendOnline}
          backendHealthProbing={backendHealthProbing}
          backendServiceStarting={backendServiceStarting}
          canStartSort={entitlement?.canAnalyze !== false}
          entitlement={entitlement}
          needsCloudAccount={needsCloudAccount}
          onEntitlementRefresh={refreshEntitlement}
          workspaceExternalSources={workspaceExternalSources}
          gmailMergePrefsSnapshot={gmailMergePrefsSnapshot}
          driveMergePrefsSnapshot={driveMergePrefsSnapshot}
          dropboxMergePrefsSnapshot={dropboxMergePrefsSnapshot}
          oneDriveMergePrefsSnapshot={oneDriveMergePrefsSnapshot}
          outlookMergePrefsSnapshot={outlookMergePrefsSnapshot}
          s3MergePrefsSnapshot={s3MergePrefsSnapshot}
          slackMergePrefsSnapshot={slackMergePrefsSnapshot}
          icloudMergePrefsSnapshot={icloudMergePrefsSnapshot}
          infomaniakMergePrefsSnapshot={infomaniakMergePrefsSnapshot}
          infomaniakMailMergePrefsSnapshot={infomaniakMailMergePrefsSnapshot}
          workspaceGmailMailOnlyRunnerRef={workspaceGmailMailOnlyRunnerRef}
          workspaceAssistantBridge={workspaceAssistantBridge}
          tourHighlightId={tourHighlightId}
          sortFlow={{
            jobCompleted: currentJob?.status === "done",
            onOpenTour: openTour,
            onOpenSortingSettings: () => jumpToSettingsSection("sorting-rules"),
          }}
          job={{
            currentJob,
            sessionId,
            isRunning,
            isAwaitingApproval,
            totalCount,
            processedCount,
            failedFiles,
            fetchFailureCount,
            reviewRows,
          }}
          onOpenSortModelDownload={handleOpenSortModelDownload}
          actions={{
            onFiles: handleFiles,
            onStartExplicitLocalSort: startExplicitLocalSort,
            onStartProgressiveDriveSort: startProgressiveDriveSort,
            onStartGmailOnlySort: startGmailOnlySort,
            onBrowserFiles: handleBrowserFiles,
            onPause: handlePause,
            onResume: handleResume,
            onCancel: handleCancel,
            onRetryFailed: handleRetryFailed,
            onRetryDriveDownloads: handleRetryDriveDownloads,
            onApproveAll: () => setAllApproved(true),
            onRejectAll: () => setAllApproved(false),
            onApplyApproved: handleApplyApproved,
            onUpdateReviewRow: patchFileByPath,
            onUndoEntry: handleUndoEntry,
            onUndoAll: handleUndoAll,
            onStartNewSort: handleStartNewSort,
            onReassignFile: setReassignFile,
            onOpenOutputSettings: queueSettingsNavigation.onOpenOutputSettings,
            onOpenAccountSettings: queueSettingsNavigation.onOpenAccountSettings,
            onOpenLicenseSettings: queueSettingsNavigation.onOpenLicenseSettings,
            onGoToOverview: () => requestTab("overview"),
            onGoToHistory: () => requestTab("history"),
          }}
          onOpenFolder={handleOpenFolder}
          onRevealFile={handleRevealFile}
          />
        </Suspense>
      )}

      {tab === "overview" && (
        <Suspense fallback={<PanelRouteFallback />}>
          <LazyOverviewPanel
          currentJob={currentJob}
          hasOutputDir={!!settings.outputDir?.trim()}
          folderTree={folderTree}
          folderViewMode={folderViewMode}
          setFolderViewMode={(mode) => setFolderViewMode(mode)}
          refreshTree={refreshTree}
          treeRefreshError={refreshError}
          onDismissTreeError={dismissRefreshError}
          onOpenFolder={handleOpenFolder}
          onRevealFile={handleRevealFile}
          doneCount={doneCount}
          activeFiles={activeFiles}
          failedFiles={failedFiles}
          fetchFailureCount={fetchFailureCount}
          pendingCount={pendingCount}
          isJobRunning={
            !!currentJob && (currentJob.status === "running" || currentJob.status === "paused")
          }
          onGoToSort={() => requestTab("queue")}
          onChooseOutputFolder={queueSettingsNavigation.onOpenOutputSettings}
          />
        </Suspense>
      )}

      {tab === "history" && (
        <Suspense fallback={<PanelRouteFallback />}>
          <LazyHistoryPanel onGoToSort={() => requestTab("queue")} />
        </Suspense>
      )}

      {tab === "memories" && (
        <Suspense fallback={<PanelRouteFallback />}>
          <LazyMemoriesPanel
          backendOnline={backendOnline}
          subTab={memorySubTab}
          showAllSections={memoryShowAllSections}
          scrollRootRef={scrollRootRef}
          onScrollSectionReport={onMemoryScrollSectionReport}
          onOpenConversation={() => requestTab("exo")}
          onOpenTodo={() => {
            openTodoSubTab("inbox");
            requestTab("tasks");
          }}
          onHighlightMemory={() => openMemoriesSubTab("overview")}
          onRetryBackend={handleRetryBackend}
          proAllowed={entitlement?.canUseProactive !== false}
          onUpgrade={() =>
            openPrimarySettingsSection(jumpToSettingsSection, { section: "license" })
          }
          />
        </Suspense>
      )}

      {tab === "tasks" && (
        <Suspense fallback={<PanelRouteFallback />}>
          <LazyTasksPanel
          backendOnline={backendOnline}
          subTab={todoSubTab}
          showAllSections={todoShowAllSections}
          scrollRootRef={scrollRootRef}
          onScrollSectionReport={onTodoScrollSectionReport}
          sidebarCompact={sidebarCompact}
          onSelectSubTab={openTodoSubTab}
          onOpenConversation={() => requestTab("assistant")}
          onOpenSources={() => requestTab("sources")}
          onOpenMemoryReview={openMemoryNeedsReview}
          todoFeed={todoFeed}
          onRetryBackend={handleRetryBackend}
          proAllowed={entitlement?.canUseProactive !== false}
          onUpgrade={() =>
            openPrimarySettingsSection(jumpToSettingsSection, { section: "license" })
          }
          />
        </Suspense>
      )}

      {tab === "assistant" && (
        <Suspense fallback={<PanelRouteFallback />}>
          <LazyAssistantWorkspacePanel
          settings={settings}
          backendOnline={backendOnline}
          voice={shellVoiceSession}
          onSettingsPatch={handleSettingsPatch}
          proAllowed={entitlement?.canUseProactive !== false}
          deferPermissionPrompt={deferAssistantPermissionPrompt}
          onOpenSort={() => requestTab("queue")}
          onStartMeeting={() => {
            queueOpenMeetingModal();
            openTodoSubTab("today");
          }}
          onStartCapture={() => {
            queueStartActivityCapture();
            openMemoriesSubTab("activity");
          }}
          onOpenAssistantSettings={() =>
            openPrimarySettingsSection(jumpToSettingsSection, { section: "assistantTools" })
          }
          onOpenGeminiSetup={openGeminiSetupModal}
          onOpenConnectionSettings={() =>
            openPrimarySettingsSection(jumpToSettingsSection, { section: "system" })
          }
          onGoToAiSettings={() =>
            openPrimarySettingsSection(jumpToSettingsSection, { section: "aiProvider" })
          }
          onOpenVoiceInteractionSettings={openVoiceInteractionSettings}
          />
        </Suspense>
      )}

      <Suspense fallback={tab === "exo" ? <PanelRouteFallback /> : null}>
        <LazyExoPanel
        persistConversationMessages={tab !== "assistant"}
        voice={shellVoiceSession}
        briefingOffer={briefingOffer}
        centerAnchorRef={exoCenterAnchorRef}
        visuallyHidden={tab !== "exo"}
        setVisualAnalysisSuspended={setVisualAnalysisSuspended}
        suppressPermissionPrompt={suppressAssistantPermissionPrompt}
        deferPermissionPrompt={deferAssistantPermissionPrompt}
        layoutRevealed={exoChromeRevealed}
        deferTesseractIntro={deferTesseractIntro}
        settings={settings}
        settingsHydrated={settingsHydrated}
        backendOnline={backendOnline}
        onSettingsPatch={handleSettingsPatch}
        onOpenAssistantSettings={() =>
          openPrimarySettingsSection(jumpToSettingsSection, { section: "assistantTools" })
        }
        onOpenGeminiSetup={openGeminiSetupModal}
        onOpenConnectionSettings={() =>
          openPrimarySettingsSection(jumpToSettingsSection, { section: "system" })
        }
        onGoToAiSettings={() =>
          openPrimarySettingsSection(jumpToSettingsSection, { section: "aiProvider" })
        }
        onOpenVoiceInteractionSettings={openVoiceInteractionSettings}
        onExpandToChat={() => requestTab("assistant")}
        onTesseractIntroComplete={() => {
          try {
            sessionStorage.setItem(EXO_INTRO_STORAGE_KEY, "1");
          } catch {
            /* ignore */
          }
          onExoChromeRevealed();
        }}
        />
      </Suspense>

      {tab === "sources" && (
        <Suspense fallback={<PanelRouteFallback />}>
          <LazyExternalSourcesPanel
            backendOnline={backendOnline}
            onRetryBackend={handleRetryBackend}
            requestTab={requestTab}
          />
        </Suspense>
      )}

      {tab === "settings" && (
        <Suspense fallback={<PanelRouteFallback />}>
          <LazySettingsPanel
          className="flex-1"
          backendOnline={backendOnline}
          backendHealthProbing={backendHealthProbing}
          settings={settings}
          modelHook={modelHook}
          onSettingsPatch={(patch) => setSettings((s) => ({ ...s, ...patch }))}
          tourHighlightId={tourHighlightId}
          entitlement={entitlement}
          onEntitlementRefresh={refreshEntitlement}
          onRegisterSettingsScroll={registerSettingsScroll}
          openModelDownloadModal={openModelDownloadModal}
          openGeminiSetupModal={openGeminiSetupModal}
          onOpenMemoriesTab={() => openMemoriesSubTab("overview")}
          onOpenSourcesTab={() => requestTab("sources")}
          activeNavTab={settingsSubTab}
          showAllSections={settingsShowAllSections}
          onNavTabChange={onSettingsSubTabChange}
          onScrollSectionReport={onSettingsScrollSectionReport}
          onRetryBackend={handleRetryBackend}
          />
        </Suspense>
      )}
    </>
  );
}
