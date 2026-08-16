/**
 * Allowlisted AI system commands from the renderer (after chat parses exosites-action).
 * Validates commandId/args; opens folders via shell; delegates UI actions to the renderer.
 */

const { ipcMain, app } = require("electron");
const state = require("../state");
const storage = require("../integrations/storage");
const googleIntegration = require("../integrations/google");
const {
  migrateLegacyGoogleProvider,
  tryHydrateGoogleGmailFromMirror,
  googleSessionLooksUsable,
  PROVIDER_GOOGLE_DRIVE,
  PROVIDER_GOOGLE_CALENDAR,
  PROVIDER_INFOMANIAK_CALENDAR,
} = require("../integrations/ipc");
const microsoftIntegration = require("../integrations/microsoft");
const infomaniakIntegration = require("../integrations/infomaniak");
const { restartBackend } = require("../backendLifecycle");
const { appendAuditLine } = require("../systemCommandAudit");
const { validateExecutePayload } = require("../systemCommandsV1");
const { launchKnownApplication } = require("../knownApplications");
const { BACKEND_PORT } = require("../constants");
const { executeSystemControl } = require("./systemControlHandlers");
const { isTrustedSender } = require("./senderGuard");
const {
  handleOpenOutputFolder,
  handleOpenWorkspaceFolder,
  handleSaveTextFile,
} = require("../systemCommand/fileOps");

function registerSystemCommandHandlers() {
  ipcMain.handle("systemCommand:audit", (_event, entry) => {
    appendAuditLine(
      entry && typeof entry === "object"
        ? {
            commandId: entry.commandId,
            outcome: entry.outcome,
            detail: entry.detail,
          }
        : {}
    );
    return { ok: true };
  });

  ipcMain.handle("systemCommand:execute", async (event, payload) => {
    if (!isTrustedSender(event)) {
      appendAuditLine({ commandId: "", outcome: "error", detail: "untrusted_sender" });
      return { ok: false, reason: "untrusted_sender" };
    }
    const v = validateExecutePayload(payload);
    if (!v.ok) {
      appendAuditLine({
        commandId:
          payload && typeof payload === "object" && typeof payload.commandId === "string"
            ? payload.commandId
            : "",
        outcome: "error",
        detail: v.error,
      });
      return { ok: false, reason: v.error };
    }
    const { command, context } = v;
    const reqId =
      payload && typeof payload === "object" && typeof payload.requestId === "string"
        ? payload.requestId.slice(0, 64)
        : "";
    const detailBase = reqId ? `req:${reqId}` : undefined;

    const win = state.mainWindow;
    switch (command.commandId) {
      case "navigate_tab":
      case "open_help":
      case "open_tour": {
        if (!win || win.isDestroyed()) {
          appendAuditLine({
            commandId: command.commandId,
            outcome: "error",
            detail: "no_window",
          });
          return { ok: false, reason: "no_window" };
        }
        win.webContents.send("systemCommand:delegate", command);
        appendAuditLine({
          commandId: command.commandId,
          outcome: "ran",
          detail: detailBase,
        });
        return { ok: true };
      }
      case "restart_backend": {
        try {
          const result = await restartBackend();
          if (!result.ok) {
            appendAuditLine({
              commandId: command.commandId,
              outcome: "error",
              detail: result.reason ?? "restart_failed",
            });
            return { ok: false, reason: result.reason ?? "restart_failed" };
          }
          appendAuditLine({
            commandId: command.commandId,
            outcome: "ran",
            detail: detailBase,
          });
          return { ok: true };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          appendAuditLine({
            commandId: command.commandId,
            outcome: "error",
            detail: msg.slice(0, 200),
          });
          return { ok: false, reason: "restart_failed" };
        }
      }
      case "open_output_folder":
        return handleOpenOutputFolder(command, context, detailBase);
      case "open_workspace_folder":
        return handleOpenWorkspaceFolder(command, context, detailBase);
      case "graph_onedrive_upload_text": {
        const fileName =
          command.args && typeof command.args.fileName === "string" ? command.args.fileName : "";
        const content =
          command.args && typeof command.args.content === "string" ? command.args.content : "";
        const ud = require("../accountProfile").resolveProfileRoot();
        let secrets = storage.loadProviderSecrets(ud, "microsoft");
        if (!secrets?.access_token) {
          appendAuditLine({
            commandId: command.commandId,
            outcome: "error",
            detail: "microsoft_not_linked",
          });
          return { ok: false, reason: "microsoft_not_linked" };
        }
        const refreshed = await microsoftIntegration.refreshStoredTokens(secrets);
        if (refreshed) {
          storage.saveProviderSecrets(ud, "microsoft", refreshed);
          secrets = refreshed;
        }
        const token = await microsoftIntegration.getValidAccessToken(secrets);
        if (!token) {
          appendAuditLine({
            commandId: command.commandId,
            outcome: "error",
            detail: "token_unavailable",
          });
          return { ok: false, reason: "token_unavailable" };
        }
        const up = await microsoftIntegration.uploadTextToOneDriveRoot(token, fileName, content);
        if (!up.ok) {
          appendAuditLine({
            commandId: command.commandId,
            outcome: "error",
            detail: (up.reason ?? "upload_failed").slice(0, 200),
          });
          return { ok: false, reason: up.reason ?? "upload_failed" };
        }
        appendAuditLine({
          commandId: command.commandId,
          outcome: "ran",
          detail: `${detailBase ? `${detailBase} ` : ""}file:${fileName.slice(0, 120)}`.trim(),
        });
        return { ok: true };
      }
      case "google_drive_upload_text": {
        const fileName =
          command.args && typeof command.args.fileName === "string" ? command.args.fileName : "";
        const content =
          command.args && typeof command.args.content === "string" ? command.args.content : "";
        const ud = require("../accountProfile").resolveProfileRoot();
        migrateLegacyGoogleProvider(ud);
        tryHydrateGoogleGmailFromMirror(ud);
        let secrets = storage.loadProviderSecrets(ud, PROVIDER_GOOGLE_DRIVE);
        if (!googleSessionLooksUsable(secrets)) {
          appendAuditLine({
            commandId: command.commandId,
            outcome: "error",
            detail: "google_not_linked",
          });
          return { ok: false, reason: "google_not_linked" };
        }
        const refreshed = await googleIntegration.refreshStoredTokens(secrets);
        if (refreshed) {
          storage.saveProviderSecrets(ud, PROVIDER_GOOGLE_DRIVE, refreshed);
          secrets = refreshed;
        }
        const token = await googleIntegration.getValidAccessToken(secrets);
        if (!token) {
          appendAuditLine({
            commandId: command.commandId,
            outcome: "error",
            detail: "token_unavailable",
          });
          return { ok: false, reason: "token_unavailable" };
        }
        const up = await googleIntegration.uploadTextFile(token, fileName, content);
        if (!up.ok) {
          appendAuditLine({
            commandId: command.commandId,
            outcome: "error",
            detail: (up.reason ?? "upload_failed").slice(0, 200),
          });
          return { ok: false, reason: up.reason ?? "upload_failed" };
        }
        appendAuditLine({
          commandId: command.commandId,
          outcome: "ran",
          detail: `${detailBase ? `${detailBase} ` : ""}file:${fileName.slice(0, 120)}`.trim(),
        });
        return { ok: true };
      }
      case "open_application": {
        const appKey =
          command.args && typeof command.args.app === "string" ? command.args.app : "";
        const launch = await launchKnownApplication(appKey);
        if (!launch.ok) {
          appendAuditLine({
            commandId: command.commandId,
            outcome: "error",
            detail: (launch.reason ?? "launch_failed").slice(0, 200),
          });
          return { ok: false, reason: launch.reason ?? "launch_failed" };
        }
        appendAuditLine({
          commandId: command.commandId,
          outcome: "ran",
          detail: `${detailBase ? `${detailBase} ` : ""}app:${appKey}`.trim(),
        });
        return { ok: true };
      }
      case "save_text_file":
        return handleSaveTextFile(command, context, detailBase);
      case "graph_calendar_list_events": {
        const startIso =
          command.args && typeof command.args.startDateTime === "string" ? command.args.startDateTime : "";
        const endIso =
          command.args && typeof command.args.endDateTime === "string" ? command.args.endDateTime : "";
        const maxEv =
          command.args && typeof command.args.maxEvents === "number" ? command.args.maxEvents : 50;
        const ud = require("../accountProfile").resolveProfileRoot();
        let secrets = storage.loadProviderSecrets(ud, "microsoft");
        if (!secrets?.access_token) {
          appendAuditLine({ commandId: command.commandId, outcome: "error", detail: "microsoft_not_linked" });
          return { ok: false, reason: "microsoft_not_linked" };
        }
        const refreshed = await microsoftIntegration.refreshStoredTokens(secrets);
        if (refreshed) {
          storage.saveProviderSecrets(ud, "microsoft", refreshed);
          secrets = refreshed;
        }
        const token = await microsoftIntegration.getValidAccessToken(secrets);
        if (!token) {
          appendAuditLine({ commandId: command.commandId, outcome: "error", detail: "token_unavailable" });
          return { ok: false, reason: "token_unavailable" };
        }
        const r = await microsoftIntegration.graphListCalendarViewEvents(token, startIso, endIso, maxEv);
        if (!r.ok) {
          appendAuditLine({
            commandId: command.commandId,
            outcome: "error",
            detail: (r.reason ?? "calendar_failed").slice(0, 200),
          });
          return { ok: false, reason: r.reason ?? "calendar_failed" };
        }
        appendAuditLine({
          commandId: command.commandId,
          outcome: "ran",
          detail: `${detailBase ? `${detailBase} ` : ""}events:${r.events?.length ?? 0}`.trim(),
        });
        return { ok: true, data: { events: r.events ?? [] } };
      }
      case "graph_mail_search": {
        const q = command.args && typeof command.args.query === "string" ? command.args.query : "";
        const maxM =
          command.args && typeof command.args.maxMessages === "number" ? command.args.maxMessages : 25;
        const ud = require("../accountProfile").resolveProfileRoot();
        let secrets = storage.loadProviderSecrets(ud, "microsoft");
        if (!secrets?.access_token) {
          appendAuditLine({ commandId: command.commandId, outcome: "error", detail: "microsoft_not_linked" });
          return { ok: false, reason: "microsoft_not_linked" };
        }
        const refreshed = await microsoftIntegration.refreshStoredTokens(secrets);
        if (refreshed) {
          storage.saveProviderSecrets(ud, "microsoft", refreshed);
          secrets = refreshed;
        }
        const token = await microsoftIntegration.getValidAccessToken(secrets);
        if (!token) {
          appendAuditLine({ commandId: command.commandId, outcome: "error", detail: "token_unavailable" });
          return { ok: false, reason: "token_unavailable" };
        }
        const r = await microsoftIntegration.graphMailSearchMessages(token, q, maxM);
        if (!r.ok) {
          appendAuditLine({
            commandId: command.commandId,
            outcome: "error",
            detail: (r.reason ?? "mail_search_failed").slice(0, 200),
          });
          return { ok: false, reason: r.reason ?? "mail_search_failed" };
        }
        appendAuditLine({
          commandId: command.commandId,
          outcome: "ran",
          detail: `${detailBase ? `${detailBase} ` : ""}hits:${r.messages?.length ?? 0}`.trim(),
        });
        return { ok: true, data: { messages: r.messages ?? [] } };
      }
      case "google_calendar_list_events": {
        const timeMin =
          command.args && typeof command.args.startDateTime === "string" ? command.args.startDateTime : "";
        const timeMax =
          command.args && typeof command.args.endDateTime === "string" ? command.args.endDateTime : "";
        const maxEv =
          command.args && typeof command.args.maxEvents === "number" ? command.args.maxEvents : 50;
        const ud = require("../accountProfile").resolveProfileRoot();
        migrateLegacyGoogleProvider(ud);
        let secrets = storage.loadProviderSecrets(ud, PROVIDER_GOOGLE_CALENDAR);
        if (!googleSessionLooksUsable(secrets)) {
          appendAuditLine({
            commandId: command.commandId,
            outcome: "error",
            detail: "google_calendar_not_linked",
          });
          return { ok: false, reason: "google_calendar_not_linked" };
        }
        const refreshed = await googleIntegration.refreshStoredTokens(secrets);
        if (refreshed) {
          storage.saveProviderSecrets(ud, PROVIDER_GOOGLE_CALENDAR, refreshed);
          secrets = refreshed;
        }
        const token = await googleIntegration.getValidAccessToken(secrets);
        if (!token) {
          appendAuditLine({ commandId: command.commandId, outcome: "error", detail: "token_unavailable" });
          return { ok: false, reason: "token_unavailable" };
        }
        const r = await googleIntegration.listPrimaryCalendarEvents(token, timeMin, timeMax, maxEv);
        if (!r.ok) {
          appendAuditLine({
            commandId: command.commandId,
            outcome: "error",
            detail: (r.reason ?? "calendar_failed").slice(0, 200),
          });
          return { ok: false, reason: r.reason ?? "calendar_failed" };
        }
        appendAuditLine({
          commandId: command.commandId,
          outcome: "ran",
          detail: `${detailBase ? `${detailBase} ` : ""}events:${r.events?.length ?? 0}`.trim(),
        });
        return { ok: true, data: { events: r.events ?? [] } };
      }
      case "gmail_search_messages": {
        const q = command.args && typeof command.args.query === "string" ? command.args.query : "";
        const maxM =
          command.args && typeof command.args.maxMessages === "number" ? command.args.maxMessages : 25;
        // Pre-filter using Gmail's own category classifier: drop Promotions, Social, Updates, Forums
        // tabs before any metadata fetches. Falls back to plain inbox when a user provides a
        // custom query (e.g. "Find emails about project X").
        const GMAIL_RECAP_QUERY =
          "in:inbox -category:promotions -category:social -category:updates " +
          "-category:forums newer_than:14d";
        const effectiveQuery = q.trim() || GMAIL_RECAP_QUERY;
        const appTok = state.appToken ? String(state.appToken) : "";
        const headers = { "Content-Type": "application/json" };
        if (appTok) headers["X-App-Token"] = appTok;
        try {
          const res = await fetch(`http://127.0.0.1:${BACKEND_PORT}/assistant/gmail-search`, {
            method: "POST",
            headers,
            body: JSON.stringify({ query: effectiveQuery, max_messages: maxM }),
          });
          const text = await res.text();
          let json = {};
          try {
            json = JSON.parse(text);
          } catch {
            json = {};
          }
          if (!res.ok) {
            const detail = typeof json.detail === "string" ? json.detail : `http_${res.status}`;
            appendAuditLine({
              commandId: command.commandId,
              outcome: "error",
              detail: detail.slice(0, 200),
            });
            return { ok: false, reason: "gmail_search_failed" };
          }
          const n = Array.isArray(json.messages) ? json.messages.length : 0;
          appendAuditLine({
            commandId: command.commandId,
            outcome: "ran",
            detail: `${detailBase ? `${detailBase} ` : ""}rows:${n}`.trim(),
          });
          return { ok: true, data: { messages: Array.isArray(json.messages) ? json.messages : [] } };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          appendAuditLine({
            commandId: command.commandId,
            outcome: "error",
            detail: msg.slice(0, 200),
          });
          return { ok: false, reason: "gmail_search_failed" };
        }
      }
      case "infomaniak_calendar_list_events": {
        const startIso =
          command.args && typeof command.args.startDateTime === "string" ? command.args.startDateTime : "";
        const endIso =
          command.args && typeof command.args.endDateTime === "string" ? command.args.endDateTime : "";
        const maxEv =
          command.args && typeof command.args.maxEvents === "number" ? command.args.maxEvents : 50;
        const ud = require("../accountProfile").resolveProfileRoot();
        let secrets = storage.loadProviderSecrets(ud, PROVIDER_INFOMANIAK_CALENDAR);
        if (!infomaniakIntegration.infomaniakSessionLooksUsable(secrets)) {
          appendAuditLine({
            commandId: command.commandId,
            outcome: "error",
            detail: "infomaniak_calendar_not_linked",
          });
          return { ok: false, reason: "infomaniak_calendar_not_linked" };
        }
        const refreshed = await infomaniakIntegration.refreshStoredTokens(secrets);
        if (refreshed) {
          storage.saveProviderSecrets(ud, PROVIDER_INFOMANIAK_CALENDAR, refreshed);
          secrets = refreshed;
        }
        const token = await infomaniakIntegration.getValidAccessToken(secrets);
        if (!token) {
          appendAuditLine({ commandId: command.commandId, outcome: "error", detail: "token_unavailable" });
          return { ok: false, reason: "token_unavailable" };
        }
        const r = await infomaniakIntegration.listInfomaniakCalendarEvents(token, startIso, endIso, maxEv);
        if (!r.ok) {
          appendAuditLine({
            commandId: command.commandId,
            outcome: "error",
            detail: (r.reason ?? "calendar_failed").slice(0, 200),
          });
          return { ok: false, reason: r.reason ?? "calendar_failed" };
        }
        appendAuditLine({
          commandId: command.commandId,
          outcome: "ran",
          detail: `${detailBase ? `${detailBase} ` : ""}events:${r.events?.length ?? 0}`.trim(),
        });
        return { ok: true, data: { events: r.events ?? [] } };
      }
      // ── System control + new Exo-level commands ───────────────────────
      case "list_directory":
      case "terminal_safe":
      case "get_running_apps":
      case "system_volume":
      case "read_file":
      case "open_app":
      case "close_app":
      case "web_search":
      case "browser_control":
      case "youtube_video":
      case "reminder":
      case "computer_settings": {
        const result = await executeSystemControl(command.commandId, command.args ?? {});
        appendAuditLine({
          commandId: command.commandId,
          outcome: result.ok ? "ran" : "error",
          detail: result.ok ? "" : (result.error ?? "").slice(0, 200),
        });
        if (!result.ok) return { ok: false, reason: result.error ?? "system_control_failed" };
        return { ok: true, data: result.data ?? {} };
      }

      // ── Phase 1: Persistent Memory ──────────────────────────────────────
      case "save_memory": {
        const { category, key, value, conversation_id } = command.args;
        try {
          const token = await getBackendToken();
          const headers = { "Content-Type": "application/json" };
          if (token) headers["X-App-Token"] = token;
          const res = await fetch(`http://127.0.0.1:${BACKEND_PORT}/memory`, {
            method: "POST",
            headers,
            body: JSON.stringify({ category, key, value, conversation_id: conversation_id ?? null }),
          });
          if (!res.ok) {
            const text = await res.text();
            appendAuditLine({ commandId: command.commandId, outcome: "error", detail: text.slice(0, 200) });
            return { ok: false, reason: "save_memory_backend_error" };
          }
          appendAuditLine({ commandId: command.commandId, outcome: "ran", detail: `${category}/${key}` });
          return { ok: true, data: { saved: true, category, key } };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          appendAuditLine({ commandId: command.commandId, outcome: "error", detail: msg.slice(0, 200) });
          return { ok: false, reason: "save_memory_failed" };
        }
      }

      default:
        return { ok: false, reason: "unknown_command" };
    }
  });
}

// Retrieve the backend token cached in app state (may be null in dev mode).
async function getBackendToken() {
  try {
    return state.appToken ?? null;
  } catch {
    return null;
  }
}

module.exports = { registerSystemCommandHandlers };
