/**
 * DailyBriefing — the proactive layer surfaced in-app: today's digest card plus
 * the notification center (nudges).
 *
 * Honest progress: today's digest is created on first load (no Generate click).
 * Nudges come from the rate-limited backend generator. A single OS notification
 * fires when new nudges appear, never a stream.
 */

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  dismissAllNudges,
  dismissNudge,
  fetchLatestDigest,
  fetchNudges,
  generateDigest,
  type Digest,
  type Nudge,
} from "../api/proactive";
import { osNotify } from "../utils/osNotify";
import { EntitlementBlockedError } from "../api/client";
import ProUpgradeCard from "./ProUpgradeCard";
import { useI18n } from "../i18n/I18nContext";

interface Props {
  backendOnline: boolean;
  onOpenTasks?: () => void;
  /** False when the proactive (paid) tier is locked; gates digest generation. */
  proAllowed?: boolean;
  onUpgrade?: () => void;
  hideProCard?: boolean;
  /** When false, nudges render elsewhere (e.g. Home attention inbox). */
  showNudges?: boolean;
  /** Nested in a titled card — skip the inner “Daily digest” chrome. */
  embedded?: boolean;
}

export default function DailyBriefing({
  backendOnline,
  onOpenTasks,
  proAllowed = true,
  onUpgrade,
  hideProCard = false,
  showNudges = true,
  embedded = false,
}: Props) {
  const { t } = useI18n();
  const [digest, setDigest] = useState<Digest | null>(null);
  const [nudges, setNudges] = useState<Nudge[]>([]);
  const [generating, setGenerating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [proBlocked, setProBlocked] = useState(false);
  const proLocked = !proAllowed || proBlocked;

  const refresh = useCallback(async () => {
    if (!backendOnline) return;
    setLoading(true);
    try {
      const [d, n] = await Promise.all([fetchLatestDigest(), fetchNudges()]);
      setDigest(d);
      setNudges(n);
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : t("briefing.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [backendOnline, t]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // The backend scheduler generates nudges; here we only poll the stored list and
  // fire a single OS notification when genuinely new ones arrive (tracked by id).
  useEffect(() => {
    if (!backendOnline || !showNudges) return;
    let cancelled = false;
    const seenIds = new Set<number>();
    let primed = false;
    const tick = async () => {
      try {
        const current = await fetchNudges();
        if (cancelled) return;
        setNudges(current);
        const fresh = current.filter((n) => !seenIds.has(n.id));
        for (const n of current) seenIds.add(n.id);
        // First poll only primes the seen-set; never notify for pre-existing nudges.
        if (primed && fresh.length > 0) {
          void osNotify(
            fresh.length === 1 ? fresh[0].title : t("briefing.newSuggestions", { n: fresh.length }),
            fresh.length === 1 ? fresh[0].body : t("briefing.openTasksToReview"),
          );
        }
        primed = true;
      } catch {
        /* best-effort */
      }
    };
    void tick();
    const handle = setInterval(() => void tick(), 5 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(handle);
    };
  }, [backendOnline, showNudges, t]);

  const handleGenerate = async () => {
    if (proLocked) return;
    setGenerating(true);
    try {
      const d = await generateDigest();
      setDigest(d);
    } catch (e) {
      if (e instanceof EntitlementBlockedError) {
        setProBlocked(true);
      } else {
        toast.error(e instanceof Error ? e.message : t("briefing.toastGenerateFailed"));
      }
    } finally {
      setGenerating(false);
    }
  };

  const handleDismiss = async (id: number) => {
    setNudges((prev) => prev.filter((n) => n.id !== id));
    try {
      await dismissNudge(id);
    } catch {
      void refresh();
    }
  };

  const openNudge = (nudge: Nudge) => {
    const kind = nudge.meta?.kind;
    if (kind === "task" || nudge.kind === "due_task") {
      onOpenTasks?.();
      return;
    }
    if (typeof nudge.meta?.conversation_id === "string") {
      onOpenTasks?.();
    }
  };

  const handleDismissAll = async () => {
    setNudges([]);
    try {
      await dismissAllNudges();
    } catch {
      void refresh();
    }
  };

  if (!backendOnline) return null;

  const sections: { label: string; items: string[] }[] = digest
    ? [
        { label: t("briefing.sectionHighlights"), items: digest.highlights ?? [] },
        { label: t("briefing.sectionDecisions"), items: digest.decisions ?? [] },
        { label: t("briefing.sectionUnresolved"), items: digest.unresolved ?? [] },
        { label: t("briefing.sectionFocusTomorrow"), items: digest.focus_tomorrow ?? [] },
      ].filter((s) => s.items.length > 0)
    : [];

  return (
    <div className="space-y-3">
      {loadError && (
        <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">{loadError}</p>
      )}

      {/* Notification center — hidden on Home (attention inbox handles nudges there). */}
      {showNudges && nudges.length > 0 && (
        <section className="space-y-1.5 rounded-xl border border-accent/30 bg-accent/5 p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-accent">
              {t("briefing.suggestions", { n: nudges.length })}
            </p>
            <button
              type="button"
              onClick={() => void handleDismissAll()}
              className="text-xs text-muted hover:text-text-primary"
            >
              {t("briefing.dismissAll")}
            </button>
          </div>
          {nudges.map((n) => (
            <div key={n.id} className="flex items-start gap-2 rounded-lg bg-bg-secondary px-3 py-2">
              <button
                type="button"
                onClick={() => openNudge(n)}
                className="min-w-0 flex-1 text-left"
              >
                <p className="text-sm font-medium text-text-primary">{n.title}</p>
                {n.body && <p className="text-xs text-muted">{n.body}</p>}
              </button>
              <button
                type="button"
                onClick={() => void handleDismiss(n.id)}
                className="shrink-0 rounded p-1 text-muted hover:text-text-primary"
                aria-label={t("briefing.dismissAria")}
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </section>
      )}

      <section className={embedded ? "space-y-3" : "rounded-xl border border-border bg-bg-secondary p-3 space-y-3"}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {embedded ? null : (
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">{t("briefing.dailyDigest")}</p>
            )}
            <p className={`text-sm text-text-primary ${embedded ? "" : "mt-0.5"}`}>
              {generating || (loading && !digest)
                ? t("briefing.generating")
                : digest
                  ? digest.headline
                  : t("briefing.noDigest")}
            </p>
          </div>
          {!proLocked && !loading ? (
            <button
              type="button"
              onClick={() => void handleGenerate()}
              disabled={generating}
              className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-muted hover:text-text-primary disabled:opacity-60"
            >
              {generating ? t("briefing.generating") : t("briefing.refresh")}
            </button>
          ) : null}
        </div>
        {proLocked && !hideProCard ? (
          <ProUpgradeCard
            compact
            description={t("pro.digestFeature")}
            onUpgrade={() => onUpgrade?.()}
          />
        ) : null}
        {sections.length > 0 ? (
          <div className="space-y-2 border-t border-border pt-3">
            {sections.map((s) => (
              <div key={s.label}>
                <p className="text-xs font-semibold text-text-secondary">{s.label}</p>
                <ul className="ml-4 list-disc text-xs text-muted">
                  {s.items.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}
