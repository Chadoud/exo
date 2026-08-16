import type { CSSProperties, ReactElement } from "react";
import { cloneElement, isValidElement, useEffect, useRef } from "react";
import type { AppMainWorkspaceProps } from "./appMainWorkspaceTypes";
import OfflineConnectionStrip from "./OfflineConnectionStrip";
import AppServiceStartupOverlay from "./AppServiceStartupOverlay";
import SidebarNav from "./SidebarNav";
import SidebarProfileTab from "./SidebarProfileTab";
import BrainSearchModal from "./BrainSearchModal";
import AmbientVoiceHud from "./AmbientVoiceHud";
import { ExoHeaderClock } from "./ExoPanelChrome";
import { WindowsTitleBranding } from "./TitleBar";
import { useWorkspaceVoiceBridge } from "../hooks/useWorkspaceVoiceBridge";
import { useExoChromeReveal } from "../apps/workspace/useExoChromeReveal";
import { useBrainSearchShortcut, useSidebarCompactLayout } from "../apps/workspace/useWorkspaceShellChrome";
import { useWorkspaceSidebarNav } from "../apps/workspace/useWorkspaceSidebarNav";
import { useOAuthAutopilotToasts } from "../apps/workspace/useOAuthAutopilotToasts";
import { useExoFullscreenShortcut } from "../apps/workspace/useExoFullscreenShortcut";
import { useCodegenPreviewDetach } from "../apps/workspace/useCodegenPreviewDetach";
import PushToTalkOverlay from "./PushToTalkOverlay";
import { shouldShowSidebarCornerBranding } from "../apps/workspace/sidebarCornerBranding";
import { isMacElectronClient, isWindowsElectronClient } from "../utils/platform";
import { useWorkspaceVoiceToolHandlers } from "../apps/workspace/useWorkspaceVoiceToolHandlers";
import {
  handleIntegrationClientAction,
  INTEGRATION_CLIENT_ACTION_EVENT,
  type IntegrationClientActionDetail,
} from "../assistant/integrationClientActions";
import { useI18n } from "../i18n/I18nContext";
import { useCodegenErrorToast } from "../features/codegen/useCodegenErrorToast";
import { APP_SHELL_GUTTER_X_CLASS } from "../utils/styles";
import WorkspacePanelRouter from "./workspace/WorkspacePanelRouter";
import { OFFLINE_STRIP_GRACE_MS } from "../constants";
import {
  shouldShowAppServiceStartupOverlay,
  shouldShowOfflineConnectionStrip,
} from "../utils/offlineConnectionStrip";
import { hasEntitlementIpc } from "../utils/electronDesktop";

/**
 * Main shell: cloud gate strip, offline strip, sidebar, tab panels.
 */
export default function AppMainWorkspace(props: AppMainWorkspaceProps) {
  const {
    titleBar,
    workspaceBanner,
    needsCloudAccount,
    suppressAssistantPermissionPrompt = false,
    deferAssistantPermissionPrompt = false,
    refreshEntitlement,
    backendOnline,
    settingsHydrated,
    backendHealthProbing,
    backendServiceStarting = false,
    backendStartupFailed = false,
    backendAutoRecoveryExhausted = false,
    backendRetryBusy = false,
    handleRetryBackend,
    openHelpModal,
    navItems,
    todoFeed,
    tab,
    requestTab,
    uiLocale,
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
    onVoiceLocalSortJobStarted,
    onVoiceCodegenRequested,
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
    lastHealthOkAt,
    setSettings,
    tourHighlightId,
    openTour,
    registerSettingsScroll,
    registerSettingsSubTabSelector,
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
  } = props;

  const { t } = useI18n();
  useCodegenErrorToast();

  const {
    memorySubTab,
    memoryShowAllSections,
    todoSubTab,
    todoShowAllSections,
    settingsSubTab,
    settingsShowAllSections,
    settingsHighlightedSubTab,
    memoryHighlightedSubTab,
    todoHighlightedSubTab,
    selectSettingsSubTab,
    profileTabActive,
    handleSidebarNavSelect,
    openTodoSubTab,
    openMemoryNeedsReview,
    openProfileFromSidebar,
    openMemoriesSubTab,
    reportSettingsScrollSection,
    reportMemoryScrollSection,
    reportTodoScrollSection,
  } = useWorkspaceSidebarNav({
    tab,
    requestTab,
    entitlement,
    jumpToSettingsSection,
    registerSettingsSubTabSelector,
  });

  useCodegenPreviewDetach(tab);
  useOAuthAutopilotToasts(t);
  useExoFullscreenShortcut(tab);

  const showAppServiceStartupOverlay = shouldShowAppServiceStartupOverlay({
    isDesktopManaged: hasEntitlementIpc(),
    backendOnline,
    backendHealthProbing,
    backendServiceStarting,
    backendStartupFailed,
    lastHealthOkAt,
  });
  const { exoChromeRevealed, revealExoChrome } = useExoChromeReveal(tab, showAppServiceStartupOverlay);

  const isDesktopElectron = isWindowsElectronClient() || isMacElectronClient();
  const showSidebarCornerBranding = shouldShowSidebarCornerBranding(tab, exoChromeRevealed, {
    isDesktopElectron,
  });
  const sidebarCompact = useSidebarCompactLayout();
  const { brainSearchOpen, setBrainSearchOpen } = useBrainSearchShortcut();

  const { handleVoiceToolRunning, handleVoiceToolResult, runIntegrationVoiceActionRef } =
    useWorkspaceVoiceToolHandlers({
      requestTab,
      workspaceAssistantBridge,
      onVoiceLocalSortJobStarted,
      onVoiceCodegenRequested,
      t,
    });

  const {
    voice: shellVoiceSession,
    briefingOffer,
    pushToTalk,
    openVoiceInteractionSettings,
    handleAlwaysAllowVoiceTool,
    setVisualAnalysisSuspended,
    runIntegrationVoiceAction,
  } = useWorkspaceVoiceBridge({
    settings,
    setSettings,
    settingsHydrated,
    backendOnline,
    activeTab: tab,
    jumpToSettingsSection,
    onRetryBackend: handleRetryBackend,
    onToolRunning: handleVoiceToolRunning,
    onToolResult: handleVoiceToolResult,
  });

  runIntegrationVoiceActionRef.current = runIntegrationVoiceAction;

  useEffect(() => {
    const onIntegrationAction = (event: Event) => {
      const detail = (event as CustomEvent<IntegrationClientActionDetail>).detail;
      if (!detail?.action || !detail?.providerId) return;
      handleIntegrationClientAction({
        detail,
        requestTab,
        runIntegrationAction: runIntegrationVoiceAction,
      });
    };
    window.addEventListener(INTEGRATION_CLIENT_ACTION_EVENT, onIntegrationAction);
    return () => window.removeEventListener(INTEGRATION_CLIENT_ACTION_EVENT, onIntegrationAction);
  }, [requestTab, runIntegrationVoiceAction]);

  const mainColumnRef = useRef<HTMLElement>(null);
  const exoCenterRef = useRef<HTMLDivElement>(null);
  const pushToTalkAnchorRef = tab === "exo" ? exoCenterRef : mainColumnRef;

  /** Nav-rail corner: live clock on every tab once shell chrome is visible (desktop Electron). */
  const sidebarHeaderClockSlot = (
    <span className="min-w-0 flex flex-col justify-center" aria-live="polite">
      <ExoHeaderClock />
    </span>
  );

  return (
    <>
      {showAppServiceStartupOverlay ? (
        <AppServiceStartupOverlay
          failed={backendStartupFailed}
          autoRecoveryExhausted={backendAutoRecoveryExhausted}
          retryBusy={backendRetryBusy}
        />
      ) : null}
      {shouldShowOfflineConnectionStrip({
        backendOnline,
        backendHealthProbing,
        backendServiceStarting,
        isDesktopManaged: hasEntitlementIpc(),
        backendStartupFailed,
        isRunning,
        hasCurrentJob: Boolean(currentJob),
        lastHealthOkAt,
        graceMs: OFFLINE_STRIP_GRACE_MS,
      }) ? (
        <OfflineConnectionStrip onRetryBackend={handleRetryBackend} />
      ) : null}
      <div
        className={`app-shell grid flex-1 min-h-0 w-full min-w-0 grid-cols-[auto_1fr] grid-rows-[auto_1fr] overflow-hidden ${
          tab === "exo" && !exoChromeRevealed ? "app-shell--exo-intro" : ""
        }${sidebarCompact ? " app-shell--sidebar-compact" : ""}`}
      >
        <div
          className="app-shell-top-brand row-start-1 col-start-1 border-b border-r border-border bg-bg-secondary min-w-[12.5rem] flex flex-col items-stretch justify-center min-h-0"
          style={
            showSidebarCornerBranding
              ? ({ WebkitAppRegion: "drag" } as CSSProperties)
              : undefined
          }
          aria-hidden={!showSidebarCornerBranding}
        >
          {showSidebarCornerBranding ? (
            <WindowsTitleBranding
              productLabel={t("titleBar.appName")}
              placement="sidebar"
              labelSlot={sidebarHeaderClockSlot}
            />
          ) : null}
        </div>
        <div className="app-shell-top-title row-start-1 col-start-2 min-h-0 min-w-0 flex flex-col items-stretch">
          <div className="min-h-0 min-w-0 flex-1 flex flex-col">
            {tab === "exo" && exoChromeRevealed && isValidElement(titleBar)
              ? cloneElement(titleBar as ReactElement<{ suppressLeadingBranding?: boolean }>, {
                  suppressLeadingBranding: true,
                })
              : tab === "exo" && !exoChromeRevealed
                ? null
                : titleBar}
          </div>
          {workspaceBanner}
        </div>
        <div className="app-shell-sidebar row-start-2 col-start-1 flex min-h-0 min-w-0 flex-col overflow-hidden bg-bg-secondary border-r border-border">
          <div className="app-shell-sidebar-inner flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
              <SidebarNav
                items={navItems}
                activeTab={tab}
                memorySubTab={memorySubTab}
                memoryShowAllSections={memoryShowAllSections}
                todoSubTab={todoSubTab}
                todoShowAllSections={todoShowAllSections}
                settingsSubTab={settingsSubTab}
                settingsShowAllSections={settingsShowAllSections}
                settingsHighlightedSubTab={settingsHighlightedSubTab}
                memoryHighlightedSubTab={memoryHighlightedSubTab}
                todoHighlightedSubTab={todoHighlightedSubTab}
                onSelect={handleSidebarNavSelect}
                uiLocale={uiLocale}
                isAwaitingApproval={isAwaitingApproval}
                installingModel={modelHook.installingModel}
              />
            </div>
            <SidebarProfileTab
              entitlement={entitlement}
              uiLocale={uiLocale}
              isActive={profileTabActive}
              onOpenProfile={openProfileFromSidebar}
            />
          </div>
        </div>
        <main
          ref={mainColumnRef}
          className={`row-start-2 col-start-2 min-h-0 min-w-0 ${
            tab === "exo" && !exoChromeRevealed
              ? "z-[5] col-span-2 row-span-2 col-start-1 row-start-1"
              : ""
          } ${
            tab === "assistant" || tab === "exo"
              ? "flex flex-col overflow-hidden px-0 pb-0 pt-0"
              : tab === "settings" || tab === "sources"
                ? "flex flex-col overflow-hidden pt-2 px-0 pb-0"
                : tab === "memories" && memorySubTab === "map" && !memoryShowAllSections
                  ? `flex flex-col overflow-hidden ${APP_SHELL_GUTTER_X_CLASS} pb-5 pt-5`
                  : `overflow-y-auto overflow-x-hidden ${APP_SHELL_GUTTER_X_CLASS} pb-5 space-y-5 pt-5`
          }`}
        >
          <WorkspacePanelRouter
            tab={tab}
            requestTab={requestTab}
            memorySubTab={memorySubTab}
            memoryShowAllSections={memoryShowAllSections}
            openMemoriesSubTab={openMemoriesSubTab}
            todoSubTab={todoSubTab}
            todoShowAllSections={todoShowAllSections}
            openTodoSubTab={openTodoSubTab}
            openMemoryNeedsReview={openMemoryNeedsReview}
            todoFeed={todoFeed}
            sidebarCompact={sidebarCompact}
            settingsSubTab={settingsSubTab}
            settingsShowAllSections={settingsShowAllSections}
            onSettingsSubTabChange={selectSettingsSubTab}
            onSettingsScrollSectionReport={reportSettingsScrollSection}
            onMemoryScrollSectionReport={reportMemoryScrollSection}
            onTodoScrollSectionReport={reportTodoScrollSection}
            scrollRootRef={mainColumnRef}
            needsCloudAccount={needsCloudAccount}
            suppressAssistantPermissionPrompt={suppressAssistantPermissionPrompt}
            deferAssistantPermissionPrompt={deferAssistantPermissionPrompt}
            refreshEntitlement={refreshEntitlement}
            settingsHydrated={settingsHydrated}
            backendOnline={backendOnline}
            backendHealthProbing={backendHealthProbing}
            handleRetryBackend={handleRetryBackend}
            openHelpModal={openHelpModal}
            isAwaitingApproval={isAwaitingApproval}
            modelHook={modelHook}
            settings={settings}
            entitlement={entitlement}
            currentJob={currentJob}
            sessionId={sessionId}
            isRunning={isRunning}
            totalCount={totalCount}
            processedCount={processedCount}
            failedFiles={failedFiles}
            fetchFailureCount={fetchFailureCount}
            reviewRows={reviewRows}
            handleFiles={handleFiles}
            startExplicitLocalSort={startExplicitLocalSort}
            startProgressiveDriveSort={startProgressiveDriveSort}
            handleBrowserFiles={handleBrowserFiles}
            workspaceGmailMailOnlyRunnerRef={workspaceGmailMailOnlyRunnerRef}
            workspaceAssistantBridge={workspaceAssistantBridge}
            handlePause={handlePause}
            handleResume={handleResume}
            handleCancel={handleCancel}
            handleRetryFailed={handleRetryFailed}
            handleRetryDriveDownloads={handleRetryDriveDownloads}
            handleApplyApproved={handleApplyApproved}
            patchFileByPath={patchFileByPath}
            handleUndoEntry={handleUndoEntry}
            handleUndoAll={handleUndoAll}
            handleStartNewSort={handleStartNewSort}
            setReassignFile={setReassignFile}
            setAllApproved={setAllApproved}
            folderTree={folderTree}
            folderViewMode={folderViewMode}
            setFolderViewMode={setFolderViewMode}
            refreshTree={refreshTree}
            refreshError={refreshError}
            dismissRefreshError={dismissRefreshError}
            handleOpenFolder={handleOpenFolder}
            handleRevealFile={handleRevealFile}
            doneCount={doneCount}
            activeFiles={activeFiles}
            pendingCount={pendingCount}
            lastHealthOkAt={lastHealthOkAt}
            setSettings={setSettings}
            tourHighlightId={tourHighlightId}
            openTour={openTour}
            registerSettingsScroll={registerSettingsScroll}
            jumpToSettingsSection={jumpToSettingsSection}
            openModelDownloadModal={openModelDownloadModal}
            openGeminiSetupModal={openGeminiSetupModal}
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
            shellVoiceSession={shellVoiceSession}
            briefingOffer={briefingOffer}
            setVisualAnalysisSuspended={setVisualAnalysisSuspended}
            openVoiceInteractionSettings={openVoiceInteractionSettings}
            exoChromeRevealed={exoChromeRevealed}
            onExoChromeRevealed={revealExoChrome}
            deferTesseractIntro={showAppServiceStartupOverlay}
            exoCenterAnchorRef={exoCenterRef}
          />
        </main>
      </div>

      <AmbientVoiceHud
        voice={shellVoiceSession}
        briefingOffer={briefingOffer}
        activeTab={tab}
        anchorRef={mainColumnRef}
        onAlwaysAllowVoiceTool={handleAlwaysAllowVoiceTool}
        voiceInteractionMode={settings.voiceInteractionMode}
        pttShortcutLabel={pushToTalk.shortcutLabel}
      />

      <PushToTalkOverlay
        visible={pushToTalk.showOverlay}
        shortcutLabel={pushToTalk.shortcutLabel}
        locked={pushToTalk.isLockedListening}
        voice={shellVoiceSession}
        anchorRef={pushToTalkAnchorRef}
        assistantLayout={tab === "exo"}
      />

      <BrainSearchModal
        open={brainSearchOpen}
        onClose={() => setBrainSearchOpen(false)}
        backendOnline={backendOnline}
      />
    </>
  );
}
