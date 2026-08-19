import { type ReactNode } from "react";
import { useI18n } from "../../i18n/I18nContext";
import ExternalSourceCard from "./ExternalSourceCard";
import ExternalSourceConnectionButton from "./ExternalSourceConnectionButton";
import { externalSourceConnectionPill } from "./externalSourceConnectionPill";
import { externalSourceConnectDisabled } from "../../utils/externalSourceConnectUi";
import { useDesktopOAuthCardState } from "../../hooks/useDesktopOAuthCardState";
import SourceAccountLine from "./SourceAccountLine";

const PROVIDER_ID = "dropbox";

/** Custom event fired after any Dropbox connect/disconnect so sibling components can re-check status. */
export const DROPBOX_INTEGRATION_CHANGED_EVENT = "exosites:dropbox-integration-changed";

interface DropboxConnectionSectionProps {
  backendOnline: boolean;
  brandIcon: ReactNode;
  compact?: boolean;
}

/**
 * Dropbox OAuth card (desktop only). Separate from Google and Microsoft connections.
 */
export default function DropboxConnectionSection({
  backendOnline,
  brandIcon,
  compact = false,
}: DropboxConnectionSectionProps) {
  const { t } = useI18n();
  const { desktop, connected, loadingStatus, oauthBusy, connect, disconnect } =
    useDesktopOAuthCardState({
      providerId: PROVIDER_ID,
      integrationChangedEvent: DROPBOX_INTEGRATION_CHANGED_EVENT,
      i18n: {
        connectSuccess: t("sources.dropboxConnectSuccess"),
        connectFailed: t("sources.dropboxConnectFailed"),
        disconnected: t("sources.dropboxDisconnected"),
        disconnectFailed: t("sources.dropboxDisconnectFailed"),
      },
    });

  const { statusLabel, statusTone } = externalSourceConnectionPill(connected, loadingStatus, t);

  return (
    <ExternalSourceCard
      id="sources-dropbox"
      title={t("sources.dropboxTitle")}
      brandIcon={brandIcon}
      statusLabel={statusLabel}
      statusTone={statusTone}
      compact={compact}
      actions={
        desktop ? (
          <ExternalSourceConnectionButton
            sourceName={t("sources.dropboxTitle")}
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
    >
      <SourceAccountLine
        providerId={PROVIDER_ID}
        connected={connected}
        backendOnline={backendOnline}
        desktop={desktop}
        refreshEvent={DROPBOX_INTEGRATION_CHANGED_EVENT}
      />
    </ExternalSourceCard>
  );
}
