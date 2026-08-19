import { type ReactNode } from "react";
import { useI18n } from "../../i18n/I18nContext";
import ExternalSourceCard from "./ExternalSourceCard";
import ExternalSourceConnectionButton from "./ExternalSourceConnectionButton";
import { externalSourceConnectionPill } from "./externalSourceConnectionPill";
import { externalSourceConnectDisabled } from "../../utils/externalSourceConnectUi";
import { useDesktopOAuthCardState } from "../../hooks/useDesktopOAuthCardState";
import {
  forgetIntegrationSourcesBestEffort,
  refreshIntegrationTasksBestEffort,
} from "../../utils/forgetIntegrationTasks";
import SourceAccountLine from "./SourceAccountLine";

const PROVIDER_ID = "onedrive";

/** Custom event fired after any Microsoft connect/disconnect so all MS-backed components can re-check. */
export const MICROSOFT_INTEGRATION_CHANGED_EVENT = "exosites:microsoft-integration-changed";

export function notifyMicrosoftIntegrationChanged() {
  window.dispatchEvent(new CustomEvent(MICROSOFT_INTEGRATION_CHANGED_EVENT));
}

interface OneDriveConnectionSectionProps {
  backendOnline: boolean;
  brandIcon: ReactNode;
  compact?: boolean;
}

/**
 * OneDrive OAuth card (desktop only). Uses the Microsoft OAuth slot registered in Azure.
 */
export default function OneDriveConnectionSection({
  backendOnline,
  brandIcon,
  compact = false,
}: OneDriveConnectionSectionProps) {
  const { t } = useI18n();
  const { desktop, connected, loadingStatus, oauthBusy, connect, disconnect } =
    useDesktopOAuthCardState({
      providerId: PROVIDER_ID,
      integrationChangedEvent: MICROSOFT_INTEGRATION_CHANGED_EVENT,
      onConnected: () => {
        if (backendOnline) refreshIntegrationTasksBestEffort();
      },
      onDisconnected: () => {
        if (backendOnline) {
          void forgetIntegrationSourcesBestEffort(["outlook", "outlook-calendar"]);
        }
      },
      i18n: {
        connectSuccess: t("sources.oneDriveConnectSuccess"),
        connectFailed: t("sources.oneDriveConnectFailed"),
        disconnected: t("sources.oneDriveDisconnected"),
        disconnectFailed: t("sources.oneDriveDisconnectFailed"),
      },
    });

  const { statusLabel, statusTone } = externalSourceConnectionPill(connected, loadingStatus, t);

  return (
    <ExternalSourceCard
      id="sources-onedrive"
      title={t("sources.oneDriveTitle")}
      brandIcon={brandIcon}
      statusLabel={statusLabel}
      statusTone={statusTone}
      compact={compact}
      actions={
        desktop ? (
          <ExternalSourceConnectionButton
            sourceName={t("sources.oneDriveTitle")}
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
        refreshEvent={MICROSOFT_INTEGRATION_CHANGED_EVENT}
      />
    </ExternalSourceCard>
  );
}
