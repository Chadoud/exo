import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CSSProperties } from "react";
import type { AppSettings } from "../../types/settings";
import type { VoiceSessionForSettingsSideEffects } from "../../utils/voiceSettingsSideEffects";
import { useI18n } from "../../i18n/I18nContext";
import { GHOST_ICON_BTN_CLASS } from "../../utils/styles";
import type { VoiceBackendReadiness } from "../../hooks/useVoiceBackendReady";
import { VoiceInteractionSettingsForm } from "./VoiceInteractionSettingsForm";

const PANEL_WIDTH_PX = 420;
const PANEL_MAX_HEIGHT_CSS = "min(32rem,70vh)";
const PANEL_GAP_PX = 8;
const VIEWPORT_MARGIN_PX = 12;
const PANEL_Z_INDEX = 200;

interface VoiceMicSettingsPopoverProps {
  settings: AppSettings;
  onSettingsPatch: (patch: Partial<AppSettings>) => void;
  voice?: VoiceSessionForSettingsSideEffects;
  onOpenAiProviderSettings?: () => void;
  onOpenFullVoiceSettings?: () => void;
  /** Where the panel opens relative to the trigger. */
  placement?: "above" | "below";
  /** Match mic button styling in AI Manager rail vs chat composer. */
  triggerVariant?: "rail" | "composer";
  voiceReadiness?: VoiceBackendReadiness;
  showWarningBadge?: boolean;
}

function SettingsGearIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className={className}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.431l-1.296 2.247a1.125 1.125 0 0 1-1.37.491l-1.216-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281a1.14 1.14 0 0 0-.645-.87 7.523 7.523 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.431l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
    </svg>
  );
}

function clampHorizontal(left: number, width: number): number {
  const maxLeft = Math.max(VIEWPORT_MARGIN_PX, window.innerWidth - width - VIEWPORT_MARGIN_PX);
  return Math.min(Math.max(VIEWPORT_MARGIN_PX, left), maxLeft);
}

/**
 * Compact gear trigger + popover for mic / voice interaction settings.
 * Panel is portaled to `document.body` so it is not clipped by Exo rail overflow.
 */
export function VoiceMicSettingsPopover({
  settings,
  onSettingsPatch,
  voice,
  onOpenAiProviderSettings,
  onOpenFullVoiceSettings,
  placement = "above",
  triggerVariant = "composer",
  voiceReadiness,
  showWarningBadge = false,
}: VoiceMicSettingsPopoverProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const openedViaKeyboardRef = useRef(false);
  const panelId = useId();
  const radioGroupId = useId();
  const [panelStyle, setPanelStyle] = useState<CSSProperties | null>(null);

  const closePanel = (restoreTriggerFocus: boolean) => {
    setOpen(false);
    if (restoreTriggerFocus) {
      triggerRef.current?.focus();
    }
  };

  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      closePanel(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        closePanel(true);
      }
    };
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open || !openedViaKeyboardRef.current) return;
    const checkedRadio = panelRef.current?.querySelector<HTMLInputElement>('input[type="radio"]:checked');
    (checkedRadio ?? closeRef.current)?.focus();
  }, [open]);

  useLayoutEffect(() => {
    if (!open) {
      setPanelStyle(null);
      return;
    }

    const updatePosition = () => {
      const trigger = triggerRef.current;
      const panel = panelRef.current;
      if (!trigger || typeof window === "undefined") {
        setPanelStyle(null);
        return;
      }

      const triggerRect = trigger.getBoundingClientRect();
      const width = Math.min(PANEL_WIDTH_PX, window.innerWidth - VIEWPORT_MARGIN_PX * 2);
      const panelHeight = panel?.offsetHeight ?? 480;
      const preferAbove = placement === "above";

      let top = preferAbove
        ? triggerRect.top - panelHeight - PANEL_GAP_PX
        : triggerRect.bottom + PANEL_GAP_PX;

      if (preferAbove && top < VIEWPORT_MARGIN_PX) {
        top = triggerRect.bottom + PANEL_GAP_PX;
      } else if (!preferAbove && top + panelHeight > window.innerHeight - VIEWPORT_MARGIN_PX) {
        top = Math.max(VIEWPORT_MARGIN_PX, triggerRect.top - panelHeight - PANEL_GAP_PX);
      }

      const maxTop = window.innerHeight - panelHeight - VIEWPORT_MARGIN_PX;
      top = Math.min(Math.max(VIEWPORT_MARGIN_PX, top), Math.max(VIEWPORT_MARGIN_PX, maxTop));

      const left = clampHorizontal(triggerRect.right - width, width);

      setPanelStyle({
        position: "fixed",
        top,
        left,
        width,
        maxHeight: PANEL_MAX_HEIGHT_CSS,
        zIndex: PANEL_Z_INDEX,
      });
    };

    updatePosition();
    const observer = panelRef.current ? new ResizeObserver(updatePosition) : null;
    observer?.observe(panelRef.current!);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, placement]);

  const triggerClass =
    triggerVariant === "rail"
      ? "exo-action-btn relative shrink-0 min-h-11 min-w-11 px-0 flex items-center justify-center"
      : "relative shrink-0 rounded-xl border border-border bg-bg-secondary min-h-11 min-w-11 p-2.5 text-text-secondary transition-colors hover:bg-hover-overlay hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50";

  const panelContent = (
    <div
      ref={panelRef}
      id={panelId}
      role="dialog"
      aria-labelledby={`${panelId}-title`}
      style={panelStyle ?? undefined}
      className={`flex flex-col overflow-hidden rounded-xl border border-border bg-bg-card shadow-xl${
        panelStyle ? "" : " invisible pointer-events-none fixed left-0 top-0 w-[26rem]"
      }`}
    >
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3">
        <h2 id={`${panelId}-title`} className="min-w-0 truncate text-base font-semibold text-text-primary">
          {t("voice.micSettingsTitle")}
        </h2>
        <button
          ref={closeRef}
          type="button"
          data-mic-settings-close=""
          className={`${GHOST_ICON_BTN_CLASS} min-h-11 min-w-11 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50`}
          aria-label={t("voice.micSettingsClose")}
          onClick={() => closePanel(true)}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">
        <VoiceInteractionSettingsForm
          settings={settings}
          onSettingsPatch={onSettingsPatch}
          variant="compact"
          radioGroupId={radioGroupId}
          voice={voice}
          voiceReadiness={voiceReadiness}
          onOpenAiProviderSettings={() => {
            setOpen(false);
            onOpenAiProviderSettings?.();
          }}
        />
      </div>

      {onOpenFullVoiceSettings ? (
        <div className="shrink-0 border-t border-border px-4 py-3">
          <button
            type="button"
            className="rounded text-sm font-medium text-accent underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
            onClick={() => {
              setOpen(false);
              onOpenFullVoiceSettings();
            }}
          >
            {t("voice.micSettingsOpenFull")}
          </button>
        </div>
      ) : null}
    </div>
  );

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        className={`${triggerClass}${open ? (triggerVariant === "rail" ? " exo-action-btn--settings-open" : " border-accent/50 bg-accent/5 text-text-primary") : ""}`}
        aria-label={t("voice.micSettingsButtonAria")}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={panelId}
        title={t("voice.micSettingsButtonAria")}
        onClick={(event) => {
          const next = !open;
          openedViaKeyboardRef.current = next && event.detail === 0;
          setOpen(next);
        }}
      >
        <SettingsGearIcon className="h-4 w-4" />
        {showWarningBadge ? (
          <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-warning" aria-hidden="true" />
        ) : null}
      </button>

      {open && typeof document !== "undefined"
        ? createPortal(panelContent, document.body)
        : null}
    </div>
  );
}
