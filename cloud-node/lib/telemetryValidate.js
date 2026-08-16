/** Validation aligned with backend/telemetry/schemas.py (SSOT) and frontend/src/telemetry/schema.ts */

const FORBIDDEN_PROP_KEYS = new Set(
  [
    "path", "paths", "filepath", "file_path", "filePath", "filename", "file_name",
    "folder", "folder_path", "output_dir", "outputDir", "dest_path",
    "email", "password", "token", "license_key", "licenseKey", "content", "prompt", "response",
  ].map((k) => k.toLowerCase()),
);

const ALLOWED_EVENT_NAMES = new Set([
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
  "sort_structure_enabled",
  "sort_structure_cap_applied",
  "sort_structure_pack_imported",
  "mail_reply_proposed",
  "mail_reply_opened",
  "mail_reply_sent",
  "mail_reply_dismissed",
  "mail_reply_failed",
]);

const ALLOWED_PROP_KEYS = new Set([
  "step", "tab", "from_tab", "duration_bucket", "ui_locale", "theme",
  "destination", "filter_field", "selection", "stack", "follow_up",
  "channel", "tool_count", "outcome", "error_class", "provider", "tool_name",
  "platform", "method",   "feature", "model",
  "file_count_bucket", "uncertain_rate_bucket", "failed_sort_bucket", "failed_fetch_bucket",
  "source", "ocr_used", "reason", "stage", "milestone", "count_bucket", "intent_bucket",
  "structure_depth", "structure_themes", "has_structure_caps", "overflow_count_bucket", "pack_id",
]);

const FEEDBACK_CATEGORIES = new Set(["bug", "ux", "idea", "other"]);
const INSTANCE_ID_RE = /^[a-zA-Z0-9._:-]+$/;
const PATH_IN_MESSAGE_RE = /(?:[A-Za-z]:\\|\/Users\/|\/home\/|\\\\)/;

/**
 * @param {unknown} body
 * @returns {{ rows: object[] } | { error: string }}
 */
function validateEventsBatch(body) {
  if (typeof body !== "object" || body === null) {
    return { error: "body must be an object" };
  }
  const b = /** @type {Record<string, unknown>} */ (body);
  const instanceId = String(b.instance_id || "");
  if (instanceId.length < 8 || instanceId.length > 128 || !INSTANCE_ID_RE.test(instanceId)) {
    return { error: "invalid instance_id" };
  }
  const sessionIdRaw = b.session_id;
  let sessionId = null;
  if (sessionIdRaw !== undefined && sessionIdRaw !== null && sessionIdRaw !== "") {
    sessionId = String(sessionIdRaw);
    if (sessionId.length < 8 || sessionId.length > 128 || !INSTANCE_ID_RE.test(sessionId)) {
      return { error: "invalid session_id" };
    }
  }
  const events = b.events;
  if (!Array.isArray(events) || events.length === 0 || events.length > 50) {
    return { error: "events must be a non-empty array (max 50)" };
  }

  const appVersion = String(b.app_version || "unknown").slice(0, 64);
  const platform = String(b.platform || "unknown").slice(0, 64);
  const locale = String(b.locale || "en").slice(0, 16);
  const clientTs = b.client_ts_ms != null ? Number(b.client_ts_ms) : null;

  const rows = [];
  for (const raw of events) {
    if (typeof raw !== "object" || raw === null) {
      return { error: "invalid event item" };
    }
    const ev = /** @type {Record<string, unknown>} */ (raw);
    const name = String(ev.name || "");
    if (!ALLOWED_EVENT_NAMES.has(name)) {
      return { error: `unknown event name: ${name}` };
    }
    const props = ev.props;
    if (props !== undefined && (typeof props !== "object" || props === null || Array.isArray(props))) {
      return { error: "props must be an object" };
    }
    const safeProps = {};
    if (props) {
      for (const [key, val] of Object.entries(props)) {
        if (FORBIDDEN_PROP_KEYS.has(key.toLowerCase())) {
          return { error: `forbidden prop key: ${key}` };
        }
        if (!ALLOWED_PROP_KEYS.has(key)) {
          return { error: `prop key not allowlisted: ${key}` };
        }
        if (typeof val !== "string" && typeof val !== "number" && typeof val !== "boolean") {
          return { error: `invalid prop type for ${key}` };
        }
        if (typeof val === "string" && val.length > 512) {
          return { error: `prop too long: ${key}` };
        }
        safeProps[key] = val;
      }
    }
    rows.push({
      instance_id: instanceId,
      session_id: sessionId,
      app_version: appVersion,
      platform,
      locale,
      event_name: name,
      event_props: Object.keys(safeProps).length ? JSON.stringify(safeProps) : null,
      client_ts_ms: Number.isFinite(clientTs) ? clientTs : null,
    });
  }
  return { rows };
}

/**
 * @param {unknown} body
 * @returns {{ row: object } | { error: string }}
 */
function validateFeedback(body) {
  if (typeof body !== "object" || body === null) {
    return { error: "body must be an object" };
  }
  const b = /** @type {Record<string, unknown>} */ (body);
  const instanceId = String(b.instance_id || "");
  if (instanceId.length < 8 || instanceId.length > 128 || !INSTANCE_ID_RE.test(instanceId)) {
    return { error: "invalid instance_id" };
  }
  const category = String(b.category || "ux");
  if (!FEEDBACK_CATEGORIES.has(category)) {
    return { error: "invalid category" };
  }
  const message = String(b.message || "").trim();
  if (!message || message.length > 4000) {
    return { error: "invalid message" };
  }
  if (PATH_IN_MESSAGE_RE.test(message)) {
    return { error: "message must not contain file paths" };
  }
  return {
    row: {
      instance_id: instanceId,
      app_version: String(b.app_version || "unknown").slice(0, 64),
      locale: String(b.locale || "en").slice(0, 16),
      category,
      message,
    },
  };
}

module.exports = {
  validateEventsBatch,
  validateFeedback,
  ALLOWED_EVENT_NAMES,
};
