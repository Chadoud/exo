import { type ReactNode, useState } from "react";
import { useI18n } from "../../i18n/I18nContext";
import ExternalSourceCard from "./ExternalSourceCard";
import ExternalSourceConnectionButton from "./ExternalSourceConnectionButton";
import { externalSourceConnectionPill } from "./externalSourceConnectionPill";
import ExternalSourceHelpButton from "./ExternalSourceHelpButton";
import { useDesktopOAuthCardState } from "../../hooks/useDesktopOAuthCardState";
import NotionOAuthSetupModal from "./NotionOAuthSetupModal";

const PROVIDER_ID = "notion";
const NOTION_INTEGRATION_CHANGED_EVENT = "exosites:notion-integration-changed";

function notifyNotionIntegrationChanged() {
  window.dispatchEvent(new CustomEvent(NOTION_INTEGRATION_CHANGED_EVENT));
}

interface NotionConnectionSectionProps {
  backendOnline: boolean;
  brandIcon: ReactNode;
  compact?: boolean;
}

export default function NotionConnectionSection({
  backendOnline: _backendOnline,
  brandIcon,
  compact = false,
}: NotionConnectionSectionProps) {
  void _backendOnline;
  const { t } = useI18n();
  const [showSetupGuide, setShowSetupGuide] = useState(false);

  const {
    desktop,
    connected,
    oauthConfigured,
    loadingStatus,
    oauthBusy,
    connect,
    disconnect,
    refreshStatus,
  } = useDesktopOAuthCardState({
    providerId: PROVIDER_ID,
    integrationChangedEvent: NOTION_INTEGRATION_CHANGED_EVENT,
    i18n: {
      connectSuccess: t("sources.notionConnectSuccess"),
      connectFailed: t("sources.notionConnectFailed"),
      disconnected: t("sources.notionDisconnected"),
      disconnectFailed: t("sources.notionDisconnectFailed"),
    },
  });

  const { statusLabel, statusTone } = externalSourceConnectionPill(connected, loadingStatus, t);

  return (
    <>
      <ExternalSourceCard
        id="sources-notion"
        title={t("sources.notionTitle")}
        titleTrailing={
          desktop ? (
            <ExternalSourceHelpButton
              label={t("sources.connectorSetupHelp")}
              onClick={() => setShowSetupGuide(true)}
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
              sourceName={t("sources.notionTitle")}
              connected={connected}
              loading={loadingStatus}
              busy={oauthBusy}
              onConnect={() => void connect()}
              onDisconnect={() => void disconnect()}
              onNotConnectedClick={
                !oauthConfigured ? () => setShowSetupGuide(true) : undefined
              }
            />
          ) : undefined
        }
      />

      {showSetupGuide && (
        <NotionOAuthSetupModal
          onClose={() => setShowSetupGuide(false)}
          onConfigured={() => {
            void refreshStatus();
            notifyNotionIntegrationChanged();
          }}
        />
      )}
    </>
  );
}
