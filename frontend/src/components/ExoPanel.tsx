/**
 * AI Manager â€” Exo-style layout.
 *
 *   â”Œâ”€ app header: clock + date â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ title bar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
 *   â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
 *   â”‚  SYSâ‡„    â”‚       CENTER                 â”‚       RIGHT              â”‚
 *   â”‚  drawer â”‚  TesseractVisual + status    â”‚  chat tabs + transcript â”‚
 *   â”‚  (â‡„ â‰¡   â”‚                               â”‚  â€¦                       â”‚
 *   â”‚  toggle)â”‚                               â”‚  [ðŸŽ™ MICROPHONE]         â”‚
 *   â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
 *
 * Time/date live in the app shell header; the narrow column â‡„ expands the SYS monitor drawer.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { CSSProperties } from "react";
import type { AppSettings } from "../types/settings";
import { useConversations, makeId, type ConversationMessage, type ConversationToolContext } from "../hooks/useConversations";
import {
  ASSISTANT_PERMISSION_MODAL_DISMISSED_SESSION_KEY,
  ASSISTANT_PERMISSIONS_PROMPT_EVENT,
  CLAP_NEW_SESSION_EVENT,
} from "../constants";
import type { UseVoiceSessionReturn } from "../hooks/useVoiceSession";
import type { UseBriefingOfferUiReturn } from "../hooks/useBriefingOfferUi";
import { useVoiceBackendReady } from "../hooks/useVoiceBackendReady";
import { AssistantChatPanelWithSharedVoice } from "./AssistantChatPanel";
import ExoConversationTabBar from "./ExoConversationTabBar";
import ExoRailTabBar from "./ExoRailTabBar";
import CodegenPreviewPanel from "../features/codegen/CodegenPreviewPanel";
import {
  getActiveCodegenSessionId,
  setRailTab,
  subscribeActiveCodegen,
  useAssistantRailTab,
  useCodegenState,
} from "../features/codegen/codegenStore";
import { useCodegenCubeLayout } from "../features/codegen/useCodegenCubeLayout";
import { usePlanCubeLayout } from "../features/assistant/plan/usePlanCubeLayout";
import { usePlanState, useRunningAgents } from "../features/assistant/plan/usePlanStream";
import type { PlanBoardPhase } from "./tesseractPlanLayout";
import ExoChatHistoryDrawer from "./ExoChatHistoryDrawer";
import {
  ExoCenter,
  type VoiceStatus,
} from "./ExoPanelChrome";
import { MicControlRow } from "./voice/MicControlRow";
import { useI18n } from "../i18n/I18nContext";
import { isPushToTalkMode, isPttMicOpen } from "../utils/voiceInteractionUi";
import { useExoVisualBudget } from "../exo/useExoVisualBudget";

const EXO_RIGHT_RAIL_MIN_W = 260;
const EXO_RIGHT_RAIL_MAX_W = 560;
const EXO_RIGHT_RAIL_DEFAULT_W = 340;
const EXO_RIGHT_RAIL_WIDTH_STORAGE_KEY = "exosites.exo.rightRailWidth.v1";
const LEGACY_EXO_RIGHT_RAIL_WIDTH_STORAGE_KEY = "exosites.jarvis.rightRailWidth.v1";

function readStoredExoRailWidthPx(): number {
  try {
    let raw = localStorage.getItem(EXO_RIGHT_RAIL_WIDTH_STORAGE_KEY);
    if (!raw) {
      raw = localStorage.getItem(LEGACY_EXO_RIGHT_RAIL_WIDTH_STORAGE_KEY);
      if (raw) {
        localStorage.setItem(EXO_RIGHT_RAIL_WIDTH_STORAGE_KEY, raw);
      }
    }
    if (!raw) return EXO_RIGHT_RAIL_DEFAULT_W;
    const n = parseInt(raw, 10);
    return Number.isFinite(n)
      ? Math.min(EXO_RIGHT_RAIL_MAX_W, Math.max(EXO_RIGHT_RAIL_MIN_W, n))
      : EXO_RIGHT_RAIL_DEFAULT_W;
  } catch {
    return EXO_RIGHT_RAIL_DEFAULT_W;
  }
}

// â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface ExoPanelProps {
  /** Shared Gemini Live voice session owned by {@link AppMainWorkspace} â€” persists across workspace tabs. */
  voice: UseVoiceSessionReturn;
  /** Startup BriefingOffer chrome state (shared with AmbientVoiceHud). */
  briefingOffer: UseBriefingOfferUiReturn;
  settings: AppSettings;
  settingsHydrated: boolean;
  backendOnline: boolean;
  onSettingsPatch: (patch: Partial<AppSettings>) => void;
  onOpenAssistantSettings: () => void;
  /** Settings â†’ AI models (chat / sort / vision). Used when chat has no model selected. */
  onOpenGeminiSetup?: () => void;
  /** Settings â†’ System (connection). Used when the local app service is offline. */
  onOpenConnectionSettings?: () => void;
  /** Navigate to Settings â†’ AI Provider section (used by error "Fix in Settings" buttons). */
  onGoToAiSettings: () => void;
  onOpenVoiceInteractionSettings?: () => void;
  /** Opens the full-width Chat AI tab from the AI Manager chat rail's expand control. */
  onExpandToChat?: () => void;
  /**
   * When false, Exo subtree is minimally laid out off-screen rather than display:none â€”
   * keeps audio / Web Audio paths reliable while switching tabs.
   */
  visuallyHidden?: boolean;
  /** Freeze mic spectrum polling when Exo visuals are idle/hidden. */
  setVisualAnalysisSuspended?: (suspended: boolean) => void;
  /** Skip the first-run assistant actions modal (cloud login / welcome wizard). */
  suppressPermissionPrompt?: boolean;
  /** Wait until the product tour finishes before prompting for assistant actions. */
  deferPermissionPrompt?: boolean;
  /** When false, only the Tesseract center is shown; shell chrome slides in with the app shell (see AppMainWorkspace). */
  layoutRevealed: boolean;
  /**
   * Called when the Tesseract intro animation completes â€” parent should set `exoChromeRevealed=true`
   * to slide the surrounding app-shell panels and Exo chrome in.
   */
  /** When true, hold the Tesseract launch animation until the local service finishes booting. */
  deferTesseractIntro?: boolean;
  onTesseractIntroComplete?: () => void;
  /** Ref to `.exo-center` for overlays that should align with the tesseract column. */
  centerAnchorRef?: RefObject<HTMLDivElement | null>;
}

type ExoChromePhase = "intro" | "phase1_right" | "full";

// â”€â”€ Main component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export default function ExoPanel({
  voice,
  briefingOffer,
  settings,
  settingsHydrated,
  backendOnline,
  onSettingsPatch,
  onOpenAssistantSettings,
  onOpenGeminiSetup,
  onOpenConnectionSettings,
  onGoToAiSettings,
  onOpenVoiceInteractionSettings,
  onExpandToChat,
  visuallyHidden = false,
  setVisualAnalysisSuspended,
  suppressPermissionPrompt = false,
  deferPermissionPrompt = false,
  layoutRevealed,
  deferTesseractIntro = false,
  onTesseractIntroComplete,
  centerAnchorRef,
}: ExoPanelProps) {
  const { t } = useI18n();
  const {
    conversations,
    activeId,
    active,
    updateMessages,
    appendToolContext,
    updateSummary,
    create: createConversation,
    remove: removeConversation,
    setActive: setActiveConversation,
  } = useConversations();

  const planCubeLayout = usePlanCubeLayout();
  const agentPlanState = usePlanState();
  const runningAgents = useRunningAgents();
  const codegenCubeLayout = useCodegenCubeLayout();
  const [activeCodegenId, setActiveCodegenId] = useState<string | null>(getActiveCodegenSessionId);
  const codegenState = useCodegenState(activeCodegenId ?? undefined);
  useEffect(() => {
    return subscribeActiveCodegen(() => setActiveCodegenId(getActiveCodegenSessionId()));
  }, []);
  const centerCubeLayout =
    codegenCubeLayout.layout === "plan" ? codegenCubeLayout : planCubeLayout;
  const centerPlanPhase: PlanBoardPhase | null =
    codegenCubeLayout.layout === "plan"
      ? codegenState?.phase === "planning"
        ? "planning"
        : codegenState?.phase === "ready"
          ? "complete"
          : codegenState?.phase === "error"
            ? "error"
            : codegenState?.phase === "cancelled"
              ? "cancelled"
              : "running"
      : agentPlanState?.phase ?? null;
  const railTab = useAssistantRailTab();

  const voiceReady = useVoiceBackendReady(settings, backendOnline, settingsHydrated);
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>("IDLE");
  // fileKey forces AssistantChatPanel to remount after each file injection
  const [fileKey, setFileKey] = useState(0);
  const [rightRailWidth, setRightRailWidth] = useState(readStoredExoRailWidthPx);
  /** Chat/activity rail: open whenever AI Manager mounts; collapsing is session-only (not persisted). */
  const [chatRailOpen, setChatRailOpen] = useState(true);
  const [chatHistoryOpen, setChatHistoryOpen] = useState(false);
  const rightRailDragStartX = useRef(0);
  const rightRailDragStartWidth = useRef(rightRailWidth);
  const [rightRailResizeDragging, setRightRailResizeDragging] = useState(false);

  const pushToTalkMode = isPushToTalkMode(settings);

  // Derive voice status from session state — PTT keeps the socket warm but UI stays idle until capture.
  useEffect(() => {
    if (voice.isReconnecting) { setVoiceStatus("RECONNECTING"); return; }
    if (pushToTalkMode) {
      const micOpen = isPttMicOpen(voice);
      const turnInFlight =
        micOpen ||
        Boolean(voice.outputTranscript?.trim()) ||
        Boolean(voice.inputTranscript?.trim()) ||
        Boolean(voice.toolPhaseLabel?.trim());
      if (!turnInFlight) { setVoiceStatus("IDLE"); return; }
    } else if (!voice.isListening) {
      setVoiceStatus("IDLE");
      return;
    }
    if (voice.outputTranscript) { setVoiceStatus("SPEAKING"); return; }
    if (voice.inputTranscript) { setVoiceStatus("LISTENING"); return; }
    setVoiceStatus("ACTIVE");
  }, [
    pushToTalkMode,
    voice.isListening,
    voice.isReconnecting,
    voice.isPttCapturing,
    voice.inputTranscript,
    voice.outputTranscript,
    voice.toolPhaseLabel,
  ]);

  // Sensitive tool approvals render in AmbientVoiceHud â€” never clipped behind Exo subtree.
  // Prompt for AI action permissions on first visit (only while this workspace is visible)
  useEffect(() => {
    if (visuallyHidden || suppressPermissionPrompt || deferPermissionPrompt) return;
    if (settings.assistantToolsEnabled) return;
    try {
      if (sessionStorage.getItem(ASSISTANT_PERMISSION_MODAL_DISMISSED_SESSION_KEY) === "1") return;
    } catch { /* ignore */ }
    window.dispatchEvent(new CustomEvent(ASSISTANT_PERMISSIONS_PROMPT_EVENT));
  }, [settings.assistantToolsEnabled, visuallyHidden, suppressPermissionPrompt, deferPermissionPrompt]);

  // Waking via double-clap from a tray-closed app opens a fresh conversation tab so the
  // returning session starts clean (the voice session itself is restarted in AppMainWorkspace).
  useEffect(() => {
    const onNewSession = () => createConversation();
    window.addEventListener(CLAP_NEW_SESSION_EVENT, onNewSession);
    return () => window.removeEventListener(CLAP_NEW_SESSION_EVENT, onNewSession);
  }, [createConversation]);

  // Voice persists when switching to another workspace tab â€” only F4 / the mic
  // button in AI Manager explicitly stops it (no teardown on visuallyHidden).

  const [exoChromePhase, setExoChromePhase] = useState<ExoChromePhase>(() =>
    layoutRevealed ? "full" : "intro",
  );
  const prevLayoutRevealChromeRef = useRef(layoutRevealed);

  // Intro animation: active when Exo panel is first unveiled while layout is still in hold mode.
  // Held until the local service startup overlay dismisses so copy and animation never overlap.
  const [introActive, setIntroActive] = useState(
    () => !visuallyHidden && !layoutRevealed && !deferTesseractIntro,
  );
  const prevVisuallyHiddenRef = useRef(visuallyHidden);

  useEffect(() => {
    if (deferTesseractIntro) {
      setIntroActive(false);
      return;
    }
    prevVisuallyHiddenRef.current = visuallyHidden;
    if (!visuallyHidden && !layoutRevealed) {
      setIntroActive(true);
    }
  }, [deferTesseractIntro, visuallyHidden, layoutRevealed]);

  const { budget: visualBudget, suspendVoiceAnalyser } = useExoVisualBudget({
    visuallyHidden,
    voiceStatus,
  });

  useEffect(() => {
    setVisualAnalysisSuspended?.(suspendVoiceAnalyser);
  }, [suspendVoiceAnalyser, setVisualAnalysisSuspended]);

  useLayoutEffect(() => {
    if (!layoutRevealed) {
      prevLayoutRevealChromeRef.current = false;
      setExoChromePhase("intro");
      return;
    }

    const fromHoldComplete = prevLayoutRevealChromeRef.current === false;
    prevLayoutRevealChromeRef.current = true;

    if (!fromHoldComplete) return;

    const staggerMs = 0;
    setExoChromePhase(staggerMs > 0 ? "phase1_right" : "full");
    if (staggerMs <= 0) return;

    const tid = window.setTimeout(() => setExoChromePhase("full"), staggerMs);
    return () => window.clearTimeout(tid);
  }, [layoutRevealed]);

  const exoShellVisualPhase: "intro" | "phase1_right" | "full" = (() => {
    if (!layoutRevealed) return "intro";
    if (exoChromePhase === "full") return "full";
    if (exoChromePhase === "phase1_right") return "phase1_right";
    return "full";
  })();

  const shellPhaseClass =
    exoShellVisualPhase === "intro"
      ? "exo-shell--intro"
      : exoShellVisualPhase === "full"
        ? "exo-shell--revealed"
        : "exo-shell--revealed-phase1";

  /** Red "mic off" tesseract borders only after landing finishes — not during hold / chrome stagger. */
  const tesseractMicMuted =
    layoutRevealed &&
    exoShellVisualPhase === "full" &&
    (pushToTalkMode
      ? !isPttMicOpen(voice) && !voice.isReconnecting
      : !voice.isListening && !voice.isReconnecting);

  // Start the mic as soon as the backend is ready — only on the visible Exo tab.
  useEffect(() => {
    if (visuallyHidden) return;
    if (settings.voiceInteractionMode !== "conversation") return;
    if (!settings.voiceAutoStart) return;
    if (!voiceReady || !backendOnline) return;
    if (voice.micAutostartSuppressed) return;
    if (voice.isListening || voice.isReconnecting) return;
    void voice.start();
  }, [
    settings.voiceInteractionMode,
    settings.voiceAutoStart,
    backendOnline,
    voiceReady,
    voice.micAutostartSuppressed,
    voice.isListening,
    voice.isReconnecting,
    voice.start,
    visuallyHidden,
  ]);

  const persistChatRailOpen = useCallback((open: boolean) => {
    setChatRailOpen(open);
  }, []);

  useEffect(() => {
    if (!chatRailOpen) setChatHistoryOpen(false);
  }, [chatRailOpen]);

  // Right-hand Exo rail width drag-handle
  const handleRightRailResizeMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!layoutRevealed || !chatRailOpen) return;
      e.preventDefault();
      setRightRailResizeDragging(true);
      rightRailDragStartX.current = e.clientX;
      rightRailDragStartWidth.current = rightRailWidth;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      const onMove = (ev: MouseEvent) => {
        const delta = rightRailDragStartX.current - ev.clientX;
        const next = Math.min(
          EXO_RIGHT_RAIL_MAX_W,
          Math.max(EXO_RIGHT_RAIL_MIN_W, rightRailDragStartWidth.current + delta),
        );
        setRightRailWidth(next);
      };

      const onUp = () => {
        setRightRailResizeDragging(false);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        setRightRailWidth((w) => {
          try {
            localStorage.setItem(EXO_RIGHT_RAIL_WIDTH_STORAGE_KEY, String(w));
          } catch {
            /* ignore */
          }
          return w;
        });
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [layoutRevealed, chatRailOpen, rightRailWidth],
  );

  // When the history drawer is open, the right rail expands by the drawer width
  // so the chat panel itself is never compressed â€” the center column absorbs the push.
  const HISTORY_DRAWER_MAX_W = 288; // must match clamp max in ExoChatHistoryDrawer

  const exoShellStyle: CSSProperties = {
    ["--exo-right-rail-width" as string]: `${rightRailWidth}px`,
    ["--exo-right-rail-track" as string]: chatRailOpen
      ? `${rightRailWidth + (chatHistoryOpen ? HISTORY_DRAWER_MAX_W : 0)}px`
      : "var(--exo-chat-rail-strip-w)",
  };

  const handleConversationChange = useCallback(
    (msgs: ConversationMessage[]) => updateMessages(activeId, msgs),
    [activeId, updateMessages],
  );
  const handleToolContext = useCallback(
    (entry: ConversationToolContext) => appendToolContext(activeId, entry),
    [activeId, appendToolContext],
  );
  const handleSummaryUpdate = useCallback(
    (summary: string) => updateSummary(activeId, summary),
    [activeId, updateSummary],
  );

  const handleComposerAttach = useCallback((name: string, content: string, opts?: { imageDataUrl?: string }) => {
    const fileMsg: ConversationMessage = {
      id: makeId(),
      role: "user",
      // Keep a short caption in content for LLM/history; bubble hides it when imageAttachment is set.
      content: opts?.imageDataUrl ? `[Image uploaded: ${name}]` : `[File uploaded: ${name}]\n\`\`\`\n${content}\n\`\`\``,
      createdAt: new Date().toISOString(),
      ...(opts?.imageDataUrl
        ? { imageAttachment: { name, dataUrl: opts.imageDataUrl } }
        : {}),
    };
    updateMessages(activeId, [...active.messages, fileMsg]);
    setFileKey((k) => k + 1);
  }, [activeId, active.messages, updateMessages]);

  return (
    <div
      className={`flex flex-col min-h-0 overflow-hidden bg-bg-secondary ${
        visuallyHidden
          ? "fixed top-0 left-0 z-0 shrink-0 m-[-1px] h-[1px] w-[1px] overflow-hidden border-0 p-0 opacity-0"
          : "h-full flex-1"
      }`}
      aria-hidden={visuallyHidden || undefined}
    >
      <div
        className={`exo-shell flex min-h-0 flex-1 flex-col overflow-hidden ${shellPhaseClass} ${
          rightRailResizeDragging ? "exo-shell--right-rail-resize-dragging" : ""
        }${layoutRevealed && !chatRailOpen ? " exo-shell--chat-rail-collapsed" : ""}${
          deferTesseractIntro && !layoutRevealed ? " exo-shell--tesseract-held" : ""
        }`}
        style={exoShellStyle}
        aria-busy={!visuallyHidden && !layoutRevealed ? true : undefined}
      >
        {/* Body: left drawer | center | right â€” grid columns collapse to center-only during intro */}
        <div className="exo-shell-body min-h-0 flex-1 overflow-hidden">

          <ExoCenter
            centerRef={centerAnchorRef}
            layoutRevealed={layoutRevealed}
            voiceStatus={voiceStatus}
            inputTranscript={voice.inputTranscript}
            outputTranscript={voice.outputTranscript}
            toolPhaseLabel={
              codegenCubeLayout.layout === "plan" && codegenState
                ? codegenState.phase === "generating"
                  ? t("assistant.codegen.phaseGenerating")
                  : codegenState.phase === "installing"
                    ? t("assistant.codegen.phaseInstalling")
                    : codegenState.phase === "starting"
                      ? t("assistant.codegen.phaseStarting")
                      : codegenState.phase === "ready"
                        ? t("assistant.codegen.phaseReady")
                        : codegenState.phase === "error"
                          ? t("assistant.codegen.phaseError")
                          : voice.toolPhaseLabel
                : voice.toolPhaseLabel
            }
            lastToolSource={voice.lastToolSource}
            visualMetricsRef={voice.visualMetricsRef}
            micMuted={tesseractMicMuted}
            introActive={introActive}
            onTesseractIntroComplete={onTesseractIntroComplete}
            briefingSection={
              codegenCubeLayout.layout === "plan" ? null : voice.briefingSection
            }
            briefingOffer={visuallyHidden ? null : briefingOffer}
            planLayout={centerCubeLayout.layout}
            plan={centerCubeLayout.plan}
            planPhase={centerCubeLayout.layout === "plan" ? centerPlanPhase : null}
            activeAgents={runningAgents}
            tesseractAnimationSuspended={visualBudget !== "RUNNING"}
          />

          <div className="exo-shell-body-right min-h-0 overflow-hidden">
            {layoutRevealed && chatRailOpen && (
              <div
                role="separator"
                aria-orientation="vertical"
                aria-label={t("assistant.resizeExoRailAria")}
                title={t("assistant.resizeExoRailTitle")}
                onMouseDown={handleRightRailResizeMouseDown}
                className="absolute inset-y-0 left-0 z-[6] flex w-2.5 cursor-col-resize items-stretch justify-center bg-transparent group"
              >
                <span
                  className="my-0 h-full w-0.5 shrink-0 self-stretch rounded-full bg-transparent transition-colors group-hover:bg-accent/50 group-active:bg-accent"
                  aria-hidden
                />
              </div>
            )}
            <div className="exo-shell-body-right-panel flex h-full min-h-0 flex-col overflow-hidden">
              {chatRailOpen ? (
                <div className="exo-right-panel flex min-h-0 flex-1 flex-col overflow-hidden">
                  <ExoConversationTabBar
                    conversations={conversations}
                    activeId={activeId}
                    onSelect={setActiveConversation}
                    onNew={createConversation}
                    onClose={removeConversation}
                    historyOpen={chatHistoryOpen}
                    onToggleHistory={() => setChatHistoryOpen((prev) => !prev)}
                    onCollapseChatRail={() => persistChatRailOpen(false)}
                    onExpandToChat={onExpandToChat}
                  />
                  {window.electronAPI?.codegenRunInstall && (
                    <ExoRailTabBar activeTab={railTab} onSelect={setRailTab} />
                  )}
                  <div className="flex min-h-0 flex-1 flex-row overflow-hidden">
                    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                      <div className="min-h-0 flex-1 overflow-hidden">
                        {railTab === "preview" && window.electronAPI?.codegenRunInstall ? (
                          <CodegenPreviewPanel
                            sessionId={activeCodegenId}
                            overlayVisible={!visuallyHidden && layoutRevealed}
                          />
                        ) : (
                        <AssistantChatPanelWithSharedVoice
                          key={`${activeId}-${fileKey}-${visuallyHidden ? "bg" : "fg"}`}
                          voice={voice}
                          conversation={active}
                          onConversationChange={handleConversationChange}
                          onToolContext={handleToolContext}
                          onSummaryUpdate={handleSummaryUpdate}
                          settings={settings}
                          backendOnline={backendOnline}
                          onOpenAssistantSettings={onOpenAssistantSettings}
                          onOpenGeminiSetup={onOpenGeminiSetup}
                          onOpenConnectionSettings={onOpenConnectionSettings}
                          hideHeader
                          hideInputAccessories
                          collapseSuggestionsInitially
                          acceptQueuedChatDraft={!visuallyHidden}
                          persistConversationMessages={!visuallyHidden}
                          chatDraftTarget="exo"
                          onComposerInlineAttachment={handleComposerAttach}
                        />
                        )}
                      </div>

                      {/* Microphone + settings */}
                      {railTab !== "preview" && (
                      <div className="flex-shrink-0 space-y-1.5 border-t border-border px-3 py-2">
                        <MicControlRow
                          voice={voice}
                          settings={settings}
                          onSettingsPatch={onSettingsPatch}
                          voiceReady={voiceReady}
                          onOpenAiProviderSettings={onGoToAiSettings ?? onOpenGeminiSetup}
                          onOpenFullVoiceSettings={onOpenVoiceInteractionSettings ?? onOpenAssistantSettings}
                          layout="exo"
                        />
                      </div>
                      )}
                    </div>
                    <ExoChatHistoryDrawer
                      open={chatHistoryOpen}
                      onClose={() => setChatHistoryOpen(false)}
                      conversations={conversations}
                      activeId={activeId}
                      onSelect={setActiveConversation}
                      onNew={createConversation}
                    />
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className="exo-chat-rail-expand flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center border-l border-border bg-bg-secondary text-muted transition-colors hover:bg-hover-overlay hover:text-text-primary"
                  onClick={() => persistChatRailOpen(true)}
                  title={t("assistant.chatRailExpand")}
                  aria-label={t("assistant.chatRailExpandAria")}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 shrink-0" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m15 18-6-6 6-6" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
