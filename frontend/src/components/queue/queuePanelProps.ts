import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { EntitlementStatus } from "../../api";
import type { AppSettings } from "../../types/settings";
import type { WorkspaceExternalSourcesSectionProps } from "../workspace/WorkspaceExternalSourcesSection";
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
import type { WorkspaceAssistantBridge } from "../../apps/shared/bridges/workspaceAssistant";
import type { QueueActions, QueueJobState } from "./queuePanelTypes";

export interface QueuePanelProps {
  settings: AppSettings;
  setSettings: Dispatch<SetStateAction<AppSettings>>;
  /** Product telemetry — forwarded to post-run CTAs and review filters. */
  telemetryOptIn: boolean;
  uiLocale: string;
  backendOnline: boolean;
  /** True during startup health fast-retry — show “Connecting…” not “offline”. */
  backendHealthProbing: boolean;
  /** True while Electron is restarting the local assistant. */
  backendServiceStarting?: boolean;
  /** “How sorting works” strip — pass from App for tour wiring. */
  sortFlow: {
    jobCompleted: boolean;
    onOpenTour: () => void;
    /** Opens Settings scrolled to sorting rules (sort help modal footer link). */
    onOpenSortingSettings?: () => void;
  };
  /** False when the free trial has ended and no valid license (Electron + API). */
  canStartSort?: boolean;
  /** Cloud entitlement — improves cloud-sort detection vs env overrides alone. */
  entitlement?: EntitlementStatus | null;
  /** True when cloud sign-in is required but the user is not signed in. */
  needsCloudAccount?: boolean;
  /** Re-fetch entitlement after cloud sort credential refresh. */
  onEntitlementRefresh?: () => void | Promise<void>;
  /** Opens add sort/chat model modal (app shell). */
  onOpenSortModelDownload: () => void;
  /** Gmail (and future connectors) above the drop zone — same sort mental model as local files. */
  workspaceExternalSources: WorkspaceExternalSourcesSectionProps;
  /** Last workspace Gmail merge prefs — seeds the Run sort chooser only. */
  gmailMergePrefsSnapshot: GmailMergePrefs | null;
  /** Last workspace Google Drive merge prefs (files to import before sort). */
  driveMergePrefsSnapshot: DriveMergePrefs | null;
  /** Last workspace Dropbox merge prefs (files to import before sort). */
  dropboxMergePrefsSnapshot: DropboxMergePrefs | null;
  /** Last workspace OneDrive merge prefs (files to import before sort). */
  oneDriveMergePrefsSnapshot: OneDriveMergePrefs | null;
  /** Last workspace Outlook merge prefs (messages to import before sort). */
  outlookMergePrefsSnapshot: OutlookMergePrefs | null;
  s3MergePrefsSnapshot: S3MergePrefs | null;
  slackMergePrefsSnapshot: SlackMergePrefs | null;
  icloudMergePrefsSnapshot: ICloudMergePrefs | null;
  infomaniakMergePrefsSnapshot: InfomaniakMergePrefs | null;
  infomaniakMailMergePrefsSnapshot: InfomaniakMailMergePrefs | null;
  /** Registered by Gmail workspace block — mail-only import for batch Run (desktop). */
  workspaceGmailMailOnlyRunnerRef: MutableRefObject<
    ((opts?: { signal?: AbortSignal }) => Promise<void>) | null
  >;
  /** Filled by ``useWorkspaceBatch`` so voice tools can invoke **Run sort** (Drive synthesis). */
  workspaceAssistantBridge?: WorkspaceAssistantBridge;
  /** When true, panel stays mounted but is not shown (job UI keeps updating while user is on another tab). */
  visuallyHidden?: boolean;
  /** Active product tour highlight — syncs wizard step to visible anchors. */
  tourHighlightId?: string | null;
  job: QueueJobState;
  actions: QueueActions;
  /** Reveal/open handlers for the post-sort folder tree (same as Results). */
  onOpenFolder: (path: string) => void;
  onRevealFile: (path: string) => void;
}
