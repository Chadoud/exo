import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, FormEvent, KeyboardEvent } from "react";
import type { AppSettings } from "../../../types/settings";
import type { UseVoiceSessionReturn } from "../../../hooks/useVoiceSession";
import type { VoiceBackendReadiness } from "../../../hooks/useVoiceBackendReady";
import TaskProgressCard from "../../../components/TaskProgressCard";
import CodegenSessionCard from "../../../components/CodegenSessionCard";
import CodegenConsentModal from "../../../components/CodegenConsentModal";
import ExoRailTabBar from "../../../components/ExoRailTabBar";
import CodegenPreviewPanel from "../../codegen/CodegenPreviewPanel";
import {
  getActiveCodegenSessionId,
  setRailTab,
  subscribeActiveCodegen,
  useAssistantRailTab,
} from "../../codegen/codegenStore";
import { SidebarRailToggleGlyph } from "../../../components/SidebarRailToggleGlyph";
import type { ChatMessage } from "../../../api/assistantChat";
import {
  ASSISTANT_PERMISSIONS_PROMPT_EVENT,
  ASSISTANT_WORKSPACE_TOP_BAR_CLASS,
} from "../../../constants";
import { useI18n } from "../../../i18n/I18nContext";
import { CARD_SHELL_CLASS } from "../../../utils/styles";
import {
  type Conversation,
  type ConversationMessage,
  type ConversationToolContext,
} from "../../../hooks/useConversations";
import SlashCommandPalette, { SLASH_COMMANDS } from "../../../components/SlashCommandPalette";
import AssistantMessageBubble from "../../../components/AssistantMessageBubble";
import ConversationCitations from "../../../components/ConversationCitations";
import { MicControlRow } from "../../../components/voice/MicControlRow";
import { isPushToTalkMode, isPttVoiceUiActive } from "../../../utils/voiceInteractionUi";
import { useAssistantChatController } from "./useAssistantChatController";
import { getChatBlockReason } from "../../../utils/chatReadiness";
import { consumeChatDraft, type ChatDraftTarget } from "../../../utils/chatComposerDraft";
import { CHAT_DRAFT_QUEUE_EVENT } from "../../../constants";
import { useProductDebugAccess } from "../../../hooks/useProductDebugAccess";
import { shouldShowAssistantDebugUi } from "../../../utils/productDebugAccess";

// ── Constants ─────────────────────────────────────────────────────────────────

const SUGGESTION_KEYS = [
  "assistant.suggestion1",
  "assistant.suggestion2",
  "assistant.suggestion3",
  "assistant.slashInvoicesFill",
  "assistant.suggestion4",
] as const;

/** Pixels from the bottom before the scroll-to-bottom button appears. */
const SCROLL_BOTTOM_THRESHOLD_PX = 120;

// ── Types ─────────────────────────────────────────────────────────────────────

/** One entry in the ring-buffer of recent outbound chat payloads — used by debug export. */
export interface OutboundChatRecord {
  sentAt: string;
  intent: string;
  wantsPrefetch: boolean;
  previousUserContentPreview: string;
  systemPromptChars: number;
  outboundMessagesCount: number;
  outboundMessages: ChatMessage[];
}

interface AssistantChatPanelProps {
  conversation: Conversation;
  onConversationChange: (msgs: ConversationMessage[]) => void;
  /** Hidden mail/calendar tool JSON for memory origin linking. */
  onToolContext?: (entry: ConversationToolContext) => void;
  settings: AppSettings;
  backendOnline: boolean;
  onOpenAssistantSettings: () => void;
  /** Opens Gemini API setup when chat is blocked (cloud AI — not local Ollama models). */
  onOpenGeminiSetup?: () => void;
  /** Prerequisite banner when the local app service is offline — opens Settings → System (connection). */
  onOpenConnectionSettings?: () => void;
  /** When true the top title/settings header bar is not rendered (Exo layout uses its own header). */
  hideHeader?: boolean;
  /** When true, the suggestion-chip row starts collapsed behind a toggle (AI Manager tab). */
  collapseSuggestionsInitially?: boolean;
  /** When true, hides the VisualContextButton and mic button in the chat input row (AI Manager provides its own mic control). */
  hideInputAccessories?: boolean;
  /**
   * When false, this panel ignores queued composer prefills (e.g. Exo rail while another tab is active).
   * Defaults to true.
   */
  acceptQueuedChatDraft?: boolean;
  /**
   * When false, do not write this panel's messages into the shared conversation store.
   * Required for the always-mounted Exo rail so it cannot clobber Chat tab updates.
   */
  persistConversationMessages?: boolean;
  /** Which chat surface this panel is — must match {@link queueChatDraft} target. */
  chatDraftTarget?: ChatDraftTarget;
  /**
   * When provided, a paperclip attachment button is rendered between the textarea and send/stop.
   * Optional imageDataUrl shows a preview bubble instead of dumping binary into a code fence.
   */
  onComposerInlineAttachment?: (
    filename: string,
    content: string,
    opts?: { imageDataUrl?: string },
  ) => void;
  /** Called with a fresh summary string after background summarisation completes. */
  onSummaryUpdate?: (summary: string) => void;
  /** Whether the conversation history sidebar is currently collapsed. */
  sidebarCollapsed?: boolean;
  /** Toggles the conversation history sidebar open/closed. */
  onSidebarToggle?: () => void;
  onSettingsPatch?: (patch: Partial<AppSettings>) => void;
  onOpenAiProviderSettings?: () => void;
  onOpenVoiceInteractionSettings?: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

type AssistantChatPanelBodyProps = AssistantChatPanelProps & {
  voice: UseVoiceSessionReturn;
  voiceReadiness: VoiceBackendReadiness;
};

/** Chat UI wired to an existing voice session — use inside AI Manager next to Exo's `useVoiceSession`. */
export function AssistantChatPanelWithSharedVoice(props: AssistantChatPanelBodyProps) {
  return <AssistantChatPanelBody {...props} />;
}

export function AssistantChatPanelBody({
  voice,
  voiceReadiness,
  conversation,
  onConversationChange,
  onToolContext,
  settings,
  backendOnline,
  onOpenAssistantSettings,
  onOpenGeminiSetup,
  onOpenConnectionSettings,
  hideHeader = false,
  collapseSuggestionsInitially = false,
  hideInputAccessories = false,
  onComposerInlineAttachment,
  onSummaryUpdate,
  sidebarCollapsed,
  onSidebarToggle,
  onSettingsPatch,
  onOpenAiProviderSettings,
  onOpenVoiceInteractionSettings,
  acceptQueuedChatDraft = true,
  persistConversationMessages = true,
  chatDraftTarget = "assistant",
}: AssistantChatPanelBodyProps) {
  const { t } = useI18n();
  const productDebugEnabled = useProductDebugAccess();
  const showSnapshotDebug = shouldShowAssistantDebugUi(
    productDebugEnabled,
    settings.assistantDebugUiEnabled,
  );

  const [draft, setDraft] = useState("");
  const [showCapabilities, setShowCapabilities] = useState(false);
  const [suggestionsExpanded, setSuggestionsExpanded] = useState(!collapseSuggestionsInitially);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [slashIndex, setSlashIndex] = useState(0);

  const scrollViewportRef = useRef<HTMLDivElement>(null);
  const scrollAnchorRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const attachInputRef = useRef<HTMLInputElement>(null);

  const applyQueuedDraft = useCallback(() => {
    if (!acceptQueuedChatDraft) return;
    const queued = consumeChatDraft(chatDraftTarget);
    if (!queued) return;
    setDraft(queued);
    requestAnimationFrame(() => {
      const field = textareaRef.current;
      if (!field) return;
      field.focus();
      const end = queued.length;
      field.setSelectionRange(end, end);
    });
  }, [acceptQueuedChatDraft, chatDraftTarget]);

  useEffect(() => {
    if (!acceptQueuedChatDraft) return;
    applyQueuedDraft();
    const onQueued = (event: Event) => {
      const detail = (event as CustomEvent<ChatDraftTarget>).detail;
      if (detail && detail !== chatDraftTarget) return;
      applyQueuedDraft();
    };
    window.addEventListener(CHAT_DRAFT_QUEUE_EVENT, onQueued);
    return () => window.removeEventListener(CHAT_DRAFT_QUEUE_EVENT, onQueued);
  }, [acceptQueuedChatDraft, applyQueuedDraft, chatDraftTarget]);
  const [activeCodegenId, setActiveCodegenId] = useState<string | null>(getActiveCodegenSessionId);
  useEffect(() => subscribeActiveCodegen(() => setActiveCodegenId(getActiveCodegenSessionId())), []);
  const showCodegenRail = Boolean(window.electronAPI?.codegenRunInstall) && !hideHeader;

  const {
    localMessages,
    isStreaming,
    sendMessage,
    handleStop,
    handleDebugExport,
    codegenConsentOpen,
    approveCodegenConsent,
    denyCodegenConsent,
    voiceTurnTraces,
  } = useAssistantChatController({
    voice,
    conversation,
    onConversationChange,
    onToolContext,
    settings,
    backendOnline,
    onSummaryUpdate,
    onDraftClear: useCallback(() => setDraft(""), []),
    persistConversationMessages,
  });

  const showSlashPalette = draft.startsWith("/") && !isStreaming;
  const visibleSlashCommands = SLASH_COMMANDS.filter(
    (cmd) => draft === "/" || cmd.id.startsWith(draft.slice(1).toLowerCase())
  );

  const railTab = useAssistantRailTab();
  const handleAttachClick = useCallback(() => {
    if (!onComposerInlineAttachment) return;

    if (window.electronAPI?.openFilesOrFolders) {
      window.electronAPI.openFilesOrFolders().then(async (paths) => {
        if (!paths?.length) return;
        const filePath = paths[0];
        if (!window.electronAPI?.readComposerAttachment) return;
        const result = await window.electronAPI.readComposerAttachment(filePath);
        if (!result.ok) return;
        if (result.kind === "directory") {
          onComposerInlineAttachment(result.basename, `[Folder attached: ${result.basename}]\n${result.pathText}`);
        } else if (result.kind === "file_too_large") {
          onComposerInlineAttachment(result.basename, `[File too large to inline — ${result.basename}]`);
        } else if (result.kind === "image") {
          // Vision turn: send immediately so the model receives multimodal parts (not caption-only).
          void sendMessage(`Please describe and analyze this image (${result.basename}).`, {
            imageAttachment: { name: result.basename, dataUrl: result.dataUrl },
          });
        } else if (result.kind === "document") {
          void sendMessage(
            `Please read and analyze the attached document (${result.basename}). Summarize who it's about, key experience, skills, and notable projects. Be specific.`,
            {
              documentAttachment: {
                name: result.basename,
                text: result.text,
                pages: result.pages ?? null,
                truncated: Boolean(result.truncated),
                source: result.source,
                previewDataUrl: result.previewDataUrl,
              },
            },
          );
        } else if (result.kind === "video") {
          onComposerInlineAttachment(
            result.basename,
            `[Video not supported: ${result.basename}]`,
          );
        } else if (result.kind === "binary") {
          const detail =
            result.reason === "encrypted"
              ? "password-protected or encrypted"
              : result.reason === "no_text_layer"
                ? "no extractable text (scanned?)"
                : "preview not available";
          onComposerInlineAttachment(
            result.basename,
            `[Could not read ${result.basename} — ${detail}]`,
          );
        } else {
          onComposerInlineAttachment(result.basename, result.text.slice(0, 8000));
        }
      }).catch(() => { /* picker cancelled or read failed silently */ });
      return;
    }

    // Browser fallback
    attachInputRef.current?.click();
  }, [onComposerInlineAttachment, sendMessage]);

  const handleAttachInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!onComposerInlineAttachment) return;
      const file = e.target.files?.[0];
      if (!file) return;
      e.target.value = "";
      if (file.type.startsWith("image/")) {
        if (file.size > 8 * 1024 * 1024) {
          onComposerInlineAttachment(file.name, `[File too large to inline — ${(file.size / 1024).toFixed(0)} KB]`);
          return;
        }
        const reader = new FileReader();
        reader.onload = (ev) => {
          const dataUrl = typeof ev.target?.result === "string" ? ev.target.result : "";
          if (!dataUrl) {
            onComposerInlineAttachment(file.name, "[Could not read image]");
            return;
          }
          void sendMessage(`Please describe and analyze this image (${file.name}).`, {
            imageAttachment: { name: file.name, dataUrl },
          });
        };
        reader.onerror = () => onComposerInlineAttachment(file.name, "[Could not read file content]");
        reader.readAsDataURL(file);
        return;
      }
      if (file.size > 500_000) {
        onComposerInlineAttachment(file.name, `[File too large to inline — ${(file.size / 1024).toFixed(0)} KB]`);
        return;
      }
      const reader = new FileReader();
      reader.onload = (ev) => {
        const text = typeof ev.target?.result === "string" ? ev.target.result : "";
        onComposerInlineAttachment(file.name, text.slice(0, 8000));
      };
      reader.onerror = () => onComposerInlineAttachment(file.name, "[Could not read file content]");
      reader.readAsText(file);
    },
    [onComposerInlineAttachment, sendMessage],
  );

  const chatBlockReason = getChatBlockReason(settings);
  const cloudChatOnly = !backendOnline && chatBlockReason === null;
  const canSend = chatBlockReason === null && !isStreaming && draft.trim().length > 0;
  const showPrerequisite = chatBlockReason !== null;
  const isPtt = isPushToTalkMode(settings);
  const pttUiActive = isPtt && isPttVoiceUiActive(voice);
  const showComposerVoiceAccessories = !hideInputAccessories && Boolean(onSettingsPatch);
  const showComposerPttHint = showComposerVoiceAccessories && isPtt && !pttUiActive;

  // Auto-scroll to bottom on new messages and during live voice turns
  useEffect(() => {
    const root = scrollViewportRef.current;
    const anchor = scrollAnchorRef.current;
    if (!root || !anchor) return;
    const overflow = root.scrollHeight > root.clientHeight + 1;
    if (!overflow) { root.scrollTop = 0; return; }
    anchor.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [localMessages, voice.inputTranscript, voice.outputTranscript]);

  // Show/hide scroll-to-bottom button
  useEffect(() => {
    const root = scrollViewportRef.current;
    if (!root) return;
    const onScroll = () => {
      setShowScrollBottom(root.scrollHeight - root.scrollTop - root.clientHeight > SCROLL_BOTTOM_THRESHOLD_PX);
    };
    root.addEventListener("scroll", onScroll, { passive: true });
    return () => root.removeEventListener("scroll", onScroll);
  }, []);

  // Auto-focus textarea when switching conversations
  useEffect(() => {
    textareaRef.current?.focus();
  }, [conversation.id]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    sendMessage(draft);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Escape" && isStreaming) {
      e.preventDefault();
      handleStop();
      return;
    }
    if (showSlashPalette && visibleSlashCommands.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSlashIndex((i) => (i + 1) % visibleSlashCommands.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSlashIndex((i) => (i - 1 + visibleSlashCommands.length) % visibleSlashCommands.length);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setDraft("");
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        const cmd = visibleSlashCommands[slashIndex];
        if (cmd) {
          e.preventDefault();
          setDraft("");
          sendMessage(t(cmd.fillKey));
          setSlashIndex(0);
        }
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(draft);
    }
  };

  const handleCopyMessage = useCallback((_msgId: string, text: string) => {
    navigator.clipboard.writeText(text);
  }, []);

  const handleDeleteConfirmComplete = useCallback(
    (messageId: string, content: string) => {
      onConversationChange(
        localMessages.map((m) =>
          m.id === messageId
            ? { ...m, content, calendarDeleteDraft: undefined }
            : m,
        ),
      );
    },
    [localMessages, onConversationChange],
  );

  const scrollToBottom = () => {
    scrollAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  };

  const handleEnableActions = () => {
    window.dispatchEvent(
      new CustomEvent(ASSISTANT_PERMISSIONS_PROMPT_EVENT, { detail: { force: true } })
    );
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      {/* Header — hidden when embedded in Exo layout */}
      {!hideHeader && (
        <header className={`${ASSISTANT_WORKSPACE_TOP_BAR_CLASS} px-4`}>
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-text-primary">
            {conversation.title || t("chat.assistantTitle")}
          </span>

          {/* Action buttons — grouped so they stay adjacent on the right */}
          <div className="ml-2 flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              title={t("assistant.openFullSettings")}
              onClick={onOpenAssistantSettings}
              className="rounded-lg p-1.5 text-muted transition-colors hover:bg-hover-overlay hover:text-text-primary"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.28c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
              </svg>
            </button>

            {onSidebarToggle !== undefined && (
              <button
                type="button"
                onClick={onSidebarToggle}
                title={sidebarCollapsed ? t("assistant.conversationSidebarExpand") : t("assistant.conversationSidebarCollapse")}
                aria-label={sidebarCollapsed ? t("assistant.conversationSidebarExpand") : t("assistant.conversationSidebarCollapse")}
                className="rounded-lg p-1.5 text-muted transition-colors hover:bg-hover-overlay hover:text-text-primary"
              >
                <SidebarRailToggleGlyph railOpen={!sidebarCollapsed} />
              </button>
            )}
          </div>
        </header>
      )}

      {showCodegenRail && (
        <ExoRailTabBar activeTab={railTab} onSelect={setRailTab} />
      )}

      {showCodegenRail && railTab === "preview" ? (
        <CodegenPreviewPanel sessionId={activeCodegenId} />
      ) : (
        <>
      {/* Permission banner */}
      {!settings.assistantToolsEnabled && (
        <div className="flex shrink-0 items-center gap-3 border-b border-border bg-bg-secondary px-4 py-2">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4 shrink-0 text-muted" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
          </svg>
          <p className="flex-1 text-xs text-muted">{t("assistant.chatPermissionBanner")}</p>
          <button
            type="button"
            onClick={handleEnableActions}
            className="shrink-0 rounded-md bg-button-primary px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-accent-hover"
          >
            {t("assistant.chatPermissionBannerCta")}
          </button>
        </div>
      )}

      {/* Messages — outer shell pins scroll-to-bottom above chips/input (not over suggestion row). */}
      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollViewportRef}
          className="sidebar-scroll absolute inset-0 min-w-0 overflow-x-hidden overflow-y-auto px-4 pb-4 pt-4"
        >
          {cloudChatOnly ? (
            <div className={`${CARD_SHELL_CLASS} mb-4 space-y-2 border-amber-500/30 bg-amber-500/5 p-4`}>
              <p className="text-sm leading-relaxed text-text-primary">{t("chat.cloudChatLimitedBanner")}</p>
              <button
                type="button"
                className="text-sm font-medium text-accent underline-offset-2 hover:underline"
                onClick={onOpenConnectionSettings ?? onOpenAssistantSettings}
              >
                {t("chat.cloudChatLimitedBannerCta")}
              </button>
            </div>
          ) : null}

          {showPrerequisite ? (
            <div className={`${CARD_SHELL_CLASS} space-y-2 p-4`}>
              <p className="text-sm font-semibold text-text-primary">
                {t("chat.prerequisiteNoModelTitle")}
              </p>
              <p className="text-sm leading-relaxed text-muted">
                {t("chat.prerequisiteNoModelMessage")}
              </p>
              <button
                type="button"
                className="text-sm font-medium text-accent underline-offset-2 hover:underline"
                onClick={onOpenGeminiSetup ?? onOpenAiProviderSettings ?? onOpenAssistantSettings}
              >
                {t("chat.prerequisiteOpenModels")}
              </button>
            </div>
          ) : localMessages.length === 0 ? (
            <p className="px-1 pt-2 text-sm text-muted">{t("assistant.chatEmptyHint")}</p>
          ) : (
            <div className="min-w-0 space-y-4 pt-4">
              {localMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex min-w-0 w-full ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  {msg.prefetching ? (
                    <p className="flex items-center gap-2 px-1 text-xs text-muted">
                      <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-muted" />
                      {msg.content}
                    </p>
                  ) : msg.content === "__agent_task__" ? (
                    msg.agentTaskId ? (
                      <TaskProgressCard
                        taskId={msg.agentTaskId}
                        goal={msg.agentGoal || "Autonomous task"}
                        alwaysApprovedTools={settings.voiceToolsAlwaysApproved}
                        onAlwaysAllowTool={
                          onSettingsPatch
                            ? (tool) => {
                                if (settings.voiceToolsAlwaysApproved.includes(tool)) return;
                                onSettingsPatch({
                                  voiceToolsAlwaysApproved: [
                                    ...settings.voiceToolsAlwaysApproved,
                                    tool,
                                  ],
                                });
                              }
                            : undefined
                        }
                      />
                    ) : (
                      <p className="text-xs text-muted animate-pulse">Starting task…</p>
                    )
                  ) : msg.content === "__codegen_studio__" && msg.codegenGoal ? (
                    msg.codegenSessionId ? (
                      <CodegenSessionCard sessionId={msg.codegenSessionId} goal={msg.codegenGoal} />
                    ) : (
                      <p className="text-xs text-muted animate-pulse">{t("assistant.codegen.starting")}</p>
                    )
                  ) : (
                    <div className={`flex min-w-0 max-w-full flex-col gap-2 ${msg.role === "user" ? "items-end" : "items-start"}`}>
                      <AssistantMessageBubble
                        msg={msg}
                        onCopy={handleCopyMessage}
                        onDeleteConfirmComplete={handleDeleteConfirmComplete}
                      />
                      {msg.localAppServiceHint ? (
                        <button
                          type="button"
                          className="text-sm font-medium text-accent underline-offset-2 hover:underline"
                          onClick={onOpenConnectionSettings ?? onOpenAssistantSettings}
                        >
                          {t("chat.localServiceRequiredCta")}
                        </button>
                      ) : null}
                    </div>
                  )}
                </div>
              ))}

              {/* Citation trail: link the final answer back to related past conversations. */}
              {!isStreaming &&
                localMessages.length > 1 &&
                localMessages[localMessages.length - 1]?.role === "assistant" && (
                  <ConversationCitations
                    query={
                      [...localMessages].reverse().find((m) => m.role === "user")?.content ?? ""
                    }
                    currentConversationId={conversation.id}
                  />
                )}

              {/* Live voice transcript bubbles — ephemeral, shown while a turn is in progress */}
              {voice.inputTranscript && (
                <div className="flex min-w-0 w-full justify-end">
                  <div className="min-w-0 max-w-[80%] break-words rounded-2xl rounded-br-sm bg-accent/20 px-3.5 py-2.5 text-sm text-text-primary opacity-70 [overflow-wrap:anywhere]">
                    <span className="mr-1.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-accent align-middle" />
                    {voice.inputTranscript}
                  </div>
                </div>
              )}
              {voice.outputTranscript && (
                <div className="flex min-w-0 w-full justify-start">
                  <div className="min-w-0 max-w-[80%] break-words rounded-2xl rounded-bl-sm border border-border bg-bg-secondary px-3.5 py-2.5 text-sm text-text-primary opacity-70 [overflow-wrap:anywhere]">
                    <span className="mr-1.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-accent align-middle" />
                    {voice.outputTranscript}
                  </div>
                </div>
              )}
              {(voice.isListening || voice.isReconnecting) && !voice.inputTranscript && !voice.outputTranscript && (
                <div className="flex justify-start">
                  <p className="flex items-center gap-1.5 px-1 text-xs text-muted">
                    <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
                    {voice.isReconnecting ? "Reconnecting…" : "Listening…"}
                  </p>
                </div>
              )}
            </div>
          )}
          <div ref={scrollAnchorRef} />
        </div>
        {showScrollBottom && (
          <div className="pointer-events-none absolute bottom-3 left-1/2 z-10 -translate-x-1/2">
            <button
              type="button"
              onClick={scrollToBottom}
              className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-border bg-bg-primary px-3 py-1.5 text-xs text-text-primary shadow-md transition-colors hover:bg-hover-overlay"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
              {t("assistant.scrollToBottom")}
            </button>
          </div>
        )}
      </div>

      {/* Suggestion chips + capabilities */}
      {!showPrerequisite && (
        <div className="shrink-0 border-t border-border">
          {collapseSuggestionsInitially && (
          <div className="flex items-center gap-2 px-2 py-1.5 bg-bg-secondary/40">
            <button
              type="button"
              onClick={() => {
                setSuggestionsExpanded((prev) => {
                  const next = !prev;
                  if (!next) setShowCapabilities(false);
                  return next;
                });
              }}
              aria-expanded={suggestionsExpanded}
              aria-label={suggestionsExpanded ? t("assistant.suggestionsHideRow") : t("assistant.suggestionsShowRow")}
              title={suggestionsExpanded ? t("assistant.suggestionsHideRow") : t("assistant.suggestionsShowRow")}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-bg-secondary px-2 py-1 text-[11px] font-medium text-muted transition-colors hover:border-accent/40 hover:bg-hover-overlay hover:text-text-primary"
            >
              {suggestionsExpanded ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18 15l-6-6-6 6" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
                </svg>
              )}
              <span>{suggestionsExpanded ? t("assistant.suggestionsHideRow") : t("assistant.suggestionsShowRow")}</span>
            </button>
          </div>
          )}
          {suggestionsExpanded && (
          <div className="flex flex-wrap items-center gap-2 px-3 py-2">
            {SUGGESTION_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => sendMessage(t(key))}
                disabled={isStreaming}
                className="rounded-full border border-border bg-bg-secondary px-3 py-1 text-xs text-text-primary transition-colors hover:bg-hover-overlay disabled:cursor-not-allowed disabled:opacity-40"
              >
                {t(key)}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setShowCapabilities((v) => !v)}
              title={t("assistant.capabilitiesLabel")}
              aria-label={t("assistant.capabilitiesLabel")}
              aria-expanded={showCapabilities}
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-bg-secondary text-sm font-semibold text-muted transition-colors hover:bg-hover-overlay hover:text-text-primary"
            >
              {showCapabilities ? "✕" : "?"}
            </button>
          </div>
          )}
          {showCapabilities && suggestionsExpanded && (
            <div className="border-t border-border bg-bg-secondary px-4 py-3 text-xs space-y-3">
              <p className="font-semibold text-text-primary text-xs">{t("assistant.capabilitiesTitle")}</p>
              <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 items-start">
                <span className="inline-flex items-center gap-1 font-medium text-green-600 dark:text-green-400 whitespace-nowrap">
                  <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3 shrink-0"><path d="M13.5 2h-2V.5a.5.5 0 0 0-1 0V2h-5V.5a.5.5 0 0 0-1 0V2h-2A1.5 1.5 0 0 0 1 3.5v11A1.5 1.5 0 0 0 2.5 16h11a1.5 1.5 0 0 0 1.5-1.5v-11A1.5 1.5 0 0 0 13.5 2ZM2 3.5a.5.5 0 0 1 .5-.5h11a.5.5 0 0 1 .5.5V5H2V3.5ZM2 6h12v8.5a.5.5 0 0 1-.5.5h-11a.5.5 0 0 1-.5-.5V6Z"/></svg>
                  {t("assistant.capabilityReadCalendar")}
                </span>
                <span className="text-text-secondary">{t("assistant.capabilityReadCalendarDetail")}</span>
                <span className="inline-flex items-center gap-1 font-medium text-green-600 dark:text-green-400 whitespace-nowrap">
                  <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3 shrink-0"><path d="M0 4a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V4Zm2-1a1 1 0 0 0-1 1v.217l7 4.2 7-4.2V4a1 1 0 0 0-1-1H2Zm13 2.383-4.708 2.825L15 11.105V5.383Zm-.034 6.876-5.64-3.471L8 9.583l-1.326-.795-5.64 3.47A1 1 0 0 0 2 13h12a1 1 0 0 0 .966-.741ZM1 11.105l4.708-2.897L1 5.383v5.722Z"/></svg>
                  {t("assistant.capabilityReadMail")}
                </span>
                <span className="text-text-secondary">{t("assistant.capabilityReadMailDetail")}</span>
                <span className="inline-flex items-center gap-1 font-medium text-amber-500 dark:text-amber-400 whitespace-nowrap">
                  <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3 shrink-0"><path d="M12.146 1.146a.5.5 0 0 1 .707 0l2 2a.5.5 0 0 1 0 .707l-10 10a.5.5 0 0 1-.168.11l-4 1.5a.5.5 0 0 1-.65-.65l1.5-4a.5.5 0 0 1 .11-.168l10-10zM11.207 2.5 13.5 4.793 14.793 3.5 12.5 1.207 11.207 2.5zm1.586 3L10.5 3.207 4 9.707V10h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.293l6.5-6.5zm-9.761 5.175-.106.106-1.528 4.074 4.074-1.528.106-.106A.5.5 0 0 1 5 12.5V12h-.5a.5.5 0 0 1-.5-.5V11h-.5a.5.5 0 0 1-.468-.325z"/></svg>
                  {t("assistant.capabilityWriteCalendar")}
                </span>
                <span className="text-text-secondary">{t("assistant.capabilityWriteCalendarDetail")}</span>
                <span className="inline-flex items-center gap-1 font-medium text-amber-500 dark:text-amber-400 whitespace-nowrap">
                  <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3 shrink-0"><path d="M15.964.686a.5.5 0 0 0-.65-.65L.767 5.855H.766l-.452.18a.5.5 0 0 0-.082.887l.41.26.001.002 4.995 3.178 1.19 2.456c.18.373.73.27.773-.145l.267-2.67 5.032 3.202a.5.5 0 0 0 .738-.32l1.5-10a.5.5 0 0 0-.013-.19z"/></svg>
                  {t("assistant.capabilityWriteMail")}
                </span>
                <span className="text-text-secondary">{t("assistant.capabilityWriteMailDetail")}</span>
              </div>
              <p className="text-2xs text-muted pt-1 border-t border-border">{t("assistant.capabilitiesFootnote")}</p>
            </div>
          )}
        </div>
      )}

      {/* Input bar */}
      {!showPrerequisite && (
        <form
          onSubmit={handleSubmit}
          className="relative flex shrink-0 flex-col gap-0 border-t border-border bg-bg-primary"
        >
          {/* Row 1: textarea + compact action buttons */}
          <div
            className={`relative flex items-end gap-2 px-3 pt-3 ${showComposerPttHint ? "pb-1" : "pb-2"}`}
          >
            {showSlashPalette && (
              <SlashCommandPalette
                filter={draft}
                selectedIndex={slashIndex}
                onSelect={(fill) => {
                  setDraft("");
                  setSlashIndex(0);
                  sendMessage(fill);
                }}
              />
            )}
            {/* Hidden file input for web-fallback attachment */}
            {onComposerInlineAttachment && (
              <input
                ref={attachInputRef}
                type="file"
                className="hidden"
                tabIndex={-1}
                aria-hidden="true"
                onChange={handleAttachInputChange}
              />
            )}
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={(e) => { setDraft(e.target.value); setSlashIndex(0); }}
              onKeyDown={handleKeyDown}
              placeholder={t("chat.inputPlaceholder")}
              rows={1}
              disabled={isStreaming}
              aria-label={t("chat.inputPlaceholder")}
              className="max-h-32 min-w-0 flex-1 resize-none overflow-y-auto rounded-xl border border-border bg-bg-secondary px-3.5 py-2.5 text-sm text-text-primary placeholder:text-muted transition-colors focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50"
              style={{ fieldSizing: "content" } as CSSProperties}
            />
            {/* Attachment button — shown only when parent provides onComposerInlineAttachment */}
            {onComposerInlineAttachment && (
              <button
                type="button"
                onClick={handleAttachClick}
                title={t("chat.attachFileTitle")}
                aria-label={t("chat.attachFileAria")}
                className="shrink-0 rounded-xl border border-border bg-bg-secondary p-2.5 text-text-secondary transition-colors hover:bg-hover-overlay hover:text-text-primary"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                </svg>
              </button>
            )}
            <div className="flex shrink-0 items-center gap-1">
              {isStreaming ? (
                <button
                  type="button"
                  onClick={handleStop}
                  title={t("chat.stopGenerationTitle")}
                  aria-label={t("chat.stopGenerationAria")}
                  className="rounded-xl border border-border bg-bg-secondary p-2.5 text-text-primary transition-colors hover:bg-hover-overlay"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden="true">
                    <rect x="6" y="6" width="12" height="12" rx="2" />
                  </svg>
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!canSend}
                  title={t("chat.sendTitle")}
                  aria-label={t("chat.sendAria")}
                  className="rounded-xl bg-button-primary p-2.5 text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
                  </svg>
                </button>
              )}

              {showComposerVoiceAccessories ? (
                <MicControlRow
                  voice={voice}
                  voiceReadiness={voiceReadiness}
                  settings={settings}
                  onSettingsPatch={onSettingsPatch!}
                  onOpenAiProviderSettings={onOpenGeminiSetup ?? onOpenAiProviderSettings}
                  onOpenFullVoiceSettings={onOpenVoiceInteractionSettings}
                  layout="composer"
                />
              ) : null}
            </div>
          </div>

          {showComposerPttHint ? (
            <p className="px-3 pb-2 text-2xs leading-snug text-muted">
              {t("voice.pttExoHint", { key: settings.pttShortcut.displayLabel })}
            </p>
          ) : null}

          {/* Row 2: debug export footer (dev builds + product admins on signed-in production builds) */}
          {showSnapshotDebug && (
          <div className="flex flex-col gap-1 px-3 pb-2">
            <div className="flex items-center justify-between">
              <span className="text-2xs text-muted select-none">{t("assistant.debugExportHint")}</span>
              <button
                type="button"
                onClick={handleDebugExport}
                title={t("assistant.debugExportTooltip")}
                aria-label={t("assistant.debugExportButton")}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-transparent px-2 py-1 text-2xs text-text-secondary transition-colors hover:border-accent/50 hover:bg-hover-overlay hover:text-text-primary"
              >
                <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3 shrink-0" aria-hidden="true">
                  <path d="M8 12l-4-4h2.5V4h3v4H12L8 12zm-5 2h10v1.5H3V14z"/>
                </svg>
                {t("assistant.debugExportButton")}
              </button>
            </div>
            {voiceTurnTraces.length > 0 ? (
              <details className="rounded-lg border border-border/60 bg-bg-secondary/40 px-2 py-1">
                <summary className="cursor-pointer text-2xs text-muted select-none">
                  Voice turn traces ({voiceTurnTraces.length})
                </summary>
                <pre className="mt-1 max-h-28 overflow-auto whitespace-pre-wrap break-words text-2xs text-text-secondary">
                  {JSON.stringify(voiceTurnTraces, null, 2)}
                </pre>
              </details>
            ) : null}
          </div>
          )}
        </form>
      )}
        </>
      )}

      <CodegenConsentModal
        open={codegenConsentOpen}
        onAllow={approveCodegenConsent}
        onDeny={denyCodegenConsent}
      />
    </div>
  );
}

