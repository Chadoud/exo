import { useCallback, useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  EXOSITES_GOOGLE_INTEGRATION_CHANGED_EVENT,
  hasElectronBridge,
  notifyGoogleIntegrationChanged,
} from "../../utils/platform";
import {
  GmailOAuthFlowTimeoutError,
  gmailOAuthAbort,
  gmailOAuthBegin,
  gmailOAuthDisconnect,
  gmailStatus,
  openGmailSignInWindow,
  waitUntilGmailOAuthFlowIdle,
} from "../../api/gmail";
import { describeIntegrationConnectFailure } from "../../utils/externalSourceConnectUi";
import { describeOAuthConnectError } from "../../utils/userFacingErrors";
import ExternalSourceCard from "./ExternalSourceCard";
import ExternalSourceConnectionButton from "./ExternalSourceConnectionButton";
import { externalSourceConnectionPill } from "./externalSourceConnectionPill";
import { externalSourceConnectDisabled } from "../../utils/externalSourceConnectUi";
import { relayConnectorTokens } from "../../assistant/connectorContext";
import { useI18n } from "../../i18n/I18nContext";

const PROVIDER_ID = "google-gmail";

interface GmailConnectionSectionProps {
  backendOnline: boolean;
  brandIcon: ReactNode;
  compact?: boolean;
}

/**
 * Gmail OAuth card (desktop PKCE or web loopback). Separate from Google Drive sign-in.
 */
export default function GmailConnectionSection({
  backendOnline,
  brandIcon,
  compact = false,
}: GmailConnectionSectionProps) {
  const { t } = useI18n();
  const desktop = hasElectronBridge();
  const [connected, setConnected] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [oauthBusy, setOauthBusy] = useState(false);
  const [connectWaiting, setConnectWaiting] = useState(false);
  const [, setConnectNeedsManualCancel] = useState(false);

  const refreshStatus = useCallback(async () => {
    const canProbeElectron = desktop && typeof window !== "undefined" && window.electronAPI;
    if (!backendOnline && !canProbeElectron) {
      setLoadingStatus(false);
      return;
    }
    setLoadingStatus(true);
    if (canProbeElectron) {
      try {
        const acc = await window.electronAPI!.integrationGetAccounts();
        if (acc.ok !== false && acc.accounts) {
          const account = acc.accounts.find((a) => a.providerId === PROVIDER_ID);
          if (account) setConnected(!!account.connected);
        }
      } catch {
        /* transient IPC — keep last-known connection state */
      }
    }
    if (!backendOnline || (desktop && window.electronAPI)) {
      setLoadingStatus(false);
      return;
    }
    try {
      const s = await gmailStatus();
      setConnected(s.connected);
    } catch {
      /* keep Electron-derived state when the web status probe fails */
    } finally {
      setLoadingStatus(false);
    }
  }, [backendOnline, desktop]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  useEffect(() => {
    if (!desktop) return;
    const onChanged = () => {
      void refreshStatus();
    };
    window.addEventListener(EXOSITES_GOOGLE_INTEGRATION_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(EXOSITES_GOOGLE_INTEGRATION_CHANGED_EVENT, onChanged);
  }, [desktop, refreshStatus]);

  const connect = async () => {
    if (desktop && window.electronAPI) {
      setOauthBusy(true);
      try {
        const r = await window.electronAPI.integrationConnect({ providerId: PROVIDER_ID });
        if (r.ok) {
          await relayConnectorTokens();
          toast.message(t("sources.gmailConnectSuccess"));
          notifyGoogleIntegrationChanged();
        } else {
          const reason = r.reason ?? "";
          toast.error(t("sources.gmailConnectFailed"), {
            description:
              describeIntegrationConnectFailure(t, reason) ?? (reason || undefined),
          });
        }
      } catch (e) {
        toast.error(t("sources.gmailConnectFailed"), {
          description: e instanceof Error ? e.message : String(e),
        });
      } finally {
        setOauthBusy(false);
        await refreshStatus();
      }
      return;
    }
    if (!backendOnline) return;
    let popupClosedPoll: number | null = null;
    setConnectNeedsManualCancel(false);
    setConnectWaiting(true);
    try {
      const { auth_url } = await gmailOAuthBegin();
      const handle = openGmailSignInWindow(auth_url);
      if (handle.mode === "popup") {
        popupClosedPoll = window.setInterval(() => {
          if (handle.window.closed) {
            if (popupClosedPoll !== null) {
              window.clearInterval(popupClosedPoll);
              popupClosedPoll = null;
            }
            void gmailOAuthAbort();
          }
        }, 400);
      } else if (handle.mode === "electron-shell") {
        void handle.untilClosed.then(() => {
          void gmailOAuthAbort();
        });
      } else {
        setConnectNeedsManualCancel(true);
      }
      let finalStatus;
      try {
        finalStatus = await waitUntilGmailOAuthFlowIdle();
      } catch (err) {
        void gmailOAuthAbort();
        if (err instanceof GmailOAuthFlowTimeoutError) {
          toast.error(t("sources.gmailConnectWaitTimeout"));
        } else {
          throw err;
        }
        return;
      }
      if (finalStatus.connected) {
        toast.message(t("sources.gmailConnectSuccess"));
      } else if (finalStatus.oauth_flow_error) {
        toast.error(t("sources.gmailConnectFailed"), {
          description: describeOAuthConnectError(t, finalStatus.oauth_flow_error),
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      const lower = msg.toLowerCase();
      if (lower.includes("already in progress")) {
        toast.error(t("sources.gmailConnectAnotherInProgress"), { description: msg });
      } else {
        toast.error(t("sources.gmailConnectFailed"), {
          description: describeOAuthConnectError(t, msg) || msg,
        });
      }
      void gmailOAuthAbort();
    } finally {
      if (popupClosedPoll !== null) window.clearInterval(popupClosedPoll);
      setConnectNeedsManualCancel(false);
      setConnectWaiting(false);
      await refreshStatus();
    }
  };

  const disconnect = async () => {
    if (desktop && window.electronAPI) {
      setOauthBusy(true);
      try {
        await window.electronAPI.integrationDisconnect({ providerId: PROVIDER_ID });
        toast.message(t("sources.gmailDisconnected"));
        notifyGoogleIntegrationChanged();
        await refreshStatus();
      } catch (e) {
        toast.error(t("sources.gmailDisconnectFailed"), { description: e instanceof Error ? e.message : "" });
      } finally {
        setOauthBusy(false);
      }
      return;
    }
    if (!backendOnline) return;
    setOauthBusy(true);
    try {
      await gmailOAuthDisconnect();
      toast.message(t("sources.gmailDisconnected"));
      await refreshStatus();
    } catch (e) {
      toast.error(t("sources.gmailDisconnectFailed"), { description: e instanceof Error ? e.message : "" });
    } finally {
      setOauthBusy(false);
    }
  };

  const { statusLabel, statusTone } = externalSourceConnectionPill(connected, loadingStatus, t);

  return (
    <ExternalSourceCard
      id="sources-gmail"
      title={t("sources.gmailTitle")}
      brandIcon={brandIcon}
      statusLabel={statusLabel}
      statusTone={statusTone}
      compact={compact}
      actions={
        <ExternalSourceConnectionButton
          sourceName={t("sources.gmailTitle")}
          connected={connected}
          loading={loadingStatus}
          busy={oauthBusy || connectWaiting}
          disabled={externalSourceConnectDisabled({
            connected,
            loading: loadingStatus,
            busy: oauthBusy || connectWaiting,
            desktop,
            backendOnline,
          })}
          onConnect={() => void connect()}
          onDisconnect={() => void disconnect()}
        />
      }
    >
      {connected && !compact ? (
        <p className="text-2xs leading-snug text-muted">{t("sources.gmailFiltersReconnectHint")}</p>
      ) : null}
    </ExternalSourceCard>
  );
}
