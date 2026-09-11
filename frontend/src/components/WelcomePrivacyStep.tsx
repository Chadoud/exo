import type { AppSettings } from "../types/settings";
import { useI18n } from "../i18n/I18nContext";
import {
  LEGAL_TERMS_BUNDLE_VERSION,
  PRIVACY_POLICY_URL,
  TERMS_OF_SERVICE_URL,
} from "../constants";
import { diagnosticsOnLegalAccept } from "../utils/diagnosticsPreferences";

interface WelcomePrivacyStepProps {
  settings: AppSettings;
  onSettingsPatch: (patch: Partial<AppSettings>) => void;
}

const linkClass = "text-accent hover:underline font-medium";

/**
 * Terms & Privacy acceptance during first-run setup. Diagnostics are on by default
 * and disclosed in the legal pages.
 */
export default function WelcomePrivacyStep({ settings, onSettingsPatch }: WelcomePrivacyStepProps) {
  const { t } = useI18n();
  const termsHref = TERMS_OF_SERVICE_URL || PRIVACY_POLICY_URL;
  const privacyHref = PRIVACY_POLICY_URL || TERMS_OF_SERVICE_URL;
  const sameLegalPage = Boolean(termsHref && termsHref === privacyHref);
  const legalAccepted = settings.acceptedLegalTermsVersion === LEGAL_TERMS_BUNDLE_VERSION;

  const handleLegalAcceptChange = (checked: boolean) => {
    if (!checked) {
      onSettingsPatch({ acceptedLegalTermsVersion: null });
      return;
    }
    const diagnostics = diagnosticsOnLegalAccept();
    onSettingsPatch({
      acceptedLegalTermsVersion: LEGAL_TERMS_BUNDLE_VERSION,
      ...diagnostics,
    });
  };

  return (
    <div className="max-w-xl mx-auto space-y-5 text-left">
      <div className="space-y-3 rounded-xl border border-border bg-bg-card px-4 py-4">
        <p className="text-sm font-medium text-text-primary">{t("welcome.legalAcceptHeading")}</p>
        <label className="flex items-start gap-3 cursor-pointer group">
          <input
            type="checkbox"
            className="mt-1 rounded border-border text-accent focus:ring-accent shrink-0"
            checked={legalAccepted}
            aria-required="true"
            onChange={(e) => handleLegalAcceptChange(e.target.checked)}
          />
          <span className="text-sm text-text-primary leading-relaxed">
            {sameLegalPage && termsHref ? (
              <>
                {t("welcome.legalAcceptPrefix")}{" "}
                <a href={termsHref} target="_blank" rel="noopener noreferrer" className={linkClass}>
                  {t("welcome.legalAcceptCombinedLink")}
                </a>
                {t("welcome.legalAcceptSuffix")}
              </>
            ) : termsHref && privacyHref ? (
              <>
                {t("welcome.legalAcceptPrefix")}{" "}
                <a href={termsHref} target="_blank" rel="noopener noreferrer" className={linkClass}>
                  {t("welcome.legalTermsLink")}
                </a>{" "}
                {t("welcome.legalAcceptAnd")}{" "}
                <a href={privacyHref} target="_blank" rel="noopener noreferrer" className={linkClass}>
                  {t("welcome.legalPrivacyLink")}
                </a>
                {t("welcome.legalAcceptSuffix")}
              </>
            ) : (
              t("welcome.legalAcceptOffline")
            )}
          </span>
        </label>
        <p className="text-2xs text-muted leading-relaxed pl-7 sm:pl-0 sm:ml-7">
          {t("welcome.legalAcceptHint")}
          {!termsHref ? <> {t("welcome.legalAcceptHintNoLinks")}</> : null}
        </p>
        <div className="space-y-2 border-t border-border pt-4">
          <p className="text-sm font-medium text-text-primary">{t("welcome.diagnosticsNoticeTitle")}</p>
          <p className="text-xs text-muted leading-relaxed">{t("welcome.diagnosticsNoticeBody")}</p>
          {PRIVACY_POLICY_URL ? (
            <p className="text-2xs text-muted">
              <a href={PRIVACY_POLICY_URL} target="_blank" rel="noopener noreferrer" className={linkClass}>
                {t("settings.privacyPolicyLink")}
              </a>
            </p>
          ) : null}
        </div>
      </div>

      <p className="text-2xs text-muted leading-relaxed">{t("welcome.privacyStepFooter")}</p>
    </div>
  );
}
