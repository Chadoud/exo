import { EXO_ACCOUNT_WEB_URL } from "../constants";
import { useI18n } from "../i18n/I18nContext";
import { useBillingActions, billingErrorKey, hasBillingIpc } from "../hooks/useBillingActions";
import { useBillingConfig } from "../hooks/useBillingConfig";
import { useOpenExternalAction } from "../hooks/useOpenExternalAction";
import { PRIMARY_BTN_CLASS } from "../utils/styles";

/**
 * "X months free" for the annual plan, derived from the real display prices —
 * never a hardcoded marketing claim. Returns 0 when prices are missing,
 * unparseable, or annual isn't actually cheaper.
 */
export function computeAnnualMonthsFree(
  priceMonthly: string | null,
  priceAnnual: string | null,
): number {
  const parse = (s: string | null) => {
    const m = s?.replace(/['\u2019,]/g, "").match(/(\d+(?:\.\d+)?)/);
    return m ? Number(m[1]) : NaN;
  };
  const monthly = parse(priceMonthly);
  const annual = parse(priceAnnual);
  if (!Number.isFinite(monthly) || !Number.isFinite(annual) || monthly <= 0) return 0;
  const months = Math.round(12 - annual / monthly);
  return months >= 1 && months < 12 ? months : 0;
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0l-3.5-3.5a1 1 0 1 1 1.4-1.4l2.8 2.79 6.8-6.79a1 1 0 0 1 1.4 0Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

/** What the user keeps by subscribing — left-aligned on the same text column as the plan cards. */
function BenefitsList() {
  const { t } = useI18n();
  const benefits = [
    t("billing.benefitSorting"),
    t("billing.benefitAssistant"),
    t("billing.benefitUpdates"),
  ];
  return (
    <ul className="flex w-full flex-col gap-2 px-4 text-left">
      {benefits.map((benefit) => (
        <li key={benefit} className="flex items-center gap-2.5 text-sm text-text-primary">
          <CheckIcon className="h-4 w-4 shrink-0 text-accent" />
          {benefit}
        </li>
      ))}
    </ul>
  );
}

interface PlanCardProps {
  label: string;
  priceLine: string;
  badge?: string;
  recommended?: boolean;
  busy: boolean;
  busyLabel: string;
  disabled: boolean;
  onSelect: () => void;
}

/** One-click plan option: the whole card starts Stripe Checkout for that plan. */
function PlanCard({
  label,
  priceLine,
  badge,
  recommended,
  busy,
  busyLabel,
  disabled,
  onSelect,
}: PlanCardProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      className={`flex min-h-14 w-full items-center justify-between gap-3 rounded-xl border px-4 py-3.5 text-left transition-colors disabled:opacity-40 disabled:pointer-events-none ${
        recommended
          ? "border-accent bg-accent-soft hover:bg-accent-faint"
          : "border-border bg-bg-card hover:bg-hover-overlay"
      }`}
    >
      <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-sm font-semibold text-text-primary">{label}</span>
        {badge && (
          <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
            {badge}
          </span>
        )}
      </span>
      <span
        className={`shrink-0 text-sm ${
          busy ? "text-muted" : recommended ? "font-semibold text-accent" : "font-semibold text-text-primary"
        }`}
      >
        {busy ? busyLabel : priceLine}
      </span>
    </button>
  );
}

/**
 * Subscribe offer shared by the trial modals: benefit recap, annual + monthly
 * plan cards (one click → Stripe Checkout in the system browser), and an
 * honest trust line. Falls back to a single button opening the account
 * website when billing is not live (web build, flag off, old cloud API).
 */
export default function BillingSubscribeActions() {
  const { t } = useI18n();
  const config = useBillingConfig();
  const billing = useBillingActions();
  const fallback = useOpenExternalAction(EXO_ACCOUNT_WEB_URL);

  const billingLive = hasBillingIpc() && !config.loading && config.enabled;

  if (!billingLive) {
    return (
      <div className="flex w-full flex-col items-stretch gap-3">
        <BenefitsList />
        <button
          type="button"
          className={`${PRIMARY_BTN_CLASS} min-h-10 w-full`}
          onClick={() => void fallback.open()}
        >
          {t("trial.subscribe")}
        </button>
        <SubscribeHelperLine state={fallback.state} onCopyLink={fallback.copyLink} />
      </div>
    );
  }

  const opening = billing.busy === "checkout";
  const monthsFree = computeAnnualMonthsFree(config.priceMonthly, config.priceAnnual);

  return (
    <div className="flex w-full flex-col items-stretch gap-3">
      <BenefitsList />
      <div className="flex w-full flex-col gap-2">
        {config.priceAnnual && (
          <PlanCard
            label={t("billing.planAnnualLabel")}
            priceLine={t("billing.perYear", { price: config.priceAnnual })}
            badge={
              monthsFree > 0 ? t("billing.monthsFreeBadge", { months: monthsFree }) : undefined
            }
            recommended
            busy={opening}
            busyLabel={t("billing.openingCheckout")}
            disabled={opening}
            onSelect={() => void billing.checkout("annual")}
          />
        )}
        <PlanCard
          label={t("billing.planMonthlyLabel")}
          priceLine={
            config.priceMonthly
              ? t("billing.perMonth", { price: config.priceMonthly })
              : t("trial.subscribe")
          }
          busy={opening}
          busyLabel={t("billing.openingCheckout")}
          disabled={opening}
          onSelect={() => void billing.checkout("monthly")}
        />
      </div>
      {billing.errorCode ? (
        <p className="text-center text-xs text-warning" role="status">
          {t(billingErrorKey(billing.errorCode))}
        </p>
      ) : (
        <p className="text-center text-xs text-muted">{t("billing.trustLine")}</p>
      )}
    </div>
  );
}

/** Under-button helper/error line for the browser-fallback Subscribe action. */
function SubscribeHelperLine({
  state,
  onCopyLink,
}: {
  state: "idle" | "failed" | "copied";
  onCopyLink: () => void;
}) {
  const { t } = useI18n();
  if (state === "idle") {
    return <p className="text-center text-xs text-muted">{t("trial.subscribeOpensBrowser")}</p>;
  }
  return (
    <p className="text-center text-xs text-warning" role="status">
      {t("trial.subscribeOpenFailed")}{" "}
      <button
        type="button"
        onClick={onCopyLink}
        className="font-semibold underline-offset-2 hover:underline"
      >
        {state === "copied" ? t("trial.subscribeLinkCopied") : t("trial.subscribeCopyLink")}
      </button>
    </p>
  );
}
