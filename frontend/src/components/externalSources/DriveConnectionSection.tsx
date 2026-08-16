import { type ReactNode } from "react";
import { EXOSITES_GOOGLE_INTEGRATION_CHANGED_EVENT } from "../../utils/platform";
import { useI18n } from "../../i18n/I18nContext";
import ExternalSourceCard from "./ExternalSourceCard";
import ExternalSourceConnectionButton from "./ExternalSourceConnectionButton";
import { externalSourceConnectionPill } from "./externalSourceConnectionPill";
import { externalSourceConnectDisabled } from "../../utils/externalSourceConnectUi";
import { useDesktopOAuthCardState } from "../../hooks/useDesktopOAuthCardState";

const PROVIDER_ID = "google-drive";

interface DriveConnectionSectionProps {
  backendOnline: boolean;
  brandIcon: ReactNode;
  compact?: boolean;
}

/**
 * Google Drive OAuth card (desktop only for listing/import). Separate Gmail sign-in on its own card.
 */
export default function DriveConnectionSection({
  backendOnline: _backendOnline,
  brandIcon,
  compact = false,
}: DriveConnectionSectionProps) {
  void _backendOnline;
  const { t } = useI18n();
  const { desktop, connected, loadingStatus, oauthBusy, connect, disconnect } =
    useDesktopOAuthCardState({
      providerId: PROVIDER_ID,
      integrationChangedEvent: EXOSITES_GOOGLE_INTEGRATION_CHANGED_EVENT,
      i18n: {
        connectSuccess: t("sources.driveConnectSuccess"),
        connectFailed: t("sources.driveConnectFailed"),
        disconnected: t("sources.driveDisconnected"),
        disconnectFailed: t("sources.driveDisconnectFailed"),
      },
    });

  const { statusLabel, statusTone } = externalSourceConnectionPill(connected, loadingStatus, t);

  return (
    <ExternalSourceCard
      id="sources-google-drive"
      title={t("sources.driveTitle")}
      brandIcon={brandIcon}
      statusLabel={statusLabel}
      statusTone={statusTone}
      compact={compact}
      actions={
        desktop ? (
          <ExternalSourceConnectionButton
            sourceName={t("sources.driveTitle")}
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
