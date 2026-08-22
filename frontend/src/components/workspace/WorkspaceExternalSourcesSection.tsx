import { EXTERNAL_SOURCE_CONNECTORS } from "../../externalSources/connectors";
import {
  WORKSPACE_SORT_GROUPED_CONNECTOR_IDS,
  WORKSPACE_SORT_SOURCE_GROUPS,
} from "../../externalSources/workspaceSortSourceGroups";
import type { AppSettings } from "../../types/settings";
import { useI18n } from "../../i18n/I18nContext";
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

export interface WorkspaceExternalSourcesSectionProps {
  settings: AppSettings;
  backendOnline: boolean;
  installedTesseractLangs: string[] | undefined;
  onGmailSortJobStarted: (jobId: string, sessionId: string) => void;
  onGmailMergePrefsChange: (prefs: GmailMergePrefs | null) => void;
  onDriveMergePrefsChange: (prefs: DriveMergePrefs | null) => void;
  onDropboxMergePrefsChange: (prefs: DropboxMergePrefs | null) => void;
  onOneDriveMergePrefsChange: (prefs: OneDriveMergePrefs | null) => void;
  onOutlookMergePrefsChange: (prefs: OutlookMergePrefs | null) => void;
  onS3MergePrefsChange: (prefs: S3MergePrefs | null) => void;
  onSlackMergePrefsChange: (prefs: SlackMergePrefs | null) => void;
  onICloudMergePrefsChange: (prefs: ICloudMergePrefs | null) => void;
  onInfomaniakMergePrefsChange: (prefs: InfomaniakMergePrefs | null) => void;
  onInfomaniakMailMergePrefsChange: (prefs: InfomaniakMailMergePrefs | null) => void;
  onEntitlementRefresh: () => void | Promise<void>;
  toastEntitlementBlocked: () => void;
  /** Opens the External sources tab (connect Gmail, OAuth setup). */
  onOpenExternalSourcesTab?: () => void;
  hideWorkspacePrimaryImportButton?: boolean;
  onRegisterWorkspaceGmailMailOnlyRunner?: (
    runner: ((opts?: { signal?: AbortSignal }) => Promise<string | null>) | null
  ) => void;
}

const CONNECTORS_BY_ID = new Map(EXTERNAL_SOURCE_CONNECTORS.map((c) => [c.id, c]));

/**
 * Renders per-connector Workspace blocks grouped by category (mail vs cloud storage).
 */
export default function WorkspaceExternalSourcesSection(props: WorkspaceExternalSourcesSectionProps) {
  const { t } = useI18n();

  if (!EXTERNAL_SOURCE_CONNECTORS.some((c) => c.renderWorkspaceBlock != null)) return null;

  const ungrouped = EXTERNAL_SOURCE_CONNECTORS.filter(
    (c) => c.renderWorkspaceBlock != null && !WORKSPACE_SORT_GROUPED_CONNECTOR_IDS.has(c.id),
  );

  return (
    <div className="flex w-full min-w-0 flex-col gap-6" data-tour="workspace-external-sources">
      {WORKSPACE_SORT_SOURCE_GROUPS.map((group) => {
        const groupConnectors = group.connectorIds
          .map((id) => CONNECTORS_BY_ID.get(id))
          .filter((c): c is (typeof EXTERNAL_SOURCE_CONNECTORS)[number] => !!(c?.renderWorkspaceBlock));

        if (groupConnectors.length === 0) return null;

        const headingId = `workspace-sort-group-${group.groupId}`;
        return (
          <section
            key={group.groupId}
            aria-labelledby={headingId}
            className="min-w-0 space-y-3"
          >
            <h2
              id={headingId}
              className="text-xs font-semibold uppercase tracking-wider text-muted m-0"
            >
              {t(group.titleKey)}
            </h2>
            <div className="grid w-full min-w-0 grid-cols-1 gap-4 md:grid-cols-2">
              {groupConnectors.map((c) => (
                <div key={c.id} className="min-w-0">
                  {c.renderWorkspaceBlock!(props)}
                </div>
              ))}
            </div>
          </section>
        );
      })}
      {ungrouped.map((c) => (
        <div key={c.id} className="min-w-0">
          {c.renderWorkspaceBlock!(props)}
        </div>
      ))}
    </div>
  );
}
