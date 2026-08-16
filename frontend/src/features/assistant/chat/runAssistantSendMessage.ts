/**
 * Server-authoritative send path via POST /assistant/turn.
 */

import { type ChatMessage } from "../../../api/assistantChat";
import {
  isAssistantTurnStream,
  parseAssistantTurnJson,
  postAssistantTurn,
} from "../../../api/assistantTurn";
import type { ConversationMessage } from "../../../hooks/useConversations";
import { makeId } from "../../../hooks/useConversations";
import { resolveChatProviderCredentials } from "../../../utils/resolveChatProviderCredentials";
import { apiKeyForBackendRequest } from "../../../utils/geminiConnection";
import { buildDefaultSystemPrompt } from "../../../systemCommands/assistantPrompts";
import { pendingCalendarDraft, pendingCalendarDeleteDraft } from "./assistantSendHelpers";
import type { RunAssistantSendMessageParams } from "./assistantSendTypes";
import {
  trackAssistantTurnCompleted,
  trackAssistantTurnFailed,
  trackAssistantTurnStarted,
} from "../../../telemetry/assistantTelemetry";
import { handleAssistantTurnStream } from "./handleAssistantTurnStream";
import { handleClientCalendarRead, handleClientMailManage, handleClientMailRead } from "./handleAssistantTurnReads";
import {
  applyCompletedTurnMessage,
  capabilityRefuseCopyKey,
  handleAgentTaskAction,
  handleCodegenStudioAction,
  handleMailComposeAction,
} from "./handleAssistantTurnActions";
import { extractApiError, mapFetchFailureToError } from "../../../api/client";
import { logAppDiagnostic } from "../../../utils/appDiagnosticLog";
import {
  conversationHistoryToChatMessages,
  conversationMessageToChatContent,
} from "./chatMultimodalContent";

function formatDocumentUserContent(doc: {
  name: string;
  text: string;
  pages?: number | null;
  truncated?: boolean;
  source?: string;
}): string {
  const meta = [
    `Document: ${doc.name}`,
    doc.pages != null ? `pages=${doc.pages}` : null,
    doc.truncated ? "truncated=true" : null,
    doc.source ? `source=${doc.source}` : null,
  ]
    .filter(Boolean)
    .join(" | ");
  return `[${meta}]\n\n${doc.text}`;
}

type AssistantSendResult =
  | { ok: true }
  | { ok: false; reason: string; failureKind: "network" | "not_found" | "http" };

/** Send one message through POST /assistant/turn. */
export async function runAssistantSendMessage(
  params: RunAssistantSendMessageParams,
): Promise<AssistantSendResult> {
  const {
    text,
    settings,
    conversation,
    localMessages,
    memoryBlock,
    imageAttachment,
    documentAttachment,
    setMessages,
    setIsStreaming,
    onDraftClear,
    signal,
  } = params;

  const previousUserContent =
    [...localMessages].reverse().find((m) => m.role === "user")?.content ?? null;
  const turnId = makeId();
  const turnStartedAt = Date.now();
  trackAssistantTurnStarted("text");
  const userMsgId = `${turnId}-user`;
  const assistantMsgId = `${turnId}-assistant`;
  const trimmed = text.trim();

  const documentBody = documentAttachment
    ? formatDocumentUserContent(documentAttachment)
    : null;
  const turnMessage = documentAttachment
    ? `Please read and analyze the attached document (${documentAttachment.name}). Summarize who it's about, key experience, skills, and notable projects. Be specific.`
    : trimmed;
  const userContent = documentBody ?? trimmed;

  const userMsg: ConversationMessage = {
    id: userMsgId,
    role: "user",
    content: userContent,
    createdAt: new Date().toISOString(),
    ...(imageAttachment ? { imageAttachment } : {}),
    ...(documentAttachment
      ? {
          documentAttachment: {
            name: documentAttachment.name,
            pages: documentAttachment.pages ?? null,
            truncated: Boolean(documentAttachment.truncated),
            source: documentAttachment.source,
            ...(documentAttachment.previewDataUrl
              ? { previewDataUrl: documentAttachment.previewDataUrl }
              : {}),
          },
        }
      : {}),
  };

  const routing = resolveChatProviderCredentials(settings);
  const historyForStream: ChatMessage[] = [
    { role: "system", content: buildDefaultSystemPrompt(memoryBlock || undefined) },
    ...conversationHistoryToChatMessages(localMessages),
    { role: "user", content: conversationMessageToChatContent(userMsg) },
  ];

  let res: Response;
  try {
    res = await postAssistantTurn(
      {
        message: turnMessage,
        previous_user_message: previousUserContent,
        pending_calendar_draft: pendingCalendarDraft(localMessages),
        pending_calendar_delete_draft: pendingCalendarDeleteDraft(localMessages),
        memory_block: memoryBlock,
        conversation_summary: conversation.summary ?? null,
        assistant_tools_enabled: settings.assistantToolsEnabled,
        assistant_agent_enabled: settings.assistantAgentEnabled,
        messages_for_stream: historyForStream,
        model: routing.model,
        provider: routing.provider,
        api_key: apiKeyForBackendRequest(routing.apiKey),
        base_url: routing.baseUrl,
        use_web_search: routing.provider === "gemini" && (settings.chatWebSearchEnabled ?? false),
        enable_tools: settings.assistantToolsEnabled,
        autonomous_mode: settings.autonomousMode,
      },
      signal,
    );
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    const err = mapFetchFailureToError(e);
    trackAssistantTurnFailed("network", routing.provider);
    logAppDiagnostic("assistant_turn_failed", {
      stage: "fetch",
      reason: err.message,
      provider: routing.provider,
    });
    return { ok: false, reason: err.message, failureKind: "network" };
  }

  if (res.status === 404) {
    trackAssistantTurnFailed("not_found", routing.provider);
    const reason =
      "Assistant routing is unavailable on the local service (404). Try restarting Exo or reinstalling the latest build.";
    logAppDiagnostic("assistant_turn_failed", { stage: "404", provider: routing.provider });
    return { ok: false, reason, failureKind: "not_found" };
  }

  if (isAssistantTurnStream(res)) {
    setMessages((prev) => [
      ...prev,
      userMsg,
      { id: assistantMsgId, role: "assistant", content: "", streaming: true },
    ]);
    onDraftClear();
    setIsStreaming(true);
    await handleAssistantTurnStream(res, params, assistantMsgId);
    return { ok: true };
  }

  if (!res.ok) {
    trackAssistantTurnFailed(`http_${res.status}`, routing.provider);
    const detail = await extractApiError(res);
    const reason = detail || `Assistant request failed (HTTP ${res.status}).`;
    logAppDiagnostic("assistant_turn_failed", {
      stage: "http",
      status: res.status,
      detail,
      provider: routing.provider,
    });
    return { ok: false, reason, failureKind: "http" };
  }

  const turn = await parseAssistantTurnJson(res);

  setMessages((prev) => [
    ...prev,
    userMsg,
    {
      id: assistantMsgId,
      role: "assistant",
      content: turn.assistant_content ?? "",
      streaming: turn.mode === "stream",
      prefetching: turn.action?.startsWith("client_") ?? false,
      calendarContext: turn.action === "client_calendar_read",
      mailRecap: turn.action === "client_mail_read",
      mailManage: turn.action === "client_mail_manage",
    },
  ]);
  onDraftClear();
  setIsStreaming(true);

  if (turn.action === "capability_refuse") {
    const refuseKey = capabilityRefuseCopyKey(String(turn.action_payload?.reason ?? ""));
    applyCompletedTurnMessage(
      { ...turn, assistant_content: params.t(refuseKey) },
      params,
      assistantMsgId,
    );
    trackAssistantTurnCompleted((Date.now() - turnStartedAt) / 1000, 0);
    return { ok: true };
  }

  if (turn.mode === "complete") {
    applyCompletedTurnMessage(turn, params, assistantMsgId);
    trackAssistantTurnCompleted((Date.now() - turnStartedAt) / 1000, 0);
    return { ok: true };
  }

  if (turn.action === "codegen_studio") {
    await handleCodegenStudioAction(
      turn,
      params,
      assistantMsgId,
      text,
      turnId,
      userMsg,
      localMessages,
    );
    return { ok: true };
  }

  if (turn.action === "agent_task") {
    await handleAgentTaskAction(turn, params, assistantMsgId, text);
    return { ok: true };
  }

  if (turn.action === "mail_compose") {
    await handleMailComposeAction(params, assistantMsgId, text);
    return { ok: true };
  }

  if (turn.action === "client_calendar_read") {
    await handleClientCalendarRead(turn, params, assistantMsgId, text, previousUserContent);
    return { ok: true };
  }

  if (turn.action === "client_mail_read") {
    await handleClientMailRead(
      turn,
      params,
      assistantMsgId,
      userMsgId,
      text,
      previousUserContent,
    );
    return { ok: true };
  }

  if (turn.action === "client_mail_manage") {
    await handleClientMailManage(
      turn,
      params,
      assistantMsgId,
      userMsgId,
      text,
      previousUserContent,
    );
    return { ok: true };
  }

  setIsStreaming(false);
  trackAssistantTurnCompleted((Date.now() - turnStartedAt) / 1000, 0);
  return { ok: true };
}
