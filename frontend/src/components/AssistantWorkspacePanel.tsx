import { useCallback, useEffect, useRef, useState } from "react";
import {
  ASSISTANT_PERMISSION_MODAL_DISMISSED_SESSION_KEY,
  ASSISTANT_PERMISSIONS_PROMPT_EVENT,
} from "../constants";
import type { AppSettings } from "../types/settings";
import type { UseVoiceSessionReturn } from "../hooks/useVoiceSession";
import type { VoiceBackendReadiness } from "../hooks/useVoiceBackendReady";
import { useConversations, type ConversationMessage, type ConversationToolContext } from "../hooks/useConversations";
import { clearConversationMemory } from "../api/memory";
import ConversationSidebar from "./ConversationSidebar";
import { AssistantChatPanelWithSharedVoice } from "./AssistantChatPanel";
import { useI18n } from "../i18n/I18nContext";

const SIDEBAR_MIN_W = 160;
const SIDEBAR_MAX_W = 520;
const SIDEBAR_DEFAULT_W = 208;
const SIDEBAR_COLLAPSED_W = 40;
const SIDEBAR_WIDTH_STORAGE_KEY = "exosites.assistant.sidebarWidth.v1";

function readStoredWidth(): number {
  try {
    const raw = localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY);
    if (!raw) return SIDEBAR_DEFAULT_W;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? Math.min(SIDEBAR_MAX_W, Math.max(SIDEBAR_MIN_W, n)) : SIDEBAR_DEFAULT_W;
  } catch {
    return SIDEBAR_DEFAULT_W;
  }
}

interface AssistantWorkspacePanelProps {
  settings: AppSettings;
  backendOnline: boolean;
  voice: UseVoiceSessionReturn;
  voiceReadiness: VoiceBackendReadiness;
  onSettingsPatch: (patch: Partial<AppSettings>) => void;
  onOpenAssistantSettings: () => void;
  onOpenGeminiSetup?: () => void;
  onOpenConnectionSettings?: () => void;
  onGoToAiSettings?: () => void;
  onOpenVoiceInteractionSettings?: () => void;
  proAllowed?: boolean;
  onOpenSort?: () => void;
  onStartMeeting?: () => void;
  onStartCapture?: () => void;
  /** Wait until the product tour finishes before prompting for assistant actions. */
  deferPermissionPrompt?: boolean;
}

/**
 * Chat workspace — conversations only. Tasks and proactive items live under To Do in the sidebar.
 */
export default function AssistantWorkspacePanel({
  settings,
  backendOnline,
  voice,
  voiceReadiness,
  onSettingsPatch,
  onOpenAssistantSettings,
  onOpenGeminiSetup,
  onOpenConnectionSettings,
  onGoToAiSettings,
  onOpenVoiceInteractionSettings,
  deferPermissionPrompt = false,
}: AssistantWorkspacePanelProps) {
  const { t } = useI18n();
  const goToAiSettings = onGoToAiSettings;
  const { conversations, activeId, active, create, remove, rename, updateMessages, appendToolContext, updateSummary, setActive } =
    useConversations();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(readStoredWidth);

  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(sidebarWidth);

  useEffect(() => {
    if (deferPermissionPrompt) return;
    if (settings.assistantToolsEnabled) return;
    try {
      if (sessionStorage.getItem(ASSISTANT_PERMISSION_MODAL_DISMISSED_SESSION_KEY) === "1") return;
    } catch {
      /* ignore */
    }
    window.dispatchEvent(new CustomEvent(ASSISTANT_PERMISSIONS_PROMPT_EVENT));
  }, [settings.assistantToolsEnabled, deferPermissionPrompt]);

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

  const handleDragHandleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (sidebarCollapsed) return;
      e.preventDefault();
      isDragging.current = true;
      dragStartX.current = e.clientX;
      dragStartWidth.current = sidebarWidth;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      const onMouseMove = (ev: MouseEvent) => {
        if (!isDragging.current) return;
        const delta = dragStartX.current - ev.clientX;
        const next = Math.min(SIDEBAR_MAX_W, Math.max(SIDEBAR_MIN_W, dragStartWidth.current + delta));
        setSidebarWidth(next);
      };

      const onMouseUp = () => {
        isDragging.current = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        setSidebarWidth((w) => {
          try {
            localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(w));
          } catch {
            /* ignore */
          }
          return w;
        });
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
      };

      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    },
    [sidebarCollapsed, sidebarWidth],
  );

  const effectiveSidebarWidth = sidebarCollapsed ? SIDEBAR_COLLAPSED_W : sidebarWidth;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden" data-tour="assistant-workspace">
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <AssistantChatPanelWithSharedVoice
          key={activeId}
          voice={voice}
          voiceReadiness={voiceReadiness}
          conversation={active}
          onConversationChange={handleConversationChange}
          onToolContext={handleToolContext}
          onSummaryUpdate={handleSummaryUpdate}
          settings={settings}
          backendOnline={backendOnline}
          onOpenAssistantSettings={onOpenAssistantSettings}
          onOpenGeminiSetup={onOpenGeminiSetup}
          onOpenConnectionSettings={onOpenConnectionSettings}
          onSettingsPatch={onSettingsPatch}
          onOpenAiProviderSettings={goToAiSettings ?? onOpenGeminiSetup}
          onOpenVoiceInteractionSettings={onOpenVoiceInteractionSettings}
          sidebarCollapsed={sidebarCollapsed}
          onSidebarToggle={() => setSidebarCollapsed((c) => !c)}
        />

        <div className="relative z-10 flex w-0 shrink-0 items-stretch" aria-hidden="true">
          <div
            onMouseDown={handleDragHandleMouseDown}
            className={`absolute inset-y-0 -left-1 w-3 ${sidebarCollapsed ? "cursor-default" : "cursor-col-resize"} group flex items-center justify-center`}
            title={sidebarCollapsed ? undefined : t("assistantWorkspace.resizeSidebar")}
          >
            <div
              className={`h-full w-0.5 rounded-full transition-colors ${
                sidebarCollapsed
                  ? "bg-transparent"
                  : "bg-border group-hover:bg-accent/60 group-active:bg-accent"
              }`}
            />
          </div>
        </div>

        <div
          className="shrink-0 flex flex-col overflow-hidden border-l border-border"
          style={{ width: effectiveSidebarWidth }}
        >
        <ConversationSidebar
          conversations={conversations}
          activeId={activeId}
          onSelect={setActive}
          onNew={create}
          onRename={rename}
          onDelete={(id) => {
            void clearConversationMemory(id).catch(() => {
              /* best-effort */
            });
            remove(id);
          }}
          collapsed={sidebarCollapsed}
          onCollapseToggle={() => setSidebarCollapsed((c) => !c)}
        />
        </div>
      </div>
    </div>
  );
}
