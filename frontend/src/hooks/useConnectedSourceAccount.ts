import { useEffect, useState } from "react";
import { gmailStatus } from "../api/gmail";

function trimEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim();
  return email || null;
}

async function probeDesktopEmail(
  providerId: string,
): Promise<{ email: string | null; failed: boolean }> {
  if (!window.electronAPI?.integrationHealthCheck) {
    return { email: null, failed: false };
  }
  try {
    const health = await window.electronAPI.integrationHealthCheck({ providerId });
    const email = trimEmail(health.email);
    if (health.ok === false) return { email: null, failed: true };
    if (email) return { email, failed: false };
    // Gmail always has a mailbox; other providers may only confirm the token.
    return { email: null, failed: providerId === "google-gmail" };
  } catch {
    return { email: null, failed: true };
  }
}

async function probeGmailStatusEmail(): Promise<{ email: string | null; failed: boolean }> {
  try {
    const status = await gmailStatus();
    const email = trimEmail(status.email);
    return { email, failed: !email && status.connected };
  } catch {
    return { email: null, failed: true };
  }
}

/**
 * Live account address for an External sources card.
 * Desktop uses IPC health. Gmail on web also probes /gmail/status. Does not persist.
 */
export function useConnectedSourceAccount(input: {
  providerId: string;
  connected: boolean;
  backendOnline: boolean;
  desktop: boolean;
  /** Re-probe after connect/disconnect without flipping `connected`. */
  refreshEvent?: string;
}): { email: string | null; probeFailed: boolean } {
  const [email, setEmail] = useState<string | null>(null);
  const [probeFailed, setProbeFailed] = useState(false);

  useEffect(() => {
    if (!input.connected) {
      setEmail(null);
      setProbeFailed(false);
      return;
    }

    let cancelled = false;
    const load = async () => {
      let found: string | null = null;
      let failed = false;
      if (input.desktop) {
        const desktop = await probeDesktopEmail(input.providerId);
        found = desktop.email;
        failed = desktop.failed;
      }
      if (!found && input.providerId === "google-gmail" && input.backendOnline) {
        const status = await probeGmailStatusEmail();
        found = status.email;
        failed = status.failed || failed;
      }
      if (cancelled) return;
      setEmail(found);
      setProbeFailed(!found && failed);
    };

    const onRefresh = () => {
      void load();
    };
    void load();
    if (input.refreshEvent) {
      window.addEventListener(input.refreshEvent, onRefresh);
    }
    return () => {
      cancelled = true;
      if (input.refreshEvent) {
        window.removeEventListener(input.refreshEvent, onRefresh);
      }
    };
  }, [input.connected, input.backendOnline, input.desktop, input.providerId, input.refreshEvent]);

  return { email, probeFailed };
}
