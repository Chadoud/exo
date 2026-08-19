import { type ReactNode, useCallback, useEffect, useState } from "react";
import { useI18n } from "../../i18n/I18nContext";
import ExternalSourceCard from "./ExternalSourceCard";
import ExternalSourceConnectionButton from "./ExternalSourceConnectionButton";
import ExternalSourceHelpButton from "./ExternalSourceHelpButton";
import { externalSourceConnectionPill } from "./externalSourceConnectionPill";
import { useDesktopOAuthCardState } from "../../hooks/useDesktopOAuthCardState";
import {
  INFOMANIAK_DRIVE_INTEGRATION_CHANGED_EVENT,
  notifyInfomaniakCalendarIntegrationChanged,
} from "./infomaniakIntegrationEvents";
import InfomaniakTokenSetupModal from "./InfomaniakTokenSetupModal";
import { describeInfomaniakConnectFailureReason } from "./infomaniakConnectFailureMessage";
import SourceAccountLine from "./SourceAccountLine";

const PROVIDER_ID = "infomaniak";

interface InfomaniakMailConnectionSectionProps {
  backendOnline: boolean;
  brandIcon: ReactNode;
  compact?: boolean;
}

/**
 * Infomaniak Mail uses the OAuth / env bearer row for Infomaniak kDrive (same session).
 */
export default function InfomaniakMailConnectionSection({
  backendOnline,
  brandIcon,
  compact = false,
}: InfomaniakMailConnectionSectionProps) {
  const { t } = useI18n();
  const [showTokenGuide, setShowTokenGuide] = useState(false);
  const [hasPersonalToken, setHasPersonalToken] = useState(false);

  const describeConnectFailure = useCallback(
    (reason: string) => describeInfomaniakConnectFailureReason(t, reason),
    [t],
  );

  const {
    desktop,
    connected,
    oauthConfigured: _oauthConfigured,
    loadingStatus,
    oauthBusy,
    disconnect,
  } = useDesktopOAuthCardState({
    providerId: PROVIDER_ID,
    integrationChangedEvent: INFOMANIAK_DRIVE_INTEGRATION_CHANGED_EVENT,
    // Mail uses the kDrive OAuth session — notifying the calendar integration
    // event keeps all Infomaniak card statuses in sync on connect/disconnect.
    onConnected: () => {
      notifyInfomaniakCalendarIntegrationChanged();
    },
    onDisconnected: () => {
      notifyInfomaniakCalendarIntegrationChanged();
    },
    describeConnectFailure,
    i18n: {
      connectSuccess: t("sources.infomaniakMailConnectSuccess"),
      connectFailed: t("sources.infomaniakMailConnectFailed"),
      disconnected: t("sources.infomaniakMailDisconnected"),
      disconnectFailed: t("sources.infomaniakMailDisconnectFailed"),
      disconnectedEnvTokenRemains: t("sources.infomaniakDisconnectClearedButEnvRemains"),
    },
  });
  void _oauthConfigured;

  useEffect(() => {
    if (!desktop || !window.electronAPI) return;
    void window.electronAPI.integrationLoadInfomaniakApiToken().then((res) => {
      setHasPersonalToken(res.hasToken);
    });
  }, [desktop]);

  const refreshPersonalTokenState = useCallback(() => {
    if (!desktop || !window.electronAPI) return;
    void window.electronAPI.integrationLoadInfomaniakApiToken().then((res) => {
      setHasPersonalToken(res.hasToken);
    });
  }, [desktop]);

  const effectivelyConnected = connected || hasPersonalToken;
  const { statusLabel, statusTone } = externalSourceConnectionPill(
    effectivelyConnected,
    loadingStatus,
    t,
  );

  return (
    <>
      <ExternalSourceCard
        id="sources-infomaniak-mail"
        title={t("sources.infomaniakMailTitle")}
        titleTrailing={
          desktop ? (
            <ExternalSourceHelpButton
              label={t("sources.connectorSetupHelp")}
              onClick={() => setShowTokenGuide(true)}
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
              sourceName={t("sources.infomaniakMailTitle")}
              connected={effectivelyConnected}
              loading={loadingStatus}
              busy={oauthBusy}
              onConnect={() => setShowTokenGuide(true)}
              onDisconnect={() => {
                void (async () => {
                  if (hasPersonalToken && window.electronAPI) {
                    await window.electronAPI.integrationClearInfomaniakApiToken();
                    refreshPersonalTokenState();
                    notifyInfomaniakCalendarIntegrationChanged();
                  }
                  if (connected) await disconnect();
                })();
              }}
              onNotConnectedClick={() => setShowTokenGuide(true)}
            />
          ) : undefined
        }
      >
        <SourceAccountLine
          providerId={PROVIDER_ID}
          connected={effectivelyConnected}
          backendOnline={backendOnline}
          desktop={desktop}
          refreshEvent={INFOMANIAK_DRIVE_INTEGRATION_CHANGED_EVENT}
        />
      </ExternalSourceCard>

      {showTokenGuide && (
        <InfomaniakTokenSetupModal
          scopePreset="mail"
          onClose={() => setShowTokenGuide(false)}
          onTokenSaved={() => {
            refreshPersonalTokenState();
            notifyInfomaniakCalendarIntegrationChanged();
          }}
        />
      )}
    </>
  );
}
