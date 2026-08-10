import { EXO_ACCOUNT_WEB_URL } from "../constants";
import { useI18n } from "../i18n/I18nContext";
import { useBillingActions, billingErrorKey, hasBillingIpc } from "../hooks/useBillingActions";
import { useBillingConfig } from "../hooks/useBillingConfig";
import { useOpenExternalAction } from "../hooks/useOpenExternalAction";
import { PRIMARY_BTN_CLASS } from "../utils/styles";

/**
 * Subscribe CTA stack shared by the trial modals: monthly (primary) + annual
 * (link-style) launching Stripe Checkout in the system browser. Falls back to
 * opening the account website when billing is not live yet (web build, billing
 * flag off, or old cloud API).
 */
export default function BillingSubscribeActions() {
  const { t } = useI18n();
  const config = useBillingConfig();
  const billing = useBillingActions();
  const fallback = useOpenExternalAction(EXO_ACCOUNT_WEB_URL);

  const billingLive = hasBillingIpc() && !config.loading && config.enabled;

  if (!billingLive) {
    return (
      <div className="flex w-full flex-col items-stretch gap-2">
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
  return (
    <div className="flex w-full flex-col items-stretch gap-2">
      <button
        type="button"
        className={`${PRIMARY_BTN_CLASS} min-h-10 w-full`}
        disabled={opening}
        onClick={() => void billing.checkout("monthly")}
      >
        {opening
          ? t("billing.openingCheckout")
          : config.priceMonthly
            ? t("billing.subscribeMonthly", { price: config.priceMonthly })
            : t("trial.subscribe")}
      </button>
      {config.priceAnnual && (
        <button
          type="button"
          disabled={opening}
          onClick={() => void billing.checkout("annual")}
          className="text-xs font-medium text-muted underline-offset-2 hover:text-text-primary hover:underline disabled:opacity-40"
        >
          {t("billing.subscribeAnnual", { price: config.priceAnnual })}
        </button>
      )}
      {billing.errorCode ? (
        <p className="text-center text-xs text-warning" role="status">
          {t(billingErrorKey(billing.errorCode))}
        </p>
      ) : (
        <p className="text-center text-xs text-muted">{t("billing.checkoutOpensBrowser")}</p>
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
