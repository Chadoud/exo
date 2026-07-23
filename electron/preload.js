const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  openFiles: () => ipcRenderer.invoke("dialog:openFiles"),
  openFilesOrFolders: () => ipcRenderer.invoke("dialog:openFilesOrFolders"),
  openDirectory: (options) => ipcRenderer.invoke("dialog:openDirectory", options ?? {}),
  readComposerAttachment: (filePath) => ipcRenderer.invoke("dialog:readComposerAttachment", filePath),
  getDefaultOutputDir: () => ipcRenderer.invoke("app:getDefaultOutputDir"),
  // Deprecated M2.3: always empty; use backendHttp / voiceMintWsAuthTicket.
  getBackendToken: () => ipcRenderer.invoke("app:getBackendToken"),
  backendHttp: (payload) => ipcRenderer.invoke("backend:http", payload),
  voiceMintWsAuthTicket: () => ipcRenderer.invoke("voice:mintWsAuthTicket"),
  getRendererDiagnosticsLogPath: () => ipcRenderer.invoke("app:getRendererDiagnosticsLogPath"),
  appendRendererDiagnostic: (payload) => ipcRenderer.invoke("app:appendRendererDiagnostic", payload),
  getSystemSpecs: () => ipcRenderer.invoke("app:getSystemSpecs"),
  getInstallLocation: () => ipcRenderer.invoke("app:getInstallLocation"),
  openApplicationsFolder: () => ipcRenderer.invoke("app:openApplicationsFolder"),
  getOCRCapabilities: () => ipcRenderer.invoke("app:getOCRCapabilities"),
  restartBackend: () => ipcRenderer.invoke("app:restartBackend"),
  getBackendStatus: () => ipcRenderer.invoke("backend:getStatus"),
  getBackendEnvOverrides: () => ipcRenderer.invoke("backendEnv:getOverrides"),
  setBackendEnvOverrides: (overrides) =>
    ipcRenderer.invoke("backendEnv:setOverrides", overrides),
  getSecret: (key) => ipcRenderer.invoke("secrets:get", key),
  hasSecret: (key) => ipcRenderer.invoke("secrets:has", key),
  setSecret: (key, value) => ipcRenderer.invoke("secrets:set", key, value),
  clearSecret: (key) => ipcRenderer.invoke("secrets:clear", key),
  openPath: (path) => ipcRenderer.invoke("shell:openPath", path),
  openExternal: (url) => ipcRenderer.invoke("shell:openExternal", url),
  openGmailOAuthWindow: (url) => ipcRenderer.invoke("shell:openGmailOAuthWindow", url),
  showInFolder: (path) => ipcRenderer.invoke("shell:showInFolder", path),
  getPreviewImageDataUrl: (filePath) =>
    ipcRenderer.invoke("preview:imageDataUrl", filePath),
  minimizeWindow: () => ipcRenderer.invoke("window:minimize"),
  maximizeWindow: () => ipcRenderer.invoke("window:maximize"),
  closeWindow: () => ipcRenderer.invoke("window:close"),
  restoreAndFocusWindow: () => ipcRenderer.invoke("window:restoreAndFocus"),
  getClapSettings: () => ipcRenderer.invoke("clap:getSettings"),
  setClapEnabled: (enabled) => ipcRenderer.invoke("clap:setEnabled", enabled),
  setBackgroundThrottling: (enabled) =>
    ipcRenderer.invoke("window:setBackgroundThrottling", enabled),
  setPushToTalkConfig: (config) => ipcRenderer.invoke("ptt:setConfig", config),
  onPushToTalkKeyDown: (handler) => {
    const channel = "ptt:keydown";
    const listener = () => {
      try {
        handler();
      } catch (e) {
        console.error("[preload] ptt:keydown", e);
      }
    };
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
  onPushToTalkKeyUp: (handler) => {
    const channel = "ptt:keyup";
    const listener = () => {
      try {
        handler();
      } catch (e) {
        console.error("[preload] ptt:keyup", e);
      }
    };
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
  toggleFullscreen: () => ipcRenderer.invoke("window:toggleFullscreen"),
  isFullscreen: () => ipcRenderer.invoke("window:isFullscreen"),
  getEntitlementState: () => ipcRenderer.invoke("entitlement:getState"),
  syncSortCredentials: (opts) => ipcRenderer.invoke("entitlement:syncSortCredentials", opts),
  activateLicense: (licenseKey) =>
    ipcRenderer.invoke("entitlement:activateLicense", licenseKey),
  clearLicense: () => ipcRenderer.invoke("entitlement:clearLicense"),
  cloudAuthRegister: (email, password, firstName, lastName) =>
    ipcRenderer.invoke("cloudAuth:register", email, password, firstName, lastName),
  cloudAuthLogin: (email, password) => ipcRenderer.invoke("cloudAuth:login", email, password),
  cloudAuthLogout: () => ipcRenderer.invoke("cloudAuth:logout"),
  cloudAuthSocial: (provider) => ipcRenderer.invoke("cloudAuth:social", provider),
  cloudAuthCancelSocial: () => ipcRenderer.invoke("cloudAuth:cancelSocial"),
  cloudAuthGetProviders: () => ipcRenderer.invoke("cloudAuth:getProviders"),
  cloudAuthExportData: () => ipcRenderer.invoke("cloudAuth:exportData"),
  cloudAuthDeleteAccount: () => ipcRenderer.invoke("cloudAuth:deleteAccount"),
  privacyWipeElectronFiles: () => ipcRenderer.invoke("privacy:wipeElectronFiles"),
  privacyWipeAllLocalData: () => ipcRenderer.invoke("privacy:wipeAllLocalData"),
  privacyWipeAllProfilesOnDevice: () => ipcRenderer.invoke("privacy:wipeAllProfilesOnDevice"),
  accountProfileGetState: () => ipcRenderer.invoke("accountProfile:getState"),
  voicePrimeSession: (payload) => ipcRenderer.invoke("voice:primeSession", payload),
  integrationRelayAllTokens: () => ipcRenderer.invoke("integration:relayAllTokens"),
  syncGetStatus: () => ipcRenderer.invoke("sync:getStatus"),
  syncSetEnabled: (enabled) => ipcRenderer.invoke("sync:setEnabled", enabled),
  syncRunNow: () => ipcRenderer.invoke("sync:runNow"),
  syncGetPairingQr: () => ipcRenderer.invoke("sync:getPairingQr"),
  /** Main copies pairing JSON to clipboard — renderer never sees master_key_b64. */
  syncCopyPairingPayload: () => ipcRenderer.invoke("sync:copyPairingPayload"),
  getRememberDevice: () => ipcRenderer.invoke("cloudSessionPrefs:getRememberDevice"),
  setRememberDevice: (value) => ipcRenderer.invoke("cloudSessionPrefs:setRememberDevice", value),
  telemetrySendBatch: (url, bodyStr) =>
    ipcRenderer.invoke("telemetry:sendBatch", url, bodyStr),
  telemetryFlushOffline: () => ipcRenderer.invoke("telemetry:flushOffline"),
  telemetrySubmitFeedback: (bodyStr) => ipcRenderer.invoke("telemetry:submitFeedback", bodyStr),
  systemCommandAudit: (entry) => ipcRenderer.invoke("systemCommand:audit", entry),
  systemCommandExecute: (payload) => ipcRenderer.invoke("systemCommand:execute", payload),
  integrationListProviders: () => ipcRenderer.invoke("integration:listProviders"),
  integrationGetAccounts: () => ipcRenderer.invoke("integration:getAccounts"),
  // M2.3: raw tokens stay in main — use integrationRelayAllTokens / voicePrimeSession.
  integrationConnect: (payload) => ipcRenderer.invoke("integration:connect", payload),
  integrationDisconnect: (payload) => ipcRenderer.invoke("integration:disconnect", payload),
  integrationListGoogleDriveFiles: (payload) =>
    ipcRenderer.invoke("integration:listGoogleDriveFiles", payload ?? {}),
  integrationImportGoogleDriveFiles: (payload) =>
    ipcRenderer.invoke("integration:importGoogleDriveFiles", payload ?? {}),
  integrationListDropboxFiles: (payload) =>
    ipcRenderer.invoke("integration:listDropboxFiles", payload ?? {}),
  integrationImportDropboxFiles: (payload) =>
    ipcRenderer.invoke("integration:importDropboxFiles", payload ?? {}),
  integrationListOneDriveFiles: (payload) =>
    ipcRenderer.invoke("integration:listOneDriveFiles", payload ?? {}),
  integrationImportOneDriveFiles: (payload) =>
    ipcRenderer.invoke("integration:importOneDriveFiles", payload ?? {}),
  integrationListOutlookMessages: (payload) =>
    ipcRenderer.invoke("integration:listOutlookMessages", payload ?? {}),
  integrationImportOutlookMessages: (payload) =>
    ipcRenderer.invoke("integration:importOutlookMessages", payload ?? {}),
  integrationSaveS3Credentials: (payload) =>
    ipcRenderer.invoke("integration:saveS3Credentials", payload ?? {}),
  integrationLoadS3Credentials: () =>
    ipcRenderer.invoke("integration:loadS3Credentials"),
  integrationSaveWhatsAppCloudCredentials: (payload) =>
    ipcRenderer.invoke("integration:saveWhatsAppCloudCredentials", payload ?? {}),
  integrationGetWhatsAppWebhookConfig: () =>
    ipcRenderer.invoke("integration:getWhatsAppWebhookConfig"),
  integrationGetWhatsAppConnectConfig: () =>
    ipcRenderer.invoke("integration:getWhatsAppConnectConfig"),
  integrationLaunchWhatsAppEmbeddedSignup: () =>
    ipcRenderer.invoke("integration:launchWhatsAppEmbeddedSignup"),
  integrationExchangeWhatsAppEmbeddedSignup: (payload) =>
    ipcRenderer.invoke("integration:exchangeWhatsAppEmbeddedSignup", payload ?? {}),
  integrationGetWhatsAppBusinessStatus: () =>
    ipcRenderer.invoke("integration:getWhatsAppBusinessStatus"),
  integrationSendWhatsAppTestMessage: (payload) =>
    ipcRenderer.invoke("integration:sendWhatsAppTestMessage", payload ?? {}),
  integrationListWhatsAppMessageTemplates: (payload) =>
    ipcRenderer.invoke("integration:listWhatsAppMessageTemplates", payload ?? {}),
  integrationListS3Objects: (payload) =>
    ipcRenderer.invoke("integration:listS3Objects", payload ?? {}),
  integrationImportS3Objects: (payload) =>
    ipcRenderer.invoke("integration:importS3Objects", payload ?? {}),
  integrationListSlackFiles: (payload) =>
    ipcRenderer.invoke("integration:listSlackFiles", payload ?? {}),
  integrationImportSlackFiles: (payload) =>
    ipcRenderer.invoke("integration:importSlackFiles", payload ?? {}),
  integrationPickICloudFolder: () =>
    ipcRenderer.invoke("integration:pickICloudFolder"),
  integrationGetICloudFolder: () =>
    ipcRenderer.invoke("integration:getICloudFolder"),
  integrationListICloudFiles: (payload) =>
    ipcRenderer.invoke("integration:listICloudFiles", payload ?? {}),
  integrationImportICloudFiles: (payload) =>
    ipcRenderer.invoke("integration:importICloudFiles", payload ?? {}),
  integrationListInfomaniakFiles: (payload) =>
    ipcRenderer.invoke("integration:listInfomaniakFiles", payload ?? {}),
  integrationImportInfomaniakFiles: (payload) =>
    ipcRenderer.invoke("integration:importInfomaniakFiles", payload ?? {}),
  integrationListInfomaniakMailMessages: (payload) =>
    ipcRenderer.invoke("integration:listInfomaniakMailMessages", payload ?? {}),
  integrationImportInfomaniakMailMessages: (payload) =>
    ipcRenderer.invoke("integration:importInfomaniakMailMessages", payload ?? {}),
  integrationSaveInfomaniakApiToken: (token) =>
    ipcRenderer.invoke("integration:saveInfomaniakApiToken", token),
  integrationLoadInfomaniakApiToken: () =>
    ipcRenderer.invoke("integration:loadInfomaniakApiToken"),
  integrationClearInfomaniakApiToken: () =>
    ipcRenderer.invoke("integration:clearInfomaniakApiToken"),
  integrationSaveNotionOAuthClient: (payload) =>
    ipcRenderer.invoke("integration:saveNotionOAuthClient", payload ?? {}),
  integrationLoadNotionOAuthClient: () =>
    ipcRenderer.invoke("integration:loadNotionOAuthClient"),
  integrationClearNotionOAuthClient: () =>
    ipcRenderer.invoke("integration:clearNotionOAuthClient"),
  integrationSaveSlackOAuthClient: (payload) =>
    ipcRenderer.invoke("integration:saveSlackOAuthClient", payload ?? {}),
  integrationLoadSlackOAuthClient: () =>
    ipcRenderer.invoke("integration:loadSlackOAuthClient"),
  integrationClearSlackOAuthClient: () =>
    ipcRenderer.invoke("integration:clearSlackOAuthClient"),
  integrationHealthCheck: (payload) =>
    ipcRenderer.invoke("integration:healthCheck", payload ?? {}),
  grantScreenCaptureConsent: () => ipcRenderer.invoke("capture:grantConsent"),
  captureScreen: () => ipcRenderer.invoke("capture:screen"),
  onSystemCommandDelegate: (handler) => {
    const channel = "systemCommand:delegate";
    const listener = (_event, cmd) => {
      try {
        handler(cmd);
      } catch (e) {
        console.error("[preload] systemCommand:delegate", e);
      }
    };
    ipcRenderer.on(channel, listener);
    return () => {
      ipcRenderer.removeListener(channel, listener);
    };
  },
  onClapHiddenToTray: (handler) => {
    const channel = "app:clapHiddenToTray";
    const listener = () => {
      try {
        handler();
      } catch (e) {
        console.error("[preload] app:clapHiddenToTray", e);
      }
    };
    ipcRenderer.on(channel, listener);
    return () => {
      ipcRenderer.removeListener(channel, listener);
    };
  },
  onMainProcessError: (handler) => {
    const channel = "main-process-error";
    const listener = (_event, payload) => {
      try {
        handler(payload);
      } catch (e) {
        console.error("[preload] main-process-error", e);
      }
    };
    ipcRenderer.on(channel, listener);
    return () => {
      ipcRenderer.removeListener(channel, listener);
    };
  },
  onBackendStartupFailed: (handler) => {
    const channel = "exo:backend-startup-failed";
    const listener = () => {
      try {
        handler();
      } catch (e) {
        console.error("[preload] exo:backend-startup-failed", e);
      }
    };
    ipcRenderer.on(channel, listener);
    return () => {
      ipcRenderer.removeListener(channel, listener);
    };
  },
  updateGetState: () => ipcRenderer.invoke("update:getState"),
  updateCheck: () => ipcRenderer.invoke("update:check"),
  updateStart: () => ipcRenderer.invoke("update:start"),
  updateInstall: () => ipcRenderer.invoke("update:install"),
  onUpdateEvent: (handler) => {
    const channels = [
      "update:available",
      "update:progress",
      "update:downloaded",
      "update:installing",
      "update:error",
    ];
    const registered = channels.map((channel) => {
      const fn = (_event, detail) => {
        try {
          handler({ type: channel.slice("update:".length), ...detail });
        } catch (e) {
          console.error("[preload] onUpdateEvent", e);
        }
      };
      ipcRenderer.on(channel, fn);
      return { channel, fn };
    });
    return () => {
      for (const { channel, fn } of registered) ipcRenderer.removeListener(channel, fn);
    };
  },
  onCloudSessionChanged: (handler) => {
    const channel = "cloud-session:changed";
    const listener = (_event, payload) => {
      try {
        handler(payload);
      } catch (e) {
        console.error("[preload] onCloudSessionChanged", e);
      }
    };
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
  onAccountProfileChanged: (handler) => {
    const channel = "account-profile:changed";
    const listener = (_event, payload) => {
      try {
        handler(payload);
      } catch (e) {
        console.error("[preload] onAccountProfileChanged", e);
      }
    };
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
  codegenRunInstall: (payload) => ipcRenderer.invoke("codegen:runInstall", payload),
  codegenDevServerStart: (payload) => ipcRenderer.invoke("codegen:devServerStart", payload),
  codegenDevServerStop: (payload) => ipcRenderer.invoke("codegen:devServerStop", payload),
  codegenDevServerStatus: (payload) => ipcRenderer.invoke("codegen:devServerStatus", payload),
  codegenOpenProjectFolder: (payload) => ipcRenderer.invoke("codegen:openProjectFolder", payload),
  codegenPreviewSetBounds: (payload) => ipcRenderer.invoke("codegen:previewSetBounds", payload),
  codegenPreviewHide: (payload) => ipcRenderer.invoke("codegen:previewHide", payload),
  codegenPreviewReload: (payload) => ipcRenderer.invoke("codegen:previewReload", payload),
  codegenPreviewProbe: (payload) => ipcRenderer.invoke("codegen:previewProbe", payload),
  onOAuthAutopilotProgress: (handler) => {
    const channels = ["oauth:autopilot:progress", "oauth:autopilot:needsUser"];
    const registered = channels.map((channel) => {
      const fn = (_event, detail) => {
        try {
          handler({ ...detail, needsUser: channel === "oauth:autopilot:needsUser" });
        } catch (e) {
          console.error("[preload] oauth:autopilot", e);
        }
      };
      ipcRenderer.on(channel, fn);
      return { channel, fn };
    });
    return () => {
      for (const { channel, fn } of registered) ipcRenderer.removeListener(channel, fn);
    };
  },
});
