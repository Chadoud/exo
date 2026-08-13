import { useState } from "react";
import { toast } from "sonner";
import type { EntitlementStatus } from "../../api";
import { useI18n } from "../../i18n/I18nContext";
import { trialBarPercent, trialDurationDays, trialLineVars } from "../../utils/entitlementUi";
import SettingsBillingStatusCard from "./SettingsBillingStatusCard";

interface SettingsLicenseSectionProps {
  entitlement: EntitlementStatus | null;
  onEntitlementRefresh: () => void;
}

export default function SettingsLicenseSection({
  entitlement,
  onEntitlementRefresh,
}: SettingsLicenseSectionProps) {
  const { t } = useI18n();
  const [licenseInput, setLicenseInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [licenseEntryOpened, setLicenseEntryOpened] = useState(false);

  const pct = trialBarPercent(entitlement);
  const licensed = entitlement?.licensed ?? false;
  const licenseEntryVisible = licenseEntryOpened || licensed || Boolean(entitlement?.hasLicenseKey);
  const subscribed = Boolean(
    entitlement?.subscriptionEntitled || entitlement?.subscriptionActive,
  );
  const unlimitedBuild = entitlement?.unlimitedBuild ?? false;
  const canAnalyze = entitlement?.canAnalyze ?? true;
  const trialActive = entitlement?.trialActive ?? false;

  const desktopOnlyToast = () =>
    toast.message(t("settings.licenseWebHintTitle"), {
      description: t("settings.licenseWebHintDesc"),
      duration: 8000,
    });

  const activationErrorDescription = (reason: string | undefined) => {
    switch (reason) {
      case "seat_limit":
        return t("settings.licenseSeatLimitDesc");
      case "network_error":
      case "cloud_url_unset":
        return t("settings.licenseNetworkErrorDesc");
      default:
        return reason ?? "";
    }
  };

  const activate = async () => {
    const bridge = window.electronAPI?.activateLicense;
    if (!bridge) {
      desktopOnlyToast();
      return;
    }
    setBusy(true);
    try {
      const res = await bridge(licenseInput);
      if (!res.ok) {
        toast.error(t("settings.licenseInvalid"), {
          description: activationErrorDescription(res.reason),
        });
        return;
      }
      toast.success(t("settings.licenseActivated"));
      setLicenseInput("");
      onEntitlementRefresh();
    } finally {
      setBusy(false);
    }
  };

  const clearDevice = async () => {
    const bridge = window.electronAPI?.clearLicense;
    if (!bridge) {
      desktopOnlyToast();
      return;
    }
    setBusy(true);
    try {
      await bridge();
      toast.message(t("settings.licenseClearedDevice"));
      onEntitlementRefresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div id="license-usage" className="space-y-4 scroll-mt-28">
      <SettingsBillingStatusCard entitlement={entitlement} />
      <div className="rounded-xl border border-border bg-bg-card p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium text-text-primary">{t("settings.licenseQuotaHeading")}</p>
          {unlimitedBuild ? (
            <span className="text-3xs font-semibold uppercase tracking-wide text-success px-2 py-0.5 rounded-md bg-success-soft border border-success-line">
              {t("settings.unlimitedBuildTier")}
            </span>
          ) : licensed || subscribed ? (
            <span className="text-3xs font-semibold uppercase tracking-wide text-success px-2 py-0.5 rounded-md bg-success-soft border border-success-line">
              {licensed ? t("settings.licenseFullTier") : t("billing.planPro")}
            </span>
          ) : trialActive ? (
            <span className="text-3xs font-semibold uppercase tracking-wide text-muted px-2 py-0.5 rounded-md bg-bg-secondary border border-border">
              {t("settings.licenseFreeTier")}
            </span>
          ) : (
            <span className="text-3xs font-semibold uppercase tracking-wide text-warning px-2 py-0.5 rounded-md bg-warning-soft border border-warning-line">
              {t("settings.trialExpiredBadge")}
            </span>
          )}
        </div>
        {!licensed && !subscribed && !unlimitedBuild && (
          <>
            <div className="h-2 rounded-full bg-bg-secondary overflow-hidden border border-border-soft">
              <div
                className={`h-full rounded-full transition-[width] ${canAnalyze ? "bg-accent" : "bg-warning"}`}
                style={{ width: `${trialActive ? pct : 100}%` }}
              />
            </div>
            <p className="text-xs text-muted">
              {entitlement && trialActive
                ? t("settings.trialMeterLine", trialLineVars(entitlement))
                : entitlement?.trialExpired
                  ? t("settings.trialExpiredLine", trialLineVars(entitlement))
                  : t("settings.trialMeterLineFallback", { days: trialDurationDays() })}
            </p>
            {!canAnalyze && (
              <p className="text-xs text-warning bg-warning-soft border border-warning-line rounded-lg px-3 py-2">
                {t("settings.licenseBlockedHint")}
              </p>
            )}
          </>
        )}
        {licensed && (
          <p className="text-xs text-muted">{t("settings.licenseUnlimitedDesc")}</p>
        )}
        {unlimitedBuild && (
          <p className="text-xs text-muted">{t("settings.unlimitedBuildDesc")}</p>
        )}
      </div>

      {/* Subscription is the primary path — license entry stays reachable for key holders, collapsed for everyone else. */}
      {!licenseEntryVisible && (
        <button
          type="button"
          onClick={() => setLicenseEntryOpened(true)}
          className="text-xs font-medium text-muted underline-offset-2 hover:text-text-primary hover:underline"
        >
          {t("settings.licenseHaveKeyLink")}
        </button>
      )}
      {licenseEntryVisible && (
        <div className="rounded-xl border border-border bg-bg-card p-4 space-y-3">
          <label htmlFor="license-key-input" className="block text-xs font-medium text-text-primary">
            {t("settings.licenseKeyLabel")}
          </label>
          <textarea
            id="license-key-input"
            value={licenseInput}
            onChange={(e) => setLicenseInput(e.target.value)}
            placeholder={t("settings.licensePastePlaceholder")}
            rows={3}
            disabled={busy}
            className="w-full rounded-lg border border-border bg-bg-card px-3 py-2 text-sm font-mono text-text-primary placeholder:text-muted resize-y min-h-[5rem]"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void activate()}
              disabled={busy || !licenseInput.trim()}
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-button-primary text-white hover:bg-button-hover disabled:opacity-40 disabled:pointer-events-none"
            >
              {t("settings.licenseActivate")}
            </button>
            <button
              type="button"
              onClick={() => void clearDevice()}
              disabled={busy || !entitlement?.hasLicenseKey}
              className="px-4 py-2 rounded-lg text-sm font-medium border border-border text-muted hover:text-text-primary hover:border-accent-line disabled:opacity-40 disabled:pointer-events-none"
            >
              {t("settings.licenseClearDevice")}
            </button>
          </div>
          <p className="text-2xs text-muted leading-relaxed">{t("settings.licensePrivacyNote")}</p>
        </div>
      )}
    </div>
  );
}
