/**
 * Shared hook for WorkspaceSortBlock account-connection state.
 *
 * Desktop sort cards (Gmail, Drive, Dropbox, OneDrive, Outlook, Infomaniak)
 * must read Electron integration accounts — the same store External sources uses.
 */
import { useCallback, useEffect, useState } from "react";
import { hasElectronBridge } from "../utils/platform";

interface UseWorkspaceConnectorAccountOptions {
  /** Provider ID as recognised by integration IPC (e.g. "onedrive", "outlook"). */
  providerId: string;
  /** CustomEvent name that signals a connection change for this provider. */
  integrationChangedEvent: string;
}

interface WorkspaceConnectorAccountState {
  desktop: boolean;
  connected: boolean;
  oauthConfigured: boolean;
  loadingStatus: boolean;
  refreshAccount: () => Promise<void>;
}

export function useWorkspaceConnectorAccount({
  providerId,
  integrationChangedEvent,
}: UseWorkspaceConnectorAccountOptions): WorkspaceConnectorAccountState {
  const desktop = hasElectronBridge();
  const [connected, setConnected] = useState(false);
  const [oauthConfigured, setOauthConfigured] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState(true);

  const refreshAccount = useCallback(async () => {
    if (!desktop || !window.electronAPI?.integrationGetAccounts) {
      setLoadingStatus(false);
      setConnected(false);
      setOauthConfigured(false);
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
        if (row) setConnected(!!row.connected);
      }
    } catch {
      /* transient IPC — keep prior state */
    } finally {
      setLoadingStatus(false);
    }
  }, [desktop, providerId]);

  useEffect(() => {
    void refreshAccount();
  }, [refreshAccount]);

  useEffect(() => {
    if (!desktop) return;
    const onChange = () => void refreshAccount();
    window.addEventListener(integrationChangedEvent, onChange);
    return () => window.removeEventListener(integrationChangedEvent, onChange);
  }, [desktop, integrationChangedEvent, refreshAccount]);

  return { desktop, connected, oauthConfigured, loadingStatus, refreshAccount };
}
