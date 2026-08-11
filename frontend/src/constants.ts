/** Frontend-side constants — single source of truth for all magic values. */

import { APP_VERSION } from "./appVersion";

/** User-facing product name — keep in sync with `package.json` `build.productName`. */
export const APP_DISPLAY_NAME = "Exo";

/** Logo in `frontend/public/logo.png` — must stay relative for packaged Electron (`file://`). */
export const APP_LOGO_URL = `${import.meta.env.BASE_URL}logo.png`;

/**
 * URL for a file under `frontend/public/`.
 * Avoid leading `/` — absolute paths break when the renderer loads from `file://`.
 */
export function publicAssetUrl(pathFromPublicRoot: string): string {
  const trimmed = pathFromPublicRoot.replace(/^\/+/, "");
  return `${import.meta.env.BASE_URL}${trimmed}`;
}

/** AudioWorklet module in `frontend/public/` — must stay relative for `file://` loads. */
export const VOICE_CAPTURE_WORKLET_URL = publicAssetUrl("voice-capture-processor.js");

/** Account / password help on the public website. */
export const EXO_ACCOUNT_WEB_URL = "https://exosites.ch";

export const DEFAULT_SORT_OUTPUT_FOLDER_LABEL = `${APP_DISPLAY_NAME.trim()} Sorted Files`;

/** Keep in sync with `electron/constants.js` `BACKEND_PORT`. */
export const BACKEND_PORT = 7799;

/** Loopback host for the local FastAPI backend (browser dev + Electron). */
export const BACKEND_HOST = "127.0.0.1";

/** Default API origin when `VITE_API_BASE` is unset (`frontend/.env`). */
export const DEFAULT_API_BASE = `http://${BACKEND_HOST}:${BACKEND_PORT}`;

/** Google AI Studio — create / manage Gemini API keys (welcome + Settings links). */
export const GEMINI_AI_STUDIO_API_KEY_URL = "https://aistudio.google.com/app/apikey";

/** Gemini Live tools — names must match backend ``tool_registry``. */
export const VOICE_TOOL_START_LOCAL_SORT = "start_local_file_sort";
export const VOICE_TOOL_RUN_GOOGLE_DRIVE_WORKSPACE_SORT = "run_google_drive_workspace_sort";
export const VOICE_TOOL_MANAGE_CONNECTION = "manage_connection";
export const VOICE_TOOL_START_CODEGEN_STUDIO = "start_codegen_studio";

/** Voice invoked Codegen Studio — chat panel adds progress UI and starts the session. */
export const VOICE_CODEGEN_START_EVENT = "exosites-voice-codegen-start";

export const SETTINGS_STORAGE_KEY = "exosites.settings.v1";

/** When false, folder structure template UI is hidden (alpha). */
export const SORT_STRUCTURE_TEMPLATES_ENABLED = true;

/** When false, max-folder controls stay hidden until cap backend ships. */
export const SORT_STRUCTURE_CAPS_UI_ENABLED = true;
export const THEME_STORAGE_KEY = "theme";
/** Set to `"1"` after the user finishes or skips the spotlight tour. */
export const TOUR_COMPLETED_STORAGE_KEY = "exosites.tour.v2";
/** Set to `"1"` when the user skips the first-run setup wizard without completing it. */
export const WELCOME_SETUP_DISMISSED_STORAGE_KEY = "exosites.welcomeSetup.dismissed.v1";
/** Dismissed Sort tab “next steps” strip (or auto-hidden after first completed job). */
export const SORT_FLOW_STRIP_DISMISSED_KEY = "exosites.sortFlowStrip.dismissed.v1";
/** User dismissed the post-run “Run complete” card — hide for future finished jobs. */
export const POST_RUN_CARD_DISMISSED_KEY = "exosites.postRunCard.dismissed.v1";
/** Shown once when the user first opens the Sort tab after a silent default output-folder seed. */
export const OUTPUT_FOLDER_SORT_TAB_TOAST_SHOWN_KEY = "exosites.sortTab.outputFolderToastShown.v1";
/** Job id for which the post-run card was hidden this session after a CTA (sessionStorage). */
export const POST_RUN_CARD_SESSION_HIDDEN_JOB_ID_KEY = "exosites.postRunCard.sessionHiddenJobId.v1";
/** User chose "Don't show again" on the free-tier API quota nudge toast. */
export const QUOTA_TOAST_DISMISSED_KEY = "exosites.quotaToast.dismissed.v1";
/** Last selected sub-tab on the Memory panel (facts | activity | map). */
export const MEMORY_SUB_TAB_STORAGE_KEY = "exosites.memorySubTab.v1";
export const MEMORY_LIST_EXPANDED_STORAGE_KEY = "exosites.memoryListExpanded.v1";
/** Last selected sub-tab on the To Do panel (today | inbox | done). */
export const TODO_SUB_TAB_STORAGE_KEY = "exosites.todoSubTab.v1";
/** Open Memory → Overview with the needs-review filter applied once the panel mounts. */
export const MEMORY_NEEDS_REVIEW_SESSION_KEY = "exosites.memoryNeedsReview.v1";
/** Scroll to and focus a memory row on Memory → Overview after brain-map navigation. */
export const MEMORY_HIGHLIGHT_SESSION_KEY = "exosites.memoryHighlight.v1";
/** One-shot navigation to a To Do sub-tab (command palette, deep links). */
export const TODO_NAV_QUEUE_SESSION_KEY = "exosites.todoNavQueue.v1";
/** One-shot navigation to External sources → WhatsApp setup modal. */
export const OPEN_WHATSAPP_SETUP_SESSION_KEY = "exosites.openWhatsAppSetup.v1";
/** One-shot chat composer prefill when opening Chat from inbox retry (cleared on consume). */
export const CHAT_DRAFT_QUEUE_SESSION_KEY = "exosites.chatDraftQueue.v1";
/** Fired after {@link queueChatDraft} so an already-mounted chat panel can pick up the prefill. */
export const CHAT_DRAFT_QUEUE_EVENT = "exosites-chat-draft-queue";
/** Sidebar persona: "files" | "assistant" — which nav group appears first. */
export const SIDEBAR_PERSONA_STORAGE_KEY = "exosites.sidebarPersona.v1";

/** sessionStorage key for review table filters (append job id). */
export function reviewFiltersStorageKey(jobId: string): string {
  return `exosites.reviewFilters.v1.${jobId}`;
}

/** Dispatched after a model pull is cancelled so UI can refresh Ollama blob cache info. */
export const OLLAMA_STORAGE_REFRESH_EVENT = "ollama-storage-refresh";

/** Dispatched to open the assistant permission modal when actions are off (`detail.force` skips session dismiss). */
export const ASSISTANT_PERMISSIONS_PROMPT_EVENT = "exosites-assistant-permissions-prompt";

/** Command palette / shortcuts: open Settings with every category on one scrollable page. */
export const SETTINGS_SHOW_ALL_SECTIONS_EVENT = "exosites-settings-show-all";

/**
 * Dispatched when a double-clap wakes the app from the tray (it was "closed").
 * Listeners open a new conversation tab — see {@link CLAP_WAKE_VOICE_EVENT} for the mic.
 */
export const CLAP_NEW_SESSION_EVENT = "exosites-clap-new-session";

/** Dispatched on every double-clap wake. Listeners turn the voice mic on if it is off. */
export const CLAP_WAKE_VOICE_EVENT = "exosites-clap-wake-voice";

/** Voice session mic lifecycle — clap-to-wake releases its stream while voice holds the mic. */
export const VOICE_MIC_ACTIVE_EVENT = "exosites-voice-mic-active";

/** Dispatched to open contextual Assistant access guidance (read/tools/providers vs accounts). `detail.focus`. */
export const ASSISTANT_ACCESS_GUIDANCE_PROMPT_EVENT = "exosites-assistant-access-guidance-prompt";

/** sessionStorage: user chose “Not now” on the assistant access-guidance modal this tab session. */
export const ASSISTANT_ACCESS_GUIDANCE_MODAL_DISMISSED_SESSION_KEY =
  "exosites.assistant.accessGuidance.dismissed.v1";

/** sessionStorage: user chose “Not now” on the assistant permission modal this tab session. */
export const ASSISTANT_PERMISSION_MODAL_DISMISSED_SESSION_KEY =
  "exosites.assistant.permissionModal.dismissed.v1";

/** Trial days remaining at/below which the one-time trial-ending nudge modal is eligible to show. */
export const TRIAL_ENDING_NUDGE_WARNING_DAYS = 3;

/** localStorage: the trial-ending nudge modal has been shown/decided once ever (never re-shown). */
export const TRIAL_ENDING_NUDGE_SEEN_STORAGE_KEY = "exosites.trialEndingNudge.seen.v1";

/** sessionStorage: user chose "Continue with limited access" on the trial-ended gate (re-shown next launch). */
export const TRIAL_GATE_DISMISSED_SESSION_KEY = "exosites.trialGate.dismissed.v1";

/** sessionStorage: Exo AI Manager full-bleed intro (shell + panel chrome) has completed once this session. */
export const EXO_INTRO_STORAGE_KEY = "exo_panel_intro_done";
/** @deprecated Legacy sessionStorage key — migrated on read. */
const LEGACY_EXO_INTRO_STORAGE_KEY = "jarvis_panel_intro_done";

/** Whether the AI Manager intro animation already ran this browser session. */
export function readExoIntroSessionDone(): boolean {
  if (typeof window === "undefined") return true;
  try {
    if (sessionStorage.getItem(EXO_INTRO_STORAGE_KEY) === "1") return true;
    if (sessionStorage.getItem(LEGACY_EXO_INTRO_STORAGE_KEY) === "1") {
      sessionStorage.setItem(EXO_INTRO_STORAGE_KEY, "1");
      return true;
    }
  } catch {
    return true;
  }
  return false;
}
/** Hold duration before app shell and Exo chrome slide in (ms). */
/**
 * Maximum wait before the Exo chrome is force-revealed if TesseractVisual's
 * onIntroComplete callback has not fired (e.g. component never mounted, animation skipped).
 *
 * MUST be greater than `TESSERACT_LAUNCH_COMPLETE_MS` (3 100 ms, defined in
 * `src/exo/exoLandingTiming.ts`). The current value of 4 500 ms satisfies
 * this. If you change either constant, verify the inequality still holds.
 */
export const EXO_INTRO_HOLD_MS = 4500;
/** Shell + panel chrome slide-in duration; must match `--exo-intro-ms` / `--app-shell-intro-ms` in `exo.css` and ExoCenter land blend + mic auto-start delay. */
export const EXO_CHROME_TRANSITION_MS = 1600;

/** Dispatched with `detail: { text: string }` when an assistant reply completes (for tool execution). */
export const ASSISTANT_REPLY_COMPLETE_EVENT = "exosites-assistant-reply-complete";

/**
 * Dispatched after a `save_memory` command executes successfully so the chat panel
 * can refresh its stale `memoryBlock` without requiring a page reload.
 * `detail`: `{ category: string; key: string; value: string }`.
 */
export const ASSISTANT_MEMORY_SAVED_EVENT = "exosites-assistant-memory-saved";

/**
 * After a successful `systemCommandExecute` from the assistant tool bridge, optionally dispatched so a
 * future chat layer can append a redacted tool summary and request one follow-up model turn.
 * `detail`: `{ commandId: string; ok: true }`.
 */
export const ASSISTANT_TOOL_FOLLOWUP_READY_EVENT = "exosites-assistant-tool-followup-ready";

/**
 * Shared layout for the Assistant chat title row and the conversation sidebar’s first row
 * so their `border-b` lines meet flush at the vertical split.
 */
export const ASSISTANT_WORKSPACE_TOP_BAR_CLASS =
  "flex h-12 shrink-0 items-center justify-between border-b border-border";

/** Shown in telemetry payloads — derived from the single version source. */
export const APP_VERSION_LABEL = APP_VERSION;

/** Support contact surfaced when the user needs help (e.g. the app service won't start). */
export const SUPPORT_EMAIL = "studio@exosites.com";

/** Optional public URL for the privacy policy (build-time). If unset, Settings hides the external link. */
export const PRIVACY_POLICY_URL = (import.meta.env.VITE_PRIVACY_POLICY_URL as string | undefined)?.trim() ?? "";

/** Optional public URL for Terms of Service. If unset, welcome/setup links fall back to {@link PRIVACY_POLICY_URL} when that is a combined legal page. */
export const TERMS_OF_SERVICE_URL = (import.meta.env.VITE_TERMS_OF_SERVICE_URL as string | undefined)?.trim() ?? "";

/**
 * Bump when published Terms/Privacy change materially so first-run and upgraded users re-confirm on the privacy step.
 * Stored in settings as `acceptedLegalTermsVersion`.
 * **Playwright:** keep `e2e/helpers/appReady.ts` `E2E_LEGAL_TERMS_BUNDLE_VERSION` identical (Node cannot import this module).
 */
export const LEGAL_TERMS_BUNDLE_VERSION = "2026-06-25-gdpr-li";

/** Optional URL for product feedback (form, Discord, GitHub Discussions). Build-time; shown in Settings → Privacy when set. */
export const BETA_FEEDBACK_URL = (import.meta.env.VITE_BETA_FEEDBACK_URL as string | undefined)?.trim() ?? "";

/**
 * Solo sphere / launch splash dwell after the WebGL gate opens — **target ~3s** on screen with sphere.
 * (First-run setup card or per-launch splash dismiss uses this.)
 */
export const POST_WELCOME_SPHERE_MODAL_DELAY_MS = 3000;

export const POLL_INTERVAL_MS = 1000;
export const HEALTH_POLL_INTERVAL_MS = 5000;
/** Browser / quick dev probes. */
export const HEALTH_FAST_RETRIES = 20;
export const HEALTH_FAST_INTERVAL_MS = 350;
/** Packaged Electron: PyInstaller cold start can exceed 2 min (first launch unpack). Keep in sync with electron/constants.js. */
export const HEALTH_FAST_RETRIES_ELECTRON = 480;
export const HEALTH_FAST_INTERVAL_ELECTRON_MS = 500;

/** Suppress full-screen offline modal briefly after last good /health (busy backend blips). */
export const OFFLINE_STRIP_GRACE_MS = 30_000;

export const CONFIDENCE_HIGH = 0.8;
export const CONFIDENCE_LOW = 0.58;

/** Backend `UNCERTAIN_FOLDER` — keep in sync with `backend/constants.py`. */
export const UNCERTAIN_FOLDER = "Uncertain";

/** Matches `backend/entitlement_constants.FREE_TRIAL_DAYS`. */
export const FREE_TRIAL_DAYS = 30;

/** Upper bound for “All” messages — must match `backend/constants.GMAIL_EXPORT_MAX_MESSAGES` (``Number.MAX_SAFE_INTEGER``). */
export const GMAIL_EXPORT_MAX_MESSAGES = 9_007_199_254_740_991;

/**
 * Max file rows collected in a client-side recursive cloud merge walk (Drive workspace, etc.).
 * Must stay ≤ `backend/constants.py` `DRIVE_STREAM_PATH_CAP`.
 * Mirrors `electron/integrations/workspaceRecurseCaps.js` `WORKSPACE_CLOUD_RECURSE_MAX_FILES`.
 */
export const WORKSPACE_CLOUD_RECURSE_MAX_FILES = 50_000;

/**
 * Max folder listings (BFS) before stopping a merge walk — pairs with {@link WORKSPACE_CLOUD_RECURSE_MAX_FILES}.
 * Main-process integrations load the same pair from `workspaceRecurseCaps.js`.
 */
export const WORKSPACE_CLOUD_RECURSE_MAX_FOLDER_LISTINGS = 2_000;

/** sessionStorage: Home / Assistant shortcut queued opening the meeting recorder on Tasks. */
export const OPEN_MEETING_MODAL_SESSION_KEY = "exosites.deferred.openMeeting.v1";

/** sessionStorage: Home / Assistant shortcut queued starting activity capture on Memories → Activity. */
export const START_ACTIVITY_CAPTURE_SESSION_KEY = "exosites.deferred.startActivityCapture.v1";

