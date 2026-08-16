/**
 * Renders a single chat message bubble for the assistant panel.
 * Handles all content variants: plain text, streaming cursor, calendar context,
 * mail recap, event creation card, and mail compose card.
 */

import { useState } from "react";
import { useI18n } from "../i18n/I18nContext";
import { CARD_SHELL_CLASS } from "../utils/styles";
import { chatBrandAssetUrl } from "../brands/chatBrandAssetUrl";
import type { ConversationMessage } from "../hooks/useConversations";
import {
  briefingOutcomeBodyKey,
  isBriefingMuted,
} from "../features/assistant/chat/briefingOutcome";
import AssistantCalendarContextContent from "./AssistantCalendarContextContent";
import AssistantMailRecapContent from "./AssistantMailRecapContent";
import AssistantEventCreateCard from "./AssistantEventCreateCard";
import AssistantEventDeleteCard from "./AssistantEventDeleteCard";
import AssistantMailComposeCard from "./AssistantMailComposeCard";

/** Duration in ms before the "Copied!" label reverts to "Copy". */
const COPY_FEEDBACK_DURATION_MS = 1800;

const TOOL_SOURCE_ICON: Record<string, { src: string; label: string }> = {
  // Google Workspace — granular (emitted by backend when operation is known)
  "google_workspace/gmail":    { src: chatBrandAssetUrl("gmail.svg"),             label: "Gmail" },
  "google_workspace/calendar": { src: chatBrandAssetUrl("google-calendar.png"),   label: "Google Calendar" },
  "google_workspace/drive":    { src: chatBrandAssetUrl("google-drive.svg"),      label: "Google Drive" },
  // Google Workspace — fallback for legacy / unknown operation
  google_workspace:            { src: chatBrandAssetUrl("google.png"),            label: "Google" },

  // Microsoft Graph — granular
  "microsoft_graph/mail":      { src: chatBrandAssetUrl("outlook.svg"),           label: "Outlook Mail" },
  "microsoft_graph/calendar":  { src: chatBrandAssetUrl("outlook.svg"),           label: "Outlook Calendar" },
  "microsoft_graph/onedrive":  { src: chatBrandAssetUrl("onedrive.png"),          label: "OneDrive" },
  // Microsoft Graph — fallback
  microsoft_graph:             { src: chatBrandAssetUrl("outlook.png"),           label: "Microsoft" },

  // Infomaniak — granular
  "infomaniak_services/mail":     { src: chatBrandAssetUrl("kdrive.png"),              label: "Infomaniak Mail" },
  "infomaniak_services/calendar": { src: chatBrandAssetUrl("infomaniak-calendar.png"), label: "Infomaniak Calendar" },
  // Infomaniak — fallback
  infomaniak_services:            { src: chatBrandAssetUrl("infomaniak-calendar.png"), label: "Infomaniak" },

  // Notion
  notion:                         { src: chatBrandAssetUrl("notion.png"),             label: "Notion" },

  // Messaging (desktop assistant tools)
  send_message:                   { src: chatBrandAssetUrl("whatsapp.png"),           label: "WhatsApp" },
  whatsapp_messaging:             { src: chatBrandAssetUrl("whatsapp.png"),           label: "WhatsApp" },
};

const BRIEFING_SECTION_LABEL_KEYS: Record<string, string> = {
  news: "assistant.briefingSectionNews",
  weather: "assistant.briefingSectionWeather",
  calendar: "assistant.briefingSectionCalendar",
  mail: "assistant.briefingSectionMail",
};

function briefingSectionLabel(section: string, translate: (key: string) => string): string {
  const key = BRIEFING_SECTION_LABEL_KEYS[section.toLowerCase()];
  return translate(key ?? "assistant.briefingSectionDefault");
}

function formatMessageEmittedAt(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  try {
    return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

interface AssistantMessageBubbleProps {
  msg: ConversationMessage;
  onCopy: (id: string, text: string) => void;
  onDeleteConfirmComplete?: (messageId: string, content: string) => void;
}

export default function AssistantMessageBubble({
  msg,
  onCopy,
  onDeleteConfirmComplete,
}: AssistantMessageBubbleProps) {
  const { t } = useI18n();
  const [hovered, setHovered] = useState(false);
  const [copied, setCopied] = useState(false);

  const isStructured =
    msg.mailRecap ||
    msg.calendarContext ||
    !!msg.calendarEventDraft ||
    !!msg.calendarDeleteDraft ||
    !!msg.mailComposeDraft;

  const outcomeBodyKey = briefingOutcomeBodyKey(msg.briefingOutcome);
  const tasksHonestyBody = msg.briefingTasksHonesty
    ? t("assistant.briefingOutcomeTasksHonesty")
    : "";
  const visibleBody = outcomeBodyKey
    ? t(outcomeBodyKey)
    : tasksHonestyBody || (typeof msg.content === "string" ? msg.content : String(msg.content ?? ""));
  const mutedBriefing = isBriefingMuted(msg.briefingOutcome);
  const headerId = msg.briefingSection ? `briefing-h-${msg.id}` : undefined;

  const handleCopy = () => {
    onCopy(msg.id, visibleBody);
    setCopied(true);
    setTimeout(() => setCopied(false), COPY_FEEDBACK_DURATION_MS);
  };

  const showEmittedAt =
    !msg.streaming && !msg.prefetching && formatMessageEmittedAt(msg.createdAt);

  const showCopyButton =
    msg.role === "assistant" && !msg.streaming && !msg.prefetching && !!visibleBody;

  return (
    <div
      className={`flex min-w-0 max-w-[82%] flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Wrapper allows the copy chip to float above the bubble without clipping. */}
      <div className={`relative w-full min-w-0 max-w-full ${showCopyButton ? "pt-2" : ""}`}>
        {showCopyButton && (
          <button
            type="button"
            onClick={handleCopy}
            aria-label={t("assistant.copyMessage")}
            className={`absolute top-0 right-2 z-10 rounded-md border border-border bg-bg-primary px-1.5 py-0.5 text-2xs text-muted shadow-sm transition-all hover:text-text-primary ${
              hovered || copied ? "opacity-100" : "pointer-events-none opacity-0"
            }`}
          >
            {copied ? t("assistant.copied") : t("assistant.copy")}
          </button>
        )}
        <div
          className={`w-full min-w-0 max-w-full overflow-x-hidden rounded-2xl px-3.5 py-3 text-sm leading-relaxed break-words [overflow-wrap:anywhere] ${
            msg.role === "user"
              ? "whitespace-pre-wrap bg-button-primary text-white"
              : `${CARD_SHELL_CLASS} text-text-primary ${isStructured ? "" : "whitespace-pre-wrap"}`
          }`}
          {...(msg.role === "assistant" && msg.briefingSection
            ? { role: "article", "aria-labelledby": headerId }
            : {})}
          data-briefing-weight={
            msg.briefingSection ? (mutedBriefing ? "muted" : "full") : undefined
          }
        >
        {/* Content variants */}
        {msg.calendarDeleteDraft ? (
          <div className="space-y-2">
            <p className="whitespace-pre-wrap text-xs text-muted">{msg.content}</p>
            <AssistantEventDeleteCard
              draft={msg.calendarDeleteDraft}
              onComplete={(content) => onDeleteConfirmComplete?.(msg.id, content)}
            />
          </div>
        ) : msg.calendarEventDraft ? (
          <div className="space-y-2">
            <p className="whitespace-pre-wrap text-xs text-muted">{msg.content}</p>
            <AssistantEventCreateCard
              title={msg.calendarEventDraft.title}
              startIso={msg.calendarEventDraft.startIso}
              connectedProviderIds={msg.calendarEventDraft.connectedProviderIds}
            />
          </div>
        ) : msg.mailComposeDraft ? (
          <div className="space-y-2">
            <p className="whitespace-pre-wrap text-xs text-muted">{msg.content}</p>
            <AssistantMailComposeCard
              subject={msg.mailComposeDraft.subject}
              to={msg.mailComposeDraft.to}
              body={msg.mailComposeDraft.body}
              connectedProviderIds={msg.mailComposeDraft.connectedProviderIds}
            />
          </div>
        ) : msg.role === "assistant" && msg.mailRecap ? (
          <AssistantMailRecapContent text={msg.content} streaming={msg.streaming} />
        ) : msg.role === "assistant" && msg.calendarContext ? (
          <AssistantCalendarContextContent text={msg.content} />
        ) : (
          <>
            {msg.role === "assistant" && msg.briefingSection ? (
              <h3
                id={headerId}
                className="mb-2 text-2xs font-semibold uppercase tracking-wide text-muted"
              >
                {briefingSectionLabel(msg.briefingSection, t)}
              </h3>
            ) : null}
            {msg.role === "assistant" && msg.voiceSource && TOOL_SOURCE_ICON[msg.voiceSource] && (
              <div className="flex items-center gap-2 mb-2">
                <img
                  src={TOOL_SOURCE_ICON[msg.voiceSource].src}
                  alt=""
                  width={18}
                  height={18}
                  className="h-[18px] w-[18px] shrink-0 object-contain rounded-md"
                />
                <span className="font-semibold text-text-primary text-sm">
                  {TOOL_SOURCE_ICON[msg.voiceSource].label}
                </span>
              </div>
            )}
            {msg.imageAttachment?.dataUrl ? (
              <div className="space-y-2">
                <img
                  src={msg.imageAttachment.dataUrl}
                  alt={msg.imageAttachment.name}
                  title={msg.imageAttachment.name}
                  className="max-h-64 max-w-full rounded-lg object-contain"
                />
              </div>
            ) : msg.documentAttachment ? (
              <div className="space-y-2">
                <p className="text-xs font-medium opacity-90">
                  {msg.documentAttachment.name}
                  {msg.documentAttachment.pages != null
                    ? ` · ${msg.documentAttachment.pages} page${msg.documentAttachment.pages === 1 ? "" : "s"}`
                    : ""}
                  {msg.documentAttachment.truncated ? " · truncated" : ""}
                </p>
                {msg.documentAttachment.previewDataUrl ? (
                  <img
                    src={msg.documentAttachment.previewDataUrl}
                    alt={`Preview of ${msg.documentAttachment.name}`}
                    className="max-h-72 max-w-full rounded-lg border border-white/20 object-contain bg-white"
                  />
                ) : (
                  <p className="text-xs opacity-70">Document attached for analysis</p>
                )}
              </div>
            ) : (
              <>
                <p className={mutedBriefing ? "text-muted" : undefined}>
                  {visibleBody}
                </p>
                {msg.streaming && (
                  <span className={`animate-pulse opacity-70${msg.content ? " ml-0.5" : ""}`}>▍</span>
                )}
              </>
            )}
          </>
        )}
        </div>
      </div>

      {showEmittedAt ? (
        <time
          dateTime={msg.createdAt ?? undefined}
          className={`mt-1 max-w-full truncate px-0.5 text-left text-[0.6875rem] leading-tight text-muted transition-opacity duration-150 ${
            hovered ? "opacity-100" : "opacity-0"
          } ${msg.role === "user" ? "self-end text-right" : "self-start"}`}
          title={showEmittedAt}
        >
          {showEmittedAt}
        </time>
      ) : null}
    </div>
  );
}
