import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  EXOSITES_GOOGLE_INTEGRATION_CHANGED_EVENT,
  hasElectronBridge,
} from "../../utils/platform";
import { relayConnectorTokens } from "../../assistant/connectorContext";
import { describeIntegrationConnectFailure } from "../../utils/externalSourceConnectUi";
import {
  refreshIntegrationTasksBestEffort,
  refreshMailRepliesBestEffort,
} from "../../utils/forgetIntegrationTasks";
import { useI18n } from "../../i18n/I18nContext";

const PROVIDER_GOOGLE_ALL = "google-all";
const PROVIDER_GMAIL = "google-gmail";
const PROVIDER_DRIVE = "google-drive";
const PROVIDER_CALENDAR = "google-calendar";

/**
 * Desktop-only: one Google OAuth consent with union scopes; fills Gmail, Drive, and Calendar slots.
 */
export default function GoogleConnectAllButton() {
  const { t } = useI18n();
  const desktop = hasElectronBridge();
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [gmailConnected, setGmailConnected] = useState(false);
  const [driveConnected, setDriveConnected] = useState(false);
  const [calendarConnected, setCalendarConnected] = useState(false);
  const [oauthBusy, setOauthBusy] = useState(false);

  const refreshStatus = useCallback(async () => {
    if (!desktop || !window.electronAPI) {
      setLoadingStatus(false);
      return;
    }
    setLoadingStatus(true);
    try {
      const acc = await window.electronAPI.integrationGetAccounts();
      if (acc.ok !== false && acc.accounts) {
        const row = (pid: string) => acc.accounts?.find((a) => a.providerId === pid);
        setGmailConnected(!!row(PROVIDER_GMAIL)?.connected);
        setDriveConnected(!!row(PROVIDER_DRIVE)?.connected);
        setCalendarConnected(!!row(PROVIDER_CALENDAR)?.connected);
      }
    } catch {
      /* transient IPC — keep prior state */
    } finally {
      setLoadingStatus(false);
    }
  }, [desktop]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  useEffect(() => {
    if (!desktop) return;
    const onChange = () => void refreshStatus();
    window.addEventListener(EXOSITES_GOOGLE_INTEGRATION_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(EXOSITES_GOOGLE_INTEGRATION_CHANGED_EVENT, onChange);
  }, [desktop, refreshStatus]);

  const connectAll = useCallback(async () => {
    if (!desktop || !window.electronAPI) return;
    setOauthBusy(true);
    try {
      const r = await window.electronAPI.integrationConnect({ providerId: PROVIDER_GOOGLE_ALL });
      if (r.ok) {
        toast.message(t("sources.googleConnectAllSuccess"));
        await relayConnectorTokens();
        window.dispatchEvent(new CustomEvent(EXOSITES_GOOGLE_INTEGRATION_CHANGED_EVENT));
        refreshIntegrationTasksBestEffort();
        refreshMailRepliesBestEffort();
      } else {
        const reason = r.reason ?? "";
        toast.error(t("sources.googleConnectAllFailed"), {
          description:
            describeIntegrationConnectFailure(t, reason) ?? (reason || undefined),
        });
      }
    } catch (e) {
      toast.error(t("sources.googleConnectAllFailed"), {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setOauthBusy(false);
      await refreshStatus();
    }
  }, [desktop, refreshStatus, t]);

  if (!desktop) return null;

  const allConnected = gmailConnected && driveConnected && calendarConnected;
  const disabled = loadingStatus || allConnected || oauthBusy;

  const title =
    allConnected && !loadingStatus
      ? t("sources.googleConnectAllDisabledFullyConnected")
      : t("sources.googleConnectAllTitle");

  return (
    <button
      type="button"
      disabled={disabled}
      title={title}
      onClick={() => void connectAll()}
      className="text-sm font-medium px-3 py-1.5 rounded-lg border border-accent-line bg-accent-light text-accent hover:bg-accent/15 disabled:opacity-40 shrink-0"
    >
      {oauthBusy ? t("sources.googleConnectAllWorking") : t("sources.googleConnectAll")}
    </button>
  );
}
