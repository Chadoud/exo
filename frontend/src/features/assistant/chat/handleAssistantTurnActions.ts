import type { AssistantTurnJsonResponse } from "../../../api/assistantTurn";
import { startAgentTask } from "../../../api/agentTask";
import { relayConnectorTokens, loadConnectedIntegrationIds } from "../../../assistant/connectorContext";
import { isResumableCodegenSession } from "../../codegen/codegenStore";
import type { ConversationMessage } from "../../../hooks/useConversations";
import {
  extractMailComposeParamsFromText,
  buildMailComposeDeeplinks,
} from "../../../systemCommands/assistantIntentHelpers";
import { calendarDeleteDraftFromTurn } from "../../../utils/calendarDeleteConfirm";
import { extractAgentRetryGoal } from "../../../utils/agentFailureContent";
import { resolveChatProviderCredentials } from "../../../utils/resolveChatProviderCredentials";
import { apiKeyForBackendRequest } from "../../../utils/geminiConnection";
import type { RunAssistantSendMessageParams } from "./assistantSendTypes";

export function capabilityRefuseCopyKey(reason: string): string {
  if (reason === "cannot_produce_video") return "assistant.capabilityRefuseVideo";
  if (reason === "how_to") return "assistant.capabilityRefuseAdvice";
  if (reason === "status_or_followup" || reason === "prior_refusal") {
    return "assistant.capabilityRefuseStatus";
  }
  if (reason === "ambiguous_artifact") return "assistant.capabilityRefuseAmbiguous";
  return "assistant.capabilityRefuseNotSoftware";
}

export function applyCompletedTurnMessage(
  turn: AssistantTurnJsonResponse,
  params: RunAssistantSendMessageParams,
  assistantMsgId: string,
): void {
  const { setMessages, stampEmission, setIsStreaming } = params;
  const draft = turn.calendar_event_draft;
  const deleteDraft = turn.calendar_delete_draft;
  setMessages((prev) =>
    prev.map((m) =>
      m.id === assistantMsgId
        ? {
            ...m,
            ...stampEmission(m),
            content: turn.assistant_content ?? "",
            streaming: false,
            prefetching: false,
            calendarEventDraft: draft
              ? {
                  title: String(draft.title ?? draft.summary ?? ""),
                  startIso: String(draft.startIso ?? draft.start ?? ""),
                  endIso: String(draft.endIso ?? draft.end ?? ""),
                  sourceText: String(draft.sourceText ?? draft.source_text ?? ""),
                  awaitingConfirm: Boolean(draft.awaitingConfirm),
                  connectedProviderIds: null,
                  toolName: String(draft.toolName ?? draft.tool_name ?? "google_workspace"),
                }
              : undefined,
            calendarDeleteDraft: deleteDraft
              ? calendarDeleteDraftFromTurn(deleteDraft)
              : undefined,
          }
        : m,
    ),
  );
  setIsStreaming(false);
}

export async function handleCodegenStudioAction(
  _turn: AssistantTurnJsonResponse,
  params: RunAssistantSendMessageParams,
  assistantMsgId: string,
  text: string,
  turnId: string,
  userMsg: ConversationMessage,
  localMessages: ConversationMessage[],
): Promise<void> {
  const { setMessages, setIsStreaming, onCodegenStudio } = params;
  setMessages((prev) =>
    prev.map((m) =>
      m.id === assistantMsgId
        ? {
            ...m,
            content: "__codegen_studio__",
            codegenGoal: text,
            streaming: false,
            prefetching: false,
          }
        : m,
    ),
  );
  setIsStreaming(false);
  const priorSessionId = [...localMessages]
    .reverse()
    .map((m) => m.codegenSessionId)
    .find((id): id is string => Boolean(id) && isResumableCodegenSession(id!));
  onCodegenStudio({
    text,
    turnId,
    userMsg,
    priorSessionId,
  });
}

export async function handleAgentTaskAction(
  turn: AssistantTurnJsonResponse,
  params: RunAssistantSendMessageParams,
  assistantMsgId: string,
  text: string,
): Promise<void> {
  const { setMessages, stampEmission, setIsStreaming, onAgentTaskStarted, settings } = params;
  if (turn.action_payload?.relay_tokens) await relayConnectorTokens();
  const payloadGoal =
    typeof turn.action_payload?.goal === "string" ? turn.action_payload.goal.trim() : "";
  const goal = payloadGoal || extractAgentRetryGoal(text);
  const routing = resolveChatProviderCredentials(settings);
  try {
    const { task_id } = await startAgentTask({
      goal,
      provider: routing.provider,
      model: routing.model,
      apiKey: apiKeyForBackendRequest(routing.apiKey),
      baseUrl: routing.baseUrl,
      autonomousMode: settings.autonomousMode,
    });
    onAgentTaskStarted(task_id, goal);
    setMessages((prev) =>
      prev.map((m) =>
        m.id === assistantMsgId
          ? {
              ...m,
              ...stampEmission(m),
              content: "__agent_task__",
              agentGoal: goal,
              agentTaskId: task_id,
              streaming: false,
              prefetching: false,
            }
          : m,
      ),
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Agent task failed.";
    setMessages((prev) =>
      prev.map((m) =>
        m.id === assistantMsgId
          ? { ...m, ...stampEmission(m), content: `⚠ ${msg}`, streaming: false }
          : m,
      ),
    );
  }
  setIsStreaming(false);
}

export async function handleMailComposeAction(
  params: RunAssistantSendMessageParams,
  assistantMsgId: string,
  text: string,
): Promise<void> {
  const { setMessages, stampEmission, setIsStreaming, t } = params;
  const connectedIds = await loadConnectedIntegrationIds();
  const { subject, to, body } = extractMailComposeParamsFromText(text);
  const links = buildMailComposeDeeplinks(connectedIds, subject, to, body);
  setMessages((prev) =>
    prev.map((m) =>
      m.id === assistantMsgId
        ? {
            ...m,
            ...stampEmission(m),
            content: t("assistant.mailComposeNotSupported"),
            prefetching: false,
            streaming: false,
            mailComposeLinks: links,
            mailComposeDraft: {
              subject,
              to,
              body,
              connectedProviderIds: connectedIds ? [...connectedIds] : null,
            },
          }
        : m,
      ),
  );
  setIsStreaming(false);
}
