interface TaskPromoCleanupBannerProps {
  count: number;
  message: string;
  actionLabel: string;
  onRemove: () => void;
}

/** Shown on the task list when mail-derived promo tasks can be removed. */
export default function TaskPromoCleanupBanner({
  count,
  message,
  actionLabel,
  onRemove,
}: TaskPromoCleanupBannerProps) {
  if (count <= 0) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
      <p className="text-sm text-text-primary">{message}</p>
      <button
        type="button"
        onClick={onRemove}
        className="shrink-0 rounded-lg bg-button-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-button-hover"
      >
        {actionLabel}
      </button>
    </div>
  );
}
