import { type ReactNode } from "react";
import { EXOSITES_GOOGLE_INTEGRATION_CHANGED_EVENT } from "../../utils/platform";
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

const PROVIDER_ID = "google-calendar";

interface GoogleCalendarConnectionSectionProps {
  backendOnline: boolean;
  brandIcon: ReactNode;
  compact?: boolean;
}

/**
 * Google Calendar OAuth slot (read-only assistant tools). Separate from Gmail and Drive.
 */
export default function GoogleCalendarConnectionSection({
  backendOnline,
  brandIcon,
  compact = false,
}: GoogleCalendarConnectionSectionProps) {
  const { t } = useI18n();
  const { desktop, connected, loadingStatus, oauthBusy, connect, disconnect } =
    useDesktopOAuthCardState({
      providerId: PROVIDER_ID,
      integrationChangedEvent: EXOSITES_GOOGLE_INTEGRATION_CHANGED_EVENT,
      onConnected: () => {
        if (backendOnline) refreshIntegrationTasksBestEffort();
      },
      onDisconnected: () => {
        if (backendOnline) void forgetIntegrationSourcesBestEffort(["google-calendar"]);
      },
      i18n: {
        connectSuccess: t("sources.googleCalendarConnectSuccess"),
        connectFailed: t("sources.googleCalendarConnectFailed"),
        disconnected: t("sources.googleCalendarDisconnected"),
        disconnectFailed: t("sources.googleCalendarDisconnectFailed"),
      },
    });

  const { statusLabel, statusTone } = externalSourceConnectionPill(connected, loadingStatus, t);

  return (
    <ExternalSourceCard
      id="sources-google-calendar"
      title={t("sources.googleCalendarTitle")}
      brandIcon={brandIcon}
      statusLabel={statusLabel}
      statusTone={statusTone}
      compact={compact}
      actions={
        desktop ? (
          <ExternalSourceConnectionButton
            sourceName={t("sources.googleCalendarTitle")}
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
        refreshEvent={EXOSITES_GOOGLE_INTEGRATION_CHANGED_EVENT}
      />
    </ExternalSourceCard>
  );
}
