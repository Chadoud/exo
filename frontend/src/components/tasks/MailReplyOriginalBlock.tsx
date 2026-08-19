import type { OriginalView } from "../../hooks/useMailReplyOriginal";

type MailReplyOriginalBlockProps = {
  view: OriginalView;
  headingId: string;
  regionId: string;
  heading: string;
  loading: string;
  empty: string;
  truncated: string;
  failed: string;
  retryLabel: string;
  onRetry: () => void;
};

/** Presentational inbound region — text nodes only, never HTML. */
export default function MailReplyOriginalBlock({
  view,
  headingId,
  regionId,
  heading,
  loading,
  empty,
  truncated,
  failed,
  retryLabel,
  onRetry,
}: MailReplyOriginalBlockProps) {
  if (view.kind === "closed") return null;
  const busy = view.kind === "loading";

  return (
    <div
      id={regionId}
      role="region"
      aria-labelledby={headingId}
      aria-busy={busy || undefined}
      className="rounded-lg border border-border bg-bg-primary px-3 py-2"
    >
      <p
        id={headingId}
        className="text-2xs font-semibold uppercase tracking-wide text-muted"
      >
        {heading}
      </p>
      {view.kind === "loading" ? (
        <p role="status" className="mt-2 text-xs text-muted motion-safe:animate-pulse">
          {loading}
        </p>
      ) : null}
      {view.kind === "empty" ? <p className="mt-2 text-xs text-muted">{empty}</p> : null}
      {view.kind === "failed" ? (
        <div className="mt-2 space-y-2">
          <p role="alert" className="text-xs text-red-400">
            {failed}
          </p>
          <button
            type="button"
            onClick={onRetry}
            className="min-h-8 text-xs font-medium text-accent hover:underline"
          >
            {retryLabel}
          </button>
        </div>
      ) : null}
      {view.kind === "ready" || view.kind === "truncated" ? (
        <>
          <div
            tabIndex={0}
            className="mt-2 max-h-48 overflow-y-auto overflow-x-hidden overscroll-contain"
          >
            <p className="text-sm text-text-secondary leading-relaxed whitespace-pre-wrap break-words">
              {view.text}
            </p>
          </div>
          {view.kind === "truncated" ? (
            <p className="mt-2 text-2xs text-muted">{truncated}</p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
