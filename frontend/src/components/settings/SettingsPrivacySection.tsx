import { useState } from "react";
import type { AppSettings } from "../../types/settings";
import { useI18n } from "../../i18n/I18nContext";
import { submitFeedback, track } from "../../telemetry/client";
import { TelemetryEventNames } from "../../telemetry/schema";
import { BETA_FEEDBACK_URL, PRIVACY_POLICY_URL } from "../../constants";
import { useIsCrashReportingConfigured } from "../../telemetry/sentry";
import { trackDiagnosticsObjectionChanged } from "../../telemetry/lifecycle";

interface SettingsPrivacySectionProps {
  settings: AppSettings;
  onSettingsPatch: (patch: Partial<AppSettings>) => void;
  backendOnline: boolean;
}

export default function SettingsPrivacySection({
  settings,
  onSettingsPatch,
  backendOnline,
}: SettingsPrivacySectionProps) {
  const { t } = useI18n();
  const crashReportingConfigured = useIsCrashReportingConfigured();
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackBusy, setFeedbackBusy] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  const sendFeedback = async () => {
    const msg = feedbackText.trim();
    if (!msg) return;
    setFeedbackBusy(true);
    setFeedbackMsg(null);
    const ok = await submitFeedback(settings.uiLocale, {
      category: "ux",
      message: msg,
    });
    setFeedbackBusy(false);
    if (ok) {
      setFeedbackMsg(t("settings.privacyFeedbackThanks"));
      setFeedbackText("");
      track(settings.telemetryOptIn, settings.uiLocale, TelemetryEventNames.feedbackSubmitted, {});
    } else {
      setFeedbackMsg(t("settings.privacyFeedbackError"));
    }
  };

  const setTelemetryOptIn = (enabled: boolean) => {
    if (enabled === settings.telemetryOptIn) return;
    trackDiagnosticsObjectionChanged(enabled, settings.uiLocale);
    onSettingsPatch({ telemetryOptIn: enabled });
  };

  const setCrashReportsOptIn = (enabled: boolean) => {
    if (enabled === settings.crashReportsOptIn) return;
    onSettingsPatch({ crashReportsOptIn: enabled });
  };

  return (
    <section id="settings-privacy" className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-text-primary">{t("settings.privacyTitle")}</h3>
        <p className="text-xs text-muted mt-1 leading-relaxed">{t("settings.privacyDesc")}</p>
        <p className="text-xs text-muted mt-2 leading-relaxed">{t("settings.mailReply.privacySentence")}</p>
      </div>

      <div className="rounded-xl border border-border bg-bg-secondary/50 px-4 py-3 space-y-3">
        <div>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              className="mt-0.5 rounded border-border text-accent focus:ring-accent shrink-0"
              checked={settings.telemetryOptIn}
              onChange={(e) => setTelemetryOptIn(e.target.checked)}
            />
            <span>
              <span className="text-xs font-medium text-text-primary block">
                {t("settings.privacyTelemetryLabel")}
              </span>
              <span className="text-xs text-muted leading-snug mt-1 block">
                {t("settings.privacyTelemetryDisclosure")}
              </span>
            </span>
          </label>
        </div>
        <div className="border-t border-border-soft pt-3">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              className="mt-0.5 rounded border-border text-accent focus:ring-accent shrink-0"
              checked={settings.crashReportsOptIn}
              onChange={(e) => setCrashReportsOptIn(e.target.checked)}
            />
            <span>
              <span className="text-xs font-medium text-text-primary block">
                {t("settings.privacyCrashLabel")}
              </span>
              <span className="text-xs text-muted leading-snug mt-1 block">
                {t(
                  crashReportingConfigured
                    ? "settings.privacyCrashDisclosure"
                    : "settings.privacyCrashDisclosureInactive",
                )}
              </span>
            </span>
          </label>
        </div>
        <p className="text-2xs text-muted leading-relaxed border-t border-border-soft pt-3">
          {t("settings.privacyObjectionHint")}
        </p>
      </div>

      {PRIVACY_POLICY_URL ? (
        <p className="text-2xs text-muted">
          <a
            href={PRIVACY_POLICY_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent hover:underline"
          >
            {t("settings.privacyPolicyLink")}
          </a>
        </p>
      ) : (
        <p className="text-2xs text-muted leading-relaxed">{t("settings.privacyPolicyInline")}</p>
      )}

      {BETA_FEEDBACK_URL ? (
        <p className="text-2xs text-muted">
          <a
            href={BETA_FEEDBACK_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent hover:underline"
          >
            {t("settings.privacyFeedbackLink")}
          </a>
        </p>
      ) : null}

      <div className="rounded-xl border border-border bg-bg-secondary/50 p-4 space-y-2">
        <p className="text-xs font-medium text-text-primary">{t("settings.privacyFeedbackTitle")}</p>
        <p className="text-2xs text-muted">{t("settings.privacyFeedbackHint")}</p>
        <textarea
          className="w-full min-h-[88px] rounded-lg border border-border bg-bg-card px-3 py-2 text-sm text-text-primary placeholder:text-muted focus:outline-none focus:border-accent"
          placeholder={t("settings.privacyFeedbackPlaceholder")}
          value={feedbackText}
          onChange={(e) => setFeedbackText(e.target.value)}
          maxLength={4000}
        />
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={feedbackBusy || !feedbackText.trim()}
            onClick={() => void sendFeedback()}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-button-primary text-white hover:bg-button-hover disabled:opacity-40"
          >
            {t("settings.privacyFeedbackSubmit")}
          </button>
          {feedbackMsg ? <span className="text-xs text-muted">{feedbackMsg}</span> : null}
        </div>
      </div>

      <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 space-y-3">
        <p className="text-xs font-medium text-text-primary">{t("settings.privacyLocalWipeTitle")}</p>
        <p className="text-2xs text-muted leading-relaxed">{t("settings.privacyLocalWipeHint")}</p>
        <LocalWipeControls backendOnline={backendOnline} />
      </div>
    </section>
  );
}

function LocalWipeControls({ backendOnline }: { backendOnline: boolean }) {
  const { t } = useI18n();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const runWipe = async () => {
    if (!confirm) {
      setConfirm(true);
      return;
    }
    if (!backendOnline) return;
    setBusy(true);
    setMessage(null);
    try {
      const { wipeAllLocalData } = await import("../../api/privacy");
      const result = await wipeAllLocalData();
      if (result.ok) {
        setMessage(t("settings.privacyLocalWipeDone"));
        setConfirm(false);
      } else {
        setMessage(result.detail || t("settings.privacyLocalWipeError"));
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : t("settings.privacyLocalWipeError"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={busy || !backendOnline}
        onClick={() => void runWipe()}
        className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
          confirm
            ? "bg-red-600 text-white hover:bg-red-500"
            : "border border-red-500/40 text-red-400 hover:bg-red-500/10"
        }`}
      >
        {confirm ? t("settings.privacyLocalWipeConfirm") : t("settings.privacyLocalWipeAction")}
      </button>
      {confirm ? (
        <button
          type="button"
          onClick={() => setConfirm(false)}
          className="rounded-lg px-3 py-1.5 text-xs text-muted hover:text-text-primary"
        >
          {t("memories.cancel")}
        </button>
      ) : null}
      {message ? <span className="text-xs text-muted">{message}</span> : null}
    </div>
  );
}
