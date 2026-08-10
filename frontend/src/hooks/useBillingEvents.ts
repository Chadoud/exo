import { useEffect } from "react";
import { toast } from "sonner";
import { translate } from "../i18n/translate";
import type { UiLocale } from "../i18n/locale";

interface UseBillingEventsOptions {
  uiLocale: UiLocale;
  refreshEntitlement: () => void;
}

/**
 * Reacts to the exo://billing/* deep link after the user returns from Stripe:
 * refreshes entitlement (main already re-synced the cloud profile) and confirms
 * the outcome with a toast. Success is only claimed once the cloud actually
 * reports the subscription — "complete" without confirmation shows a
 * finalizing message and main follows up with "entitled" when the webhook lands.
 */
export function useBillingEvents({ uiLocale, refreshEntitlement }: UseBillingEventsOptions): void {
  useEffect(() => {
    const bridge = window.electronAPI?.onBillingEvent;
    if (!bridge) return;
    const showSubscribedToast = () =>
      toast.success(translate(uiLocale, "billing.subscribedToast"), {
        description: translate(uiLocale, "billing.subscribedToastDesc"),
      });
    const unsubscribe = bridge((event) => {
      if (event?.kind === "complete") {
        refreshEntitlement();
        if (event.subscribed) {
          showSubscribedToast();
        } else {
          toast.message(translate(uiLocale, "billing.subscriptionPendingToast"));
        }
      } else if (event?.kind === "entitled") {
        refreshEntitlement();
        showSubscribedToast();
      } else if (event?.kind === "cancelled") {
        toast.message(translate(uiLocale, "billing.checkoutCancelledToast"));
      }
    });
    return unsubscribe;
  }, [uiLocale, refreshEntitlement]);
}
