import { useCallback, useState } from "react";
import { copyTextToClipboard } from "../utils/clipboard";

type OpenExternalActionState = "idle" | "failed" | "copied";

/**
 * Opens an external URL via the Electron bridge, with a copy-link fallback when the
 * bridge is missing or the call rejects (e.g. no default browser configured).
 */
export function useOpenExternalAction(url: string) {
  const [state, setState] = useState<OpenExternalActionState>("idle");

  const open = useCallback(async () => {
    const bridge = window.electronAPI?.openExternal;
    if (!bridge) {
      setState("failed");
      return;
    }
    try {
      await bridge(url);
      setState("idle");
    } catch {
      setState("failed");
    }
  }, [url]);

  const copyLink = useCallback(async () => {
    const ok = await copyTextToClipboard(url);
    if (!ok) return;
    setState("copied");
    window.setTimeout(() => setState("failed"), 1500);
  }, [url]);

  return { state, open, copyLink };
}
