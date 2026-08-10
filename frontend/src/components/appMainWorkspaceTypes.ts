import type { ComponentProps, MutableRefObject, ReactNode } from "react";
import type { AppSettings, UiLocale } from "../types/settings";
import type { EntitlementStatus, FileEntry, FolderNode, GmailAnalyzeSlice, Job } from "../api";
import type { UseModelsReturn } from "../hooks/useModels";
import type { MainNavItem, MainNavTab } from "../hooks/useMainNavItems";
import type { TodoFeed } from "../hooks/useTodoFeed";
import type { WorkspaceAssistantBridge } from "../apps/shared/bridges/workspaceAssistant";
import type { SettingsNavTab } from "../utils/settingsNav";
import type { WorkspaceExternalSourcesSectionProps } from "./workspace/WorkspaceExternalSourcesSection";
import type { GmailMergePrefs } from "./workspace/GmailWorkspaceSortBlock";
import type { DriveMergePrefs } from "./workspace/DriveWorkspaceSortBlock";
import type { DropboxMergePrefs } from "./workspace/DropboxWorkspaceSortBlock";
import type { OneDriveMergePrefs } from "./workspace/oneDriveWorkspaceImportResolve";
import type { OutlookMergePrefs } from "./workspace/outlookWorkspaceImportResolve";
import type { S3MergePrefs } from "./workspace/s3WorkspaceImportResolve";
import type { SlackMergePrefs } from "./workspace/slackWorkspaceImportResolve";
import type { ICloudMergePrefs } from "./workspace/icloudWorkspaceImportResolve";
import type { InfomaniakMergePrefs } from "./workspace/infomaniakWorkspaceImportResolve";
import type { InfomaniakMailMergePrefs } from "./workspace/InfomaniakMailWorkspaceSortBlock";
import type QueuePanel from "./QueuePanel";
import type OverviewPanel from "./OverviewPanel";

type Tab = MainNavTab;

export interface AppMainWorkspaceProps {
  /** Sits in the main column only (same width as scrollable content — avoids header vs body horizontal mismatch). */
  titleBar: ReactNode;
  needsCloudAccount: boolean;
  suppressAssistantPermissionPrompt?: boolean;
  /** Hold the assistant-actions prompt until the first-run product tour finishes. */
  deferAssistantPermissionPrompt?: boolean;
  refreshEntitlement: () => void | Promise<void>;
  settingsHydrated: boolean;
  backendOnline: boolean;
  backendHealthProbing: boolean;
  backendServiceStarting?: boolean;
  backendStartupFailed?: boolean;
  backendAutoRecoveryExhausted?: boolean;
  backendRetryBusy?: boolean;
  handleRetryBackend?: (opts?: { silent?: boolean }) => void | Promise<void>;
  openHelpModal: () => void;
  navItems: MainNavItem[];
  todoFeed: TodoFeed;
  tab: Tab;
  requestTab: (t: Tab) => void;
  uiLocale: UiLocale;
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
    opts?: { signal?: AbortSignal },
  ) => Promise<void>;
  startProgressiveDriveSort: (
    initialFilePaths: string[],
    opts?: { signal?: AbortSignal; gmailSlice?: GmailAnalyzeSlice | null },
  ) => Promise<{ job_id: string; session_id: string } | null>;
  onVoiceLocalSortJobStarted: (jobId: string, sessionId: string) => void;
  onVoiceCodegenRequested: (goal: string) => void;
  handleBrowserFiles: ComponentProps<typeof QueuePanel>["actions"]["onBrowserFiles"];
  workspaceGmailMailOnlyRunnerRef: MutableRefObject<
    ((opts?: { signal?: AbortSignal }) => Promise<void>) | null
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
  registerSettingsSubTabSelector: (select: (tab: SettingsNavTab) => void) => void;
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
}
