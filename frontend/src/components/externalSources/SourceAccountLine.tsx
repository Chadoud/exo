import { useI18n } from "../../i18n/I18nContext";
import { useConnectedSourceAccount } from "../../hooks/useConnectedSourceAccount";
import { resolveGmailAccountLine } from "../../utils/gmailConnectedAccount";
import ExternalSourceAccountLine from "./ExternalSourceAccountLine";

interface SourceAccountLineProps {
  providerId: string;
  connected: boolean;
  backendOnline: boolean;
  desktop: boolean;
  refreshEvent?: string;
}

/** Connected account under an External sources title. Hidden until a live probe returns. */
export default function SourceAccountLine({
  providerId,
  connected,
  backendOnline,
  desktop,
  refreshEvent,
}: SourceAccountLineProps) {
  const { t } = useI18n();
  const { email, probeFailed } = useConnectedSourceAccount({
    providerId,
    connected,
    backendOnline,
    desktop,
    refreshEvent,
  });
  const line = resolveGmailAccountLine({ connected, email, probeFailed });
  return (
    <ExternalSourceAccountLine
      email={line.kind === "address" ? line.email : null}
      unknown={line.kind === "unknown"}
      unknownLabel={t("sources.gmailAccountUnknown")}
    />
  );
}
