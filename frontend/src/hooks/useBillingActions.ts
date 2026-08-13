import { useCallback, useRef, useState } from "react";

/** Error codes surfaced by the billing IPC (electron/ipc/billingHandlers.js). */
type BillingErrorCode =
  | "not_logged_in"
  | "already_subscribed"
  | "no_stripe_customer"
  | "billing_not_configured"
  | "invalid_interval"
  | "rate_limited"
  | "offline"
  | "billing_error"
  | "untrusted_sender";

type BillingInterval = "monthly" | "annual";

export function hasBillingIpc(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.electronAPI?.billingCheckout === "function"
  );
}

/** i18n key for a billing error code (all under `billing.*`). */
export function billingErrorKey(code: BillingErrorCode | null): string {
  switch (code) {
    case "not_logged_in":
      return "billing.errorNotLoggedIn";
    case "already_subscribed":
      return "billing.errorAlreadySubscribed";
    case "billing_not_configured":
      return "billing.errorUnavailable";
    case "offline":
      return "billing.errorOffline";
    case "rate_limited":
      return "billing.errorRateLimited";
    default:
      return "billing.errorGeneric";
  }
}

/**
 * Launch Stripe Checkout / the Customer Portal from the renderer.
 * The system browser opens on success; errors surface as codes for i18n copy.
 */
export function useBillingActions() {
  const [busy, setBusy] = useState<"checkout" | "portal" | null>(null);
  const [errorCode, setErrorCode] = useState<BillingErrorCode | null>(null);
  // Ref, not state, guards re-entry within the same React batch.
  const busyRef = useRef(false);

  const run = useCallback(
    async (kind: "checkout" | "portal", invoke: () => Promise<{ ok: boolean; error?: string }>) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setBusy(kind);
      setErrorCode(null);
      try {
        const res = await invoke();
        if (!res.ok) {
          setErrorCode((res.error as BillingErrorCode) || "billing_error");
        }
      } catch {
        setErrorCode("billing_error");
      } finally {
        busyRef.current = false;
        setBusy(null);
      }
    },
    [],
  );

  const checkout = useCallback(
    (interval: BillingInterval) => {
      const bridge = window.electronAPI?.billingCheckout;
      if (!bridge) {
        setErrorCode("billing_not_configured");
        return Promise.resolve();
      }
      return run("checkout", () => bridge(interval));
    },
    [run],
  );

  const openPortal = useCallback(() => {
    const bridge = window.electronAPI?.billingOpenPortal;
    if (!bridge) {
      setErrorCode("billing_not_configured");
      return Promise.resolve();
    }
    return run("portal", () => bridge());
  }, [run]);

  return { busy, errorCode, checkout, openPortal };
}
