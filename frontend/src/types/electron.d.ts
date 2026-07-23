/** Shared Electron IPC bridge types — declared once, used everywhere. */

import type { EntitlementStatus } from "../api";

export interface OCRCapabilities {
  status: "ready" | "partial" | "missing";
  tesseractInstalled: boolean;
  tesseractVersion: string;
  languages: string[];
  hasEnglish: boolean;
  hasFrench: boolean;
  visionFallbackAvailable: boolean;
  visionModelName: string | null;
}

export interface SystemSpecs {
  platform: string;
  arch: string;
  totalMemBytes: number;
  totalMemGb: number;
}

/** macOS install location (mounted .dmg vs /Applications). */
export interface InstallLocationState {
  runningFromMountedVolume: boolean;
  installedInApplications: boolean;
  showInstallHint: boolean;
}

/** Snapshot of the in-app update flow (mirrors electron/autoUpdater.js lastState). */
export interface UpdateState {
  status: "idle" | "checking" | "up-to-date" | "available" | "downloading" | "downloaded" | "installing" | "error";
  version: string | null;
  notes: string | null;
  /** macOS packaged builds can self-update; Windows redirects to the download page. */
  canSelfUpdate: boolean;
  downloadUrl: string | null;
  progress: number | null;
  error: string | null;
}

/** Update events pushed from main; `type` is the channel suffix after `update:`. */
export type UpdateEvent =
  | { type: "available"; version: string; notes: string | null; canSelfUpdate: boolean; downloadUrl: string }
  | { type: "progress"; percent: number; transferred: number; total: number; bytesPerSecond: number }
  | { type: "downloaded"; version: string }
  | { type: "installing"; version: string | null }
  | { type: "error"; message: string };

export interface ElectronAPI {
  openFiles: () => Promise<string[]>;
  openFilesOrFolders: () => Promise<string[]>;
  /** Read a single file/folder/image for the assistant composer (dialog-granted paths only). */
  readComposerAttachment: (filePath: string) => Promise<
    | { ok: true; kind: "file"; basename: string; text: string }
    | { ok: true; kind: "image"; basename: string; dataUrl: string }
    | {
        ok: true;
        kind: "document";
        basename: string;
        text: string;
        truncated?: boolean;
        pages?: number | null;
        source?: string;
        previewDataUrl?: string;
      }
    | { ok: true; kind: "binary"; basename: string; reason?: string }
    | { ok: true; kind: "video"; basename: string }
    | { ok: true; kind: "file_too_large"; basename: string }
    | { ok: true; kind: "directory"; basename: string; pathText: string }
    | { ok: false; reason?: string }
  >;
  openDirectory: (options?: {
    title?: string;
    defaultPath?: string;
    buttonLabel?: string;
  }) => Promise<string | null>;
  getDefaultOutputDir: () => Promise<string | null>;
  /** @deprecated M2.3 — always returns empty string; use backendHttp / voiceMintWsAuthTicket. */
  getBackendToken: () => Promise<string>;
  /** Authenticated local-backend proxy (app token injected in main). */
  backendHttp?: (payload: {
    path: string;
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    bodyBase64?: string;
    contentType?: string;
  }) => Promise<{ ok: boolean; status: number; text: string; contentType: string }>;
  /** Short-lived one-shot ticket for voice WebSocket app_auth. */
  voiceMintWsAuthTicket?: () => Promise<{ ok: true; ticket: string } | { ok: false; reason?: string }>;
  /** Relay all connected integration tokens from main (no raw tokens in renderer). */
  integrationRelayAllTokens?: () => Promise<{ ok: true; relayed: string[] } | { ok: false; reason?: string }>;
  /** Text log path (JSON lines) for renderer crashes and forwarded JS errors. */
  getRendererDiagnosticsLogPath: () => Promise<string | null>;
  /** Append one diagnostic object as a JSON line (main process). */
  appendRendererDiagnostic: (payload: Record<string, unknown>) => Promise<{ ok: boolean }>;
  getSystemSpecs: () => Promise<SystemSpecs>;
  /** macOS: true when launched from a mounted .dmg instead of /Applications. */
  getInstallLocation: () => Promise<InstallLocationState>;
  openApplicationsFolder: () => Promise<{ ok: boolean; error: string | null }>;
  getOCRCapabilities: () => Promise<OCRCapabilities>;
  /** Kill and respawn the Python API (e.g. after crash or port conflict). */
  restartBackend: () => Promise<{ ok: boolean; reason?: string }>;
  /** True only when this app's managed backend child responds on /health. */
  getBackendStatus: () => Promise<{
    ok: boolean;
    managed: boolean;
    reason?: string;
    startupProgress?: { elapsedMs: number; maxWaitMs: number; percent: number };
  }>;
  /** Optional classification env overrides (merged into backend child process). */
  getBackendEnvOverrides: () => Promise<Record<string, string | boolean | number>>;
  setBackendEnvOverrides: (
    overrides: Record<string, string | boolean | number>
  ) => Promise<{ ok: boolean; reason?: string }>;
  /** Read a main-process secret encrypted with OS safeStorage. Packaged builds return a mask when configured. */
  getSecret: (key: string) => Promise<string | null>;
  /** True when a secret exists in safeStorage (no raw value). */
  hasSecret?: (key: string) => Promise<boolean>;
  /** Persist a secret in main-process safeStorage. */
  setSecret: (key: string, value: string) => Promise<{ ok: boolean; reason?: string }>;
  /** Remove a secret from the active profile vault. */
  clearSecret?: (key: string) => Promise<{ ok: boolean; reason?: string }>;
  openPath: (path: string) => Promise<string>;
  openExternal: (url: string) => Promise<void>;
  /** Opens Google OAuth in an app window; resolves when that window is closed (desktop Gmail connect). */
  openGmailOAuthWindow: (url: string) => Promise<void>;
  showInFolder: (path: string) => Promise<void>;
  /** Read a local image as a data URL for <img> (avoids file:// from http dev server). */
  getPreviewImageDataUrl: (
    filePath: string
  ) => Promise<{ dataUrl: string } | { error: string } | null>;
  minimizeWindow: () => Promise<void>;
  maximizeWindow: () => Promise<void>;
  closeWindow: () => Promise<void>;
  /** Show, un-minimize, and focus the main window. */
  restoreAndFocusWindow: () => Promise<{ ok: boolean; reason?: string }>;
  /** Read clap-to-launch state (opt-in flag + whether the desktop shell supports it). */
  getClapSettings: () => Promise<{ enabled: boolean; supported: boolean }>;
  /** Enable/disable clap-to-launch: persists opt-in, syncs the OS login item and tray. */
  setClapEnabled: (
    enabled: boolean
  ) => Promise<{ ok: boolean; enabled?: boolean; reason?: string }>;
  /**
   * When true, Chromium may throttle timers in background (default).
   * Pass false only while clap-wake mic sampling is active.
   */
  setBackgroundThrottling: (
    enabled: boolean
  ) => Promise<{ ok: boolean; enabled?: boolean; reason?: string }>;
  setPushToTalkConfig: (config: {
    enabled?: boolean;
    accelerator?: string;
  }) => Promise<{ ok: boolean }>;
  onPushToTalkKeyDown: (handler: () => void) => (() => void) | undefined;
  onPushToTalkKeyUp: (handler: () => void) => (() => void) | undefined;
  /** Toggle the native OS fullscreen state of the main window. */
  toggleFullscreen: () => Promise<void>;
  /** Returns the current native fullscreen state of the main window. */
  isFullscreen: () => Promise<boolean>;
  getEntitlementState: () => Promise<EntitlementStatus>;
  syncSortCredentials: (opts?: { force?: boolean }) => Promise<{
    ok: boolean;
    error?: string;
    restarted?: boolean;
    skipped?: string;
    expires_at?: number;
  }>;
  activateLicense: (licenseKey: string) => Promise<{ ok: boolean; reason?: string }>;
  clearLicense: () => Promise<{ ok: boolean }>;
  cloudAuthRegister: (
    email: string,
    password: string,
    firstName: string,
    lastName: string
  ) => Promise<{ ok: boolean; error?: string }>;
  cloudAuthLogin: (
    email: string,
    password: string
  ) => Promise<{ ok: boolean; error?: string }>;
  cloudAuthLogout: () => Promise<{ ok: boolean }>;
  /** Sign in with Google/Apple via an app-owned OAuth window. */
  cloudAuthSocial: (provider: "google" | "apple") => Promise<{ ok: boolean; error?: string }>;
  cloudAuthCancelSocial: () => Promise<{ ok: boolean }>;
  /** Which sign-in providers the configured cloud API offers. */
  cloudAuthGetProviders: () => Promise<{ password: boolean; google: boolean; apple: boolean }>;
  cloudAuthExportData: () => Promise<{ ok: boolean; data?: unknown; error?: string }>;
  cloudAuthDeleteAccount: () => Promise<{ ok: boolean; error?: string }>;
  privacyWipeElectronFiles: () => Promise<{ ok: boolean; removed?: string[]; reason?: string }>;
  privacyWipeAllLocalData: () => Promise<{ ok: boolean; cleared?: string[]; detail?: string; reason?: string }>;
  /** Factory-reset: erase every local account vault + device session on this Mac. */
  privacyWipeAllProfilesOnDevice: () => Promise<{ ok: boolean; cleared?: string[]; detail?: string; reason?: string }>;
  accountProfileGetState: () => Promise<{
    ok: boolean;
    activeId?: string;
    isGuest?: boolean;
    profileRoot?: string;
    deviceRoot?: string;
    error?: string;
  }>;
  voicePrimeSession: (payload: {
    sessionId: string;
    provider?: string;
    model?: string;
    baseUrl?: string;
  }) => Promise<{ ok: boolean; reason?: string; relayed?: string[] }>;
  getRememberDevice: () => Promise<boolean>;
  setRememberDevice: (value: boolean) => Promise<{ ok: boolean }>;
  /** POST telemetry batch via main; persists to disk if the local API is unreachable. */
  telemetrySendBatch: (
    url: string,
    bodyJson: string
  ) => Promise<{ ok: boolean; delivered?: boolean; queued?: boolean; reason?: string }>;
  /** Retry queued batches (also runs periodically in main). */
  telemetryFlushOffline: () => Promise<{ ok: boolean }>;
  /** Submit feedback to local API and mirror to cloud when signed in. */
  telemetrySubmitFeedback: (bodyJson: string) => Promise<boolean>;
  /** Append one JSON line to userData/system-command-audit.log (AI actions). */
  systemCommandAudit: (entry: {
    commandId: string;
    outcome: string;
    detail?: string;
  }) => Promise<{ ok: boolean }>;
  /**
   * Run an allowlisted AI system command after user confirmation (main validates; UI actions are delegated).
   */
  systemCommandExecute: (payload: {
    commandId: string;
    args?: Record<string, unknown>;
    requestId?: string;
    context?: { outputDir?: string; authorizedWorkspacePaths?: string[] };
  }) => Promise<{ ok: boolean; reason?: string; data?: unknown }>;
  /** Subscribe to delegated commands from main (navigate tab, help, tour). Returns unsubscribe. */
  onSystemCommandDelegate: (
    handler: (command: {
      v: 1;
      commandId: string;
      args: Record<string, unknown>;
    }) => void
  ) => () => void;
  /**
   * Fired when clap-to-launch hides the window to the tray (the user "closed" it).
   * The renderer should cut the mic and silence the AI while the clap listener stays alive.
   * Returns an unsubscribe function.
   */
  onClapHiddenToTray: (handler: () => void) => () => void;
  /**
   * Fired when the Electron main process catches an uncaught error / rejection.
   * The renderer reports it (respecting the Privacy opt-in) and surfaces a toast,
   * since main-process errors never reach the renderer's own error handlers.
   * Returns an unsubscribe function.
   */
  onMainProcessError: (
    handler: (payload: {
      kind?: string;
      message?: string;
      stack?: string | null;
      /** Expected updater/crypto noise — renderer should skip toast. */
      benign?: boolean;
    }) => void
  ) => () => void;
  /** Main process gave up waiting for the local Python service during cold start. */
  onBackendStartupFailed: (handler: () => void) => () => void;
  /**
   * Subscribe to AI self-connect (OAuth autopilot) progress while the AI drives a
   * consent page. `needsUser` is true when a human-only gate (login/2FA/captcha)
   * needs the user to take over. Returns an unsubscribe function.
   */
  onOAuthAutopilotProgress: (
    handler: (detail: {
      providerId?: string;
      label?: string;
      status?: string;
      message?: string;
      needsUser: boolean;
    }) => void,
  ) => () => void;
  /** Third-party OAuth integrations (Google Drive, …) — separate from product cloud login. */
  integrationListProviders: () => Promise<{
    ok: boolean;
    providers?: Array<{
      id: string;
      displayName: string;
      capabilities: string[];
      capabilityLabels: string[];
      scopesSummary: string;
      clientIdEnvVar: string;
      dashboardUrl: string;
      dashboardLabel: string;
      oauthConfigured: boolean;
    }>;
  }>;
  integrationGetAccounts: () => Promise<{
    ok: boolean;
    accounts?: Array<{
      providerId: string;
      connected: boolean;
      /** Infomaniak: true when `EXOSITES_INFOMANIAK_TOKEN` supplies API access (may omit stored OAuth). */
      authViaEnvToken?: boolean;
    }>;
  }>;
  integrationConnect: (payload: {
    providerId: string;
    /** When true, the AI drives the consent page in an app-owned window. */
    autopilot?: boolean;
  }) => Promise<{ ok: boolean; reason?: string }>;
  integrationDisconnect: (payload: { providerId: string }) => Promise<{
    ok: boolean;
    reason?: string;
    /** Infomaniak: stored OAuth cleared but env token still enables API access. */
    stillAuthorizedViaEnv?: boolean;
  }>;
  integrationListGoogleDriveFiles: (payload?: {
    pageSize?: number;
    pageToken?: string;
    /** When set, lists children of this folder (use `root` for top of My Drive). */
    parentId?: string;
    /**
     * When true, lists all non-folder files in My Drive (any depth) in one paginated query stream.
     * Ignores `parentId` for the Drive `q` clause. Used for Run-sort resolution from My Drive root.
     */
    flatMyDriveFiles?: boolean;
  }) => Promise<
    | {
        ok: true;
        files: Array<{
          id?: string;
          name?: string;
          mimeType?: string;
          size?: string;
          /** RFC 3339; used for workspace list filters */
          modifiedTime?: string;
        }>;
        nextPageToken?: string;
      }
    | { ok: false; reason?: string }
  >;
  /** Download Drive files to a staging dir; returns absolute paths for the local Python analyze API. */
  integrationImportGoogleDriveFiles: (payload: {
    fileIds: string[];
    /** Reuse the same download directory across progressive import waves. */
    stagingDir?: string;
  }) => Promise<
    | { ok: true; localPaths: string[]; failed: Array<{ id: string; reason: string }>; stagingDir: string }
    | { ok: false; reason?: string }
  >;
  /** List one page of a Dropbox folder (or continue paging via cursor). */
  integrationListDropboxFiles: (payload?: {
    /** Dropbox path (empty string = root). */
    path?: string;
    /** Pagination cursor from a previous call. When set, `path` and `recursive` are ignored. */
    cursor?: string;
    /** When false, lists only immediate children (default: true = recursive). */
    recursive?: boolean;
  }) => Promise<
    | {
        ok: true;
        entries: Array<{
          ".tag": "file" | "folder" | "deleted";
          id?: string;
          name: string;
          path_lower?: string;
          path_display?: string;
          size?: number;
          client_modified?: string;
          server_modified?: string;
        }>;
        cursor: string;
        hasMore: boolean;
      }
    | { ok: false; reason?: string }
  >;
  /** Download Dropbox entries to a staging dir; returns absolute local paths for the Python analyze API. */
  integrationImportDropboxFiles: (payload: {
    entries: Array<{
      ".tag": "file";
      name: string;
      path_lower: string;
      path_display?: string;
      size?: number;
    }>;
    /** Reuse the same download directory across progressive import waves. */
    stagingDir?: string;
  }) => Promise<
    | {
        ok: true;
        localPaths: string[];
        failed: Array<{ path: string; reason: string }>;
        stagingDir: string;
      }
    | { ok: false; reason?: string }
  >;
  /**
   * List OneDrive items: one Graph page, or a full recursive walk when `recursive: true` (no `nextLink`).
   */
  integrationListOneDriveFiles: (payload?: {
    /** OneDrive path relative to root (empty = root, e.g. "/Documents"). */
    path?: string;
    /** Pagination nextLink from a previous call. When set, `path` and `recursive` are ignored. */
    nextLink?: string;
    /** Full tree from `path` (BFS); capped in the desktop app for safety. */
    recursive?: boolean;
  }) => Promise<
    | {
        ok: true;
        items: Array<{
          id: string;
          name: string;
          size?: number;
          lastModifiedDateTime?: string;
          file?: { mimeType?: string };
        }>;
        nextLink?: string;
        /** Present when `recursive` was used; listing may be incomplete. */
        cappedByFolders?: boolean;
        cappedByFiles?: boolean;
      }
    | { ok: false; reason?: string }
  >;
  /** Download OneDrive items to a staging dir; returns absolute local paths for the Python analyze API. */
  integrationImportOneDriveFiles: (payload: {
    items: Array<{ id: string; name: string; size?: number }>;
    /** Reuse the same download directory across progressive import waves. */
    stagingDir?: string;
  }) => Promise<
    | {
        ok: true;
        localPaths: string[];
        failed: Array<{ id: string; reason: string }>;
        stagingDir: string;
      }
    | { ok: false; reason?: string }
  >;
  /** List one page of Outlook messages from a mail folder. */
  integrationListOutlookMessages: (payload?: {
    /** Mail folder name or well-known name ("Inbox", "SentItems", "AllMessages", …). Default: "Inbox". */
    folder?: string;
    /** ISO 8601 date-time string; only messages received on or after this date are returned. */
    since?: string;
    /** Pagination nextLink from a previous call. When set, other filters are ignored. */
    nextLink?: string;
    pageSize?: number;
  }) => Promise<
    | {
        ok: true;
        messages: Array<{
          id: string;
          subject?: string;
          bodyPreview?: string;
          hasAttachments?: boolean;
          receivedDateTime?: string;
          from?: { emailAddress?: { name?: string; address?: string } };
        }>;
        nextLink?: string;
      }
    | { ok: false; reason?: string }
  >;
  /** Download Outlook messages to a staging dir as .txt files (+ optional attachments). */
  integrationImportOutlookMessages: (payload: {
    messageIds: string[];
    /** Message metadata used to build filenames without re-fetching headers. */
    messagesMeta?: Array<{
      id: string;
      subject?: string;
      hasAttachments?: boolean;
      receivedDateTime?: string;
    }>;
    /** When true, non-inline attachments are saved alongside the .txt file. */
    includeAttachments?: boolean;
    /** Reuse the same staging directory across progressive import waves. */
    stagingDir?: string;
  }) => Promise<
    | {
        ok: true;
        localPaths: string[];
        failed: Array<{ id: string; reason: string }>;
        stagingDir: string;
      }
    | { ok: false; reason?: string }
  >;
  integrationHealthCheck: (payload: {
    providerId: string;
  }) => Promise<{ ok: boolean; reason?: string }>;

  // ─── S3 ────────────────────────────────────────────────────────────────────
  integrationSaveS3Credentials: (payload: {
    access_key: string;
    secret_key: string;
    region: string;
    bucket: string;
    prefix?: string;
  }) => Promise<{ ok: boolean; reason?: string }>;
  integrationLoadS3Credentials: () => Promise<{
    ok: boolean;
    credentials: {
      access_key: string;
      secret_key_masked: string;
      region: string;
      bucket: string;
      prefix: string;
    } | null;
  }>;

  // ─── WhatsApp Cloud API ────────────────────────────────────────────────────
  integrationSaveWhatsAppCloudCredentials: (payload: {
    phone_number_id: string;
    access_token: string;
    business_account_id: string;
  }) => Promise<{
    ok: boolean;
    reason?: string;
    displayPhoneNumber?: string | null;
    webhookRegistrationFailed?: boolean;
  }>;
  integrationGetWhatsAppWebhookConfig: () => Promise<{
    ok: boolean;
    webhook_url?: string;
    configured?: boolean;
    verify_token_set?: boolean;
    reason?: string;
  }>;
  integrationGetWhatsAppConnectConfig: () => Promise<{
    ok: boolean;
    meta_app_id?: string | null;
    embedded_signup_config_id?: string | null;
    embedded_signup_available?: boolean;
    reason?: string;
  }>;
  integrationLaunchWhatsAppEmbeddedSignup: () => Promise<{
    ok: boolean;
    code?: string;
    codeSource?: "oauth_callback" | "meta_hosted_es" | "embedded_finish";
    oauthRedirectUri?: string;
    phoneNumberId?: string;
    businessAccountId?: string;
    displayPhoneNumber?: string;
    reason?: string;
  }>;
  integrationExchangeWhatsAppEmbeddedSignup: (payload: {
    code: string;
    code_source?: "oauth_callback" | "meta_hosted_es" | "embedded_finish";
    oauth_redirect_uri?: string;
    phone_number_id?: string;
    business_account_id?: string;
    display_phone_number?: string;
  }) => Promise<{
    ok: boolean;
    displayPhoneNumber?: string | null;
    reason?: string;
    webhookRegistrationFailed?: boolean;
  }>;
  integrationGetWhatsAppBusinessStatus: () => Promise<{
    ok: boolean;
    connected?: boolean;
    displayPhoneNumber?: string | null;
    phoneNumberId?: string;
    businessAccountId?: string;
    webhookConfigured?: boolean;
    webhookUrl?: string | null;
    cloudPollingEnabled?: boolean;
    inboundCount?: number;
    lastInboundMs?: number | null;
    reason?: string;
  }>;
  integrationSendWhatsAppTestMessage: (payload: {
    to: string;
    text: string;
  }) => Promise<{ ok: boolean; reason?: string; messageId?: string }>;
  integrationListWhatsAppMessageTemplates: (payload?: {
    business_account_id?: string;
    limit?: number;
  }) => Promise<{
    ok: boolean;
    reason?: string;
    templates?: Array<{
      name: string;
      language?: string;
      status?: string;
      category?: string;
    }>;
  }>;

  integrationListS3Objects: (payload?: {
    continuationToken?: string;
    prefix?: string;
  }) => Promise<
    | { ok: true; items: Array<{ key: string; size: number; lastModified: string }>; nextContinuationToken?: string | null }
    | { ok: false; reason?: string }
  >;
  integrationImportS3Objects: (payload: {
    items: Array<{ key: string; size?: number }>;
    stagingDir?: string;
  }) => Promise<
    | { ok: true; localPaths: string[]; failed: Array<{ key: string; reason: string }>; stagingDir: string }
    | { ok: false; reason?: string }
  >;

  // ─── Slack ─────────────────────────────────────────────────────────────────
  integrationListSlackFiles: (payload?: {
    channel?: string;
    types?: string;
    tsFrom?: string;
    cursor?: string;
  }) => Promise<
    | { ok: true; files: Array<{ id: string; name: string; size?: number; url_private?: string; url_private_download?: string }>; nextCursor?: string | null }
    | { ok: false; reason?: string }
  >;
  integrationImportSlackFiles: (payload: {
    files: Array<{ id: string; name: string; size?: number; url_private?: string; url_private_download?: string }>;
    stagingDir?: string;
  }) => Promise<
    | { ok: true; localPaths: string[]; failed: Array<{ id: string; reason: string }>; stagingDir: string }
    | { ok: false; reason?: string }
  >;

  // ─── iCloud ────────────────────────────────────────────────────────────────
  integrationPickICloudFolder: () => Promise<{ ok: boolean; folder?: string; reason?: string }>;
  integrationGetICloudFolder: () => Promise<{ ok: boolean; folder: string | null }>;
  integrationListICloudFiles: (payload?: Record<string, never>) => Promise<
    | { ok: true; files: Array<{ path: string; name: string; size: number; lastModified: string }>; capped?: boolean }
    | { ok: false; reason?: string }
  >;
  integrationImportICloudFiles: (payload: {
    items: Array<{ path: string; name: string; size?: number }>;
    stagingDir?: string;
  }) => Promise<
    | { ok: true; localPaths: string[]; failed: Array<{ path: string; reason: string }>; stagingDir: string }
    | { ok: false; reason?: string }
  >;

  // ─── Infomaniak personal API token ─────────────────────────────────────────
  /**
   * Persist the user's personal Infomaniak API token, encrypted with OS safeStorage.
   * The token is used as a Bearer credential for all Infomaniak API calls.
   */
  integrationSaveInfomaniakApiToken: (token: string) => Promise<{ ok: boolean; reason?: string }>;
  /** Returns whether a personal API token is currently stored (does not return the token itself). */
  integrationLoadInfomaniakApiToken: () => Promise<{ ok: boolean; hasToken: boolean }>;
  /** Remove the stored personal API token from disk. */
  integrationClearInfomaniakApiToken: () => Promise<{ ok: boolean }>;

  /**
   * Persist the user's Notion OAuth client credentials (Client ID + Secret),
   * encrypted with OS safeStorage. Used so users can connect Notion without
   * editing `.env`.
   */
  integrationSaveNotionOAuthClient: (payload: {
    clientId: string;
    clientSecret: string;
  }) => Promise<{ ok: boolean; reason?: string }>;
  /** Returns whether OAuth client credentials are stored, plus a masked Client ID (never the secret). */
  integrationLoadNotionOAuthClient: () => Promise<{
    ok: boolean;
    configured: boolean;
    clientIdMasked: string;
  }>;
  /** Remove the stored Notion OAuth client credentials from disk. */
  integrationClearNotionOAuthClient: () => Promise<{ ok: boolean }>;

  integrationSaveSlackOAuthClient: (payload: {
    clientId: string;
    clientSecret: string;
  }) => Promise<{ ok: boolean; reason?: string }>;
  integrationLoadSlackOAuthClient: () => Promise<{
    ok: boolean;
    configured: boolean;
    clientIdMasked: string;
  }>;
  integrationClearSlackOAuthClient: () => Promise<{ ok: boolean }>;

  // ─── Infomaniak kDrive ─────────────────────────────────────────────────────
  integrationListInfomaniakFiles: (payload?: {
    driveId?: number;
    recursive?: boolean;
    rootFolderId?: number;
    parentId?: number;
    page?: number;
  }) => Promise<
    | { ok: true; drives?: object[]; files?: object[]; hasMore?: boolean }
    | { ok: false; reason?: string }
  >;
  integrationImportInfomaniakFiles: (payload: {
    items: Array<{ id: number; name: string; size?: number; driveId?: number }>;
    stagingDir?: string;
  }) => Promise<
    | { ok: true; localPaths: string[]; failed: Array<{ id: number; reason: string }>; stagingDir: string }
    | { ok: false; reason?: string }
  >;

  /** Infomaniak Mail listing for workspace merge (uses `infomaniak` bearer). */
  integrationListInfomaniakMailMessages: (payload?: {
    mailbox?: string;
    /** INBOX | SENT | ALL (electron canonical). */
    folder?: string;
    since?: number | string | null;
  }) => Promise<{ ok: true; messages: object[] } | { ok: false; reason?: string }>;
  /** Save Infomaniak messages as `.txt` under userData staging for sort. */
  integrationImportInfomaniakMailMessages: (payload: {
    messageIds: string[];
    messagesMeta?: Record<string, unknown>[];
    stagingDir?: string;
  }) => Promise<
    | { ok: true; localPaths: string[]; failed: Array<{ id: string; reason: string }>; stagingDir: string }
    | { ok: false; reason?: string }
  >;

  // ─── Screen capture ─────────────────────────────────────────────────────────
  /** Record an explicit user gesture authorizing the next screen capture. */
  grantScreenCaptureConsent: () => Promise<{ ok: boolean; error?: string }>;
  captureScreen: () => Promise<
    | { ok: true; data: string }
    | { ok: false; error: string }
  >;

  // ─── Encrypted sync (GO SYNC) ───────────────────────────────────────────────
  syncGetStatus?: () => Promise<{
    enabled?: boolean;
    lastRunAt?: string | null;
    lastError?: string | null;
    pendingCount?: number;
    conflictCount?: number;
  }>;
  syncSetEnabled?: (enabled: boolean) => Promise<{ ok: boolean }>;
  syncRunNow?: () => Promise<{ ok: boolean }>;
  /** Main builds the QR so master_key_b64 never enters the renderer. */
  syncGetPairingQr?: () => Promise<{ dataUrl: string } | { ok: false; error: string }>;
  /** Main copies the same pairing JSON as the QR onto the clipboard (no key in renderer). */
  syncCopyPairingPayload?: () => Promise<{ ok: true } | { ok: false; error: string }>;

  // ─── Codegen Studio ─────────────────────────────────────────────────────────
  // ─── In-app updates ──────────────────────────────────────────────────────
  /** Current update snapshot (lets a late-mounting UI sync without waiting for an event). */
  updateGetState: () => Promise<UpdateState>;
  /** Re-check the website feed for a newer version. */
  updateCheck: () => Promise<{ ok: boolean; status?: string }>;
  /** macOS: download the update in-app; Windows: open the download page. */
  updateStart: () => Promise<{ ok: boolean; mode?: "download" | "redirect"; url?: string; reason?: string }>;
  /** macOS only: quit and install a downloaded update. */
  updateInstall: () => Promise<{ ok: boolean; reason?: string }>;
  /** Subscribe to update events from main. Returns an unsubscribe function. */
  onUpdateEvent: (handler: (event: UpdateEvent) => void) => () => void;
  /** Fired when cloud sign-in state changes (login, logout, expired refresh). */
  onCloudSessionChanged: (handler: (payload: { reason?: string }) => void) => () => void;
  /** Fired when the active local account vault changes (login, logout, wipe). */
  onAccountProfileChanged: (handler: (payload: { activeId?: string; profileRoot?: string }) => void) => () => void;

  codegenRunInstall: (payload: {
    sessionId: string;
    cwd: string;
    installCommand: string;
    skipIfReady?: boolean;
  }) => Promise<{ ok: boolean; skipped?: boolean; logTail?: string; error?: string }>;
  codegenDevServerStart: (payload: {
    sessionId: string;
    cwd: string;
    devCommand: string;
    reuseIfRunning?: boolean;
  }) => Promise<{
    ok: boolean;
    port?: number;
    url?: string;
    logTail?: string;
    reused?: boolean;
    error?: string;
    buildError?: string | null;
  }>;
  codegenDevServerStop: (payload: { sessionId: string }) => Promise<{ ok: boolean }>;
  codegenDevServerStatus: (payload: { sessionId: string }) => Promise<{
    running: boolean;
    port: number | null;
    url: string | null;
    logTail: string;
    phase?: string;
    cwd?: string;
    buildError?: string | null;
  }>;
  codegenOpenProjectFolder: (payload: { path: string }) => Promise<{ ok: boolean }>;
  codegenPreviewSetBounds: (payload: {
    sessionId: string;
    url: string;
    bounds: { x: number; y: number; width: number; height: number };
  }) => Promise<{ ok: boolean }>;
  codegenPreviewHide: (payload: { sessionId: string }) => Promise<{ ok: boolean }>;
  codegenPreviewReload: (payload: { sessionId: string }) => Promise<{ ok: boolean }>;
  codegenPreviewProbe: (payload: { sessionId: string }) => Promise<{
    ok: boolean;
    reason?: string | null;
    /** "overlay" | "blank" | "ok" | "no_preview" | "inconclusive" */
    kind?: string | null;
  }>;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
