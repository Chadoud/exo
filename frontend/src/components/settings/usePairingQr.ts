import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "../../i18n/I18nContext";
import { pairingErrorMessage } from "./pairingErrorMessage";

/** Remint before the cloud grant expires (cloud TTL is 30 minutes). */
const PAIRING_REFRESH_SKEW_MS = 90_000;
const MIN_REFRESH_DELAY_MS = 5_000;
/** setTimeout is a signed 32-bit delay; cap so a bad expiresAt cannot fire immediately. */
const MAX_TIMEOUT_MS = 2_147_483_647;

export function usePairingQr(hasSyncedOnce: boolean): {
  pairQrDataUrl: string | null;
  pairError: string | null;
} {
  const { t } = useI18n();
  const [pairQrDataUrl, setPairQrDataUrl] = useState<string | null>(null);
  const [pairError, setPairError] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const hadQrRef = useRef(false);

  const loadQr = useCallback(async () => {
    if (!hasSyncedOnce) {
      hadQrRef.current = false;
      setPairQrDataUrl(null);
      setPairError(null);
      setExpiresAt(null);
      return;
    }
    const api = window.electronAPI;
    if (!api?.syncGetPairingQr) {
      hadQrRef.current = false;
      setPairQrDataUrl(null);
      setExpiresAt(null);
      setPairError(t("sync.pairQrError"));
      return;
    }
    const getPairingQr = api.syncGetPairingQr;
    try {
      const result = await getPairingQr();
      if (result && "dataUrl" in result && typeof result.dataUrl === "string") {
        hadQrRef.current = true;
        setPairQrDataUrl(result.dataUrl);
        setPairError(null);
        setExpiresAt(typeof result.expiresAt === "string" ? result.expiresAt : null);
        return;
      }
      hadQrRef.current = false;
      setPairQrDataUrl(null);
      setExpiresAt(null);
      setPairError(
        pairingErrorMessage(
          result,
          t("sync.pairQrError"),
          t("sync.pairKeyUnreadable"),
          t("sync.pairSessionExpired"),
        ),
      );
    } catch {
      hadQrRef.current = false;
      setPairQrDataUrl(null);
      setExpiresAt(null);
      setPairError(t("sync.pairQrError"));
    }
  }, [hasSyncedOnce, t]);

  useEffect(() => {
    void loadQr();
  }, [loadQr]);

  useEffect(() => {
    if (!hasSyncedOnce || !expiresAt) return;
    const expiresMs = Date.parse(expiresAt);
    if (!Number.isFinite(expiresMs)) return;
    const delay = Math.min(
      MAX_TIMEOUT_MS,
      Math.max(MIN_REFRESH_DELAY_MS, expiresMs - Date.now() - PAIRING_REFRESH_SKEW_MS),
    );
    const id = window.setTimeout(() => {
      void loadQr();
    }, delay);
    return () => window.clearTimeout(id);
  }, [expiresAt, hasSyncedOnce, loadQr]);

  useEffect(() => {
    if (!hasSyncedOnce) return;
    const onShown = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      void loadQr();
    };
    document.addEventListener("visibilitychange", onShown);
    window.addEventListener("focus", onShown);
    return () => {
      document.removeEventListener("visibilitychange", onShown);
      window.removeEventListener("focus", onShown);
    };
  }, [hasSyncedOnce, loadQr]);

  return { pairQrDataUrl, pairError };
}
