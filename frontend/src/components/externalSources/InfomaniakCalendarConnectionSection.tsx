import { type ReactNode, useCallback, useEffect, useState } from "react";
import { useI18n } from "../../i18n/I18nContext";
import ExternalSourceCard from "./ExternalSourceCard";
import ExternalSourceConnectionButton from "./ExternalSourceConnectionButton";
import ExternalSourceHelpButton from "./ExternalSourceHelpButton";
import { externalSourceConnectionPill } from "./externalSourceConnectionPill";
import { useDesktopOAuthCardState } from "../../hooks/useDesktopOAuthCardState";
import {
  INFOMANIAK_CALENDAR_INTEGRATION_CHANGED_EVENT,
  notifyInfomaniakDriveIntegrationChanged,
} from "./infomaniakIntegrationEvents";
import InfomaniakTokenSetupModal from "./InfomaniakTokenSetupModal";
import { describeInfomaniakConnectFailureReason } from "./infomaniakConnectFailureMessage";
import SourceAccountLine from "./SourceAccountLine";

const PROVIDER_ID = "infomaniak-calendar";

interface InfomaniakCalendarConnectionSectionProps {
  backendOnline: boolean;
  brandIcon: ReactNode;
  compact?: boolean;
}

/**
 * Infomaniak Calendar OAuth slot (read-only assistant tools). Separate from kDrive.
 * The API-token guide mirrors other Infomaniak cards; the checklist only lists Workspace Calendar scopes.
 */
export default function InfomaniakCalendarConnectionSection({
  backendOnline,
  brandIcon,
  compact = false,
}: InfomaniakCalendarConnectionSectionProps) {
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
    integrationChangedEvent: INFOMANIAK_CALENDAR_INTEGRATION_CHANGED_EVENT,
    // Calendar uses a separate OAuth slot from kDrive, but both share the same
    // user session — notify the kDrive UI so its connection indicator refreshes.
    onConnected: () => {
      notifyInfomaniakDriveIntegrationChanged();
    },
    onDisconnected: () => {
      notifyInfomaniakDriveIntegrationChanged();
    },
    describeConnectFailure,
    i18n: {
      connectSuccess: t("sources.infomaniakCalendarConnectSuccess"),
      connectFailed: t("sources.infomaniakCalendarConnectFailed"),
      disconnected: t("sources.infomaniakCalendarDisconnected"),
      disconnectFailed: t("sources.infomaniakCalendarDisconnectFailed"),
      disconnectedEnvTokenRemains: t("sources.infomaniakCalendarDisconnectClearedButEnvRemains"),
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
        id="sources-infomaniak-calendar"
        title={t("sources.infomaniakCalendarTitle")}
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
              sourceName={t("sources.infomaniakCalendarTitle")}
              connected={effectivelyConnected}
              loading={loadingStatus}
              busy={oauthBusy}
              onConnect={() => setShowTokenGuide(true)}
              onDisconnect={() => {
                void (async () => {
                  if (hasPersonalToken && window.electronAPI) {
                    await window.electronAPI.integrationClearInfomaniakApiToken();
                    refreshPersonalTokenState();
                    notifyInfomaniakDriveIntegrationChanged();
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
          refreshEvent={INFOMANIAK_CALENDAR_INTEGRATION_CHANGED_EVENT}
        />
      </ExternalSourceCard>

      {showTokenGuide && (
        <InfomaniakTokenSetupModal
          scopePreset="calendar"
          onClose={() => setShowTokenGuide(false)}
          onTokenSaved={() => {
            refreshPersonalTokenState();
            notifyInfomaniakDriveIntegrationChanged();
          }}
        />
      )}
    </>
  );
}
