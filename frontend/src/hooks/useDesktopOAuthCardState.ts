/**
 * Shared hook for desktop OAuth provider cards (Drive, Dropbox, OneDrive, Outlook).
 *
 * Handles: status polling, connect/disconnect IPC calls, and listening to a
 * provider-specific "integration changed" custom event so sibling cards refresh
 * when the user connects/disconnects a related provider on the same page.
 */
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useI18n } from "../i18n/I18nContext";
import { hasElectronBridge } from "../utils/platform";
import { relayConnectorTokens } from "../assistant/connectorContext";
import { describeIntegrationConnectFailure } from "../utils/externalSourceConnectUi";

interface UseDesktopOAuthCardStateOptions {
  /** Provider ID as recognised by integration IPC (e.g. "onedrive", "outlook"). */
  providerId: string;
  /** CustomEvent name that signals a change to this provider's session. */
  integrationChangedEvent: string;
  /** Fired after a successful connect (before calling refresh). */
  onConnected?: () => void;
  /** Fired after a successful disconnect (before calling refresh). */
  onDisconnected?: () => void;
  i18n: {
    connectSuccess: string;
    connectFailed: string;
    disconnected: string;
    disconnectFailed: string;
    /** When disconnect clears storage but `EXOSITES_INFOMANIAK_TOKEN` still authorizes the app. */
    disconnectedEnvTokenRemains?: string;
  };
  /** When connect returns `ok: false`, map `reason` to a user-facing description (toast body). */
  describeConnectFailure?: (reason: string) => string | undefined;
}

interface DesktopOAuthCardState {
  desktop: boolean;
  connected: boolean;
  oauthConfigured: boolean;
  /** Infomaniak: `EXOSITES_INFOMANIAK_TOKEN` is set (access without stored OAuth). */
  sessionBackedByEnvToken: boolean;
  loadingStatus: boolean;
  oauthBusy: boolean;
  refreshStatus: () => Promise<void>;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
}

export function useDesktopOAuthCardState({
  providerId,
  integrationChangedEvent,
  onConnected,
  onDisconnected,
  i18n,
  describeConnectFailure,
}: UseDesktopOAuthCardStateOptions): DesktopOAuthCardState {
  const { t } = useI18n();
  const desktop = hasElectronBridge();
  const [connected, setConnected] = useState(false);
  const [oauthConfigured, setOauthConfigured] = useState(false);
  const [sessionBackedByEnvToken, setSessionBackedByEnvToken] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [oauthBusy, setOauthBusy] = useState(false);

  const refreshStatus = useCallback(async () => {
    if (!desktop || !window.electronAPI?.integrationGetAccounts) {
      setLoadingStatus(false);
      setConnected(false);
      setOauthConfigured(false);
      setSessionBackedByEnvToken(false);
      return;
    }
    setLoadingStatus(true);
    try {
      const prov = await window.electronAPI.integrationListProviders();
      if (prov.ok !== false && prov.providers) {
        const p = prov.providers.find((x) => x.id === providerId);
        if (p) setOauthConfigured(!!p.oauthConfigured);
      }
      const acc = await window.electronAPI.integrationGetAccounts();
      if (acc.ok !== false && acc.accounts) {
        const row = acc.accounts.find((a) => a.providerId === providerId);
        setConnected(!!row?.connected);
        setSessionBackedByEnvToken(!!row?.authViaEnvToken);
      }
    } catch {
      /* Keep last-known state — a transient IPC failure must not grey out Connect. */
    } finally {
      setLoadingStatus(false);
    }
  }, [desktop, providerId]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  useEffect(() => {
    if (!desktop) return;
    const onChange = () => void refreshStatus();
    window.addEventListener(integrationChangedEvent, onChange);
    return () => window.removeEventListener(integrationChangedEvent, onChange);
  }, [desktop, integrationChangedEvent, refreshStatus]);

  const connect = useCallback(async () => {
    if (!desktop || !window.electronAPI) return;
    setOauthBusy(true);
    try {
      const r = await window.electronAPI.integrationConnect({ providerId });
      if (r.ok) {
        toast.message(i18n.connectSuccess);
        // Push fresh tokens into the backend cache so voice/tools work on the
        // next ask without requiring a mic restart / session-prime.
        await relayConnectorTokens();
        window.dispatchEvent(new CustomEvent(integrationChangedEvent));
        onConnected?.();
      } else {
        const reason = r.reason ?? "";
        const description =
          describeConnectFailure?.(reason) ??
          describeIntegrationConnectFailure(t, reason) ??
          (reason || undefined);
        toast.error(i18n.connectFailed, { description });
      }
    } catch (e) {
      toast.error(i18n.connectFailed, {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setOauthBusy(false);
      await refreshStatus();
    }
  }, [
    desktop,
    providerId,
    integrationChangedEvent,
    i18n,
    describeConnectFailure,
    onConnected,
    refreshStatus,
    t,
  ]);

  const disconnect = useCallback(async () => {
    if (!desktop || !window.electronAPI) return;
    setOauthBusy(true);
    try {
      const r = await window.electronAPI.integrationDisconnect({ providerId });
      if (r?.ok) {
        if (r.stillAuthorizedViaEnv && i18n.disconnectedEnvTokenRemains) {
          toast.message(i18n.disconnectedEnvTokenRemains);
        } else {
          toast.message(i18n.disconnected);
        }
        await relayConnectorTokens();
        onDisconnected?.();
      } else {
        toast.error(i18n.disconnectFailed, { description: r?.reason ?? "" });
      }
      window.dispatchEvent(new CustomEvent(integrationChangedEvent));
      await refreshStatus();
    } catch (e) {
      toast.error(i18n.disconnectFailed, {
        description: e instanceof Error ? e.message : "",
      });
    } finally {
      setOauthBusy(false);
    }
  }, [desktop, providerId, integrationChangedEvent, i18n, onDisconnected, refreshStatus]);

  return {
    desktop,
    connected,
    oauthConfigured,
    sessionBackedByEnvToken,
    loadingStatus,
    oauthBusy,
    refreshStatus,
    connect,
    disconnect,
  };
}
