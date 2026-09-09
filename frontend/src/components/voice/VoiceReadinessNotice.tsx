import { useI18n } from "../../i18n/I18nContext";
import type { VoiceReadinessView } from "../../voice/voiceReadiness";
import { VoiceMicGeminiSetupBanner } from "./VoiceMicGeminiSetupBanner";

interface VoiceReadinessNoticeProps {
  compact: boolean;
  view: VoiceReadinessView;
  onOpenSettings?: () => void;
  onRefresh?: () => void;
}

/**
 * Pre-session readiness callout for the mic settings form.
 * Runtime session errors stay on VoiceMicIssueBanner.
 */
export function VoiceReadinessNotice({
  compact,
  view,
  onOpenSettings,
  onRefresh,
}: VoiceReadinessNoticeProps) {
  const { t } = useI18n();
  if (view.bannerKind === "none" || !view.messageKey) return null;

  if (view.bannerKind === "missing_key" && onOpenSettings) {
    return (
      <VoiceMicGeminiSetupBanner
        compact={compact}
        message={t(view.messageKey)}
        actionLabel={t("voice.readinessFixInSettings")}
        onAction={onOpenSettings}
      />
    );
  }

  if (view.bannerKind === "checking") {
    return (
      <div
        className={`rounded-lg border border-border bg-bg-secondary/40 ${compact ? "px-2.5 py-2" : "px-3 py-2.5"}`}
        role="status"
        aria-busy="true"
      >
        <p className="animate-pulse text-xs font-medium leading-snug text-muted">{t(view.messageKey)}</p>
      </div>
    );
  }

  if (view.bannerKind === "unavailable") {
    return (
      <div
        className={`rounded-lg border border-warning-bold bg-warning-soft ${compact ? "px-2.5 py-2" : "px-3 py-2.5"}`}
        role="status"
      >
        <p className="text-xs font-semibold leading-snug text-amber-900 dark:text-amber-100">{t(view.messageKey)}</p>
        {view.action === "refresh" && onRefresh ? (
          <button
            type="button"
            className="mt-1.5 rounded text-xs font-semibold text-accent underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
            onClick={onRefresh}
          >
            {t("voice.readinessRetry")}
          </button>
        ) : null}
      </div>
    );
  }

  return null;
}
