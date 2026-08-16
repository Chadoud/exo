import { type ReactNode, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useI18n } from "../../i18n/I18nContext";
import ExternalSourceCard from "./ExternalSourceCard";
import ExternalSourceConnectionButton from "./ExternalSourceConnectionButton";
import { externalSourceConnectionPill } from "./externalSourceConnectionPill";

const PROVIDER_ID = "icloud";
const ICLOUD_INTEGRATION_CHANGED_EVENT = "exosites:icloud-integration-changed";

function notifyICloudIntegrationChanged() {
  window.dispatchEvent(new CustomEvent(ICLOUD_INTEGRATION_CHANGED_EVENT));
}

interface ICloudConnectionSectionProps {
  backendOnline: boolean;
  brandIcon: ReactNode;
  compact?: boolean;
}

/**
 * iCloud Drive local-folder picker — no OAuth, no API key.
 * The user picks their iCloud Drive sync folder on disk.
 */
export default function ICloudConnectionSection({
  backendOnline: _backendOnline,
  brandIcon,
  compact = false,
}: ICloudConnectionSectionProps) {
  void _backendOnline;
  const { t } = useI18n();
  const desktop = Boolean(window.electronAPI);

  const [connected, setConnected] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [busy, setBusy] = useState(false);

  const loadStatus = useCallback(async () => {
    if (!window.electronAPI) { setLoadingStatus(false); return; }
    setLoadingStatus(true);
    try {
      const accountsResult = await window.electronAPI.integrationGetAccounts();
      if (accountsResult.ok) {
        const account = accountsResult.accounts?.find(
          (a: { providerId: string; connected: boolean }) => a.providerId === PROVIDER_ID
        );
        setConnected(account?.connected ?? false);
      }
    } finally {
      setLoadingStatus(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
    const handler = () => void loadStatus();
    window.addEventListener(ICLOUD_INTEGRATION_CHANGED_EVENT, handler);
    return () => window.removeEventListener(ICLOUD_INTEGRATION_CHANGED_EVENT, handler);
  }, [loadStatus]);

  const handlePickFolder = useCallback(async () => {
    if (!window.electronAPI) return;
    setBusy(true);
    try {
      const result = await window.electronAPI.integrationPickICloudFolder();
      if (result.ok && result.folder) {
        toast.success(t("sources.icloudFolderSelected"));
        notifyICloudIntegrationChanged();
        await loadStatus();
      } else if (result.reason !== "cancelled") {
        toast.error(t("sources.icloudPickFailed"));
      }
    } finally {
      setBusy(false);
    }
  }, [loadStatus, t]);

  const handleDisconnect = useCallback(async () => {
    if (!window.electronAPI) return;
    setBusy(true);
    try {
      await window.electronAPI.integrationDisconnect({ providerId: PROVIDER_ID });
      toast.success(t("sources.icloudDisconnected"));
      notifyICloudIntegrationChanged();
      await loadStatus();
    } finally {
      setBusy(false);
    }
  }, [loadStatus, t]);

  const { statusLabel, statusTone } = externalSourceConnectionPill(connected, loadingStatus, t);

  return (
    <ExternalSourceCard
      id="sources-icloud"
      title={t("sources.icloudTitle")}
      brandIcon={brandIcon}
      statusLabel={statusLabel}
      statusTone={statusTone}
      compact={compact}
      actions={
        desktop ? (
          <ExternalSourceConnectionButton
            sourceName={t("sources.icloudTitle")}
            connected={connected}
            loading={loadingStatus}
            busy={busy}
            onConnect={() => void handlePickFolder()}
            onDisconnect={() => void handleDisconnect()}
          />
        ) : undefined
      }
    />
  );
}
