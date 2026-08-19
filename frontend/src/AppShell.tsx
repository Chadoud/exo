import { useState } from "react";
import { toast } from "sonner";
import type { FileEntry } from "./api";
import AppLayout from "./components/AppLayout";
import TitleBar from "./components/TitleBar";
import AppMainWorkspace from "./components/AppMainWorkspace";
import AppWorkspaceOverlays from "./components/AppWorkspaceOverlays";
import UpdateModal from "./components/UpdateModal";
import AssistantReplyToolBridge from "./components/AssistantReplyToolBridge";
import AssistantAccessGuidanceModalHost from "./components/AssistantAccessGuidanceModalHost";
import AssistantPermissionsModalHost from "./components/AssistantPermissionsModalHost";
import TrialLifecycleModalHost from "./components/TrialLifecycleModalHost";
import TrialEndedBanner from "./components/TrialEndedBanner";
import BillingPastDueBanner from "./components/BillingPastDueBanner";
import { useTrialGateDismissal } from "./hooks/useTrialGateDismissal";
import { shouldShowTrialLimitedBanner } from "./utils/trialLifecycleGate";
import AppAccountGate from "./components/AppAccountGate";
import ModelDownloadModal from "./components/settings/ModelDownloadModal";
import GeminiApiKeySetupModal from "./components/settings/GeminiApiKeySetupModal";
import { useAppSettings } from "./hooks/useAppSettings";
import { useFolderTree } from "./hooks/useFolderTree";
import type { MainNavTab } from "./hooks/useMainNavItems";
import { useAppShellChrome } from "./apps/shared/useAppShellChrome";
import { useBillingEvents } from "./hooks/useBillingEvents";
import { useWorkspaceController } from "./apps/workspace/useWorkspaceController";
import { useAssistantVoiceActions } from "./apps/assistant/useAssistantVoiceActions";
import type { UiLocale } from "./i18n/locale";
import { translate } from "./i18n/translate";
import { isFreshTrial, trialLengthDays } from "./utils/entitlementUi";
import { accountDisplayLabel, accountProfileTitle } from "./utils/accountProfileDisplay";
import type { AppSettings } from "./types/settings";

type Tab = MainNavTab;

type AppShellProps = {
  settings: AppSettings;
  setSettings: ReturnType<typeof useAppSettings>["setSettings"];
  hydrated: boolean;
  uiLocale: UiLocale;
};

/** Main app shell — runs under {@link I18nProvider} so panels can call `useI18n`. */
export function AppShell({ settings, setSettings, hydrated, uiLocale }: AppShellProps) {
  const [tab, setTab] = useState<Tab>("exo");
  const [reassignFile, setReassignFile] = useState<FileEntry | null>(null);

  const { folderTree, refreshTree, refreshError, dismissRefreshError } = useFolderTree(
    settings.outputDir,
  );

  const chrome = useAppShellChrome({
    settings,
    setSettings,
    hydrated,
    uiLocale,
    tab,
    setTab,
    refreshTree,
    reassignFile,
  });

  const workspace = useWorkspaceController({
    uiLocale,
    settings,
    backendOnline: chrome.backendOnline,
    mainAppReady: chrome.mainAppReady,
    entitlement: chrome.entitlement,
    refreshEntitlement: chrome.refreshEntitlement,
    setTab,
    modelHook: chrome.modelHook,
    jumpToSettingsSection: chrome.jumpToSettingsSection,
    toastEntitlementBlocked: chrome.toastEntitlementBlocked,
    toastCloudAccountRequired: chrome.toastCloudAccountRequired,
    folderTree,
    refreshTree,
    refreshError,
    dismissRefreshError,
    reassignFile,
    setReassignFile,
  });

  useBillingEvents({ uiLocale, refreshEntitlement: chrome.refreshEntitlement });

  const trialGate = useTrialGateDismissal();
  const limitedModeBanner = shouldShowTrialLimitedBanner(chrome.entitlement, {
    entitlementLoaded: chrome.entitlementLoaded,
    gateDismissed: trialGate.gateDismissed,
  }) ? (
    <TrialEndedBanner onSeePlans={trialGate.reopenGate} />
  ) : null;

  const assistantVoice = useAssistantVoiceActions({
    uiLocale,
    settings,
    setTab,
    startPolling: workspace.startPolling,
    setSessionId: workspace.setSessionId,
  });

  const restartBackend =
    typeof window !== "undefined" && typeof window.electronAPI?.restartBackend === "function"
      ? chrome.handleRetryBackend
      : undefined;

  const signedInEntitlement =
    chrome.entitlement?.cloudAuthRequired && chrome.entitlement.cloudLoggedIn
      ? chrome.entitlement
      : null;
  const cloudAccountLabel = signedInEntitlement ? accountDisplayLabel(signedInEntitlement) : undefined;
  const cloudAccountTitle = signedInEntitlement ? accountProfileTitle(signedInEntitlement) : undefined;

  return (
    <>
      {!chrome.mainAppReady && (
        <AppAccountGate
          loading={!chrome.entitlementLoaded}
          onSignedIn={() => {
            void (async () => {
              const status = await chrome.refreshEntitlementWithStatus();
              if (
                status?.trialActive &&
                !status.licensed &&
                !status.unlimitedBuild &&
                isFreshTrial(status)
              ) {
                toast.success(translate(uiLocale, "cloudAuth.trialStarted"), {
                  description: translate(uiLocale, "cloudAuth.trialStartedDesc", {
                    days: trialLengthDays(status),
                  }),
                });
              }
            })();
          }}
        />
      )}
      {chrome.mainAppReady && (
        <>
          <AssistantReplyToolBridge settings={settings} />
          <AssistantPermissionsModalHost
            settings={settings}
            setSettings={setSettings}
            blocked={
              chrome.needsCloudAccount || chrome.showWelcome || !chrome.entitlementLoaded
            }
            onJumpToAssistantSettings={() => chrome.openPrimarySettings("assistantTools")}
          />
          <AssistantAccessGuidanceModalHost
            onOpenAssistantSettings={() => chrome.openPrimarySettings("assistantTools")}
            onOpenExternalSources={() => chrome.requestTab("sources")}
          />
          <TrialLifecycleModalHost
            entitlement={chrome.entitlement}
            activeTab={tab}
            openPrimarySettings={chrome.openPrimarySettings}
            gateDismissed={trialGate.gateDismissed}
            onContinueLimited={trialGate.continueLimited}
          />
          <BillingPastDueBanner entitlement={chrome.entitlement} />
          <AppLayout
            workspace={
              <AppMainWorkspace
                titleBar={
                  <TitleBar
                    backendOnline={chrome.backendOnline}
                    backendHealthProbing={chrome.backendHealthProbing}
                    backendServiceStarting={chrome.backendServiceStarting}
                    theme={chrome.theme}
                    onToggleTheme={chrome.toggleTheme}
                    onOpenHelp={chrome.openHelpModal}
                    uiLocale={settings.uiLocale}
                    onUiLocaleChange={(loc) => setSettings((s) => ({ ...s, uiLocale: loc }))}
                    cloudAccountLabel={cloudAccountLabel}
                    cloudAccountTitle={cloudAccountTitle}
                    onRetryBackend={restartBackend}
                  />
                }
                workspaceBanner={limitedModeBanner}
                needsCloudAccount={chrome.needsCloudAccount}
                suppressAssistantPermissionPrompt={
                  chrome.needsCloudAccount || chrome.showWelcome || !chrome.entitlementLoaded
                }
                deferAssistantPermissionPrompt={chrome.firstRunTourPending}
                refreshEntitlement={chrome.refreshEntitlement}
                settingsHydrated={hydrated}
                backendOnline={chrome.backendOnline}
                backendHealthProbing={chrome.backendHealthProbing}
                backendServiceStarting={chrome.backendServiceStarting}
                backendStartupFailed={chrome.backendStartupFailed}
                backendAutoRecoveryExhausted={chrome.backendAutoRecoveryExhausted}
                backendRetryBusy={chrome.backendRetryBusy}
                handleRetryBackend={restartBackend}
                openHelpModal={chrome.openHelpModal}
                navItems={chrome.navItems}
                todoFeed={chrome.todoFeed}
                tab={tab}
                requestTab={chrome.requestTab}
                uiLocale={uiLocale}
                isAwaitingApproval={workspace.isAwaitingApproval}
                modelHook={chrome.modelHook}
                settings={settings}
                entitlement={chrome.entitlement}
                entitlementLoaded={chrome.entitlementLoaded}
                toastEntitlementBlocked={chrome.toastEntitlementBlocked}
                currentJob={workspace.currentJob}
                sessionId={workspace.sessionId}
                isRunning={workspace.isRunning}
                totalCount={workspace.totalCount}
                processedCount={workspace.processedCount}
                failedFiles={workspace.failedFiles}
                fetchFailureCount={workspace.fetchFailureCount}
                reviewRows={workspace.reviewRows}
                handleFiles={workspace.handleFiles}
                startExplicitLocalSort={workspace.startExplicitLocalSort}
                startProgressiveDriveSort={workspace.startProgressiveDriveSort}
                onVoiceLocalSortJobStarted={assistantVoice.onVoiceLocalSortJobStarted}
                onVoiceCodegenRequested={assistantVoice.onVoiceCodegenRequested}
                handleBrowserFiles={workspace.handleBrowserFiles}
                workspaceGmailMailOnlyRunnerRef={workspace.workspaceGmailMailOnlyRunnerRef}
                workspaceAssistantBridge={workspace.workspaceBridge}
                handlePause={workspace.handlePause}
                handleResume={workspace.handleResume}
                handleCancel={workspace.handleCancel}
                handleRetryFailed={workspace.handleRetryFailed}
                handleRetryDriveDownloads={workspace.handleRetryDriveDownloads}
                handleApplyApproved={workspace.handleApplyApproved}
                patchFileByPath={workspace.patchFileByPath}
                handleUndoEntry={workspace.handleUndoEntry}
                handleUndoAll={workspace.handleUndoAll}
                handleStartNewSort={workspace.handleStartNewSort}
                setReassignFile={workspace.setReassignFile}
                setAllApproved={workspace.setAllApproved}
                folderTree={workspace.folderTree}
                folderViewMode={settings.folderViewMode}
                setFolderViewMode={(mode) => setSettings((s) => ({ ...s, folderViewMode: mode }))}
                refreshTree={workspace.refreshTree}
                refreshError={workspace.refreshError}
                dismissRefreshError={workspace.dismissRefreshError}
                handleOpenFolder={workspace.handleOpenFolder}
                handleRevealFile={workspace.handleRevealFile}
                doneCount={workspace.doneCount}
                activeFiles={workspace.activeFiles}
                pendingCount={workspace.pendingCount}
                lastHealthOkAt={chrome.lastHealthOkAt}
                setSettings={setSettings}
                tourHighlightId={chrome.tourHighlightId}
                openTour={chrome.openTour}
                registerSettingsScroll={chrome.registerSettingsScroll}
                registerSettingsSubTabSelector={chrome.registerSettingsSubTabSelector}
                jumpToSettingsSection={chrome.jumpToSettingsSection}
                openModelDownloadModal={chrome.openModelDownloadModal}
                openGeminiSetupModal={chrome.openGeminiSetupModal}
                workspaceExternalSources={{
                  settings,
                  backendOnline: chrome.backendOnline,
                  installedTesseractLangs: chrome.modelHook.ocrInfo?.languages,
                  onGmailSortJobStarted: assistantVoice.onVoiceLocalSortJobStarted,
                  onGmailMergePrefsChange: workspace.handleGmailMergePrefsChange,
                  onDriveMergePrefsChange: workspace.handleDriveMergePrefsChange,
                  onDropboxMergePrefsChange: workspace.handleDropboxMergePrefsChange,
                  onOneDriveMergePrefsChange: workspace.handleOneDriveMergePrefsChange,
                  onOutlookMergePrefsChange: workspace.handleOutlookMergePrefsChange,
                  onS3MergePrefsChange: workspace.handleS3MergePrefsChange,
                  onSlackMergePrefsChange: workspace.handleSlackMergePrefsChange,
                  onICloudMergePrefsChange: workspace.handleICloudMergePrefsChange,
                  onInfomaniakMergePrefsChange: workspace.handleInfomaniakMergePrefsChange,
                  onInfomaniakMailMergePrefsChange: workspace.handleInfomaniakMailMergePrefsChange,
                  onEntitlementRefresh: chrome.refreshEntitlement,
                  toastEntitlementBlocked: chrome.toastEntitlementBlocked,
                  onOpenExternalSourcesTab: () => chrome.requestTab("sources"),
                  hideWorkspacePrimaryImportButton: true,
                  onRegisterWorkspaceGmailMailOnlyRunner: workspace.registerWorkspaceGmailMailOnlyRunner,
                }}
                gmailMergePrefsSnapshot={workspace.gmailMergePrefsSnapshot}
                driveMergePrefsSnapshot={workspace.driveMergePrefsSnapshot}
                dropboxMergePrefsSnapshot={workspace.dropboxMergePrefsSnapshot}
                oneDriveMergePrefsSnapshot={workspace.oneDriveMergePrefsSnapshot}
                outlookMergePrefsSnapshot={workspace.outlookMergePrefsSnapshot}
                s3MergePrefsSnapshot={workspace.s3MergePrefsSnapshot}
                slackMergePrefsSnapshot={workspace.slackMergePrefsSnapshot}
                icloudMergePrefsSnapshot={workspace.icloudMergePrefsSnapshot}
                infomaniakMergePrefsSnapshot={workspace.infomaniakMergePrefsSnapshot}
                infomaniakMailMergePrefsSnapshot={workspace.infomaniakMailMergePrefsSnapshot}
              />
            }
            workspaceOverlays={
              <AppWorkspaceOverlays
                showWelcome={chrome.showWelcome}
                settings={settings}
                hydrated={hydrated}
                modelHook={chrome.modelHook}
                setSettings={setSettings}
                dismissWelcomeWizard={chrome.dismissWelcomeWizard}
                setupIncomplete={chrome.setupIncomplete}
                reopenWelcomeWizard={chrome.reopenWelcomeWizard}
                backendOnline={chrome.backendOnline}
                backendHealthProbing={chrome.backendHealthProbing}
                backendServiceStarting={chrome.backendServiceStarting}
                onRetryBackend={restartBackend}
                onSwitchAccount={
                  typeof window !== "undefined" && typeof window.electronAPI?.cloudAuthLogout === "function"
                    ? chrome.handleSwitchAccount
                    : undefined
                }
                entitlement={chrome.entitlement}
                showLaunchSphereSplash={chrome.showLaunchSphereSplash}
                finishLaunchSphereSplash={chrome.finishLaunchSphereSplash}
                tourOpen={chrome.tourOpen}
                cloudSortActive={chrome.cloudSortActive}
                tourStepMeta={chrome.tourStepMeta}
                deferProductTour={chrome.deferProductTour}
                launchSphereSplashOpen={chrome.launchSphereSplashOpen}
                tourStep={chrome.tourStep}
                setTourStep={chrome.setTourStep}
                setTourOpen={chrome.setTourOpen}
                tab={tab}
                tourNavigate={chrome.tourNavigate}
                markTourComplete={chrome.markTourComplete}
                settingsUnsavedOpen={chrome.settingsUnsavedOpen}
                cancelSettingsNavigation={chrome.cancelSettingsNavigation}
                confirmSettingsDiscard={chrome.confirmSettingsDiscard}
                confirmSettingsKeep={chrome.confirmSettingsKeep}
                reassignFile={workspace.reassignFile}
                folderTree={workspace.folderTree}
                handleReassign={workspace.handleReassign}
                setReassignFile={workspace.setReassignFile}
                modelHookBanner={chrome.modelHook}
                helpOpen={chrome.helpOpen}
                setHelpOpen={chrome.setHelpOpen}
                replayTourFromHelp={chrome.replayTourFromHelp}
                lastHealthOkAt={chrome.lastHealthOkAt}
                commandPaletteOpen={chrome.commandPaletteOpen}
                setCommandPaletteOpen={chrome.setCommandPaletteOpen}
                commandPaletteCommands={chrome.commandPaletteCommands}
                uiLocale={uiLocale}
              />
            }
          />
          {chrome.modelDownloadModalRole ? (
            <ModelDownloadModal
              open
              role={chrome.modelDownloadModalRole}
              onClose={() => chrome.setModelDownloadModalRole(null)}
              settings={settings}
              modelHook={chrome.modelHook}
              onSettingsPatch={(patch) => setSettings((s) => ({ ...s, ...patch }))}
              entitlement={chrome.entitlement}
            />
          ) : null}
          <GeminiApiKeySetupModal
            open={chrome.geminiSetupModalOpen}
            onClose={() => chrome.setGeminiSetupModalOpen(false)}
            settings={settings}
            onSettingsPatch={(patch) => setSettings((s) => ({ ...s, ...patch }))}
          />
          <UpdateModal />
        </>
      )}
    </>
  );
}
