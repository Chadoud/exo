import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import type { MainNavTab } from "../hooks/useMainNavItems";
import type { UseVoiceSessionReturn } from "../hooks/useVoiceSession";
import type { UseBriefingOfferUiReturn } from "../hooks/useBriefingOfferUi";
import type { VoiceInteractionMode } from "../types/voiceInteraction";
import ScreenConsentModal from "./ScreenConsentModal";
import BriefingOfferChrome from "./BriefingOfferChrome";
import { isPushToTalkMode, isPttVoiceUiActive } from "../utils/voiceInteractionUi";

interface AmbientVoiceHudProps {
  voice: UseVoiceSessionReturn;
  briefingOffer: UseBriefingOfferUiReturn;
  activeTab: MainNavTab;
  /** Main workspace column — default placement is horizontally centered within this region. */
  anchorRef?: RefObject<HTMLElement | null>;
  /** Persist always-allow for a sensitive voice tool and approve the pending call. */
  onAlwaysAllowVoiceTool?: (tool: string) => void;
  voiceInteractionMode?: VoiceInteractionMode;
  pttShortcutLabel?: string;
}

const HUD_Z = 140;
const EDGE = 16;
/** Gap from the viewport bottom when the panel is fully expanded. */
const DEFAULT_BOTTOM_GAP_PX = 24;
/** Height of the drag/toggle handle strip in px — must stay in sync with the h-7 class. */
const HANDLE_HEIGHT_PX = 28;

function truncate(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(0, max - 1))}\u2026`;
}

/**
 * Shell-level UI for Gemini Live voice on non–AI Manager tabs: transcripts, stop/minimize,
 * and draggable placement.
 *
 * Collapse behaviour: the panel slides down out of the viewport, leaving only the handle
 * strip peeking at the bottom edge. It stays that way while the mic is idle; it expands
 * once your speech or the assistant transcript appears (unless you collapsed it).
 */
export default function AmbientVoiceHud({
  voice,
  briefingOffer,
  activeTab,
  anchorRef,
  onAlwaysAllowVoiceTool,
  voiceInteractionMode = "conversation",
  pttShortcutLabel = "⌥ Option",
}: AmbientVoiceHudProps) {
  const isPtt = isPushToTalkMode({ voiceInteractionMode });
  const active = isPtt
    ? isPttVoiceUiActive(voice)
    : voice.isListening || voice.isReconnecting;
  const hudAllowed = activeTab !== "exo";
  const showBriefingOffer = hudAllowed && briefingOffer.isActive;

  /** Starts collapsed; expands when user or assistant transcript is non-empty (not on idle “Listening”). */
  const [minimized, setMinimized] = useState(true);
  /**
   * Set to true when the user explicitly closes the panel mid-session.
   * Cleared when a new voice session begins so the panel auto-opens again next time.
   */
  const userClosedRef = useRef(false);
  /** Tracks previous `active` value to detect session start transitions. */
  const prevActiveRef = useRef(false);
  /** null = bottom-center anchor within the main column; set when user drags the panel. */
  const [panelPos, setPanelPos] = useState<{ left: number; top: number } | null>(null);
  /** Horizontal center of the main workspace column in viewport coordinates. */
  const [anchorCenterX, setAnchorCenterX] = useState<number | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    ox: number;
    oy: number;
    rectW: number;
    rectH: number;
  } | null>(null);
  const hudShellRef = useRef<HTMLDivElement>(null);

  const clampToViewport = useCallback((left: number, top: number, w: number, h: number) => {
    if (typeof window === "undefined") return { left, top };
    const maxL = Math.max(EDGE, window.innerWidth - w - EDGE);
    const maxT = Math.max(EDGE, window.innerHeight - h - EDGE);
    return {
      left: Math.min(maxL, Math.max(EDGE, left)),
      top: Math.min(maxT, Math.max(EDGE, top)),
    };
  }, []);

  const onDragHandlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (minimized || e.button !== 0) return;
      const el = hudShellRef.current;
      if (!el) return;

      const rect = el.getBoundingClientRect();
      const logicalLeft = panelPos?.left ?? rect.left;
      const logicalTop = panelPos?.top ?? rect.top;

      dragRef.current = {
        pointerId: e.pointerId,
        ox: e.clientX - logicalLeft,
        oy: e.clientY - logicalTop,
        rectW: rect.width,
        rectH: rect.height,
      };
      try {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      setPanelPos({ left: Math.round(logicalLeft), top: Math.round(logicalTop) });
    },
    [minimized, panelPos],
  );

  const onDragHandlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const d = dragRef.current;
      if (!d || e.pointerId !== d.pointerId) return;
      const nextLeft = Math.round(e.clientX - d.ox);
      const nextTop = Math.round(e.clientY - d.oy);
      setPanelPos(clampToViewport(nextLeft, nextTop, d.rectW, d.rectH));
    },
    [clampToViewport],
  );

  const onDragHandlePointerUp = useCallback((e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || e.pointerId !== d.pointerId) return;
    dragRef.current = null;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }, []);

  const onMinimize = useCallback(() => {
    dragRef.current = null;
    userClosedRef.current = true;
    // Always snap to bottom-centre before sliding so the peek is always at the bottom edge.
    setPanelPos(null);
    setMinimized(true);
  }, []);

  const onRestore = useCallback(() => {
    userClosedRef.current = false;
    setMinimized(false);
  }, []);

  // New session: allow auto-open on speech again; stay minimized until user or AI speaks.
  // Session end: snap back to minimized so the next session starts with only the handle peek.
  useEffect(() => {
    const wasActive = prevActiveRef.current;
    prevActiveRef.current = active;

    if (!wasActive && active) {
      userClosedRef.current = false;
      setPanelPos(null);
      setMinimized(true);
    }
    if (wasActive && !active) {
      setMinimized(true);
      setPanelPos(null);
    }
  }, [active]);

  // Expand when there is something to show (speech or BriefingOffer), unless user collapsed the panel.
  useEffect(() => {
    if (userClosedRef.current) return;
    if (showBriefingOffer) {
      setMinimized(false);
      return;
    }
    if (!active) return;
    const userSpeaking = Boolean(voice.inputTranscript?.trim());
    const assistantSpeaking = Boolean(voice.outputTranscript?.trim());
    if (userSpeaking || assistantSpeaking) {
      setMinimized(false);
    }
  }, [active, showBriefingOffer, voice.inputTranscript, voice.outputTranscript]);

  useEffect(() => {
    if (hudAllowed) return;
    setMinimized(true);
    setPanelPos(null);
  }, [hudAllowed]);

  useEffect(() => {
    const onResize = () =>
      setPanelPos((p) => {
        if (!p || typeof window === "undefined") return p;
        const el = hudShellRef.current;
        if (!el) return p;
        const { width, height } = el.getBoundingClientRect();
        return clampToViewport(p.left, p.top, width, height);
      });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [clampToViewport]);

  useEffect(() => {
    const anchor = anchorRef?.current;
    if (!anchor || typeof window === "undefined") {
      setAnchorCenterX(null);
      return;
    }

    const updateAnchorCenter = () => {
      const rect = anchor.getBoundingClientRect();
      setAnchorCenterX(rect.left + rect.width / 2);
    };

    updateAnchorCenter();
    const observer = new ResizeObserver(updateAnchorCenter);
    observer.observe(anchor);
    window.addEventListener("resize", updateAnchorCenter);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateAnchorCenter);
    };
  }, [anchorRef, activeTab]);

  if (!voice.pendingToolApproval && !active && !showBriefingOffer) return null;

  /**
   * Shell position + slide animation.
   *
   * Non-dragged (default): anchored at `bottom: 0`, shifted up by DEFAULT_BOTTOM_GAP_PX
   * when expanded. When minimised, translateY slides the panel below the viewport
   * leaving only HANDLE_HEIGHT_PX visible.
   *
   * Dragged (panelPos set): absolute top/left — no Y-slide animation (panel is freely
   * placed, minimize snaps back to bottom-centre via setPanelPos(null)).
   */
  const defaultLeft = anchorCenterX ?? (typeof window !== "undefined" ? window.innerWidth / 2 : "50%");

  const shellStyle: CSSProperties = panelPos
    ? { position: "fixed", left: panelPos.left, top: panelPos.top, zIndex: HUD_Z }
    : {
        position: "fixed",
        bottom: 0,
        left: defaultLeft,
        zIndex: HUD_Z,
        transform: `translateX(-50%) translateY(${
          minimized
            ? `calc(100% - ${HANDLE_HEIGHT_PX}px)`
            : `-${DEFAULT_BOTTOM_GAP_PX}px`
        })`,
        transition: "transform 320ms cubic-bezier(0.33, 1, 0.68, 1), left 200ms ease",
      };

  return (
    <>
      <ScreenConsentModal
        open={voice.pendingToolApproval !== null}
        tool={voice.pendingToolApproval?.tool ?? null}
        onAllow={() => {
          const id = voice.pendingToolApproval?.callId;
          if (id) voice.approveToolCall(id, "once");
        }}
        onAllowSession={
          voice.pendingToolApproval?.tool === "screen_capture"
            ? () => {
                const id = voice.pendingToolApproval?.callId;
                if (id) voice.approveToolCall(id, "session");
              }
            : undefined
        }
        onAlwaysAllow={
          onAlwaysAllowVoiceTool && voice.pendingToolApproval?.tool
            ? () => {
                const tool = voice.pendingToolApproval!.tool;
                const id = voice.pendingToolApproval!.callId;
                onAlwaysAllowVoiceTool(tool);
                if (id) voice.approveToolCall(id, "once");
              }
            : undefined
        }
        onDeny={() => {
          const id = voice.pendingToolApproval?.callId;
          if (id) voice.denyToolCall(id);
        }}
      />

      {(active || showBriefingOffer) && hudAllowed ? (
        <div
          ref={hudShellRef}
          style={shellStyle}
          className="flex w-[min(36rem,calc(100vw-3rem))] flex-col overflow-hidden rounded-xl border border-border bg-bg-card/95 shadow-xl backdrop-blur-md"
        >
          {/* ── Handle strip — always visible, collapses/expands the panel ── */}
          <button
            type="button"
            title={minimized ? "Expand voice panel" : "Collapse voice panel"}
            aria-label={minimized ? "Expand voice panel" : "Collapse voice panel"}
            onClick={minimized ? onRestore : onMinimize}
            className="flex h-7 w-full shrink-0 items-center justify-center border-b border-border bg-bg-secondary text-muted transition-colors hover:bg-hover-overlay hover:text-text-primary"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="h-3 w-3"
              aria-hidden
            >
              {minimized ? (
                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 15.75 7.5-7.5 7.5 7.5" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
              )}
            </svg>
          </button>

          {/* ── Panel body — clipped during the slide animation ── */}
          <div
            role="status"
            aria-live="polite"
            aria-label="Voice assistant activity"
            className="flex flex-col gap-1.5 px-3 py-2"
          >
            <button
              type="button"
              aria-label="Drag to reposition"
              title="Drag to move"
              onPointerDown={onDragHandlePointerDown}
              onPointerMove={onDragHandlePointerMove}
              onPointerUp={onDragHandlePointerUp}
              onPointerCancel={onDragHandlePointerUp}
              className="-mx-1 -my-1 flex cursor-grab items-center gap-2 rounded-lg border border-transparent px-1 py-1 text-left hover:border-border/70 active:cursor-grabbing"
              style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
            >
              <span className="flex gap-1 text-muted shrink-0" aria-hidden>
                <span className="block h-1 w-1 rounded-full bg-current opacity-70" />
                <span className="block h-1 w-1 rounded-full bg-current opacity-70" />
                <span className="block h-1 w-1 rounded-full bg-current opacity-70" />
              </span>
              <span className="text-3xs uppercase tracking-wide text-accent shrink-0">
                {voice.isReconnecting
                  ? "Reconnecting voice…"
                  : showBriefingOffer && !active
                    ? "Briefing"
                    : isPtt && !voice.isPttCapturing
                      ? `Hold ${pttShortcutLabel}`
                      : "Voice active"}
              </span>
              {voice.toolPhaseLabel ? (
                <span className="min-w-0 truncate text-2xs text-amber-200/95">{voice.toolPhaseLabel}</span>
              ) : (
                !voice.outputTranscript &&
                !voice.inputTranscript &&
                voice.isListening &&
                !isPtt &&
                !showBriefingOffer && (
                  <span className="min-w-0 truncate text-2xs text-muted">Listening…</span>
                )
              )}
            </button>

            {showBriefingOffer ? (
              <BriefingOfferChrome
                variant="hud"
                phase={briefingOffer.phase}
                errorMessage={briefingOffer.errorMessage}
                confirmAlwaysOpen={briefingOffer.confirmAlwaysOpen}
                onAccept={briefingOffer.accept}
                onSkipSession={briefingOffer.skipSession}
                onNever={briefingOffer.never}
                onOpenAlwaysConfirm={briefingOffer.openAlwaysConfirm}
                onConfirmAlways={briefingOffer.confirmAlways}
                onCancelAlwaysConfirm={briefingOffer.cancelAlwaysConfirm}
                onCancel={briefingOffer.cancel}
                onRetry={briefingOffer.retry}
              />
            ) : null}

            {voice.inputTranscript ? (
              <p className="text-xs text-muted line-clamp-2 px-1">
                <span className="font-medium text-text-secondary">You: </span>
                {truncate(voice.inputTranscript, 220)}
              </p>
            ) : null}
            {voice.outputTranscript ? (
              <p className="text-xs text-text-primary line-clamp-2 px-1">
                <span className="font-medium text-accent">Assistant: </span>
                {truncate(voice.outputTranscript, 280)}
              </p>
            ) : null}

            <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  voice.stop();
                  voice.dismissError();
                }}
                className="text-3xs px-2.5 py-1 rounded-lg border border-red-800/70 text-red-200 hover:bg-red-950/60"
              >
                Stop microphone
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
