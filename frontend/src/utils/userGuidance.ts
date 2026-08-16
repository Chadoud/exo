import { toast } from "sonner";
import { APP_DISPLAY_NAME, BACKEND_PORT } from "../constants";
import { formatError } from "./formatError";
import { isFreeTierQuotaError } from "./quotaToast";
import { isProductDebugEnabled } from "./productDebugAccess";

/** Strip port numbers and dev API paths from user-visible error detail. */
function formatUserBackendDetail(detail: string): string {
  if (import.meta.env.DEV || isProductDebugEnabled()) return detail;
  const low = detail.toLowerCase();
  if (
    low.includes("cannot reach the api") ||
    low.includes("failed to fetch") ||
    low.includes("fetch failed")
  ) {
    return `${APP_DISPLAY_NAME} could not reach the local assistant service yet.`;
  }
  return detail.replace(new RegExp(`127\\.0\\.0\\.1:${BACKEND_PORT}|localhost:${BACKEND_PORT}`, "g"), "the local service");
}

/**
 * Identifies the settings section or recovery action that fixes the error.
 * Consumers map these to navigation callbacks so toasts / inline errors get
 * a concrete "Fix it" button.
 *
 * settings:ai-provider  → Settings → AI Provider (enter Gemini key)
 * settings:models       → Settings → Models (install / select Ollama model)
 * backend:retry         → Title-bar Retry (restarts the Python process)
 * os:microphone         → OS-level privacy settings (no in-app target)
 */
export type ErrorActionId =
  | "settings:ai-provider"
  | "settings:models"
  | "backend:retry"
  | "os:microphone";

/** Detail, hint copy, and an optional action ID for a contextual "Fix it" button. */
export function userFacingErrorDetail(e: unknown): {
  detail: string;
  hint?: string;
  actionId?: ErrorActionId;
} {
  const detail = formatError(e);
  const low = detail.toLowerCase();

  if (
    low.includes("failed to fetch") ||
    low.includes("fetch failed") ||
    low.includes("networkerror") ||
    low.includes("load failed") ||
    low.includes("network error") ||
    low.includes("cannot reach the api") ||
    (e instanceof TypeError && low.includes("fetch"))
  ) {
    const hint = import.meta.env.DEV || isProductDebugEnabled()
      ? "If the title bar shows API offline, click Retry (restarts the local API in the desktop app). In dev with SKIP_BACKEND=1, run uvicorn on 127.0.0.1 yourself."
      : `${APP_DISPLAY_NAME} is still starting on this computer. This can take up to two minutes — wait a moment, or tap Restart service.`;
    return { detail: formatUserBackendDetail(detail), hint, actionId: "backend:retry" as const };
  }

  if (low.includes("ollama") && (low.includes("refused") || low.includes("connection") || low.includes("econnrefused"))) {
    return {
      detail,
      hint: "Start the Ollama app on this computer, then open Settings and use Refresh models.",
      actionId: "settings:models",
    };
  }

  if (
    (low.includes("model") && (low.includes("not found") || low.includes("missing") || low.includes("pull"))) ||
    (low.includes("no such file") && low.includes("model"))
  ) {
    return {
      detail,
      hint: "Choose another model in Settings, or download one from the catalog after Ollama is running.",
      actionId: "settings:models",
    };
  }

  if (
    isFreeTierQuotaError(detail) ||
    (low.includes("resource_exhausted") && (low.includes("429") || low.includes("quota"))) ||
    low.includes("free gemini api limit reached")
  ) {
    return {
      detail: low.includes("free gemini api limit reached")
        ? detail
        : "Gemini API limit reached",
      hint:
        "You've hit the free Gemini API limit. Add a paid API key in Settings → AI agents → AI provider for reliable voice and chat.",
      actionId: "settings:ai-provider",
    };
  }

  if (
    low.includes("could not sync") &&
    low.includes("gemini") &&
    (low.includes("voice backend") || low.includes("voice"))
  ) {
    return {
      detail,
      hint: "Open Settings → AI agents → AI provider and save your Gemini key again, then retry voice.",
      actionId: "settings:ai-provider",
    };
  }

  // Gemini / Google AI API key errors — covers both "not configured" (our own
  // backend message) and live API rejections like "1007 … API key not valid".
  if (
    low.includes("gemini_api_key not configured") ||
    low.includes("gemini api key") ||
    (low.includes("gemini") && low.includes("api key")) ||
    (low.includes("gemini") && low.includes("key") && low.includes("voice")) ||
    low.includes("api key not valid") ||
    low.includes("please pass a valid api key") ||
    low.includes("api_key_invalid") ||
    low.includes("invalid api key") ||
    // Gemini Live status code 1007 = API key rejected
    (low.includes("1007") && (low.includes("api key") || low.includes("none")))
  ) {
    return {
      detail,
      hint: "Your Gemini API key is missing or invalid. Add or update it in Settings → AI agents → AI provider. Get a free key at aistudio.google.com.",
      actionId: "settings:ai-provider",
    };
  }

  // Microphone / audio device errors from getUserMedia
  if (
    low.includes("notallowederror") ||
    low.includes("permission denied") ||
    (low.includes("permission") && low.includes("microphone"))
  ) {
    return {
      detail,
      hint: "Microphone access was denied. Allow it in your OS system preferences (Privacy → Microphone) and in the app, then try again.",
      actionId: "os:microphone",
    };
  }

  if (
    low.includes("notfounderror") ||
    low.includes("requested device not found") ||
    low.includes("could not start audio") ||
    (low.includes("devicenotfound") && low.includes("audio"))
  ) {
    return {
      detail,
      hint: "No microphone was found. Connect an audio input device and try again.",
      actionId: "os:microphone",
    };
  }

  if (low.includes("notreadableerror") || low.includes("track ended") || low.includes("hardware")) {
    return {
      detail,
      hint: "The microphone is in use by another application or hardware error. Close other audio apps and try again.",
      actionId: "os:microphone",
    };
  }

  if (
    low.includes("no execution context") ||
    low.includes("audiocontext") ||
    low.includes("audioworklet") ||
    low.includes("could not start (state")
  ) {
    return {
      detail,
      hint: "Audio could not start. Try clicking the microphone button again — the browser requires a user gesture to activate audio. If the problem persists, reload the app.",
    };
  }

  // WebSocket / voice backend errors — often caused by missing Gemini key
  if (
    low.includes("websocket connection failed") ||
    (low.includes("websocket") && low.includes("backend")) ||
    low.includes("gemini_api_key not configured")
  ) {
    return {
      detail,
      hint: `Voice requires a Gemini API key and the local backend on port ${BACKEND_PORT}. Check Settings → AI agents → AI provider, then try again.`,
      actionId: "settings:ai-provider",
    };
  }

  return { detail };
}

/**
 * Return the action ID for an error without formatting the full detail string.
 * Useful when the component wants to render its own UI and only needs to know
 * which settings section would fix the problem.
 */
export function errorActionId(e: unknown): ErrorActionId | undefined {
  return userFacingErrorDetail(e).actionId;
}

interface ToastErrorOptions {
  /** Contextual "Fix it" button to render inside the toast. */
  action?: { label: string; onClick: () => void };
}

export interface ToastAppErrorOptions {
  description?: string;
  duration?: number;
  id?: string | number;
  action?: { label: string; onClick: () => void };
}

/** White surface + solid red — not Sonner's light pink error palette. */
const ERROR_TOAST_SURFACE = {
  background: "#ffffff",
  border: "2px solid #dc2626",
  color: "#dc2626",
} as const;

/** Standard app error toast — short title, optional description, optional action. */
export function toastAppError(title: string, options?: ToastAppErrorOptions): void {
  const description = options?.description;
  toast.error(title, {
    description,
    duration: options?.duration ?? (description ? 11_000 : 7_000),
    richColors: false,
    classNames: { toast: "app-sonner-toast-error" },
    style: ERROR_TOAST_SURFACE,
    id: options?.id,
    ...(options?.action ? { action: options.action } : {}),
  });
}

/** Use with Sonner: title stays short; detail + optional hint in description. */
export function toastUserError(title: string, e: unknown, options?: ToastErrorOptions) {
  const { detail, hint, actionId } = userFacingErrorDetail(e);
  const action = options?.action;
  toastAppError(title, {
    description: hint ? `${detail}\n\n${hint}` : detail,
    duration: hint ? 11_000 : 7000,
    ...(action || actionId
      ? {
          action: action
            ? { label: action.label, onClick: action.onClick }
            : undefined,
        }
      : {}),
  });
}

export function inlineErrorMessage(e: unknown): string {
  const { detail, hint } = userFacingErrorDetail(e);
  return hint ? `${detail} — ${hint}` : detail;
}
