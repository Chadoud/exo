import { useCallback, useEffect, useState } from "react";
import { fetchMailReplies, fetchMailReplySettings, patchMailReplySettings } from "../../api/mailReplies";
import { useI18n } from "../../i18n/I18nContext";

interface GmailReplySuggestToggleProps {
  connected: boolean;
  backendOnline: boolean;
}

export default function GmailReplySuggestToggle({
  connected,
  backendOnline,
}: GmailReplySuggestToggleProps) {
  const { t } = useI18n();
  const [enabled, setEnabled] = useState(true);
  const [gated, setGated] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!backendOnline) return;
    try {
      const [settings, list] = await Promise.all([
        fetchMailReplySettings(),
        fetchMailReplies(),
      ]);
      setEnabled(settings.enabled);
      setGated(list.gated_reason);
    } catch {
      /* keep last-known toggle */
    }
  }, [backendOnline]);

  useEffect(() => {
    void refresh();
  }, [refresh, connected]);

  const missingScope = gated === "no_scope";
  const disabled = !connected || missingScope || busy || !backendOnline;

  const onChange = async (next: boolean) => {
    setBusy(true);
    setEnabled(next);
    try {
      const saved = await patchMailReplySettings(next);
      setEnabled(saved.enabled);
    } catch {
      setEnabled(!next);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-1">
      <label className="inline-flex min-h-8 items-center gap-2 text-xs text-text-primary">
        <input
          type="checkbox"
          className="rounded border-border text-accent focus:ring-accent"
          checked={enabled}
          disabled={disabled}
          onChange={(e) => void onChange(e.target.checked)}
        />
        <span>{t("settings.mailReply.toggleLabel")}</span>
      </label>
      <p className="text-2xs leading-snug text-muted">
        {missingScope || !connected
          ? t("settings.mailReply.reconnectHint")
          : t("settings.mailReply.toggleHint")}
      </p>
      {connected && !missingScope ? (
        <p className="text-2xs leading-snug text-muted">{t("settings.mailReply.firstCheck")}</p>
      ) : null}
    </div>
  );
}
