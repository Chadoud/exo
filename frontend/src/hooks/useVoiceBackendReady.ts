import { useCallback, useEffect, useRef, useState } from "react";
import type { AppSettings } from "../types/settings";
import { ensureVoiceBackendReady } from "../voice/ensureVoiceBackendReady";
import {
  snapshotFromEnsureResult,
  snapshotWhilePending,
  type VoiceReadinessSnapshot,
} from "../voice/voiceReadiness";

export const VOICE_READINESS_DEBOUNCE_MS = 200;

export type VoiceBackendReadiness = VoiceReadinessSnapshot & {
  refresh: () => void;
};

/**
 * Mirror Gemini settings into the backend process, then expose structured voice readiness.
 * Prefer this over raw GET /voice/status — avoids a race where the UI polls before sync finishes.
 */
export function useVoiceBackendReadiness(
  settings: AppSettings,
  backendOnline: boolean,
  settingsHydrated = true,
): VoiceBackendReadiness {
  const [snapshot, setSnapshot] = useState<VoiceReadinessSnapshot>(() =>
    snapshotWhilePending(settingsHydrated, backendOnline),
  );
  const [refreshNonce, setRefreshNonce] = useState(0);
  const generationRef = useRef(0);

  const refresh = useCallback(() => {
    setRefreshNonce((value) => value + 1);
  }, []);

  useEffect(() => {
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    setSnapshot(snapshotWhilePending(settingsHydrated, backendOnline));

    if (!settingsHydrated || !backendOnline) {
      return;
    }

    const timer = window.setTimeout(() => {
      void ensureVoiceBackendReady(settings, { backendOnline }).then((result) => {
        if (generation !== generationRef.current) return;
        setSnapshot(snapshotFromEnsureResult(result));
      });
    }, VOICE_READINESS_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    settingsHydrated,
    backendOnline,
    settings.geminiApiKey,
    settings.chatProviders?.gemini?.apiKey,
    refreshNonce,
  ]);

  return { ...snapshot, refresh };
}
