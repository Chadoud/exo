import type { ComponentProps } from "react";
import type { FileEntry } from "../api";
import type { UseModelsReturn } from "../hooks/useModels";
import type { MainNavTab } from "../hooks/useMainNavItems";
import AppTour from "./AppTour";
import type { ProductTourStepMeta } from "../i18n/productTourSteps";
import WelcomeScreen from "./WelcomeScreen";
import LaunchSphereSplash from "./LaunchSphereSplash";
import ReassignModal from "./ReassignModal";
import GlobalModelDownloadBanner from "./GlobalModelDownloadBanner";
import type { EntitlementStatus } from "../api";
import FinishSetupCallout from "./FinishSetupCallout";
import InstallFromDmgBanner from "./InstallFromDmgBanner";
import HelpShortcutsModal from "./HelpShortcutsModal";
import CommandPalette from "./CommandPalette";
import type { CommandItem } from "./CommandPalette";
import { useInstallFromDmgHint } from "../hooks/useInstallFromDmgHint";

type Tab = MainNavTab;

interface AppWorkspaceOverlaysProps {
  showWelcome: boolean;
  settings: ComponentProps<typeof WelcomeScreen>["settings"];
  hydrated: boolean;
  modelHook: UseModelsReturn;
  setSettings: React.Dispatch<React.SetStateAction<import("../types/settings").AppSettings>>;
  dismissWelcomeWizard: () => void;
  /** True when setup was skipped without a working sort model (shows the Finish-setup callout). */
  setupIncomplete: boolean;
  reopenWelcomeWizard: () => void;
  backendOnline: boolean;
  backendHealthProbing: boolean;
  backendServiceStarting?: boolean;
  onRetryBackend?: () => void | Promise<void>;
  onSwitchAccount?: () => void | Promise<void>;
  entitlement?: EntitlementStatus | null;
  showLaunchSphereSplash: boolean;
  finishLaunchSphereSplash: () => void;
  tourOpen: boolean;
  cloudSortActive: boolean;
  tourStepMeta: ProductTourStepMeta[];
  deferProductTour: boolean;
  launchSphereSplashOpen: boolean;
  tourStep: number;
  setTourStep: (n: number | ((p: number) => number)) => void;
  setTourOpen: (v: boolean) => void;
  tab: Tab;
  tourNavigate: (t: Tab) => void;
  markTourComplete: () => void;
  reassignFile: FileEntry | null;
  folderTree: ComponentProps<typeof ReassignModal>["existingFolders"];
  handleReassign: ComponentProps<typeof ReassignModal>["onReassign"];
  setReassignFile: (f: FileEntry | null) => void;
  modelHookBanner: UseModelsReturn;
  helpOpen: boolean;
  setHelpOpen: (v: boolean) => void;
  replayTourFromHelp: () => void;
  lastHealthOkAt: number | null;
  commandPaletteOpen: boolean;
  setCommandPaletteOpen: (v: boolean) => void;
  commandPaletteCommands: CommandItem[];
}

/**
 * Modals, tour, and global banners outside the main scroll region.
 */
export default function AppWorkspaceOverlays(props: AppWorkspaceOverlaysProps) {
  const {
    showWelcome,
    settings,
    hydrated,
    modelHook,
    setSettings,
    dismissWelcomeWizard,
    setupIncomplete,
    reopenWelcomeWizard,
    backendOnline,
    backendHealthProbing,
    backendServiceStarting,
    onRetryBackend,
    onSwitchAccount,
    entitlement,
    showLaunchSphereSplash,
    finishLaunchSphereSplash,
    tourOpen,
    cloudSortActive,
    tourStepMeta,
    deferProductTour,
    launchSphereSplashOpen,
    tourStep,
    setTourStep,
    setTourOpen,
    tab,
    tourNavigate,
    markTourComplete,
    reassignFile,
    folderTree,
    handleReassign,
    setReassignFile,
    modelHookBanner,
    helpOpen,
    setHelpOpen,
    replayTourFromHelp,
    lastHealthOkAt,
    commandPaletteOpen,
    setCommandPaletteOpen,
    commandPaletteCommands,
  } = props;

  const {
    showInstallHint,
    dismissInstallHint,
    openApplicationsFolder,
  } = useInstallFromDmgHint();

  return (
    <>
      {showWelcome && (
        <WelcomeScreen
          settings={settings}
          settingsHydrated={hydrated}
          modelHook={modelHook}
          onSettingsPatch={(patch) => setSettings((s) => ({ ...s, ...patch }))}
          onDismiss={dismissWelcomeWizard}
          backendOnline={backendOnline}
          backendHealthProbing={backendHealthProbing}
          backendServiceStarting={backendServiceStarting}
          onRetryBackend={onRetryBackend}
          onSwitchAccount={onSwitchAccount}
          entitlement={entitlement}
        />
      )}

      {showLaunchSphereSplash && <LaunchSphereSplash onFinished={finishLaunchSphereSplash} />}

      {setupIncomplete && !showWelcome && !launchSphereSplashOpen && !tourOpen && (
        <FinishSetupCallout onFinishSetup={reopenWelcomeWizard} entitlement={entitlement} />
      )}

      {showInstallHint && !showWelcome && !launchSphereSplashOpen && (
        <InstallFromDmgBanner
          onOpenApplications={openApplicationsFolder}
          onDismiss={dismissInstallHint}
        />
      )}

      <AppTour
        open={tourOpen && !showWelcome && !launchSphereSplashOpen && !deferProductTour}
        stepIndex={tourStep}
        onStepIndexChange={setTourStep}
        onClose={() => setTourOpen(false)}
        cloudSortActive={cloudSortActive}
        activeTab={tab}
        onNavigateTab={tourNavigate}
        onComplete={markTourComplete}
        tourLayoutKey={tourOpen ? `${tourStepMeta[tourStep]?.id ?? ""}` : ""}
      />

      {reassignFile && (
        <ReassignModal
          file={reassignFile}
          existingFolders={folderTree}
          onReassign={handleReassign}
          onClose={() => setReassignFile(null)}
        />
      )}

      <GlobalModelDownloadBanner tab={tab} modelHook={modelHookBanner} />

      <HelpShortcutsModal
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        onReplayTour={replayTourFromHelp}
        diagnostics={{
          backendOnline,
          lastHealthOkAt,
          modelCount: modelHookBanner.models.length,
          ocrStatus: modelHookBanner.ocrInfo?.status ?? "unknown",
        }}
      />

      <CommandPalette
        open={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        commands={commandPaletteCommands}
      />
    </>
  );
}
