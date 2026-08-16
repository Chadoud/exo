import { useCallback, useRef, type MutableRefObject } from "react";
import { toast } from "sonner";
import {
  VOICE_TOOL_MANAGE_CONNECTION,
  VOICE_TOOL_RUN_GOOGLE_DRIVE_WORKSPACE_SORT,
  VOICE_TOOL_START_CODEGEN_STUDIO,
  VOICE_TOOL_START_LOCAL_SORT,
} from "../../constants";
import { setActivePlanTask } from "../../features/assistant/plan/planStore";
import type { WorkspaceAssistantBridge } from "../shared/bridges/workspaceAssistant";
import type { MainNavTab } from "../../hooks/useMainNavItems";
import {
  handleIntegrationClientAction,
  type IntegrationClientAction,
} from "../../assistant/integrationClientActions";

type Tab = MainNavTab;
type TFunction = (key: string, params?: Record<string, string | number>) => string;

interface UseWorkspaceVoiceToolHandlersParams {
  requestTab: (tab: Tab) => void;
  workspaceAssistantBridge: WorkspaceAssistantBridge;
  onVoiceLocalSortJobStarted: (jobId: string, sessionId: string) => void;
  onVoiceCodegenRequested: (goal: string) => void;
  t: TFunction;
}

/**
 * Voice tool side-effects for workspace automation (sort tab, codegen, integrations).
 */
export function useWorkspaceVoiceToolHandlers({
  requestTab,
  workspaceAssistantBridge,
  onVoiceLocalSortJobStarted,
  onVoiceCodegenRequested,
  t,
}: UseWorkspaceVoiceToolHandlersParams) {
  const focusSortTabAfterVoiceAutomation = useCallback(() => {
    requestTab("queue");
  }, [requestTab]);

  const handleVoiceToolRunning = useCallback(
    (payload: { tools: string[]; planTaskId?: string; planGoal?: string }) => {
      if (payload.planTaskId && payload.planGoal) {
        setActivePlanTask(payload.planTaskId, payload.planGoal);
      }
      const hit = payload.tools.some(
        (n) =>
          n === VOICE_TOOL_START_LOCAL_SORT ||
          n === VOICE_TOOL_RUN_GOOGLE_DRIVE_WORKSPACE_SORT,
      );
      if (!hit) return;
      focusSortTabAfterVoiceAutomation();
    },
    [focusSortTabAfterVoiceAutomation],
  );

  const runIntegrationVoiceActionRef = useRef<
    (
      action: "integration_connect" | "integration_disconnect" | "open_whatsapp_setup",
      providerId: string,
      providerLabel: string,
    ) => Promise<void>
  >(async () => {});

  const handleVoiceToolResult = useCallback(
    (payload: { tool: string; callId: string; result: unknown }) => {
      const describeFailure = (err: unknown) =>
        typeof err === "string" && err.trim()
          ? err.trim()
          : t("assistant.voiceLocalSortFailedFallbackDetail");

      const toastVoiceToolFailed = (err: unknown) => {
        toast.error(t("assistant.voiceLocalSortFailedTitle"), {
          description: describeFailure(err),
          duration: 8000,
        });
      };

      if (payload.tool === VOICE_TOOL_START_LOCAL_SORT) {
        focusSortTabAfterVoiceAutomation();
        const r = payload.result as {
          ok?: boolean;
          data?: { job_id?: string; session_id?: string };
          error?: string;
        };
        if (r?.ok && r.data?.job_id) {
          onVoiceLocalSortJobStarted(r.data.job_id, r.data.session_id ?? r.data.job_id);
          return;
        }
        toastVoiceToolFailed(r?.error);
        return;
      }

      if (payload.tool === VOICE_TOOL_START_CODEGEN_STUDIO) {
        const r = payload.result as {
          ok?: boolean;
          data?: { goal?: string; action?: string };
          error?: string;
        };
        if (r?.data?.action === "refuse") return;
        if (r?.ok && r.data?.goal) {
          onVoiceCodegenRequested(r.data.goal);
          return;
        }
        toastVoiceToolFailed(r?.error);
        return;
      }

      if (payload.tool === VOICE_TOOL_RUN_GOOGLE_DRIVE_WORKSPACE_SORT) {
        focusSortTabAfterVoiceAutomation();
        const r = payload.result as { ok?: boolean; error?: string };
        if (!r?.ok) {
          toastVoiceToolFailed(r?.error);
          return;
        }
        void workspaceAssistantBridge.triggerRunBatch({ forceGoogleDrive: true });
        return;
      }

      if (payload.tool === VOICE_TOOL_MANAGE_CONNECTION) {
        const r = payload.result as {
          ok?: boolean;
          data?: {
            action?: "integration_connect" | "integration_disconnect" | "open_whatsapp_setup";
            provider_id?: string;
            provider_label?: string;
          };
        };
        const providerId = r?.data?.provider_id;
        const action = r?.data?.action;
        if (!r?.ok || !providerId || !action) return;
        handleIntegrationClientAction({
          detail: {
            action: action as IntegrationClientAction,
            providerId,
            providerLabel: r.data?.provider_label ?? providerId,
          },
          requestTab,
          runIntegrationAction: runIntegrationVoiceActionRef.current,
        });
      }
    },
    [
      focusSortTabAfterVoiceAutomation,
      workspaceAssistantBridge,
      onVoiceLocalSortJobStarted,
      onVoiceCodegenRequested,
      t,
      requestTab,
    ],
  );

  return {
    handleVoiceToolRunning,
    handleVoiceToolResult,
    runIntegrationVoiceActionRef: runIntegrationVoiceActionRef as MutableRefObject<
      (
        action: "integration_connect" | "integration_disconnect" | "open_whatsapp_setup",
        providerId: string,
        providerLabel: string,
      ) => Promise<void>
    >,
  };
}
