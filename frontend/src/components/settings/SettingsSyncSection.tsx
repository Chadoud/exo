/**
 * Settings → Sync — E2E encrypted multi-device sync (GO SYNC).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "../../i18n/I18nContext";
import { isStaleTrialSyncError, syncLastErrorKind } from "../../utils/syncLastErrorCopy";
import ExoAppIcon from "../ExoAppIcon";
import ProUpgradeCard from "../ProUpgradeCard";
import { pairingErrorMessage } from "./pairingErrorMessage";
import { usePairingQr } from "./usePairingQr";

interface SyncStatus {
  enabled?: boolean;
  lastRunAt?: string | null;
  lastSuccessfulSyncAt?: string | null;
  lastError?: string | null;
  pendingCount?: number;
  conflictCount?: number;
}

interface Props {
  canUseSync: boolean;
  licensed?: boolean;
  onUpgrade: () => void;
}

function syncErrorLine(
  lastError: string | null | undefined,
  licensed: boolean,
  trialEndedCopy: string,
  sessionExpiredCopy: string,
): string | null {
  const kind = syncLastErrorKind(lastError, licensed);
  if (kind === "hidden" || kind === "stale_trial_retry") return null;
  if (kind === "trial_ended") return trialEndedCopy;
  if (kind === "session_expired") return sessionExpiredCopy;
  return lastError?.trim() || null;
}

export default function SettingsSyncSection({ canUseSync, licensed = false, onUpgrade }: Props) {
  const { t } = useI18n();
  const [status, setStatus] = useState<SyncStatus>({});
  const [busy, setBusy] = useState(false);
  const retriedStaleTrialError = useRef(false);
  const [copyHint, setCopyHint] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const api = window.electronAPI;
    if (!api?.syncGetStatus) return;
    const s = await api.syncGetStatus();
    setStatus(s ?? {});
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const hasSyncedOnce = Boolean(status.lastSuccessfulSyncAt);
  const { pairQrDataUrl, pairError } = usePairingQr(hasSyncedOnce);

  const runNow = useCallback(async () => {
    const api = window.electronAPI;
    if (!api?.syncRunNow) return;
    setBusy(true);
    try {
      await api.syncRunNow();
      await refresh();
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  useEffect(() => {
    if (!isStaleTrialSyncError(status.lastError, licensed) || retriedStaleTrialError.current) {
      return;
    }
    retriedStaleTrialError.current = true;
    void runNow();
  }, [licensed, status.lastError, runNow]);

  const copyPairing = async () => {
    if (!hasSyncedOnce) {
      setCopyHint(t("sync.pairSyncFirst"));
      return;
    }
    const api = window.electronAPI;
    if (!api?.syncCopyPairingPayload) {
      setCopyHint(t("sync.pairCopyError"));
      return;
    }
    setBusy(true);
    setCopyHint(null);
    try {
      const result = await api.syncCopyPairingPayload();
      if (result && result.ok === true) {
        setCopyHint(t("sync.pairCopied"));
        return;
      }
      setCopyHint(
        pairingErrorMessage(
          result,
          t("sync.pairCopyError"),
          t("sync.pairKeyUnreadable"),
          t("sync.pairSessionExpired"),
        ),
      );
    } catch {
      setCopyHint(t("sync.pairCopyError"));
    } finally {
      setBusy(false);
    }
  };

  const syncErrorDetail = syncErrorLine(
    status.lastError,
    licensed,
    t("sync.errorTrialEnded"),
    t("sync.errorSessionExpired"),
  );

  if (!canUseSync) {
    return (
      <section className="space-y-3" data-tour="settings-sync">
        <h3 className="text-sm font-semibold text-text-primary">{t("sync.settingsTitle")}</h3>
        <ProUpgradeCard
          description={`${t("sync.proTitle")} — ${t("sync.proBody")}`}
          onUpgrade={onUpgrade}
        />
      </section>
    );
  }

  return (
    <section className="space-y-3 rounded-xl border border-border bg-bg-card p-4" data-tour="settings-sync">
      <div className="space-y-3 text-xs text-text-secondary">
        <p>
          {status.lastRunAt
            ? t("sync.lastRun").replace("{time}", new Date(status.lastRunAt).toLocaleString())
            : t("sync.neverRun")}
        </p>
        {syncErrorDetail ? (
          <p className="text-red-500">
            {t("sync.errorPrefix")} {syncErrorDetail}
          </p>
        ) : null}
        <button type="button" disabled={busy} onClick={() => void runNow()} className="text-accent hover:underline">
          {t("sync.runNow")}
        </button>
        <div className="rounded-lg border border-border bg-bg-primary/40 p-3">
          <div className="flex items-center gap-2.5">
            <ExoAppIcon decorative />
            <p className="text-xs font-medium text-text-primary">{t("sync.pairTitle")}</p>
          </div>
          <p className="mt-1 text-[11px] text-muted">
            {hasSyncedOnce && !pairError ? t("sync.pairHint") : t("sync.pairSyncFirst")}
          </p>
          {pairError ? <p className="mt-2 text-[11px] text-red-500">{pairError}</p> : null}
          {hasSyncedOnce && pairQrDataUrl && !pairError ? (
            <img
              src={pairQrDataUrl}
              alt={t("sync.pairTitle")}
              className="mt-3 h-[220px] w-[220px] rounded-md bg-white p-2"
            />
          ) : null}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={busy || !hasSyncedOnce}
              onClick={() => void copyPairing()}
              className="inline-flex min-h-10 items-center rounded-lg border border-border bg-bg-card px-3 py-2 text-xs font-medium text-text-primary hover:bg-hover-overlay disabled:opacity-50"
            >
              {t("sync.pairCopy")}
            </button>
            {copyHint ? <p className="text-[11px] text-muted">{copyHint}</p> : null}
          </div>
        </div>
      </div>
    </section>
  );
}
