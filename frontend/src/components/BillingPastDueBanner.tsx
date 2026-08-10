import { useState } from "react";
import type { EntitlementStatus } from "../api";
import { useI18n } from "../i18n/I18nContext";
import { useBillingActions, billingErrorKey } from "../hooks/useBillingActions";

const SESSION_DISMISS_KEY = "exo.billing.pastDueBannerDismissed";

function readSessionDismissed(): boolean {
  try {
    return sessionStorage.getItem(SESSION_DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

interface BillingPastDueBannerProps {
  entitlement: EntitlementStatus | null;
}

/**
 * Shown while the subscription is past_due (payment failed, Stripe retrying).
 * Access stays on during the retry window — this only asks the user to fix the
 * card. Dismissible per session; it returns next launch until resolved.
 */
export default function BillingPastDueBanner({ entitlement }: BillingPastDueBannerProps) {
  const { t } = useI18n();
  const billing = useBillingActions();
  const [dismissed, setDismissed] = useState(readSessionDismissed);

  if (dismissed || entitlement?.subscriptionStatus !== "past_due") return null;

  const dismiss = () => {
    try {
      sessionStorage.setItem(SESSION_DISMISS_KEY, "1");
    } catch {
      /* still dismiss for this render lifetime */
    }
    setDismissed(true);
  };

  return (
    <div
      role="alert"
      className="fixed inset-x-0 top-12 z-40 mx-auto flex w-fit max-w-[calc(100vw-2rem)] flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-warning-line bg-warning-soft px-4 py-2 shadow-lg"
    >
      <p className="text-xs text-warning">
        {billing.errorCode ? t(billingErrorKey(billing.errorCode)) : t("billing.pastDueBanner")}
      </p>
      <button
        type="button"
        disabled={billing.busy === "portal"}
        onClick={() => void billing.openPortal()}
        className="text-xs font-semibold text-warning underline-offset-2 hover:underline disabled:opacity-40"
      >
        {billing.busy === "portal" ? t("billing.openingPortal") : t("billing.pastDueUpdateCta")}
      </button>
      <button
        type="button"
        onClick={dismiss}
        className="text-xs font-medium text-muted underline-offset-2 hover:text-text-primary hover:underline"
      >
        {t("billing.dismiss")}
      </button>
    </div>
  );
}
