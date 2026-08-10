/**
 * Settings → Sync — E2E encrypted multi-device sync (GO SYNC).
 */

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "../../i18n/I18nContext";
import ProUpgradeCard from "../ProUpgradeCard";

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
  onUpgrade: () => void;
}

function pairingErrorMessage(
  result: unknown,
  fallback: string,
  keyUnreadable?: string,
  sessionExpired?: string,
): string {
  if (result && typeof result === "object" && "error" in result) {
    const err = (result as { error?: unknown }).error;
    if (typeof err === "string" && err.trim()) {
      if (err.includes("sync_master_key_unreadable") && keyUnreadable) {
        return keyUnreadable;
      }
      // Cloud JWT rejected when minting a pairing grant.
      if (
        sessionExpired &&
        (err.includes("invalid_token") ||
          err.includes("missing_token") ||
          err.includes("not_logged_in") ||
          err.includes("401"))
      ) {
        return sessionExpired;
      }
      return `${fallback} (${err.trim()})`;
    }
  }
  return fallback;
}

export default function SettingsSyncSection({ canUseSync, onUpgrade }: Props) {
  const { t } = useI18n();
  const [status, setStatus] = useState<SyncStatus>({});
  const [busy, setBusy] = useState(false);
  const [pairQrDataUrl, setPairQrDataUrl] = useState<string | null>(null);
  const [pairError, setPairError] = useState<string | null>(null);
  const [copyHint, setCopyHint] = useState<string | null>(null);
  const [pairRetryTick, setPairRetryTick] = useState(0);

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

  useEffect(() => {
    if (!status.enabled) {
      setPairQrDataUrl(null);
      setPairError(null);
      setCopyHint(null);
      return;
    }
    // Do not mint a pairing QR until desktop has synced at least once.
    if (!hasSyncedOnce) {
      setPairQrDataUrl(null);
      setPairError(null);
      return;
    }
    const api = window.electronAPI;
    if (!api?.syncGetPairingQr) {
      setPairQrDataUrl(null);
      setPairError(t("sync.pairQrError"));
      return;
    }
    const getPairingQr = api.syncGetPairingQr;
    void (async () => {
      try {
        const result = await getPairingQr();
        if (result && "dataUrl" in result && typeof result.dataUrl === "string") {
          setPairQrDataUrl(result.dataUrl);
          setPairError(null);
          return;
        }
        setPairQrDataUrl(null);
        setPairError(
          pairingErrorMessage(
            result,
            t("sync.pairQrError"),
            t("sync.pairKeyUnreadable"),
            t("sync.pairSessionExpired"),
          ),
        );
      } catch {
        setPairQrDataUrl(null);
        setPairError(t("sync.pairQrError"));
      }
    })();
  }, [status.enabled, hasSyncedOnce, t, pairRetryTick]);

  const toggle = async () => {
    if (!canUseSync) return;
    const api = window.electronAPI;
    if (!api?.syncSetEnabled) return;
    setBusy(true);
    setCopyHint(null);
    setPairError(null);
    try {
      const result = await api.syncSetEnabled(!status.enabled);
      if (
        result &&
        typeof result === "object" &&
        "ok" in result &&
        (result as { ok?: unknown }).ok === false
      ) {
        setPairError(
          pairingErrorMessage(
            result,
            t("sync.pairQrError"),
            t("sync.pairKeyUnreadable"),
            t("sync.pairSessionExpired"),
          ),
        );
        return;
      }
      await refresh();
    } catch {
      setPairError(t("sync.pairQrError"));
    } finally {
      setBusy(false);
    }
  };

  const runNow = async () => {
    const api = window.electronAPI;
    if (!api?.syncRunNow) return;
    setBusy(true);
    try {
      await api.syncRunNow();
      await refresh();
    } finally {
      setBusy(false);
    }
  };

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
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">{t("sync.settingsTitle")}</h3>
          <p className="mt-0.5 text-xs text-muted">{t("sync.settingsDesc")}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={Boolean(status.enabled)}
          disabled={busy}
          onClick={() => void toggle()}
          className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
            status.enabled ? "bg-accent" : "bg-border"
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
              status.enabled ? "translate-x-4" : "translate-x-0"
            }`}
          />
        </button>
      </div>
      {status.enabled ? (
        <div className="space-y-3 text-xs text-text-secondary">
          <p>{status.lastRunAt ? t("sync.lastRun").replace("{time}", new Date(status.lastRunAt).toLocaleString()) : t("sync.neverRun")}</p>
          {status.lastError ? <p className="text-red-500">{t("sync.errorPrefix")} {status.lastError}</p> : null}
          <button type="button" disabled={busy} onClick={() => void runNow()} className="text-accent hover:underline">
            {t("sync.runNow")}
          </button>
          <div className="rounded-lg border border-border bg-bg-primary/40 p-3">
            <p className="text-xs font-medium text-text-primary">{t("sync.pairTitle")}</p>
            <p className="mt-1 text-[11px] text-muted">
              {hasSyncedOnce ? t("sync.pairHint") : t("sync.pairSyncFirst")}
            </p>
            {pairError ? <p className="mt-2 text-[11px] text-red-500">{pairError}</p> : null}
            {hasSyncedOnce && pairQrDataUrl ? (
              <img src={pairQrDataUrl} alt="" className="mt-3 h-[220px] w-[220px] rounded-md bg-white p-2" />
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
              {hasSyncedOnce ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setCopyHint(null);
                    setPairRetryTick((n) => n + 1);
                  }}
                  className="inline-flex min-h-10 items-center rounded-lg border border-border bg-bg-card px-3 py-2 text-xs font-medium text-text-primary hover:bg-hover-overlay disabled:opacity-50"
                >
                  {t("sync.pairRetry")}
                </button>
              ) : null}
              {copyHint ? <p className="text-[11px] text-muted">{copyHint}</p> : null}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
