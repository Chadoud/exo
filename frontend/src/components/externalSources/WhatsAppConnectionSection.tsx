import { type ReactNode, useCallback, useEffect, useState } from "react";
import { useI18n } from "../../i18n/I18nContext";
import ExternalSourceCard from "./ExternalSourceCard";
import ExternalSourceConnectionButton from "./ExternalSourceConnectionButton";
import ExternalSourceHelpButton from "./ExternalSourceHelpButton";
import { externalSourceConnectionPill } from "./externalSourceConnectionPill";
import { useDesktopOAuthCardState } from "../../hooks/useDesktopOAuthCardState";
import { useWhatsAppEmbeddedConnect } from "../../hooks/useWhatsAppEmbeddedConnect";
import WhatsAppBusinessSetupModal from "./WhatsAppBusinessSetupModal";
import { consumeOpenWhatsAppSetup } from "../../utils/deferredPanelActions";

const PROVIDER_ID = "whatsapp";
const WHATSAPP_INTEGRATION_CHANGED_EVENT = "exosites:whatsapp-integration-changed";

interface WhatsAppConnectionSectionProps {
  backendOnline: boolean;
  brandIcon: ReactNode;
  compact?: boolean;
}

/**
 * WhatsApp on External sources — personal desktop messaging plus optional Business Cloud API.
 */
export default function WhatsAppConnectionSection({
  backendOnline: _backendOnline,
  brandIcon,
  compact = false,
}: WhatsAppConnectionSectionProps) {
  void _backendOnline;
  const { t } = useI18n();
  const [showBusinessSetup, setShowBusinessSetup] = useState(false);

  const {
    desktop,
    connected,
    loadingStatus,
    oauthBusy,
    disconnect,
  } = useDesktopOAuthCardState({
    providerId: PROVIDER_ID,
    integrationChangedEvent: WHATSAPP_INTEGRATION_CHANGED_EVENT,
    i18n: {
      connectSuccess: t("sources.whatsappCloudSaveSuccess"),
      connectFailed: t("sources.whatsappCloudSaveFailed"),
      disconnected: t("sources.whatsappDisconnected"),
      disconnectFailed: t("sources.whatsappDisconnectFailed"),
    },
  });

  const onConfigured = useCallback(() => {
    window.dispatchEvent(new CustomEvent(WHATSAPP_INTEGRATION_CHANGED_EVENT));
  }, []);

  const { connecting, connectBusiness, connectConfig } = useWhatsAppEmbeddedConnect(onConfigured);

  useEffect(() => {
    if (consumeOpenWhatsAppSetup()) {
      setShowBusinessSetup(true);
    }
  }, []);

  const { statusLabel, statusTone } = externalSourceConnectionPill(connected, loadingStatus, t);

  const businessBusy = connecting || oauthBusy;

  return (
    <>
      <ExternalSourceCard
        id="sources-whatsapp"
        title={t("sources.whatsappTitle")}
        titleTrailing={
          desktop ? (
            <ExternalSourceHelpButton
              label={t("sources.connectorSetupHelp")}
              onClick={() => setShowBusinessSetup(true)}
            />
          ) : null
        }
        brandIcon={brandIcon}
        statusLabel={statusLabel}
        statusTone={statusTone}
        compact={compact}
        actions={
          desktop ? (
            <ExternalSourceConnectionButton
              sourceName={t("sources.whatsappTitle")}
              connected={connected}
              loading={loadingStatus}
              busy={businessBusy}
              onConnect={() => void connectBusiness()}
              onDisconnect={() => void disconnect()}
            />
          ) : undefined
        }
      />

      {showBusinessSetup ? (
        <WhatsAppBusinessSetupModal
          onClose={() => setShowBusinessSetup(false)}
          onConfigured={onConfigured}
          connectConfig={connectConfig}
          connecting={connecting}
          connectBusiness={connectBusiness}
        />
      ) : null}
    </>
  );
}
