/**
 * IPC handlers: connect, disconnect, S3 credentials save/load, iCloud folder pick/get,
 * and Infomaniak personal API token management.
 *
 * @param {Electron.IpcMain} ipcMain
 * @param {import('./integrationCore')} core
 */

const storage = require("../storage");
const google = require("../google");
const microsoft = require("../microsoft");
const dropbox = require("../dropbox");
const notion = require("../notion");
const notionClientStore = require("../notionClientStore");
const slack = require("../slack");
const slackClientStore = require("../slackClientStore");
const whatsapp = require("../whatsapp");
const whatsappCloudSync = require("../whatsappCloudSync");
const { runWhatsAppEmbeddedSignup } = require("../whatsappEmbeddedSignupWindow");
const icloud = require("../icloud");
const infomaniak = require("../infomaniak");
const infomaniakTokenStore = require("../infomaniakTokenStore");
const { clearInfomaniakEnvTokenFromDotenv } = require("../../readGmailDotenvForBackend");
const { syncGoogleOauthClientIdForElectronMain } = require("../../backendProcess");
const { isTrustedSender } = require("../../ipc/senderGuard");
const { BACKEND_PORT } = require("../../constants");

/** @param {import("electron").IpcMainInvokeEvent} event */
function rejectUntrustedSender(event) {
  if (!isTrustedSender(event)) {
    return { ok: false, reason: "untrusted_sender" };
  }
  return null;
}

const _PROVIDER_CONNECT_LABELS = {
  "google-all": "Google",
  "google-gmail": "Gmail",
  "google-drive": "Google Drive",
  "google-calendar": "Google Calendar",
  microsoft: "Microsoft",
  onedrive: "Microsoft",
  outlook: "Microsoft",
};

function _connectOpts(providerId, autopilot) {
  if (!autopilot) return {};
  return {
    autopilot: true,
    providerId,
    label: _PROVIDER_CONNECT_LABELS[providerId] || providerId,
  };
}

/** @returns {{ ok: true } | { ok: false; reason: string }} */
function saveIntegrationSecrets(ud, providerId, secrets) {
  const result = storage.saveProviderSecrets(ud, providerId, secrets);
  if (!result.ok) return { ok: false, reason: result.reason };
  return { ok: true };
}

async function _verifyGoogleTokens(providerId, tokens) {
  const accessToken = tokens?.access_token;
  if (!accessToken) {
    return { ok: false, verification: {}, reason: "no_access_token" };
  }
  const verification = {};
  const needsCalendar = providerId === "google-calendar" || providerId === "google-all";
  const needsGmail = providerId === "google-gmail" || providerId === "google-all";
  const needsDrive = providerId === "google-drive" || providerId === "google-all";

  if (needsCalendar) verification.calendar = await google.googleCalendarHealth(accessToken);
  if (needsGmail) {
    const gmailHealth = await google.gmailProfileHealth(accessToken);
    verification.gmail = gmailHealth.ok
      ? { ok: true }
      : { ok: false, reason: gmailHealth.reason };
  }
  if (needsDrive) verification.drive = await google.driveAboutHealth(accessToken);

  const failed = [];
  if (needsCalendar && !verification.calendar?.ok) failed.push("calendar");
  if (needsGmail && !verification.gmail?.ok) failed.push("gmail");
  if (needsDrive && !verification.drive?.ok) failed.push("drive");

  if (failed.length > 0) {
    return {
      ok: false,
      verification,
      reason: `scope_verification_failed:${failed.join(",")}`,
    };
  }
  return { ok: true, verification };
}

async function _verifyMicrosoftTokens(tokens) {
  const accessToken = tokens?.access_token;
  if (!accessToken) {
    return { ok: false, verification: {}, reason: "no_access_token" };
  }
  const graph = await microsoft.graphMeHealth(accessToken);
  const verification = { graph };
  if (!graph.ok) {
    return {
      ok: false,
      verification,
      reason: graph.reason || "scope_verification_failed",
    };
  }
  return { ok: true, verification };
}

/**
 * Verify Graph health, register cloud webhook binding, and start desktop poll.
 * @param {import('./integrationCore')} core
 * @param {string} ud
 * @param {{ phone_number_id: string, access_token: string, business_account_id?: string }} creds
 * @param {string | null | undefined} displayPhoneFallback
 * @param {{ skipGraphHealth?: boolean }} [options]
 */
async function finalizeWhatsAppCloudSave(core, ud, creds, displayPhoneFallback = null, options = {}) {
  let displayPhone = displayPhoneFallback || null;
  const skipGraph = Boolean(options.skipGraphHealth && displayPhoneFallback);
  if (!skipGraph) {
    const health = await whatsapp.whatsAppCloudHealth(creds);
    if (!health.ok) {
      storage.clearProvider(ud, core.PROVIDER_WHATSAPP);
      return { ok: false, reason: health.reason || "health_check_failed" };
    }
    displayPhone = health.displayPhoneNumber || displayPhone;
  }
  try {
    await whatsappCloudSync.registerPhoneBinding(ud, creds, displayPhone);
    whatsappCloudSync.startPolling(ud);
  } catch (err) {
    console.warn("[whatsapp] cloud webhook registration failed:", err?.message || err);
    return { ok: true, displayPhoneNumber: displayPhone, webhookRegistrationFailed: true };
  }
  return { ok: true, displayPhoneNumber: displayPhone };
}


const { relayTokensAfterConnectSave } = require("../postConnectTokenRelay");

function registerIntegrationOAuthHandlers(ipcMain, core) {
  ipcMain.handle("integration:connect", async (event, payload) => {
    const denied = rejectUntrustedSender(event);
    if (denied) return denied;
    syncGoogleOauthClientIdForElectronMain();
    const id = payload && typeof payload.providerId === "string" ? payload.providerId : "";
    // When the request comes from the AI assistant, drive the consent page in an
    // app-owned window (autopilot) instead of opening the external browser.
    const autopilot = Boolean(payload && payload.autopilot);

    if (id === core.PROVIDER_GOOGLE_ALL) {
      const r = await google.connectGoogleAllPkce(_connectOpts(id, autopilot));
      if (!r.ok || !r.tokens) return { ok: false, reason: r.reason || "connect_failed" };
      const ud = core.userData();
      const gmailSave = core.saveGmailIntegrationSecrets(ud, r.tokens);
      if (!gmailSave.ok) return gmailSave;
      const driveSave = core.saveDriveIntegrationSecrets(ud, r.tokens);
      if (!driveSave.ok) return driveSave;
      const calSave = saveIntegrationSecrets(ud, core.PROVIDER_GOOGLE_CALENDAR, r.tokens);
      if (!calSave.ok) return calSave;
      const verifiedAll = await _verifyGoogleTokens(id, r.tokens);
      await relayTokensAfterConnectSave();
      return verifiedAll;
    }

    if (id === core.PROVIDER_GOOGLE_GMAIL) {
      const r = await google.connectGoogleGmailPkce(_connectOpts(id, autopilot));
      if (!r.ok || !r.tokens) return { ok: false, reason: r.reason || "connect_failed" };
      const gmailSave = core.saveGmailIntegrationSecrets(core.userData(), r.tokens);
      if (!gmailSave.ok) return gmailSave;
      const verifiedGmail = await _verifyGoogleTokens(id, r.tokens);
      await relayTokensAfterConnectSave();
      return verifiedGmail;
    }

    if (id === core.PROVIDER_GOOGLE_DRIVE) {
      const r = await google.connectGoogleDrivePkce(_connectOpts(id, autopilot));
      if (!r.ok || !r.tokens) return { ok: false, reason: r.reason || "connect_failed" };
      const driveSave = core.saveDriveIntegrationSecrets(core.userData(), r.tokens);
      if (!driveSave.ok) return driveSave;
      const verifiedDrive = await _verifyGoogleTokens(id, r.tokens);
      await relayTokensAfterConnectSave();
      return verifiedDrive;
    }

    if (id === core.PROVIDER_GOOGLE_CALENDAR) {
      const r = await google.connectGoogleCalendarPkce(_connectOpts(id, autopilot));
      if (!r.ok || !r.tokens) return { ok: false, reason: r.reason || "connect_failed" };
      const calSave = saveIntegrationSecrets(core.userData(), core.PROVIDER_GOOGLE_CALENDAR, r.tokens);
      if (!calSave.ok) return calSave;
      const verifiedCal = await _verifyGoogleTokens(id, r.tokens);
      await relayTokensAfterConnectSave();
      return verifiedCal;
    }

    if (id === core.PROVIDER_MICROSOFT || id === core.PROVIDER_ONEDRIVE || id === core.PROVIDER_OUTLOOK) {
      const r = await microsoft.connectMicrosoftPkce(_connectOpts(core.PROVIDER_MICROSOFT, autopilot));
      if (!r.ok || !r.tokens) return { ok: false, reason: r.reason || "connect_failed" };
      const msSave = saveIntegrationSecrets(core.userData(), core.PROVIDER_MICROSOFT, r.tokens);
      if (!msSave.ok) return msSave;
      return _verifyMicrosoftTokens(r.tokens);
    }

    if (id === core.PROVIDER_DROPBOX) {
      const r = await dropbox.connectDropboxPkce();
      if (!r.ok || !r.tokens) return { ok: false, reason: r.reason || "connect_failed" };
      const dbSave = core.saveDropboxSecrets(core.userData(), r.tokens);
      if (!dbSave.ok) return dbSave;
      return { ok: true };
    }

    if (id === core.PROVIDER_NOTION) {
      try {
        const tokens = await notion.connectNotionPkce({ autopilot });
        const saved = saveIntegrationSecrets(core.userData(), core.PROVIDER_NOTION, tokens);
        if (!saved.ok) return saved;
        return { ok: true };
      } catch (e) {
        return { ok: false, reason: e.message || "connect_failed" };
      }
    }

    if (id === core.PROVIDER_SLACK) {
      try {
        const tokens = await slack.connectSlackOAuth();
        const saved = saveIntegrationSecrets(core.userData(), core.PROVIDER_SLACK, tokens);
        if (!saved.ok) return saved;
        return { ok: true };
      } catch (e) {
        return { ok: false, reason: e.message || "connect_failed" };
      }
    }

    if (id === core.PROVIDER_INFOMANIAK_ALL) {
      try {
        const tokens = await infomaniak.connectInfomaniakAllPkce();
        const ud = core.userData();
        const mailSave = saveIntegrationSecrets(ud, core.PROVIDER_INFOMANIAK, tokens);
        if (!mailSave.ok) return mailSave;
        const calSave = saveIntegrationSecrets(ud, core.PROVIDER_INFOMANIAK_CALENDAR, tokens);
        if (!calSave.ok) return calSave;
        return { ok: true };
      } catch (e) {
        return { ok: false, reason: e.message || "connect_failed" };
      }
    }

    if (id === core.PROVIDER_INFOMANIAK) {
      try {
        const tokens = await infomaniak.connectInfomaniakPkce();
        const saved = saveIntegrationSecrets(core.userData(), core.PROVIDER_INFOMANIAK, tokens);
        if (!saved.ok) return saved;
        return { ok: true };
      } catch (e) {
        return { ok: false, reason: e.message || "connect_failed" };
      }
    }

    if (id === core.PROVIDER_INFOMANIAK_CALENDAR) {
      try {
        const tokens = await infomaniak.connectInfomaniakCalendarPkce();
        const saved = saveIntegrationSecrets(core.userData(), core.PROVIDER_INFOMANIAK_CALENDAR, tokens);
        if (!saved.ok) return saved;
        return { ok: true };
      } catch (e) {
        return { ok: false, reason: e.message || "connect_failed" };
      }
    }

    return { ok: false, reason: "unknown_provider" };
  });

  ipcMain.handle("integration:disconnect", async (event, payload) => {
    const denied = rejectUntrustedSender(event);
    if (denied) return denied;
    const id = payload && typeof payload.providerId === "string" ? payload.providerId : "";
    const ud = core.userData();

    if (id === core.PROVIDER_GOOGLE_GMAIL) {
      storage.clearProvider(ud, core.PROVIDER_GOOGLE_GMAIL);
      google.deleteGmailOAuthMirror();
      return { ok: true };
    }
    if (id === core.PROVIDER_GOOGLE_DRIVE) {
      storage.clearProvider(ud, core.PROVIDER_GOOGLE_DRIVE);
      return { ok: true };
    }
    if (id === core.PROVIDER_GOOGLE_CALENDAR) {
      storage.clearProvider(ud, core.PROVIDER_GOOGLE_CALENDAR);
      return { ok: true };
    }
    if (id === core.PROVIDER_MICROSOFT || id === core.PROVIDER_ONEDRIVE || id === core.PROVIDER_OUTLOOK) {
      storage.clearProvider(ud, core.PROVIDER_MICROSOFT);
      return { ok: true };
    }
    if (id === core.PROVIDER_DROPBOX) {
      storage.clearProvider(ud, core.PROVIDER_DROPBOX);
      return { ok: true };
    }
    if (id === core.PROVIDER_NOTION) {
      storage.clearProvider(ud, core.PROVIDER_NOTION);
      return { ok: true };
    }
    if (id === core.PROVIDER_SLACK) {
      storage.clearProvider(ud, core.PROVIDER_SLACK);
      return { ok: true };
    }
    if (id === core.PROVIDER_WHATSAPP) {
      const prefs = whatsappCloudSync.readPrefs(ud);
      whatsappCloudSync.stopPolling();
      storage.clearProvider(ud, core.PROVIDER_WHATSAPP);
      if (prefs.phoneNumberId) {
        void whatsappCloudSync.unregisterPhoneBinding(ud, prefs.phoneNumberId);
      }
      return { ok: true };
    }
    if (id === core.PROVIDER_S3) {
      storage.clearProvider(ud, core.PROVIDER_S3);
      return { ok: true };
    }
    if (id === core.PROVIDER_ICLOUD) {
      storage.clearProvider(ud, core.PROVIDER_ICLOUD);
      return { ok: true };
    }
    if (id === core.PROVIDER_INFOMANIAK) {
      storage.clearProvider(ud, core.PROVIDER_INFOMANIAK);
      clearInfomaniakEnvTokenFromDotenv(core.infomaniakEnvOpts());
      return { ok: true };
    }
    if (id === core.PROVIDER_INFOMANIAK_CALENDAR) {
      storage.clearProvider(ud, core.PROVIDER_INFOMANIAK_CALENDAR);
      clearInfomaniakEnvTokenFromDotenv(core.infomaniakEnvOpts());
      return { ok: true };
    }

    return { ok: false, reason: "unknown_provider" };
  });

  // ─── S3 credentials ──────────────────────────────────────────────────────────

  ipcMain.handle("integration:saveS3Credentials", async (event, payload) => {
    const denied = rejectUntrustedSender(event);
    if (denied) return denied;
    const { access_key, secret_key, region, bucket, prefix } = payload || {};
    if (!access_key?.trim() || !secret_key?.trim() || !region?.trim() || !bucket?.trim()) {
      return { ok: false, reason: "missing_required_fields" };
    }
    const ud = core.userData();
    const creds = {
      access_key: access_key.trim(),
      secret_key: secret_key.trim(),
      region: region.trim(),
      bucket: bucket.trim(),
      prefix: (prefix || "").trim(),
    };
    const saved = saveIntegrationSecrets(ud, core.PROVIDER_S3, creds);
    if (!saved.ok) return saved;
    return { ok: true };
  });

  ipcMain.handle("integration:loadS3Credentials", (event) => {
    const denied = rejectUntrustedSender(event);
    if (denied) return denied;
    const ud = core.userData();
    const creds = storage.loadProviderSecrets(ud, core.PROVIDER_S3);
    if (!creds) return { ok: true, credentials: null };
    return {
      ok: true,
      credentials: {
        access_key: creds.access_key || "",
        secret_key_masked: creds.secret_key ? "••••••••" + (creds.secret_key.slice(-4) || "") : "",
        region: creds.region || "",
        bucket: creds.bucket || "",
        prefix: creds.prefix || "",
      },
    };
  });

  // ─── WhatsApp Cloud API credentials ─────────────────────────────────────────

  ipcMain.handle("integration:saveWhatsAppCloudCredentials", async (event, payload) => {
    const denied = rejectUntrustedSender(event);
    if (denied) return denied;
    const phoneNumberId =
      typeof payload?.phone_number_id === "string" ? payload.phone_number_id.trim() : "";
    const accessToken =
      typeof payload?.access_token === "string" ? payload.access_token.trim() : "";
    const businessAccountId =
      typeof payload?.business_account_id === "string" ? payload.business_account_id.trim() : "";
    if (!phoneNumberId || !accessToken || !businessAccountId) {
      return { ok: false, reason: "missing_required_fields" };
    }
    const ud = core.userData();
    const creds = {
      phone_number_id: phoneNumberId,
      access_token: accessToken,
      business_account_id: businessAccountId,
    };
    const saved = saveIntegrationSecrets(ud, core.PROVIDER_WHATSAPP, creds);
    if (!saved.ok) return saved;
    return finalizeWhatsAppCloudSave(core, ud, creds);
  });

  ipcMain.handle("integration:getWhatsAppWebhookConfig", async (event) => {
    const denied = rejectUntrustedSender(event);
    if (denied) return denied;
    return whatsappCloudSync.fetchWebhookConfig(core.userData());
  });

  ipcMain.handle("integration:getWhatsAppConnectConfig", async (event) => {
    const denied = rejectUntrustedSender(event);
    if (denied) return denied;
    return whatsappCloudSync.fetchConnectConfig(core.userData());
  });

  ipcMain.handle("integration:launchWhatsAppEmbeddedSignup", async (event) => {
    const denied = rejectUntrustedSender(event);
    if (denied) return denied;
    const config = await whatsappCloudSync.fetchConnectConfig(core.userData());
    if (!config?.embedded_signup_available || !config.meta_app_id || !config.embedded_signup_config_id) {
      return { ok: false, reason: "embedded_signup_not_configured" };
    }
    return runWhatsAppEmbeddedSignup(
      config.meta_app_id,
      config.embedded_signup_config_id,
      config.embedded_signup_redirect_uri,
    );
  });

  ipcMain.handle("integration:exchangeWhatsAppEmbeddedSignup", async (event, payload) => {
    const denied = rejectUntrustedSender(event);
    if (denied) return denied;
    const ud = core.userData();
    const exchanged = await whatsappCloudSync.exchangeEmbeddedSignup(ud, {
      code: payload?.code,
      code_source: payload?.codeSource || payload?.code_source,
      oauth_redirect_uri: payload?.oauthRedirectUri || payload?.oauth_redirect_uri,
      phone_number_id: payload?.phoneNumberId || payload?.phone_number_id,
      business_account_id: payload?.businessAccountId || payload?.business_account_id,
      display_phone_number: payload?.displayPhoneNumber || payload?.display_phone_number,
    });
    if (!exchanged.ok || !exchanged.credentials) {
      console.warn(
        "[whatsappEmbeddedSignup] cloud exchange failed:",
        exchanged.reason || "exchange_failed",
        "code_source=",
        payload?.codeSource || payload?.code_source || "missing",
      );
      return { ok: false, reason: exchanged.reason || "exchange_failed" };
    }
    const creds = exchanged.credentials;
    const saved = saveIntegrationSecrets(ud, core.PROVIDER_WHATSAPP, {
      phone_number_id: creds.phone_number_id,
      access_token: creds.access_token,
      business_account_id: creds.business_account_id,
    });
    if (!saved.ok) return saved;
    return finalizeWhatsAppCloudSave(
      core,
      ud,
      {
        phone_number_id: creds.phone_number_id,
        access_token: creds.access_token,
        business_account_id: creds.business_account_id,
      },
      creds.display_phone_number || null,
      { skipGraphHealth: true },
    );
  });

  ipcMain.handle("integration:getWhatsAppBusinessStatus", async (event) => {
    const denied = rejectUntrustedSender(event);
    if (denied) return denied;
    const ud = core.userData();
    const creds = storage.loadProviderSecrets(ud, core.PROVIDER_WHATSAPP);
    if (!whatsapp.credentialsLookUsable(creds)) {
      return { ok: true, connected: false };
    }
    const health = await whatsapp.whatsAppCloudHealth(creds);
    const webhook = await whatsappCloudSync.fetchWebhookConfig(ud);
    const prefs = whatsappCloudSync.readPrefs(ud);
    let relayHealth = null;
    try {
      const res = await fetch(`http://127.0.0.1:${BACKEND_PORT}/integration/whatsapp-health`, {
        headers: { Accept: "application/json" },
      });
      if (res.ok) {
        relayHealth = await res.json();
      }
    } catch {
      relayHealth = null;
    }
    return {
      ok: true,
      connected: health.ok,
      displayPhoneNumber: health.displayPhoneNumber || null,
      phoneNumberId: creds.phone_number_id || "",
      businessAccountId: creds.business_account_id || "",
      webhookConfigured: Boolean(webhook?.configured),
      webhookUrl: typeof webhook?.webhook_url === "string" ? webhook.webhook_url : null,
      cloudPollingEnabled: Boolean(prefs?.enabled),
      inboundCount: typeof relayHealth?.inbound_count === "number" ? relayHealth.inbound_count : 0,
      lastInboundMs:
        typeof relayHealth?.last_inbound_ms === "number" ? relayHealth.last_inbound_ms : null,
      reason: health.ok ? undefined : health.reason,
    };
  });

  ipcMain.handle("integration:sendWhatsAppTestMessage", async (event, payload) => {
    const denied = rejectUntrustedSender(event);
    if (denied) return denied;
    const ud = core.userData();
    const creds = storage.loadProviderSecrets(ud, core.PROVIDER_WHATSAPP);
    const to = typeof payload?.to === "string" ? payload.to.trim() : "";
    const text = typeof payload?.text === "string" ? payload.text.trim() : "";
    return whatsapp.sendWhatsAppCloudText(creds, to, text);
  });

  ipcMain.handle("integration:listWhatsAppMessageTemplates", async (event, payload) => {
    const denied = rejectUntrustedSender(event);
    if (denied) return denied;
    const ud = core.userData();
    const creds = storage.loadProviderSecrets(ud, core.PROVIDER_WHATSAPP);
    const limit = typeof payload?.limit === "number" ? payload.limit : 50;
    const wabaId =
      typeof payload?.business_account_id === "string"
        ? payload.business_account_id.trim()
        : creds.business_account_id || "";
    return whatsapp.listWhatsAppMessageTemplates(creds, wabaId, limit);
  });

  // ─── iCloud folder pick / get ─────────────────────────────────────────────────

  ipcMain.handle("integration:pickICloudFolder", async (event) => {
    const denied = rejectUntrustedSender(event);
    if (denied) return denied;
    const folder = await icloud.pickICloudFolder(null);
    if (!folder) return { ok: false, reason: "cancelled" };
    const ud = core.userData();
    const saved = saveIntegrationSecrets(ud, core.PROVIDER_ICLOUD, { folder });
    if (!saved.ok) return saved;
    return { ok: true, folder };
  });

  ipcMain.handle("integration:getICloudFolder", (event) => {
    const denied = rejectUntrustedSender(event);
    if (denied) return denied;
    const ud = core.userData();
    const settings = storage.loadProviderSecrets(ud, core.PROVIDER_ICLOUD);
    return { ok: true, folder: settings?.folder || null };
  });

  // ─── Notion OAuth client credentials (pasted in-app via setup guide) ─────────

  ipcMain.handle("integration:saveNotionOAuthClient", async (event, payload) => {
    const denied = rejectUntrustedSender(event);
    if (denied) return denied;
    return notionClientStore.saveNotionOAuthClient({
      clientId: payload?.clientId,
      clientSecret: payload?.clientSecret,
    });
  });

  ipcMain.handle("integration:loadNotionOAuthClient", (event) => {
    const denied = rejectUntrustedSender(event);
    if (denied) return denied;
    const creds = notionClientStore.loadNotionOAuthClient();
    if (!creds) return { ok: true, configured: false, clientIdMasked: "" };
    const id = creds.clientId;
    const clientIdMasked = id.length > 8 ? `${id.slice(0, 4)}…${id.slice(-4)}` : "••••";
    return { ok: true, configured: true, clientIdMasked };
  });

  ipcMain.handle("integration:clearNotionOAuthClient", (event) => {
    const denied = rejectUntrustedSender(event);
    if (denied) return denied;
    return notionClientStore.clearNotionOAuthClient();
  });

  // ─── Slack OAuth client credentials (pasted in-app via setup guide) ──────────

  ipcMain.handle("integration:saveSlackOAuthClient", async (event, payload) => {
    const denied = rejectUntrustedSender(event);
    if (denied) return denied;
    return slackClientStore.saveSlackOAuthClient({
      clientId: payload?.clientId,
      clientSecret: payload?.clientSecret,
    });
  });

  ipcMain.handle("integration:loadSlackOAuthClient", (event) => {
    const denied = rejectUntrustedSender(event);
    if (denied) return denied;
    const creds = slackClientStore.loadSlackOAuthClient();
    if (!creds) return { ok: true, configured: false, clientIdMasked: "" };
    const id = creds.clientId;
    const clientIdMasked = id.length > 8 ? `${id.slice(0, 4)}…${id.slice(-4)}` : "••••";
    return { ok: true, configured: true, clientIdMasked };
  });

  ipcMain.handle("integration:clearSlackOAuthClient", (event) => {
    const denied = rejectUntrustedSender(event);
    if (denied) return denied;
    return slackClientStore.clearSlackOAuthClient();
  });

  // ─── Infomaniak personal API token ───────────────────────────────────────────

  ipcMain.handle("integration:saveInfomaniakApiToken", async (event, token) => {
    const denied = rejectUntrustedSender(event);
    if (denied) return denied;
    return infomaniakTokenStore.saveInfomaniakApiToken(token);
  });

  ipcMain.handle("integration:loadInfomaniakApiToken", (event) => {
    const denied = rejectUntrustedSender(event);
    if (denied) return denied;
    const token = infomaniakTokenStore.loadInfomaniakApiToken();
    return { ok: true, hasToken: !!token };
  });

  ipcMain.handle("integration:clearInfomaniakApiToken", (event) => {
    const denied = rejectUntrustedSender(event);
    if (denied) return denied;
    return infomaniakTokenStore.clearInfomaniakApiToken();
  });
};

module.exports = registerIntegrationOAuthHandlers;
