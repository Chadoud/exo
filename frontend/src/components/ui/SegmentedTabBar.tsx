/**
 * Accessible segmented control with a sliding selection pill (iOS-style).
 */

import { useCallback, useMemo, type KeyboardEvent } from "react";

interface SegmentedTab<T extends string = string> {
  id: T;
  label: string;
  /** Optional count badge (e.g. review inbox). */
  badge?: number;
}

interface SegmentedTabBarProps<T extends string = string> {
  tabs: SegmentedTab<T>[];
  activeId: T;
  onSelect: (id: T) => void;
  ariaLabel?: string;
  className?: string;
  disabled?: boolean;
}

const PILL_TRANSITION =
  "transition-transform duration-[280ms] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none";

export default function SegmentedTabBar<T extends string = string>({
  tabs,
  activeId,
  onSelect,
  ariaLabel,
  className = "",
  disabled = false,
}: SegmentedTabBarProps<T>) {
  const activeIndex = useMemo(
    () => Math.max(0, tabs.findIndex((tab) => tab.id === activeId)),
    [tabs, activeId],
  );

  const segmentWidth =
    tabs.length > 0 ? `calc((100% - 0.5rem) / ${tabs.length})` : "0%";

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (disabled || tabs.length < 2) return;
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      const delta = event.key === "ArrowRight" ? 1 : -1;
      const next = (activeIndex + delta + tabs.length) % tabs.length;
      onSelect(tabs[next].id);
    },
    [activeIndex, disabled, onSelect, tabs],
  );

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      aria-disabled={disabled || undefined}
      onKeyDown={onKeyDown}
      className={`relative flex rounded-[10px] border border-border bg-bg-secondary/60 p-1 ${className}`.trim()}
    >
      {tabs.length > 0 ? (
        <span
          aria-hidden
          className={`pointer-events-none absolute top-1 bottom-1 left-1 rounded-[7px] bg-button-primary ${PILL_TRANSITION}`}
          style={{
            width: segmentWidth,
            transform: `translateX(calc(${activeIndex * 100}%))`,
          }}
        />
      ) : null}

      {tabs.map((tab) => {
        const selected = tab.id === activeId;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            disabled={disabled}
            className={`relative z-10 flex flex-1 items-center justify-center gap-1.5 rounded-[7px] px-3 py-2 text-xs font-medium outline-none transition-colors duration-200 ease-out focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-1 focus-visible:ring-offset-bg-secondary disabled:opacity-40 ${
              selected ? "text-white" : "text-muted hover:text-text-primary"
            }`}
            onClick={() => onSelect(tab.id)}
          >
            {tab.label}
            {tab.badge != null && tab.badge > 0 ? (
              <span
                className={`rounded-full px-1.5 py-px text-[10px] font-semibold tabular-nums transition-colors duration-200 ${
                  selected ? "bg-white/20 text-white" : "bg-bg-primary text-muted"
                }`}
              >
                {tab.badge}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
