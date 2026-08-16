import { useState } from "react";
import { useI18n } from "../../i18n/I18nContext";
import {
  EXTERNAL_SOURCE_CARD_PRIMARY_ACTION_CLASS,
  EXTERNAL_SOURCE_CARD_SECONDARY_ACTION_CLASS,
} from "./ExternalSourceCard";
import ExternalSourceDisconnectConfirm from "./ExternalSourceDisconnectConfirm";
import { connectionStatusLabel } from "./externalSourceConnectionPill";

interface ExternalSourceConnectionButtonProps {
  /** Display name of the source (Gmail, Drive, …) for the confirm copy. */
  sourceName: string;
  connected: boolean;
  loading?: boolean;
  busy?: boolean;
  disabled?: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  /** When not connected, run setup (e.g. open token modal) instead of OAuth connect. */
  onNotConnectedClick?: () => void;
}

/**
 * Single card action — label is always Connected or Not connected; click toggles the link.
 * Disconnect asks for confirmation first so a mis-click does not drop the session.
 */
export default function ExternalSourceConnectionButton({
  sourceName,
  connected,
  loading = false,
  busy = false,
  disabled = false,
  onConnect,
  onDisconnect,
  onNotConnectedClick,
}: ExternalSourceConnectionButtonProps) {
  const { t } = useI18n();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const isConnected = !loading && connected;
  const label = connectionStatusLabel(connected, loading, t);

  const handleClick = () => {
    if (isConnected) {
      setConfirmOpen(true);
      return;
    }
    if (onNotConnectedClick) {
      onNotConnectedClick();
      return;
    }
    onConnect();
  };

  const confirmDisconnect = () => {
    setConfirmOpen(false);
    onDisconnect();
  };

  return (
    <>
      <button
        type="button"
        disabled={disabled || busy || loading}
        onClick={handleClick}
        className={
          isConnected
            ? EXTERNAL_SOURCE_CARD_SECONDARY_ACTION_CLASS
            : EXTERNAL_SOURCE_CARD_PRIMARY_ACTION_CLASS
        }
      >
        {label}
      </button>
      {confirmOpen ? (
        <ExternalSourceDisconnectConfirm
          sourceName={sourceName}
          title={t("sources.disconnectConfirmTitle", { source: sourceName })}
          body={t("sources.disconnectConfirmBody", { source: sourceName })}
          confirmLabel={t("sources.disconnectConfirmAction")}
          cancelLabel={t("sources.disconnectConfirmCancel")}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={confirmDisconnect}
        />
      ) : null}
    </>
  );
}
