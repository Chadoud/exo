/**
 * Keep in sync with backend/telemetry/schemas.py (ALLOWED_EVENT_NAMES, FORBIDDEN_PROP_KEYS).
 * Privacy / usage documentation: ../../../SECURITY.md — update both when adding events or props.
 */

import { z } from "zod";

export const TELEMETRY_SCHEMA_VERSION = 1 as const;

/** Event names allowed server-side — use these constants from UI code. */
export const TelemetryEventNames = {
  appStarted: "app_started",
  welcomeStepViewed: "welcome_step_viewed",
  welcomeCompleted: "welcome_completed",
  welcomeDismissed: "welcome_dismissed",
  settingsOpened: "settings_opened",
  tabChanged: "tab_changed",
  firstDrop: "first_drop",
  jobStarted: "job_started",
  jobCompleted: "job_completed",
  jobFailed: "job_failed",
  jobCancelled: "job_cancelled",
  sortBlocked: "sort_blocked",
  feedbackSubmitted: "feedback_submitted",
  postRunCtaClicked: "post_run_cta_clicked",
  reviewFilterChanged: "review_filter_changed",
  codegenSessionStart: "codegen_session_start",
  codegenPreviewReady: "codegen_preview_ready",
  codegenError: "codegen_error",
  codegenRepairOutcome: "codegen_repair_outcome",
  accountSignedIn: "account_signed_in",
  accountSignedOut: "account_signed_out",
  accountDeleted: "account_deleted",
  telemetryOptIn: "telemetry_opt_in",
  telemetryOptOut: "telemetry_opt_out",
  appHeartbeat: "app_heartbeat",
  assistantTurnStarted: "assistant_turn_started",
  assistantTurnCompleted: "assistant_turn_completed",
  assistantTurnFailed: "assistant_turn_failed",
  assistantToolInvoked: "assistant_tool_invoked",
  sendMessageStarted: "send_message_started",
  sendMessageCompleted: "send_message_completed",
  sendMessageFailed: "send_message_failed",
  integrationConnectStarted: "integration_connect_started",
  integrationConnectCompleted: "integration_connect_completed",
  integrationConnectFailed: "integration_connect_failed",
  featureEntered: "feature_entered",
  featureExited: "feature_exited",
  providerError: "provider_error",
  reviewOpened: "review_opened",
  reviewBulkApplied: "review_bulk_applied",
  reviewReassign: "review_reassign",
  reviewDismissed: "review_dismissed",
  setupMilestone: "setup_milestone",
  brainMapNodeClicked: "brain_map_node_clicked",
  brainMapSourceOpened: "brain_map_source_opened",
  brainMapEmptyState: "brain_map_empty_state",
  memoryRecalled: "memory_recalled",
  memoryEvictedStale: "memory_evicted_stale",
  sortStructureEnabled: "sort_structure_enabled",
  sortStructureCapApplied: "sort_structure_cap_applied",
  sortStructurePackImported: "sort_structure_pack_imported",
  mailReplyProposed: "mail_reply_proposed",
  mailReplyOpened: "mail_reply_opened",
  mailReplySent: "mail_reply_sent",
  mailReplyDismissed: "mail_reply_dismissed",
  mailReplyFailed: "mail_reply_failed",
} as const;

export type TelemetryEventName = (typeof TelemetryEventNames)[keyof typeof TelemetryEventNames];

const forbiddenPropKey = (key: string) => {
  const lower = key.toLowerCase();
  const blocked = new Set(
    [
      "path",
      "paths",
      "filepath",
      "file_path",
      "filename",
      "file_name",
      "folder",
      "folder_path",
      "output_dir",
      "outputdir",
      "dest_path",
      "email",
      "password",
      "token",
      "license_key",
      "licensekey",
      "content",
      "prompt",
      "response",
    ].map((k) => k.toLowerCase())
  );
  return blocked.has(lower);
};

const allowedPropKeys = new Set([
  "step",
  "tab",
  "from_tab",
  "duration_bucket",
  "ui_locale",
  "theme",
  "destination",
  "filter_field",
  "selection",
  "stack",
  "follow_up",
  "channel",
  "tool_count",
  "outcome",
  "error_class",
  "provider",
  "tool_name",
  "platform",
  "method",
  "feature",
  "model",
  "file_count_bucket",
  "uncertain_rate_bucket",
  "failed_sort_bucket",
  "failed_fetch_bucket",
  "source",
  "ocr_used",
  "reason",
  "stage",
  "milestone",
  "count_bucket",
  "intent_bucket",
  "structure_depth",
  "structure_themes",
  "has_structure_caps",
  "overflow_count_bucket",
  "pack_id",
]);

const propsSchema = z
  .record(
    z.string(),
    z.union([z.string().max(512), z.number(), z.boolean()])
  )
  .superRefine((rec, ctx) => {
    for (const key of Object.keys(rec)) {
      if (forbiddenPropKey(key)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Forbidden key: ${key}` });
        return;
      }
      if (!allowedPropKeys.has(key)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Unknown prop key: ${key}` });
        return;
      }
    }
  });

export const uiEventItemSchema = z.object({
  v: z.literal(TELEMETRY_SCHEMA_VERSION),
  name: z.enum([
    "app_started",
    "welcome_step_viewed",
    "welcome_completed",
    "welcome_dismissed",
    "settings_opened",
    "tab_changed",
    "first_drop",
    "job_started",
    "job_completed",
    "job_failed",
    "job_cancelled",
    "sort_blocked",
    "feedback_submitted",
    "post_run_cta_clicked",
    "review_filter_changed",
    "codegen_session_start",
    "codegen_preview_ready",
    "codegen_error",
    "codegen_repair_outcome",
    "account_signed_in",
    "account_signed_out",
    "account_deleted",
    "telemetry_opt_in",
    "telemetry_opt_out",
    "app_heartbeat",
    "assistant_turn_started",
    "assistant_turn_completed",
    "assistant_turn_failed",
    "assistant_tool_invoked",
    "send_message_started",
    "send_message_completed",
    "send_message_failed",
    "integration_connect_started",
    "integration_connect_completed",
    "integration_connect_failed",
    "feature_entered",
    "feature_exited",
    "provider_error",
    "review_opened",
    "review_bulk_applied",
    "review_reassign",
    "review_dismissed",
    "setup_milestone",
    "brain_map_node_clicked",
    "brain_map_source_opened",
    "brain_map_empty_state",
    "memory_recalled",
    "memory_evicted_stale",
    "sort_structure_enabled",
    "sort_structure_cap_applied",
    "sort_structure_pack_imported",
    "mail_reply_proposed",
    "mail_reply_opened",
    "mail_reply_sent",
    "mail_reply_dismissed",
    "mail_reply_failed",
  ]),
  props: propsSchema.default({}),
});

export const telemetryBatchSchema = z.object({
  instance_id: z.string().min(8).max(128).regex(/^[a-zA-Z0-9._:-]+$/),
  session_id: z
    .string()
    .min(8)
    .max(128)
    .regex(/^[a-zA-Z0-9._:-]+$/)
    .optional(),
  app_version: z.string().max(64).default("unknown"),
  platform: z.string().max(64).default("unknown"),
  locale: z.string().max(16).default("en"),
  client_ts_ms: z.number().int().nonnegative().optional(),
  events: z.array(uiEventItemSchema).max(50).default([]),
});

export const feedbackSchema = z.object({
  instance_id: z.string().min(8).max(128).regex(/^[a-zA-Z0-9._:-]+$/),
  category: z.enum(["bug", "ux", "idea", "other"]).default("ux"),
  message: z
    .string()
    .min(1)
    .max(4000)
    .refine((s) => !/(?:[A-Za-z]:\\|\/Users\/|\/home\/|\\\\)/.test(s), {
      message: "Do not include file paths in feedback",
    }),
  app_version: z.string().max(64).default("unknown"),
  locale: z.string().max(16).default("en"),
});

export type FeedbackPayload = z.infer<typeof feedbackSchema>;
