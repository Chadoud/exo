import { useI18n } from "../../i18n/I18nContext";

interface WelcomeSignedInBannerProps {
  displayLabel: string;
  email?: string;
  showEmail?: boolean;
  onSwitchAccount?: () => void | Promise<void>;
}

/** Shown on welcome step 1 when the user already passed the account gate. */
export default function WelcomeSignedInBanner({
  displayLabel,
  email,
  showEmail = false,
  onSwitchAccount,
}: WelcomeSignedInBannerProps) {
  const { t } = useI18n();

  return (
    <div className="mb-4 rounded-xl border border-border bg-bg-secondary/60 px-4 py-3 flex flex-wrap items-center justify-between gap-2">
      <div className="min-w-0">
        <p className="text-sm text-muted">{t("welcome.signedInAs", { email: displayLabel })}</p>
        {showEmail && email ? (
          <p className="text-xs text-muted truncate">{email}</p>
        ) : null}
      </div>
      {typeof onSwitchAccount === "function" && (
        <button
          type="button"
          onClick={() => void onSwitchAccount()}
          className="text-xs font-medium text-accent hover:text-accent-hover underline underline-offset-2"
        >
          {t("welcome.switchAccount")}
        </button>
      )}
    </div>
  );
}
