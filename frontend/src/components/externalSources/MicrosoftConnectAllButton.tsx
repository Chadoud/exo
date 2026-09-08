import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { hasElectronBridge } from "../../utils/platform";
import { describeIntegrationConnectFailure } from "../../utils/externalSourceConnectUi";
import { useI18n } from "../../i18n/I18nContext";
import {
  refreshIntegrationTasksBestEffort,
  resumeIntegrationSourcesBestEffort,
} from "../../utils/forgetIntegrationTasks";
import {
  MICROSOFT_INTEGRATION_CHANGED_EVENT,
  notifyMicrosoftIntegrationChanged,
} from "./OneDriveConnectionSection";

const PROVIDER_MICROSOFT = "microsoft";
const PROVIDER_ONEDRIVE = "onedrive";

/**
 * Desktop-only: one Microsoft Graph sign-in fills the shared slot used by OneDrive and Outlook cards.
 */
export default function MicrosoftConnectAllButton() {
  const { t } = useI18n();
  const desktop = hasElectronBridge();
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [microsoftConnected, setMicrosoftConnected] = useState(false);
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
        const row = acc.accounts.find((a) => a.providerId === PROVIDER_ONEDRIVE);
        setMicrosoftConnected(!!row?.connected);
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
    window.addEventListener(MICROSOFT_INTEGRATION_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(MICROSOFT_INTEGRATION_CHANGED_EVENT, onChange);
  }, [desktop, refreshStatus]);

  const connectAll = useCallback(async () => {
    if (!desktop || !window.electronAPI) return;
    setOauthBusy(true);
    try {
      const r = await window.electronAPI.integrationConnect({ providerId: PROVIDER_MICROSOFT });
      if (r.ok) {
        toast.message(t("sources.microsoftConnectAllSuccess"));
        resumeIntegrationSourcesBestEffort(["outlook", "outlook-calendar"]);
        refreshIntegrationTasksBestEffort();
        notifyMicrosoftIntegrationChanged();
      } else {
        toast.error(t("sources.microsoftConnectAllFailed"), {
          description:
            describeIntegrationConnectFailure(t, r.reason ?? "") ?? (r.reason || undefined),
        });
      }
    } catch (e) {
      toast.error(t("sources.microsoftConnectAllFailed"), {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setOauthBusy(false);
      await refreshStatus();
    }
  }, [desktop, refreshStatus, t]);

  if (!desktop) return null;

  const disabled = loadingStatus || microsoftConnected || oauthBusy;

  const title =
    microsoftConnected && !loadingStatus
      ? t("sources.microsoftConnectAllDisabledFullyConnected")
      : t("sources.microsoftConnectAllTitle");

  return (
    <button
      type="button"
      disabled={disabled}
      title={title}
      onClick={() => void connectAll()}
      className="text-sm font-medium px-3 py-1.5 rounded-lg border border-accent-line bg-accent-light text-accent hover:bg-accent/15 disabled:opacity-40 shrink-0"
    >
      {oauthBusy ? t("sources.microsoftConnectAllWorking") : t("sources.microsoftConnectAll")}
    </button>
  );
}
