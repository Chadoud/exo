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

interface InfomaniakConnectionSectionProps {
  backendOnline: boolean;
  brandIcon: ReactNode;
  compact?: boolean;
}

export default function InfomaniakConnectionSection({
  backendOnline,
  brandIcon,
  compact = false,
}: InfomaniakConnectionSectionProps) {
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
    // kDrive and Calendar share one OAuth session — notify the calendar UI so its
    // connection status refreshes whenever kDrive connects or disconnects.
    onConnected: () => {
      notifyInfomaniakCalendarIntegrationChanged();
    },
    onDisconnected: () => {
      notifyInfomaniakCalendarIntegrationChanged();
    },
    describeConnectFailure,
    i18n: {
      connectSuccess: t("sources.infomaniakConnectSuccess"),
      connectFailed: t("sources.infomaniakConnectFailed"),
      disconnected: t("sources.infomaniakDisconnected"),
      disconnectFailed: t("sources.infomaniakDisconnectFailed"),
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
        id="sources-infomaniak"
        title={t("sources.infomaniakTitle")}
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
              sourceName={t("sources.infomaniakTitle")}
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
          scopePreset="kdrive"
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
