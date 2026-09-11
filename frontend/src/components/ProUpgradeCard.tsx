import { CARD_SHELL_CLASS, PRIMARY_BTN_CLASS } from "../utils/styles";
import { useI18n } from "../i18n/I18nContext";

interface ProUpgradeCardProps {
  /** Plain-language outcome describing what the locked feature does (already localized). */
  description: string;
  /** Opens the license section so the user can unlock — never a dead end. */
  onUpgrade: () => void;
  /** Tighter padding for inline placement inside a panel. */
  compact?: boolean;
}

/**
 * Upgrade prompt shown where a paid (proactive) feature would otherwise act.
 * Always states what the feature does plus the path to unlock it.
 */
export default function ProUpgradeCard({ description, onUpgrade, compact }: ProUpgradeCardProps) {
  const { t } = useI18n();
  return (
    <div
      className={`${CARD_SHELL_CLASS} bg-bg-secondary ${compact ? "p-3" : "p-4"}`}
    >
      <div className="flex items-start gap-3">
        <svg className="mt-0.5 h-4 w-4 shrink-0 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
        </svg>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-button-primary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">
              {t("pro.badge")}
            </span>
            <p className="text-sm font-semibold text-text-primary">{t("pro.title")}</p>
          </div>
          <p className="text-sm leading-relaxed text-muted">{description}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={onUpgrade}
        className={`${PRIMARY_BTN_CLASS} mt-3 px-3 py-1.5 text-xs`}
      >
        {t("pro.cta")}
      </button>
    </div>
  );
}
