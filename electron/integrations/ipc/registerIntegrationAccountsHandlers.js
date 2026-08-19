/**
 * IPC handlers: listProviders, getAccounts, healthCheck.
 *
 * These handlers deal with reading provider connection state. Access tokens are
 * relayed from main via integration:relayAllTokens (never returned to renderer).
 *
 * @param {Electron.IpcMain} ipcMain
 * @param {import('./integrationCore')} core
 */

const storage = require("../storage");
const google = require("../google");
const microsoft = require("../microsoft");
const dropbox = require("../dropbox");
const notion = require("../notion");
const slack = require("../slack");
const whatsapp = require("../whatsapp");
const s3 = require("../s3");
const icloud = require("../icloud");
const infomaniak = require("../infomaniak");
const infomaniakTokenStore = require("../infomaniakTokenStore");
const { isTrustedSender } = require("../../ipc/senderGuard");

/** @param {import("electron").IpcMainInvokeEvent} event */
function rejectUntrustedSender(event) {
  if (!isTrustedSender(event)) {
    return { ok: false, reason: "untrusted_sender" };
  }
  return null;
}

/** Pass through a health probe; include email only when the provider returned one. */
function healthWithEmail(h) {
  if (!h || !h.ok) return { ok: false, reason: (h && h.reason) || "health_failed" };
  const email = typeof h.email === "string" ? h.email.trim() : "";
  return email ? { ok: true, email } : { ok: true };
}

module.exports = function registerIntegrationAccountsHandlers(ipcMain, core) {
  const { syncGoogleOauthClientIdForElectronMain } = require("../../backendProcess");

  ipcMain.handle("integration:listProviders", (event) => {
    const denied = rejectUntrustedSender(event);
    if (denied) return denied;
    syncGoogleOauthClientIdForElectronMain();
    return { ok: true, providers: core.buildProvidersList() };
  });

  ipcMain.handle("integration:getAccounts", (event) => {
    const denied = rejectUntrustedSender(event);
    if (denied) return denied;
    const ud = core.userData();
    core.migrateLegacyGoogleProvider(ud);
    core.tryHydrateGoogleGmailFromMirror(ud);
    const gmailSecrets = storage.loadProviderSecrets(ud, core.PROVIDER_GOOGLE_GMAIL);
    const driveSecrets = storage.loadProviderSecrets(ud, core.PROVIDER_GOOGLE_DRIVE);
    const googleCalendarSecrets = storage.loadProviderSecrets(ud, core.PROVIDER_GOOGLE_CALENDAR);
    const microsoftSecrets = storage.loadProviderSecrets(ud, core.PROVIDER_MICROSOFT);
    const dropboxSecrets = storage.loadProviderSecrets(ud, core.PROVIDER_DROPBOX);
    const notionSecrets = storage.loadProviderSecrets(ud, core.PROVIDER_NOTION);
    const slackSecrets = storage.loadProviderSecrets(ud, core.PROVIDER_SLACK);
    const whatsappSecrets = storage.loadProviderSecrets(ud, core.PROVIDER_WHATSAPP);
    const s3Creds = storage.loadProviderSecrets(ud, core.PROVIDER_S3);
    const icloudSettings = storage.loadProviderSecrets(ud, core.PROVIDER_ICLOUD);
    const infomaniakSecrets = storage.loadProviderSecrets(ud, core.PROVIDER_INFOMANIAK);
    const infomaniakCalendarSecrets = storage.loadProviderSecrets(ud, core.PROVIDER_INFOMANIAK_CALENDAR);
    return {
      ok: true,
      accounts: [
        { providerId: core.PROVIDER_GOOGLE_GMAIL, connected: core.googleSessionLooksUsable(gmailSecrets) },
        { providerId: core.PROVIDER_GOOGLE_DRIVE, connected: core.googleSessionLooksUsable(driveSecrets) },
        { providerId: core.PROVIDER_GOOGLE_CALENDAR, connected: core.googleSessionLooksUsable(googleCalendarSecrets) },
        { providerId: core.PROVIDER_MICROSOFT, connected: core.microsoftSessionLooksUsable(microsoftSecrets) },
        { providerId: core.PROVIDER_ONEDRIVE, connected: core.microsoftSessionLooksUsable(microsoftSecrets) },
        { providerId: core.PROVIDER_OUTLOOK, connected: core.microsoftSessionLooksUsable(microsoftSecrets) },
        { providerId: core.PROVIDER_DROPBOX, connected: core.dropboxSessionLooksUsable(dropboxSecrets) },
        { providerId: core.PROVIDER_NOTION, connected: notion.notionSessionLooksUsable(notionSecrets) },
        { providerId: core.PROVIDER_SLACK, connected: slack.slackSessionLooksUsable(slackSecrets) },
        {
          providerId: core.PROVIDER_WHATSAPP,
          connected: whatsapp.credentialsLookUsable(whatsappSecrets),
        },
        { providerId: core.PROVIDER_S3, connected: s3.credentialsLookUsable(s3Creds) },
        { providerId: core.PROVIDER_ICLOUD, connected: icloud.icloudSettingsLooksUsable(icloudSettings) },
        {
          providerId: core.PROVIDER_INFOMANIAK,
          connected:
            infomaniakTokenStore.isValidInfomaniakApiToken(infomaniakTokenStore.loadInfomaniakApiToken()) ||
            infomaniak.infomaniakSessionLooksUsable(infomaniakSecrets),
          authViaEnvToken: infomaniak.hasEnvInfomaniakToken(),
          authViaPersonalToken: infomaniakTokenStore.isValidInfomaniakApiToken(
            infomaniakTokenStore.loadInfomaniakApiToken()
          ),
        },
        {
          providerId: core.PROVIDER_INFOMANIAK_CALENDAR,
          connected:
            infomaniakTokenStore.isValidInfomaniakApiToken(infomaniakTokenStore.loadInfomaniakApiToken()) ||
            infomaniak.infomaniakCalendarSessionLooksUsable(infomaniakCalendarSecrets),
          authViaEnvToken: infomaniak.hasEnvInfomaniakToken(),
          authViaPersonalToken: infomaniakTokenStore.isValidInfomaniakApiToken(
            infomaniakTokenStore.loadInfomaniakApiToken()
          ),
        },
      ],
    };
  });

  ipcMain.handle("integration:healthCheck", async (event, payload) => {
    const denied = rejectUntrustedSender(event);
    if (denied) return denied;
    const id = payload && typeof payload.providerId === "string" ? payload.providerId : "";
    const ud = core.userData();

    if (id === core.PROVIDER_GOOGLE_GMAIL) {
      if (!google.getClientId()) return { ok: false, reason: "oauth_not_configured" };
      core.migrateLegacyGoogleProvider(ud);
      core.tryHydrateGoogleGmailFromMirror(ud);
      const sess = await core.ensureGoogleSession(ud, core.PROVIDER_GOOGLE_GMAIL);
      if (!sess.ok) return sess;
      return healthWithEmail(await google.gmailProfileHealth(sess.token));
    }

    if (id === core.PROVIDER_GOOGLE_DRIVE) {
      if (!google.getClientId()) return { ok: false, reason: "oauth_not_configured" };
      core.migrateLegacyGoogleProvider(ud);
      const sess = await core.ensureGoogleSession(ud, core.PROVIDER_GOOGLE_DRIVE);
      if (!sess.ok) return sess;
      return healthWithEmail(await google.driveAboutHealth(sess.token));
    }

    if (id === core.PROVIDER_GOOGLE_CALENDAR) {
      if (!google.getClientId()) return { ok: false, reason: "oauth_not_configured" };
      core.migrateLegacyGoogleProvider(ud);
      const sess = await core.ensureGoogleSession(ud, core.PROVIDER_GOOGLE_CALENDAR);
      if (!sess.ok) return sess;
      return healthWithEmail(await google.googleCalendarHealth(sess.token));
    }

    if (id === core.PROVIDER_MICROSOFT || id === core.PROVIDER_ONEDRIVE || id === core.PROVIDER_OUTLOOK) {
      if (!microsoft.getClientId()) return { ok: false, reason: "oauth_not_configured" };
      const sess = await core.ensureMicrosoftSession(ud);
      if (!sess.ok) return sess;
      return healthWithEmail(await microsoft.graphMeHealth(sess.token));
    }

    if (id === core.PROVIDER_DROPBOX) {
      if (!dropbox.getAppKey()) return { ok: false, reason: "oauth_not_configured" };
      const sess = await core.ensureDropboxSession(ud);
      if (!sess.ok) return sess;
      return healthWithEmail(await dropbox.dropboxAccountHealth(sess.token));
    }

    if (id === core.PROVIDER_NOTION) {
      if (!notion.getClientId() || !notion.getClientSecret()) {
        return { ok: false, reason: "oauth_not_configured" };
      }
      const sess = await core.ensureNotionSession(ud);
      if (!sess.ok) return sess;
      const h = await notion.notionUserHealth(sess.token);
      return h.ok ? { ok: true } : { ok: false, reason: h.reason || "health_failed" };
    }

    if (id === core.PROVIDER_SLACK) {
      if (!slack.getClientId()) return { ok: false, reason: "oauth_not_configured" };
      const sess = await core.ensureSlackSession(ud);
      if (!sess.ok) return sess;
      const h = await slack.slackWorkspaceHealth(sess.token);
      return h.ok ? { ok: true } : { ok: false, reason: h.reason || "health_failed" };
    }

    if (id === core.PROVIDER_WHATSAPP) {
      const creds = storage.loadProviderSecrets(ud, core.PROVIDER_WHATSAPP);
      const h = await whatsapp.whatsAppCloudHealth(creds);
      return h.ok ? { ok: true } : { ok: false, reason: h.reason || "health_failed" };
    }

    if (id === core.PROVIDER_S3) {
      const s3Creds = storage.loadProviderSecrets(ud, core.PROVIDER_S3);
      const h = await s3.s3CredentialsHealth(s3Creds);
      return h.ok ? { ok: true } : { ok: false, reason: h.reason || "health_failed" };
    }

    if (id === core.PROVIDER_ICLOUD) {
      const icloudSettings = storage.loadProviderSecrets(ud, core.PROVIDER_ICLOUD);
      const h = await icloud.icloudFolderHealth(icloudSettings);
      return h.ok ? { ok: true } : { ok: false, reason: h.reason || "health_failed" };
    }

    if (id === core.PROVIDER_INFOMANIAK) {
      if (!infomaniak.infomaniakAuthConfigured()) return { ok: false, reason: "oauth_not_configured" };
      const sess = await core.ensureInfomaniakSession(ud);
      if (!sess.ok) return sess;
      const h = await infomaniak.infomaniakDriveHealth(sess.token);
      return healthWithEmail(h);
    }

    if (id === core.PROVIDER_INFOMANIAK_CALENDAR) {
      if (!infomaniak.infomaniakAuthConfigured()) return { ok: false, reason: "oauth_not_configured" };
      const sess = await core.ensureInfomaniakCalendarSession(ud);
      if (!sess.ok) return sess;
      const h = await infomaniak.infomaniakCalendarHealth(sess.token);
      return healthWithEmail(h);
    }

    return { ok: false, reason: "unknown_provider" };
  });
};
