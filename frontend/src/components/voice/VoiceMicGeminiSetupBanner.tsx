interface VoiceMicGeminiSetupBannerProps {
  compact: boolean;
  message: string;
  actionLabel: string;
  onAction: () => void;
}

function WarningIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"
      />
    </svg>
  );
}

/**
 * Compact Gemini-missing callout for mic settings — theme tokens, not pale amber-on-peach.
 */
export function VoiceMicGeminiSetupBanner({
  compact,
  message,
  actionLabel,
  onAction,
}: VoiceMicGeminiSetupBannerProps) {
  return (
    <div
      className={`rounded-lg border border-warning-bold bg-warning-soft ${compact ? "px-2.5 py-2" : "px-3 py-2.5"}`}
      role="status"
    >
      <div className="flex items-start gap-2">
        <WarningIcon className="mt-0.5 h-4 w-4 shrink-0 text-amber-900 dark:text-amber-100" />
        <div className="min-w-0">
          <p className="text-xs font-semibold leading-snug text-amber-900 dark:text-amber-100">{message}</p>
          <button
            type="button"
            className="mt-1.5 rounded text-xs font-semibold text-accent underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
            onClick={onAction}
          >
            {actionLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
