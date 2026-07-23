/**
 * Presentational pieces for {@link ExoPanel} — clock, metrics, center visual.
 */

import { useEffect, useRef, useState, type MutableRefObject, type RefObject } from "react";
import { EXO_CHROME_TRANSITION_MS } from "../constants";
import TesseractVisual, { type TesseractPlan } from "./TesseractVisual";
import type { AgentActivity } from "../features/assistant/plan/planStore";
import { computePreBlendDelayMs } from "../exo/exoLandingTiming";
import type { VoiceVisualMetrics } from "../voice/voiceVisualMetrics";
import type { VoiceTesseractDrive } from "../voice/voiceTesseractPlayback";
import type { UseBriefingOfferUiReturn } from "../hooks/useBriefingOfferUi";
import BriefingOfferChrome from "./BriefingOfferChrome";

// ── Voice / landing (shared with parent status derivation) ───────────────────

export type VoiceStatus = "IDLE" | "ACTIVE" | "LISTENING" | "SPEAKING" | "RECONNECTING";

/** Full-bleed hold: tesseract intro spin rate. Lowered from 2.15 so the rotation reads calmly during the landing hold. */
const LANDING_INTRO_PLAYBACK_RATE = 1.3;
/** Ramp into voice-driven speed while app + Exo chrome slide in — matches `EXO_CHROME_TRANSITION_MS` / `--exo-intro-ms`. */
const LANDING_SPEED_BLEND_MS = EXO_CHROME_TRANSITION_MS;
/**
 * How long after `introActive` becomes true to wait before starting the speed blend,
 * so the blend finishes exactly when TESSERACT_LAUNCH_COMPLETE_MS fires and the panels
 * begin sliding in. Computed by `exoLandingTiming`.
 */
const PRE_BLEND_DELAY_MS = computePreBlendDelayMs(EXO_CHROME_TRANSITION_MS);

/**
 * Maps a linear time fraction [0, 1] to a cubic ease-in-out curve.
 * Produces a slow→fast→slow deceleration: the blend spends more time near
 * the start and end, accelerating through the middle of the landing window.
 */
function easeLandingBlend(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// ── Clock (header row in app shell for AI Manager) ────────────────────────────

export function ExoHeaderClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const tick = () => setNow(new Date());
    // Align to the next minute boundary, then tick once per minute (HH:MM display).
    const msToNextMinute = 60_000 - (Date.now() % 60_000);
    let intervalId: ReturnType<typeof setInterval> | null = null;
    const timeoutId = setTimeout(() => {
      tick();
      intervalId = setInterval(tick, 60_000);
    }, msToNextMinute);
    return () => {
      clearTimeout(timeoutId);
      if (intervalId) clearInterval(intervalId);
    };
  }, []);
  const pad = (n: number) => String(n).padStart(2, "0");
  const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const dateStr = now
    .toLocaleDateString(undefined, { weekday: "short", month: "short", day: "2-digit", year: "numeric" })
    .toUpperCase();
  return (
    <div className="exo-clock exo-clock--header flex flex-col items-start justify-center leading-tight select-none" aria-live="polite">
      <span className="exo-clock-time">{timeStr}</span>
      <span className="exo-clock-date">{dateStr}</span>
    </div>
  );
}

// ── Center ────────────────────────────────────────────────────────────────────

interface ExoCenterProps {
  voiceStatus: VoiceStatus;
  inputTranscript: string;
  outputTranscript: string;
  /** Backend is executing a Gemini Live tool (calendar, mail, etc.). */
  toolPhaseLabel?: string | null;
  /** Last Live tool source id (e.g. google_workspace) — subs for detail line if label lags a frame. */
  lastToolSource?: string | null;
  /** Live mic metrics ref — amplitude/bands updated imperatively (~20 Hz). */
  visualMetricsRef: MutableRefObject<VoiceVisualMetrics>;
  /** False during full-bleed intro: tesseract runs fast; eases to voice speed as chrome appears. */
  layoutRevealed: boolean;
  /** True when the voice session is not capturing (parent) — red cube borders after landing settles (see land blend). */
  micMuted: boolean;
  /** When true, TesseractVisual plays its one-shot intro fade animation. */
  introActive?: boolean;
  /** Called when the Tesseract intro animation ends — signals parent to slide the surrounding chrome in. */
  onTesseractIntroComplete?: () => void;
  /**
   * The briefing section currently being spoken by the pipeline.
   * One of: "news" | "weather" | "calendar" | "mail". Null when no briefing is active.
   * Renders a lightweight progress strip below the status text.
   */
  briefingSection?: string | null;
  /** Startup BriefingOffer chrome — null when Exo is visually hidden (HUD hosts instead). */
  briefingOffer?: UseBriefingOfferUiReturn | null;
  /** Cube visualizer layout — "plan" morphs cubes into the live plan board. */
  planLayout?: "idle" | "plan";
  /** Plan descriptor for the cube board (when planLayout is "plan"). */
  plan?: TesseractPlan | null;
  /** Live plan phase for travel-cube animation while planning / executing. */
  planPhase?: import("./tesseractPlanLayout").PlanBoardPhase | null;
  /**
   * Every agent task currently working (planning/running), across all tabs.
   * Rendered as a compact roster under the status text so the user can see
   * which agents are active and what each is doing.
   */
  activeAgents?: AgentActivity[];
  /** Optional ref for the `.exo-center` column (PTT overlay horizontal anchor on AI Manager). */
  centerRef?: RefObject<HTMLDivElement | null>;
  /** Pause Tesseract RAF/CSS when Exo is off-tab (panel stays mounted for audio). */
  tesseractAnimationSuspended?: boolean;
}

/** Max agent rows shown before collapsing the remainder into a "+N more" line. */
const MAX_VISIBLE_AGENTS = 3;

/**
 * Compact roster of agents currently working, shown under the center status
 * text. Each row pairs the agent's goal with its live one-line activity, so the
 * user can see at a glance which agents are active and what each is doing — even
 * after switching to a different conversation tab.
 */
function AgentActivityRoster({ agents }: { agents: AgentActivity[] }) {
  const visible = agents.slice(0, MAX_VISIBLE_AGENTS);
  const overflow = agents.length - visible.length;
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`${agents.length} agent${agents.length === 1 ? "" : "s"} working`}
      className="mt-1.5 flex w-full max-w-[min(100%,30rem)] flex-col items-center gap-0.5 px-2"
    >
      {visible.map((agent) => (
        <p
          key={agent.taskId}
          className="flex w-full items-center justify-center gap-1.5 truncate text-2xs"
        >
          <span
            aria-hidden
            className={`h-1.5 w-1.5 shrink-0 animate-pulse rounded-full ${
              agent.phase === "planning" ? "bg-accent/80" : "bg-amber-300/90"
            }`}
          />
          <span className="min-w-0 truncate font-medium text-white/80">
            {String(agent.goal || "Agent")}
          </span>
          {agent.activity ? (
            <>
              <span className="text-white/30" aria-hidden>·</span>
              <span className="min-w-0 truncate text-white/55">{String(agent.activity)}</span>
            </>
          ) : null}
        </p>
      ))}
      {overflow > 0 ? <p className="text-2xs text-white/40">+{overflow} more</p> : null}
    </div>
  );
}

export function ExoCenter({
  voiceStatus,
  inputTranscript,
  outputTranscript,
  toolPhaseLabel = null,
  lastToolSource = null,
  visualMetricsRef,
  layoutRevealed,
  micMuted,
  introActive,
  onTesseractIntroComplete,
  briefingSection = null,
  briefingOffer = null,
  planLayout = "idle",
  plan = null,
  planPhase = null,
  activeAgents = [],
  centerRef,
  tesseractAnimationSuspended = false,
}: ExoCenterProps) {
  const statusColors: Record<VoiceStatus, string> = {
    IDLE: "rgba(108,99,255,0.45)",
    ACTIVE: "rgba(0,200,255,0.65)",
    LISTENING: "rgba(0,200,255,0.75)",
    SPEAKING: "rgba(180,30,100,0.75)",
    RECONNECTING: "rgba(255,180,0,0.85)",
  };

  // Derive a human-readable label in priority order:
  // reconnecting → RECONNECTING, tool running → WORKING, AI generating → THINKING,
  // user talking → LISTENING, connected idle → READY, mic off → hidden.
  const displayLabel: string | null =
    voiceStatus === "RECONNECTING" ? "RECONNECTING" :
    planLayout === "plan" ? "WORKING" :
    toolPhaseLabel        ? "WORKING"   :
    voiceStatus === "SPEAKING" || outputTranscript ? "THINKING" :
    voiceStatus === "LISTENING" ? "LISTENING" :
    voiceStatus === "ACTIVE"    ? "READY"     :
    null;

  /** Shown under WORKING — `Working: <tool>` from the session, with last source as fallback. */
  const workingDetailLine =
    toolPhaseLabel?.trim() || (lastToolSource ? `Working: ${lastToolSource}` : null);

  const displayColor =
    displayLabel === "RECONNECTING" ? "rgba(255,180,0,0.85)"    :
    displayLabel === "WORKING"   ? "rgba(255,180,0,0.85)"    :
    displayLabel === "THINKING"  ? "rgba(180,30,100,0.75)"   :
    displayLabel === "LISTENING" ? "rgba(0,200,255,0.75)"    :
    displayLabel === "READY"     ? "rgba(0,200,255,0.65)"    :
    statusColors[voiceStatus];

  const [landBlend, setLandBlend] = useState(() => (layoutRevealed ? 1 : 0));
  const prevLayoutRevealedRef = useRef(layoutRevealed);
  /**
   * Set to true the moment the pre-reveal RAF loop starts (1600 ms before layoutRevealed).
   * Checked by the layoutRevealed effect to decide whether to snap to 1 or blend from 0.
   *
   * Using "started" rather than "completed" avoids a race: the onIntroComplete setTimeout
   * and the pre-blend's last RAF tick are both scheduled ~3100 ms after tab open. JS event
   * loop ordering is not guaranteed between setTimeout callbacks and RAF callbacks, so
   * "completed" could still be false when layoutRevealed fires. "Started" is set 1600 ms
   * earlier (inside a setTimeout at 1500 ms) so it is always true when layoutRevealed fires.
   */
  const preBlendStartedRef = useRef(layoutRevealed);

  // Pre-start the speed blend so the Tesseract is already at normal speed by the
  // time layoutRevealed flips and panels begin sliding in.
  useEffect(() => {
    if (!introActive || layoutRevealed) return;

    let timerId: number | null = null;
    let raf = 0;

    timerId = window.setTimeout(() => {
      timerId = null;
      preBlendStartedRef.current = true; // mark started before the first RAF tick
      const start = performance.now();
      const tick = (now: number) => {
        const rawT = Math.min(1, (now - start) / LANDING_SPEED_BLEND_MS);
        setLandBlend(easeLandingBlend(rawT));
        if (rawT < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, PRE_BLEND_DELAY_MS);

    return () => {
      if (timerId !== null) window.clearTimeout(timerId);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [introActive, layoutRevealed]);

  useEffect(() => {
    const justFinishedHold = !prevLayoutRevealedRef.current && layoutRevealed;
    prevLayoutRevealedRef.current = layoutRevealed;

    if (!layoutRevealed) {
      setLandBlend(0);
      preBlendStartedRef.current = false;
      return;
    }
    if (!justFinishedHold) {
      setLandBlend(1);
      return;
    }

    // Pre-blend has been running for ~1600 ms — landBlend is at ≈1. Lock it in.
    if (preBlendStartedRef.current) {
      setLandBlend(1);
      return;
    }

    // Fallback: intro was skipped (reduced motion, session already seen, etc.). Blend now.
    const start = performance.now();
    let raf = 0;
    setLandBlend(0);
    const tick = (now: number) => {
      const rawT = Math.min(1, (now - start) / LANDING_SPEED_BLEND_MS);
      setLandBlend(easeLandingBlend(rawT));
      if (rawT < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [layoutRevealed]);

  const voiceDriveRef = useRef<VoiceTesseractDrive>({
    metrics: visualMetricsRef.current,
    voiceStatus,
    landBlend,
    outputTranscript,
    introPlaybackRate: LANDING_INTRO_PLAYBACK_RATE,
  });
  voiceDriveRef.current.metrics = visualMetricsRef.current;
  voiceDriveRef.current.voiceStatus = voiceStatus;
  voiceDriveRef.current.landBlend = landBlend;
  voiceDriveRef.current.outputTranscript = outputTranscript;

  const showMicOffCubeBorders = micMuted && landBlend >= 1;

  return (
    <div ref={centerRef} className="exo-center relative min-h-0 flex-1 overflow-hidden">
      <div className="absolute inset-0 exo-bg" />
      <div className="absolute inset-0">
        <TesseractVisual
          compact
          voiceDriveRef={voiceDriveRef}
          micMuted={showMicOffCubeBorders}
          reconnecting={voiceStatus === "RECONNECTING"}
          introActive={introActive}
          onIntroComplete={onTesseractIntroComplete}
          isActive={displayLabel === "WORKING" || displayLabel === "THINKING"}
          layout={planLayout}
          plan={plan}
          planPhase={planPhase}
          animationSuspended={tesseractAnimationSuspended}
        />
      </div>

      {/* Fixed-height, top-aligned status stack: the label is pinned so it never
          shifts when the working-detail / briefing breadcrumb / transcript rows
          appear or disappear while the AI or the user is speaking.
          BriefingOffer expands the stack so Yes / Not now / Never stay usable. */}
      <div
        className="absolute inset-x-0 bottom-[2%] flex flex-col items-center gap-1 px-2 text-center pointer-events-none"
        style={{
          height: briefingOffer?.isActive ? "auto" : "6rem",
          minHeight: "6rem",
          maxHeight: "40%",
          justifyContent: "flex-start",
        }}
      >
        {displayLabel && (
          <p className="exo-voice-status-text" style={{ color: displayColor }}>
            {displayLabel}
          </p>
        )}
        {displayLabel === "WORKING" && workingDetailLine ? (
          <p className="exo-voice-tool-phase mt-1 max-w-[min(100%,28rem)] px-2">
            {workingDetailLine}
          </p>
        ) : null}
        {activeAgents.length > 0 ? (
          <AgentActivityRoster agents={activeAgents} />
        ) : null}
        {briefingOffer?.isActive ? (
          <BriefingOfferChrome
            variant="exo"
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
        {briefingSection && (
          <div className="mt-1.5 flex items-center gap-0.5">
            {(["news", "weather", "calendar", "mail"] as const).map((s, i) => (
              <span key={s} className="flex items-center gap-0.5">
                {i > 0 && (
                  <span className="text-white/20 text-[10px] select-none mx-0.5">›</span>
                )}
                <span
                  className={`text-[11px] px-1.5 py-0.5 rounded transition-all duration-300 ${
                    s === briefingSection
                      ? "text-white/90 font-semibold tracking-wide"
                      : "text-white/25"
                  }`}
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </span>
              </span>
            ))}
          </div>
        )}
        {(inputTranscript || outputTranscript) && (
          <p className="exo-voice-transcript">
            {inputTranscript || outputTranscript}
          </p>
        )}
      </div>
    </div>
  );
}
