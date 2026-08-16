import { type ReactNode, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useI18n } from "../../i18n/I18nContext";
import ExternalSourceCard, {
  EXTERNAL_SOURCE_CARD_PRIMARY_ACTION_CLASS,
  EXTERNAL_SOURCE_CARD_SECONDARY_ACTION_CLASS,
} from "./ExternalSourceCard";
import ExternalSourceConnectionButton from "./ExternalSourceConnectionButton";
import { externalSourceConnectionPill } from "./externalSourceConnectionPill";

const PROVIDER_ID = "s3";
const S3_INTEGRATION_CHANGED_EVENT = "exosites:s3-integration-changed";

function notifyS3IntegrationChanged() {
  window.dispatchEvent(new CustomEvent(S3_INTEGRATION_CHANGED_EVENT));
}

interface S3ConnectionSectionProps {
  backendOnline: boolean;
  brandIcon: ReactNode;
  compact?: boolean;
}

/**
 * S3 credentials form — no OAuth. User enters access key, secret, region, bucket.
 */
export default function S3ConnectionSection({
  backendOnline: _backendOnline,
  brandIcon,
  compact = false,
}: S3ConnectionSectionProps) {
  void _backendOnline;
  const { t } = useI18n();
  const desktop = Boolean(window.electronAPI);

  const [connected, setConnected] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [fields, setFields] = useState({
    access_key: "",
    secret_key: "",
    region: "",
    bucket: "",
    prefix: "",
  });

  const loadStatus = useCallback(async () => {
    if (!window.electronAPI) { setLoadingStatus(false); return; }
    setLoadingStatus(true);
    try {
      const result = await window.electronAPI.integrationGetAccounts();
      if (result.ok) {
        const account = result.accounts?.find((a: { providerId: string; connected: boolean }) => a.providerId === PROVIDER_ID);
        setConnected(account?.connected ?? false);
      }
    } finally {
      setLoadingStatus(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
    const handler = () => void loadStatus();
    window.addEventListener(S3_INTEGRATION_CHANGED_EVENT, handler);
    return () => window.removeEventListener(S3_INTEGRATION_CHANGED_EVENT, handler);
  }, [loadStatus]);

  const handleSave = useCallback(async () => {
    if (!window.electronAPI) return;
    if (!fields.access_key.trim() || !fields.secret_key.trim() || !fields.region.trim() || !fields.bucket.trim()) {
      toast.error(t("sources.s3MissingFields"));
      return;
    }
    setBusy(true);
    try {
      const result = await window.electronAPI.integrationSaveS3Credentials(fields);
      if (result.ok) {
        toast.success(t("sources.s3SaveSuccess"));
        setShowForm(false);
        notifyS3IntegrationChanged();
        await loadStatus();
      } else {
        toast.error(t("sources.s3SaveFailed"));
      }
    } finally {
      setBusy(false);
    }
  }, [fields, loadStatus, t]);

  const handleDisconnect = useCallback(async () => {
    if (!window.electronAPI) return;
    setBusy(true);
    try {
      await window.electronAPI.integrationDisconnect({ providerId: PROVIDER_ID });
      toast.success(t("sources.s3Disconnected"));
      notifyS3IntegrationChanged();
      await loadStatus();
    } finally {
      setBusy(false);
    }
  }, [loadStatus, t]);

  const { statusLabel, statusTone } = externalSourceConnectionPill(connected, loadingStatus, t);

  return (
    <ExternalSourceCard
      id="sources-s3"
      title={t("sources.s3Title")}
      brandIcon={brandIcon}
      statusLabel={statusLabel}
      statusTone={statusTone}
      compact={compact}
      actions={
        desktop && showForm ? (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleSave()}
              className={EXTERNAL_SOURCE_CARD_PRIMARY_ACTION_CLASS}
            >
              {t("sources.s3Save")}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className={EXTERNAL_SOURCE_CARD_SECONDARY_ACTION_CLASS}
            >
              {t("sources.s3Cancel")}
            </button>
          </>
        ) : desktop && !showForm ? (
          <ExternalSourceConnectionButton
            sourceName={t("sources.s3Title")}
            connected={connected}
            loading={loadingStatus}
            busy={busy}
            onConnect={() => setShowForm(true)}
            onDisconnect={() => void handleDisconnect()}
            onNotConnectedClick={() => setShowForm(true)}
          />
        ) : undefined
      }
    >
      {desktop && showForm ? (
        <div className="flex flex-col gap-2 pt-1">
          {(["access_key", "secret_key", "region", "bucket", "prefix"] as const).map((field) => (
            <div key={field} className="flex flex-col gap-0.5">
              <label className="text-xs text-muted">{t(`sources.s3Field_${field}`)}</label>
              <input
                type={field === "secret_key" ? "password" : "text"}
                value={fields[field]}
                onChange={(e) => setFields((prev) => ({ ...prev, [field]: e.target.value }))}
                placeholder={t(`sources.s3FieldHint_${field}`)}
                className="text-sm px-2.5 py-1.5 rounded-lg border border-border bg-surface text-text-primary focus:outline-none focus:border-accent placeholder:text-muted"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
              />
            </div>
          ))}
        </div>
      ) : null}
    </ExternalSourceCard>
  );
}
