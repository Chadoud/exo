import { useCallback, useEffect, useRef } from "react";
import { api } from "../api";
import type { Job } from "../api";
import { POLL_INTERVAL_MS } from "../constants";

interface UseJobPollingArgs {
  onJob: (job: Job) => void;
  onTerminal: () => void;
  onError?: (err: Error) => void;
  /** When false, keep polling and do not latch the error toast. */
  shouldNotifyError?: () => boolean;
}

export function useJobPolling({ onJob, onTerminal, onError, shouldNotifyError }: UseJobPollingArgs) {
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const visibilityCleanupRef = useRef<(() => void) | null>(null);
  const inFlightRef = useRef(false);
  const errorNotifiedRef = useRef(false);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    visibilityCleanupRef.current?.();
    visibilityCleanupRef.current = null;
  }, []);

  const pollOnce = useCallback(
    async (jobId: string) => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      try {
        const job = await api.job(jobId);
        errorNotifiedRef.current = false;
        onJob(job);
        if (
          job.status === "done" ||
          job.status === "awaiting_approval" ||
          job.status === "cancelled"
        ) {
          stopPolling();
          onTerminal();
        }
      } catch (e) {
        if (shouldNotifyError && !shouldNotifyError()) {
          return;
        }
        if (!errorNotifiedRef.current) {
          errorNotifiedRef.current = true;
          onError?.(e instanceof Error ? e : new Error(String(e)));
        }
      } finally {
        inFlightRef.current = false;
      }
    },
    [onJob, onTerminal, onError, shouldNotifyError, stopPolling]
  );

  const startPolling = useCallback(
    (jobId: string) => {
      errorNotifiedRef.current = false;
      stopPolling();
      void pollOnce(jobId);
      pollRef.current = setInterval(() => pollOnce(jobId), POLL_INTERVAL_MS);

      // Fire an immediate catch-up poll when the tab becomes visible again
      const onVisibilityChange = () => {
        if (document.visibilityState === "visible" && pollRef.current !== null) {
          pollOnce(jobId);
        }
      };
      document.addEventListener("visibilitychange", onVisibilityChange);
      visibilityCleanupRef.current = () =>
        document.removeEventListener("visibilitychange", onVisibilityChange);
    },
    [pollOnce, stopPolling]
  );

  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  return { startPolling, stopPolling };
}
