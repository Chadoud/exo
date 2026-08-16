import { type ReactNode } from "react";
import { useI18n } from "../../i18n/I18nContext";
import ExternalSourceCard from "./ExternalSourceCard";
import ExternalSourceConnectionButton from "./ExternalSourceConnectionButton";
import { externalSourceConnectionPill } from "./externalSourceConnectionPill";
import { externalSourceConnectDisabled } from "../../utils/externalSourceConnectUi";
import { MICROSOFT_INTEGRATION_CHANGED_EVENT } from "./OneDriveConnectionSection";
import { useDesktopOAuthCardState } from "../../hooks/useDesktopOAuthCardState";

const PROVIDER_ID = "outlook";

interface OutlookConnectionSectionProps {
  backendOnline: boolean;
  brandIcon: ReactNode;
  compact?: boolean;
}

/**
 * Outlook OAuth card (desktop only).
 *
 * Shares the same Microsoft Azure app registration (and token store slot) as OneDrive.
 * Connecting either service logs in with the same PKCE flow; the session is valid for both.
 */
export default function OutlookConnectionSection({
  backendOnline: _backendOnline,
  brandIcon,
  compact = false,
}: OutlookConnectionSectionProps) {
  void _backendOnline;
  const { t } = useI18n();
  const { desktop, connected, loadingStatus, oauthBusy, connect, disconnect } =
    useDesktopOAuthCardState({
      providerId: PROVIDER_ID,
      integrationChangedEvent: MICROSOFT_INTEGRATION_CHANGED_EVENT,
      i18n: {
        connectSuccess: t("sources.outlookConnectSuccess"),
        connectFailed: t("sources.outlookConnectFailed"),
        disconnected: t("sources.outlookDisconnected"),
        disconnectFailed: t("sources.outlookDisconnectFailed"),
      },
    });

  const { statusLabel, statusTone } = externalSourceConnectionPill(connected, loadingStatus, t);

  return (
    <ExternalSourceCard
      id="sources-outlook"
      title={t("sources.outlookTitle")}
      brandIcon={brandIcon}
      statusLabel={statusLabel}
      statusTone={statusTone}
      compact={compact}
      actions={
        desktop ? (
          <ExternalSourceConnectionButton
            sourceName={t("sources.outlookTitle")}
            connected={connected}
            loading={loadingStatus}
            busy={oauthBusy}
            disabled={externalSourceConnectDisabled({
              connected,
              loading: loadingStatus,
              busy: oauthBusy,
              desktop: true,
            })}
            onConnect={() => void connect()}
            onDisconnect={() => void disconnect()}
          />
        ) : undefined
      }
    />
  );
}
