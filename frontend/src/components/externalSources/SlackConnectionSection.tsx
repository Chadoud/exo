import { type ReactNode, useState } from "react";
import { useI18n } from "../../i18n/I18nContext";
import ExternalSourceCard from "./ExternalSourceCard";
import ExternalSourceConnectionButton from "./ExternalSourceConnectionButton";
import { externalSourceConnectionPill } from "./externalSourceConnectionPill";
import { useDesktopOAuthCardState } from "../../hooks/useDesktopOAuthCardState";
import SlackOAuthSetupModal from "./SlackOAuthSetupModal";

const PROVIDER_ID = "slack";
const SLACK_INTEGRATION_CHANGED_EVENT = "exosites:slack-integration-changed";

function notifySlackIntegrationChanged() {
  window.dispatchEvent(new CustomEvent(SLACK_INTEGRATION_CHANGED_EVENT));
}

interface SlackConnectionSectionProps {
  backendOnline: boolean;
  brandIcon: ReactNode;
  compact?: boolean;
}

export default function SlackConnectionSection({
  backendOnline: _backendOnline,
  brandIcon,
  compact = false,
}: SlackConnectionSectionProps) {
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
    integrationChangedEvent: SLACK_INTEGRATION_CHANGED_EVENT,
    i18n: {
      connectSuccess: t("sources.slackConnectSuccess"),
      connectFailed: t("sources.slackConnectFailed"),
      disconnected: t("sources.slackDisconnected"),
      disconnectFailed: t("sources.slackDisconnectFailed"),
    },
  });

  const { statusLabel, statusTone } = externalSourceConnectionPill(connected, loadingStatus, t);

  return (
    <>
      <ExternalSourceCard
        id="sources-slack"
        title={t("sources.slackTitle")}
        brandIcon={brandIcon}
        statusLabel={statusLabel}
        statusTone={statusTone}
        compact={compact}
        actions={
          desktop ? (
            <ExternalSourceConnectionButton
              sourceName={t("sources.slackTitle")}
              connected={connected}
              loading={loadingStatus}
              busy={oauthBusy}
              disabled={false}
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
        <SlackOAuthSetupModal
          onClose={() => setShowSetupGuide(false)}
          onConfigured={() => {
            void refreshStatus();
            notifySlackIntegrationChanged();
          }}
        />
      )}
    </>
  );
}
