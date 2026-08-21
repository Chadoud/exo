import type { EntitlementStatus } from "../../api";
import { useI18n } from "../../i18n/I18nContext";
import { useBillingActions, billingErrorKey, hasBillingIpc } from "../../hooks/useBillingActions";
import { useBillingConfig } from "../../hooks/useBillingConfig";

/** The cloud API contract is ISO 8601 (see accounts.getProfile). */
function formatPeriodEnd(iso: string | null | undefined): string {
  const ms = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(ms)) return "—";
  return new Date(ms).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

interface SettingsBillingStatusCardProps {
  entitlement: EntitlementStatus | null;
}

/**
 * Plan & billing card in Settings → Subscription: status and checkout.
 * state and opens the Stripe Customer Portal (card, invoices, cancel) or
 * Checkout. Hidden until billing exists for this build/account combination.
 */
export default function SettingsBillingStatusCard({ entitlement }: SettingsBillingStatusCardProps) {
  const { t } = useI18n();
  const config = useBillingConfig();
  const billing = useBillingActions();

  const status = entitlement?.subscriptionStatus ?? null;
  const hasSubscription = Boolean(status);
  // No IPC (web build), billing switched off, and nothing to manage → no card.
  if (!hasBillingIpc() || (!config.enabled && !hasSubscription)) return null;
  if (entitlement?.licensed || entitlement?.unlimitedBuild) return null;

  const subscribed = Boolean(entitlement?.subscriptionActive);
  const pastDue = status === "past_due";
  const planLabel = pastDue
    ? t("billing.planPastDue")
    : subscribed
      ? t("billing.planPro")
      : status
        ? t("billing.planCanceled")
        : entitlement?.trialActive
          ? t("billing.planTrial")
          : t("billing.planExpired");
  const badgeClass = pastDue
    ? "text-warning bg-warning-soft border-warning-line"
    : subscribed
      ? "text-success bg-success-soft border-success-line"
      : "text-muted bg-bg-secondary border-border";

  const periodEnd = entitlement?.subscriptionCurrentPeriodEnd;
  const dateLine = subscribed
    ? entitlement?.subscriptionCancelAtPeriodEnd
      ? t("billing.endsOn", { date: formatPeriodEnd(periodEnd) })
      : t("billing.renewsOn", { date: formatPeriodEnd(periodEnd) })
    : null;

  return (
    <div className="rounded-xl border border-border bg-bg-card p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-text-primary">{t("billing.planHeading")}</p>
        <span
          className={`text-3xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded-md border ${badgeClass}`}
        >
          {planLabel}
        </span>
      </div>
      {dateLine && <p className="text-xs text-muted">{dateLine}</p>}
      {subscribed && entitlement?.subscriptionCancelAtPeriodEnd && (
        <p className="text-xs text-warning bg-warning-soft border border-warning-line rounded-lg px-3 py-2">
          {t("billing.cancelScheduledNote")}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {hasSubscription ? (
          <button
            type="button"
            disabled={billing.busy === "portal"}
            onClick={() => void billing.openPortal()}
            className="px-4 py-2 rounded-lg text-sm font-medium border border-border text-muted hover:text-text-primary hover:border-accent-line disabled:opacity-40 disabled:pointer-events-none"
          >
            {billing.busy === "portal" ? t("billing.openingPortal") : t("billing.manageBilling")}
          </button>
        ) : (
          <button
            type="button"
            disabled={billing.busy === "checkout" || !config.enabled}
            onClick={() => void billing.checkout("monthly")}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-button-primary text-white hover:bg-button-hover disabled:opacity-40 disabled:pointer-events-none"
          >
            {billing.busy === "checkout"
              ? t("billing.openingCheckout")
              : config.priceMonthly
                ? t("billing.subscribeMonthly", { price: config.priceMonthly })
                : t("billing.subscribeCta")}
          </button>
        )}
        {!hasSubscription && config.priceAnnual && (
          <button
            type="button"
            disabled={billing.busy === "checkout" || !config.enabled}
            onClick={() => void billing.checkout("annual")}
            className="px-4 py-2 rounded-lg text-sm font-medium border border-border text-muted hover:text-text-primary hover:border-accent-line disabled:opacity-40 disabled:pointer-events-none"
          >
            {t("billing.subscribeAnnual", { price: config.priceAnnual })}
          </button>
        )}
      </div>
      {billing.errorCode ? (
        <p className="text-xs text-warning" role="status">
          {t(billingErrorKey(billing.errorCode))}
        </p>
      ) : (
        <p className="text-2xs text-muted leading-relaxed">{t("billing.manageBillingHint")}</p>
      )}
    </div>
  );
}
