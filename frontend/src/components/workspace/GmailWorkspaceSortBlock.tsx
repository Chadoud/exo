import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  gmailImportSort,
  gmailStatus,
  type GmailImportContent,
} from "../../api/gmail";
import type { AppSettings } from "../../types/settings";
import { effectiveMinConfidenceForJob } from "../../utils/automationPreset";
import {
  WORKSPACE_CONNECTOR_FILTERS_ONLY_PANEL_CLASS,
  WORKSPACE_CONNECTOR_SUBSECTION_HEADER_CLASS,
  WORKSPACE_CONNECTOR_SUBSECTION_HINT_CLASS,
  WORKSPACE_CONNECTOR_SUBSECTION_TITLE_CLASS,
} from "../../utils/styles";
import { buildGmailQueryFromSelection, parseGmailQueryToSelectionIds } from "../../utils/gmailSearchCategories";
import GmailCategoryMaxRow from "./GmailCategoryMaxRow";
import { useSyncWorkspaceMergePrefs } from "./useSyncWorkspaceMergePrefs";
import { buildAnalyzeOcrPayload } from "../../utils/tesseractLang";
import { useI18n } from "../../i18n/I18nContext";
import { EntitlementBlockedError } from "../../api/client";
import { formatError } from "../../utils/formatError";
import { toastUserError } from "../../utils/userGuidance";
import { GMAIL_EXPORT_MAX_MESSAGES } from "../../constants";
import { GmailBrandIcon } from "../../externalSources/ExternalSourceBrandIcons";
import { EXOSITES_GOOGLE_INTEGRATION_CHANGED_EVENT } from "../../utils/platform";
import { buildGmailJobUiParametersJson } from "../../utils/gmailJobParameters";
import { documentBriefingRequestField } from "../../utils/sortSystemPromptPayload";
import { sortClassifyPayloadForJob } from "../../utils/sortClassifyPayload";
import { useWorkspaceConnectorAccount } from "../../hooks/useWorkspaceConnectorAccount";
import { WorkspaceConnectorCollapsibleCard } from "./WorkspaceConnectorCollapsibleCard";
import { relayConnectorTokens } from "../../assistant/connectorContext";

export type GmailMergePrefs = {
  enabled: boolean;
  gmail_query: string;
  max_messages: number;
  gmail_import_content: GmailImportContent;
};

export interface GmailWorkspaceSortBlockProps {
  settings: AppSettings;
  backendOnline: boolean;
  installedTesseractLangs: string[] | undefined;
  onGmailSortJobStarted: (jobId: string, sessionId: string) => void;
  onGmailMergePrefsChange: (prefs: GmailMergePrefs | null) => void;
  onEntitlementRefresh: () => void | Promise<void>;
  toastEntitlementBlocked: () => void;
  onOpenExternalSourcesTab?: () => void;
  /** When true, the in-card “Sort mail now” button is hidden — use workspace Run instead. */
  hideWorkspacePrimaryImportButton?: boolean;
  /** Registers the mail-only import runner for the workspace batch Run control (desktop). */
  onRegisterWorkspaceGmailMailOnlyRunner?: (
    runner: ((opts?: { signal?: AbortSignal }) => Promise<void>) | null
  ) => void;
}

function capFromStatus(raw: unknown): number | null {
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 1) return null;
  return Math.min(GMAIL_EXPORT_MAX_MESSAGES, Math.max(1, Math.round(raw)));
}

/**
 * Sort-files Gmail card. Desktop connection state comes from Electron accounts
 * (same store as External sources). Python `/gmail/status` is only for import
 * caps and the browser-only OAuth path.
 */
export default function GmailWorkspaceSortBlock({
  settings,
  backendOnline,
  installedTesseractLangs,
  onGmailSortJobStarted,
  onGmailMergePrefsChange,
  onEntitlementRefresh,
  toastEntitlementBlocked,
  onOpenExternalSourcesTab,
  hideWorkspacePrimaryImportButton = false,
  onRegisterWorkspaceGmailMailOnlyRunner,
}: GmailWorkspaceSortBlockProps) {
  const { t } = useI18n();
  const {
    desktop,
    connected: electronConnected,
    oauthConfigured: electronOauth,
    loadingStatus: electronLoading,
  } = useWorkspaceConnectorAccount({
    providerId: "google-gmail",
    integrationChangedEvent: EXOSITES_GOOGLE_INTEGRATION_CHANGED_EVENT,
  });

  const [webConnected, setWebConnected] = useState(false);
  const [webOauth, setWebOauth] = useState(false);
  const [webLoading, setWebLoading] = useState(true);
  const [importBusy, setImportBusy] = useState(false);
  const [sectionOpen, setSectionOpen] = useState(false);
  const [query, setQuery] = useState("in:anywhere");
  const [maxMessages, setMaxMessages] = useState(GMAIL_EXPORT_MAX_MESSAGES);
  const [importMaxCap, setImportMaxCap] = useState(GMAIL_EXPORT_MAX_MESSAGES);
  const [importContent, setImportContent] = useState<GmailImportContent>("both");
  const [includeInRun, setIncludeInRun] = useState(false);

  const connected = desktop ? electronConnected : webConnected;
  const oauthConfigured = desktop ? electronOauth : webOauth;
  const loadingStatus = desktop ? electronLoading : webLoading;

  useEffect(() => {
    if (!backendOnline) {
      if (!desktop) setWebLoading(false);
      return;
    }
    let cancelled = false;
    void gmailStatus()
      .then((s) => {
        if (cancelled) return;
        const cap = capFromStatus(s.gmail_import_max_messages);
        if (cap != null) setImportMaxCap(cap);
        if (!desktop) {
          setWebConnected(s.connected);
          setWebOauth(s.oauth_configured);
        }
      })
      .catch(() => {
        if (cancelled || desktop) return;
        setWebConnected(false);
        setWebOauth(false);
      })
      .finally(() => {
        if (!cancelled && !desktop) setWebLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [backendOnline, desktop]);

  useEffect(() => {
    setMaxMessages((m) => Math.min(m, importMaxCap));
  }, [importMaxCap]);

  const mergePayload = useCallback((): GmailMergePrefs | null => {
    if (!includeInRun || !connected || !oauthConfigured) return null;
    return {
      enabled: true,
      gmail_query: buildGmailQueryFromSelection(parseGmailQueryToSelectionIds(query)),
      max_messages: Math.min(importMaxCap, Math.max(1, maxMessages)),
      gmail_import_content: importContent,
    };
  }, [includeInRun, connected, oauthConfigured, query, maxMessages, importContent, importMaxCap]);

  useSyncWorkspaceMergePrefs(onGmailMergePrefsChange, mergePayload);

  const needsExternal = !oauthConfigured || !connected;
  const accountBusy = !backendOnline || !connected || loadingStatus;

  const summaryLine = useMemo(() => {
    if (loadingStatus) return t("sources.gmailLoadingStatus");
    if (!oauthConfigured) return t("queue.workspaceGmailSummarySetup");
    if (!connected) return t("queue.workspaceGmailSummaryDisconnected");
    return t("queue.workspaceGmailSummaryConnected");
  }, [loadingStatus, oauthConfigured, connected, t]);

  const runMailImport = useCallback(async (signal?: AbortSignal) => {
    if (!backendOnline || !settings.outputDir?.trim()) {
      toast.message(t("queue.gmailNeedOutputDir"));
      return;
    }
    setImportBusy(true);
    try {
      await relayConnectorTokens();
      const ocr = buildAnalyzeOcrPayload(settings, installedTesseractLangs);
      const { job_id, session_id } = await gmailImportSort(
        {
          gmail_query: buildGmailQueryFromSelection(parseGmailQueryToSelectionIds(query)),
          max_messages: Math.min(importMaxCap, Math.max(1, maxMessages)),
          gmail_import_content: importContent,
          gmail_ui_parameters_json: buildGmailJobUiParametersJson({
            query,
            maxMessages: Math.min(importMaxCap, Math.max(1, maxMessages)),
            importMaxCap,
            importContent,
          }),
          output_dir: settings.outputDir,
          model: settings.model,
          mode: settings.mode,
          language: settings.language,
          vision_model: settings.visionModel.trim() || undefined,
          rules: settings.rules.filter((r) => r.enabled && r.pattern.trim()),
          on_collision: settings.onCollision,
          min_confidence: effectiveMinConfidenceForJob(settings),
          ...ocr,
          ...sortClassifyPayloadForJob(settings),
          ...documentBriefingRequestField(settings),
        },
        { signal }
      );
      onGmailSortJobStarted(job_id, session_id);
      toast.message(t("queue.gmailImportStarted"));
    } catch (e) {
      if (signal?.aborted) return;
      if (e instanceof DOMException && e.name === "AbortError") return;
      if (e instanceof EntitlementBlockedError) {
        toastEntitlementBlocked();
        void onEntitlementRefresh();
        return;
      }
      const msg = formatError(e);
      const capMatch = msg.match(/less than or equal to (\d+)/i);
      if (capMatch) {
        const serverCap = Math.min(GMAIL_EXPORT_MAX_MESSAGES, Math.max(1, parseInt(capMatch[1], 10)));
        setImportMaxCap(serverCap);
        setMaxMessages((m) => Math.min(m, serverCap));
        toast.error(t("queue.gmailImportFailed"), {
          description: `${msg}\n\n${t("queue.gmailImportCapAdapted", { cap: serverCap })}`,
        });
      } else {
        toastUserError(t("queue.gmailImportFailed"), e);
      }
    } finally {
      setImportBusy(false);
    }
  }, [
    backendOnline,
    settings,
    installedTesseractLangs,
    query,
    maxMessages,
    importMaxCap,
    importContent,
    onGmailSortJobStarted,
    t,
    toastEntitlementBlocked,
    onEntitlementRefresh,
  ]);

  useEffect(() => {
    if (!onRegisterWorkspaceGmailMailOnlyRunner) return;
    onRegisterWorkspaceGmailMailOnlyRunner((opts) => runMailImport(opts?.signal));
    return () => onRegisterWorkspaceGmailMailOnlyRunner(null);
  }, [onRegisterWorkspaceGmailMailOnlyRunner, runMailImport]);

  const canUseGmail = backendOnline && connected && oauthConfigured && !loadingStatus;

  return (
    <WorkspaceConnectorCollapsibleCard
      idBase="workspace-gmail"
      icon={<GmailBrandIcon compact />}
      copy={{
        title: t("sources.gmailTitle"),
        srHeading: t("queue.workspaceGmailHeading"),
        includeInRunLabel: t("queue.workspaceIncludeGmailInRun"),
        openExternalSourcesLabel: t("queue.gmailOpenExternalSources"),
        notConnectedLabel: t("queue.workspaceGmailNotConnected"),
        connectUnderSourcesLabel: t("queue.workspaceGmailConnectHint"),
      }}
      connected={connected}
      oauthConfigured={oauthConfigured}
      loadingStatus={loadingStatus}
      needsExternal={needsExternal}
      includeDisabled={accountBusy}
      includeInRun={includeInRun}
      onIncludeInRunChange={setIncludeInRun}
      sectionOpen={sectionOpen}
      onToggleSection={() => setSectionOpen((o) => !o)}
      summaryLine={summaryLine}
      onOpenExternalSourcesTab={onOpenExternalSourcesTab}
    >
      <div className={WORKSPACE_CONNECTOR_FILTERS_ONLY_PANEL_CLASS}>
        <div className={WORKSPACE_CONNECTOR_SUBSECTION_HEADER_CLASS}>
          <span className={WORKSPACE_CONNECTOR_SUBSECTION_TITLE_CLASS}>{t("queue.gmailImportOptionsToggle")}</span>
          <span className={WORKSPACE_CONNECTOR_SUBSECTION_HINT_CLASS}>{t("queue.gmailImportOptionsHint")}</span>
        </div>
        <GmailCategoryMaxRow
          query={query}
          onQueryChange={setQuery}
          maxMessages={maxMessages}
          onMaxMessagesChange={setMaxMessages}
          importMaxCap={importMaxCap}
          importContent={importContent}
          onImportContentChange={setImportContent}
          disabled={accountBusy}
        />
      </div>
      {!hideWorkspacePrimaryImportButton && (
        <button
          type="button"
          disabled={!canUseGmail || importBusy || !settings.outputDir?.trim()}
          onClick={() => void runMailImport()}
          className="w-full px-4 py-2.5 rounded-lg text-sm font-medium bg-button-primary text-white hover:bg-button-hover disabled:opacity-40 disabled:pointer-events-none"
        >
          {importBusy ? t("queue.gmailImporting") : t("queue.gmailImportSort")}
        </button>
      )}
    </WorkspaceConnectorCollapsibleCard>
  );
}
