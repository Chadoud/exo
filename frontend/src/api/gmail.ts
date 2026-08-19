import { desktopClient } from "../desktopClient";
import { EntitlementBlockedError, extractApiError, getApiHeaders, mapFetchFailureToError } from "./client";
import type { SortUploadPayload } from "./jobs";

const OAUTH_BEGIN_TIMEOUT_MS = 30_000;
const OAUTH_IDLE_POLL_MS = 500;
const OAUTH_IDLE_MAX_WAIT_MS = 310_000;

/** What to pull from each Gmail message into the sort job. */
export type GmailImportContent = "text" | "attachments" | "both";

type GmailImportSortBody = SortUploadPayload & {
  gmail_query: string;
  max_messages: number;
  gmail_import_content: GmailImportContent;
  /** Opaque JSON string: scope, cap, and mode snapshot for the job and CSV. */
  gmail_ui_parameters_json?: string;
};

export type GmailDeveloperSetupStep = {
  id: string;
  status: "pass" | "fail" | "manual" | "skipped" | "not_applicable";
  hints?: Record<string, unknown>;
};

export type GmailStatusResponse = {
  /** Server-side cap for ``max_messages`` on import / with-sources (omit on very old backends). */
  gmail_import_max_messages?: number;
  connected: boolean;
  /** True while the backend waits for the Google OAuth redirect (after POST /gmail/oauth/begin). */
  oauth_flow_active?: boolean;
  /** Populated when the last flow ended with an error (not user abort). */
  oauth_flow_error?: string | null;
  /** Loopback redirect URI the backend uses (non-secret). */
  gmail_oauth_redirect_uri?: string;
  oauth_configured: boolean;
  /** Non-secret hints so the UI can explain “.env not loaded” vs “vars missing”. */
  oauth_env_id_present?: boolean;
  oauth_env_secret_present?: boolean;
  oauth_json_path_env_present?: boolean;
  oauth_default_json_exists?: boolean;
  backend_dotenv_file_exists?: boolean;
  user_dotenv_file_exists?: boolean;
  resource_dotenv_file_exists?: boolean;
  developer_setup_steps?: GmailDeveloperSetupStep[];
  /** Connected mailbox address from Gmail profile — omit/null when unknown. */
  email?: string | null;
};

export async function gmailStatus(): Promise<GmailStatusResponse> {
  try {
    return (await desktopClient.getGmailStatus()) as GmailStatusResponse;
  } catch (e: unknown) {
    throw mapFetchFailureToError(e);
  }
}

export class GmailOAuthFlowTimeoutError extends Error {
  constructor() {
    super("GmailOAuthFlowTimeoutError");
    this.name = "GmailOAuthFlowTimeoutError";
  }
}

/**
 * How the Google sign-in surface is opened so the UI can detect when it was dismissed.
 *
 * - **popup**: `window.open` returned a window — poll `closed` (omit `noopener` so the handle exists).
 * - **electron-shell**: Desktop app opens an owned BrowserWindow; `untilClosed` resolves when it closes.
 * - **untracked**: Popup blocked / unknown — caller cannot auto-detect dismiss.
 */
type GmailOAuthWindowHandle =
  | { mode: "popup"; window: Window }
  | { mode: "electron-shell"; untilClosed: Promise<void> }
  | { mode: "untracked" };

/**
 * Opens the Google OAuth URL in a trackable window when possible.
 * Validates that the URL belongs to accounts.google.com before opening to prevent
 * a compromised/spoofed API response from redirecting users to an attacker page.
 */
export function openGmailSignInWindow(authUrl: string): GmailOAuthWindowHandle {
  try {
    const parsed = new URL(authUrl);
    if (parsed.protocol !== "https:" || parsed.hostname !== "accounts.google.com") {
      console.error("[gmail] Rejected OAuth URL with unexpected origin:", parsed.origin);
      return { mode: "untracked" };
    }
  } catch {
    console.error("[gmail] Rejected malformed OAuth URL");
    return { mode: "untracked" };
  }

  let w: Window | null = null;
  try {
    // `noopener` makes `window.open` return `null` in many engines — we need a handle to poll `.closed`.
    w = window.open(authUrl, "exosites_gmail_oauth", "popup=yes,width=520,height=720");
  } catch {
    /* ignore */
  }
  if (w) {
    return { mode: "popup", window: w };
  }

  const openGmailWin =
    typeof window !== "undefined" ? window.electronAPI?.openGmailOAuthWindow : undefined;
  if (typeof openGmailWin === "function") {
    return { mode: "electron-shell", untilClosed: openGmailWin(authUrl) };
  }

  try {
    w = window.open(authUrl, "_blank");
  } catch {
    /* ignore */
  }
  if (w) {
    return { mode: "popup", window: w };
  }

  void window.open(authUrl, "_blank");
  return { mode: "untracked" };
}

/**
 * Starts the loopback OAuth server and returns the Google authorize URL.
 * Open the URL in a browser window, then poll {@link gmailStatus} until `oauth_flow_active` is false,
 * or call {@link gmailOAuthAbort} if the user dismisses the flow.
 */
export async function gmailOAuthBegin(): Promise<{ auth_url: string }> {
  let res: Response;
  try {
    res = await desktopClient.fetch("/gmail/oauth/begin", {
      method: "POST",
      headers: await getApiHeaders({ "Content-Type": "application/json" }),
      signal: AbortSignal.timeout(OAUTH_BEGIN_TIMEOUT_MS),
    });
  } catch (e: unknown) {
    throw mapFetchFailureToError(e);
  }
  if (res.status === 409) {
    throw new Error(await extractApiError(res));
  }
  if (!res.ok) throw new Error(await extractApiError(res));
  return res.json() as Promise<{ auth_url: string }>;
}

/** Stops an in-flight Gmail browser sign-in (closes wait on the callback server). */
export async function gmailOAuthAbort(): Promise<void> {
  let res: Response;
  try {
    res = await desktopClient.fetch("/gmail/oauth/abort", {
      method: "POST",
      headers: await getApiHeaders({ "Content-Type": "application/json" }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (e: unknown) {
    throw mapFetchFailureToError(e);
  }
  if (!res.ok) throw new Error(await extractApiError(res));
}

/**
 * Polls ``GET /gmail/status`` until `oauth_flow_active` is false or ``maxWaitMs`` elapses.
 *
 * @throws GmailOAuthFlowTimeoutError when the wait budget is exceeded
 */
export async function waitUntilGmailOAuthFlowIdle(options?: {
  pollIntervalMs?: number;
  maxWaitMs?: number;
}): Promise<GmailStatusResponse> {
  const pollIntervalMs = options?.pollIntervalMs ?? OAUTH_IDLE_POLL_MS;
  const maxWaitMs = options?.maxWaitMs ?? OAUTH_IDLE_MAX_WAIT_MS;
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    const s = await gmailStatus();
    if (!s.oauth_flow_active) return s;
    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }
  throw new GmailOAuthFlowTimeoutError();
}

export async function gmailOAuthDisconnect(): Promise<{ ok: boolean; connected: boolean }> {
  let res: Response;
  try {
    res = await desktopClient.fetch("/gmail/oauth", {
      method: "DELETE",
      headers: await getApiHeaders(),
    });
  } catch (e: unknown) {
    throw mapFetchFailureToError(e);
  }
  if (!res.ok) throw new Error(await extractApiError(res));
  return res.json() as Promise<{ ok: boolean; connected: boolean }>;
}

export async function gmailImportSort(
  body: GmailImportSortBody,
  init?: Pick<RequestInit, "signal">
): Promise<{ job_id: string; session_id: string }> {
  let res: Response;
  try {
    res = await desktopClient.fetch("/gmail/import-sort", {
      method: "POST",
      headers: await getApiHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
      ...init,
    });
  } catch (e: unknown) {
    throw mapFetchFailureToError(e);
  }
  if (!res.ok) {
    if (res.status === 402) {
      throw new EntitlementBlockedError(await extractApiError(res));
    }
    throw new Error(await extractApiError(res));
  }
  return res.json() as Promise<{ job_id: string; session_id: string }>;
}
