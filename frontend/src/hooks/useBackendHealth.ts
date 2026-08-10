import { useCallback, useState, useEffect } from "react";
import { api } from "../api";
import {
  HEALTH_POLL_INTERVAL_MS,
  HEALTH_FAST_RETRIES,
  HEALTH_FAST_INTERVAL_MS,
  HEALTH_FAST_RETRIES_ELECTRON,
  HEALTH_FAST_INTERVAL_ELECTRON_MS,
} from "../constants";
import { hasEntitlementIpc } from "../utils/electronDesktop";

type BackendStatusReason = "starting" | "foreign_process" | "exited" | "health_timeout" | "skip_backend" | string | undefined;

function isDefinitiveBackendFailure(reason: BackendStatusReason): boolean {
  return reason === "foreign_process" || reason === "exited" || reason === "health_timeout";
}

export function useBackendHealth() {
  const [backendOnline, setBackendOnline] = useState(false);
  /** Unix ms of last successful /health (client-side only). */
  const [lastHealthOkAt, setLastHealthOkAt] = useState<number | null>(null);
  /** True during startup until the local service is online or definitively failed (desktop keeps this through cold start). */
  const [backendHealthProbing, setBackendHealthProbing] = useState(true);
  /** Managed backend child is running but /health is not ready yet (PyInstaller cold start). */
  const [backendServiceStarting, setBackendServiceStarting] = useState(false);
  /** Packaged desktop: local service failed to start — show recovery UI instead of infinite spinner. */
  const [backendStartupFailed, setBackendStartupFailed] = useState(false);

  const markStartupFailed = useCallback(() => {
    setBackendStartupFailed(true);
    setBackendHealthProbing(false);
    setBackendServiceStarting(false);
  }, []);

  const beginBackendStartupProbe = useCallback(() => {
    setBackendStartupFailed(false);
    setBackendHealthProbing(true);
    setBackendServiceStarting(true);
    setBackendOnline(false);
  }, []);

  useEffect(() => {
    let stopped = false;
    let pollId: number | null = null;
    let gotOnline = false;
    let definitiveFailure = false;
    const useManagedCheck =
      hasEntitlementIpc() && typeof window.electronAPI?.getBackendStatus === "function";
    const fastRetries = import.meta.env.DEV
      ? 80
      : useManagedCheck
        ? HEALTH_FAST_RETRIES_ELECTRON
        : HEALTH_FAST_RETRIES;
    const fastIntervalMs =
      useManagedCheck && !import.meta.env.DEV
        ? HEALTH_FAST_INTERVAL_ELECTRON_MS
        : HEALTH_FAST_INTERVAL_MS;

    const finishStartupProbe = () => {
      if (stopped) return;
      setBackendHealthProbing(false);
      setBackendServiceStarting(false);
    };

    const applyStatusReason = (reason: BackendStatusReason) => {
      if (stopped) return;
      setBackendServiceStarting(reason === "starting");
    };

    const check = async (): Promise<"ok" | "retry" | "failed"> => {
      const getStatus = window.electronAPI?.getBackendStatus;
      if (typeof getStatus === "function") {
        try {
          const status = await getStatus();
          applyStatusReason(status?.reason);
          if (status?.ok) {
            gotOnline = true;
            if (!stopped) {
              setBackendOnline(true);
              setLastHealthOkAt(Date.now());
              setBackendStartupFailed(false);
            }
            finishStartupProbe();
            return "ok";
          }
          if (!stopped) setBackendOnline(false);
          if (isDefinitiveBackendFailure(status?.reason)) {
            definitiveFailure = true;
            if (!stopped) markStartupFailed();
            return "failed";
          }
          return "retry";
        } catch {
          if (!stopped) {
            setBackendOnline(false);
            setBackendServiceStarting(false);
          }
          return "retry";
        }
      }

      try {
        await api.health();
        gotOnline = true;
        if (!stopped) {
          setBackendOnline(true);
          setLastHealthOkAt(Date.now());
          setBackendStartupFailed(false);
        }
        finishStartupProbe();
        return "ok";
      } catch {
        if (!stopped) {
          setBackendOnline(false);
          setBackendServiceStarting(false);
        }
        return "retry";
      }
    };

    const unsubStartupFailed = window.electronAPI?.onBackendStartupFailed?.(() => {
      if (!stopped && !gotOnline) markStartupFailed();
    });

    void (async () => {
      try {
        for (let i = 0; i < fastRetries && !stopped; i++) {
          const result = await check();
          if (result === "ok" || result === "failed") break;
          await new Promise((r) => setTimeout(r, fastIntervalMs));
        }
      } finally {
        if (!stopped) {
          if (gotOnline || definitiveFailure) {
            finishStartupProbe();
          } else if (!useManagedCheck) {
            finishStartupProbe();
          } else {
            const status = await window.electronAPI?.getBackendStatus?.().catch(() => null);
            if (isDefinitiveBackendFailure(status?.reason)) {
              markStartupFailed();
            } else {
              setBackendServiceStarting(true);
              // Keep probing UI until the managed service is online (PyInstaller cold start).
            }
          }
        }
      }

      if (!stopped) {
        pollId = window.setInterval(() => {
          void check();
        }, HEALTH_POLL_INTERVAL_MS);
      }
    })();

    return () => {
      stopped = true;
      unsubStartupFailed?.();
      if (pollId !== null) window.clearInterval(pollId);
    };
  }, [markStartupFailed]);

  return {
    backendOnline,
    lastHealthOkAt,
    backendHealthProbing,
    backendServiceStarting,
    backendStartupFailed,
    beginBackendStartupProbe,
  };
}
