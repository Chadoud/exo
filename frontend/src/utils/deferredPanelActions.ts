import {
  MEMORY_HIGHLIGHT_SESSION_KEY,
  MEMORY_NEEDS_REVIEW_SESSION_KEY,
  OPEN_MEETING_MODAL_SESSION_KEY,
  OPEN_WHATSAPP_SETUP_SESSION_KEY,
  START_ACTIVITY_CAPTURE_SESSION_KEY,
  TODO_NAV_QUEUE_SESSION_KEY,
} from "../constants";
import type { TodoSubTab } from "./todoUi";
import {
  consumeChatDraft,
  queueChatDraft,
  type ChatDraftTarget,
} from "./chatComposerDraft";

export type { ChatDraftTarget };
export { consumeChatDraft, queueChatDraft };

/** Navigate to Memory → Overview with needs-review filter on next mount. */
export function queueMemoryNeedsReview(): void {
  try {
    sessionStorage.setItem(MEMORY_NEEDS_REVIEW_SESSION_KEY, "1");
  } catch {
    /* ignore */
  }
}

/** Returns true once per queued needs-review intent; clears the flag. */
export function consumeMemoryNeedsReview(): boolean {
  try {
    if (sessionStorage.getItem(MEMORY_NEEDS_REVIEW_SESSION_KEY) !== "1") return false;
    sessionStorage.removeItem(MEMORY_NEEDS_REVIEW_SESSION_KEY);
    return true;
  } catch {
    return false;
  }
}

/** Navigate to Memory → Overview and scroll to a memory row on next mount. */
export function queueHighlightMemory(memoryId: number): void {
  try {
    sessionStorage.setItem(MEMORY_HIGHLIGHT_SESSION_KEY, String(memoryId));
  } catch {
    /* ignore */
  }
}

/** Returns queued memory id once; clears the flag. */
export function consumeHighlightMemory(): number | null {
  try {
    const raw = sessionStorage.getItem(MEMORY_HIGHLIGHT_SESSION_KEY);
    sessionStorage.removeItem(MEMORY_HIGHLIGHT_SESSION_KEY);
    if (!raw) return null;
    const id = Number.parseInt(raw, 10);
    return Number.isFinite(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}

/** Navigate to To Do sub-tab once the workspace is ready. */
export function queueTodoSubTab(subTab: TodoSubTab): void {
  try {
    sessionStorage.setItem(TODO_NAV_QUEUE_SESSION_KEY, subTab);
  } catch {
    /* ignore */
  }
}

/** Returns queued sub-tab once; clears the flag. */
export function consumeQueuedTodoSubTab(): TodoSubTab | null {
  try {
    const value = sessionStorage.getItem(TODO_NAV_QUEUE_SESSION_KEY);
    sessionStorage.removeItem(TODO_NAV_QUEUE_SESSION_KEY);
    if (value === "upcoming") {
      return "today";
    }
    if (value === "replies") {
      return "today";
    }
    if (value === "today" || value === "inbox" || value === "done") {
      return value;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/** Navigate to External sources, then open the WhatsApp Business API setup modal. */
export function queueOpenWhatsAppSetup(): void {
  try {
    sessionStorage.setItem(OPEN_WHATSAPP_SETUP_SESSION_KEY, "1");
  } catch {
    /* ignore */
  }
}

/** Returns true once per queued WhatsApp setup intent; clears the flag. */
export function consumeOpenWhatsAppSetup(): boolean {
  try {
    if (sessionStorage.getItem(OPEN_WHATSAPP_SETUP_SESSION_KEY) !== "1") return false;
    sessionStorage.removeItem(OPEN_WHATSAPP_SETUP_SESSION_KEY);
    return true;
  } catch {
    return false;
  }
}

/** Navigate to Tasks, then open the meeting recorder once the panel is ready. */
export function queueOpenMeetingModal(): void {
  try {
    sessionStorage.setItem(OPEN_MEETING_MODAL_SESSION_KEY, "1");
  } catch {
    /* ignore */
  }
}

/** Returns true once per queued meeting intent; clears the flag. */
export function consumeOpenMeetingModal(): boolean {
  try {
    if (sessionStorage.getItem(OPEN_MEETING_MODAL_SESSION_KEY) !== "1") return false;
    sessionStorage.removeItem(OPEN_MEETING_MODAL_SESSION_KEY);
    return true;
  } catch {
    return false;
  }
}

/** Navigate to Memories → Activity, then start capture when prerequisites are met. */
export function queueStartActivityCapture(): void {
  try {
    sessionStorage.setItem(START_ACTIVITY_CAPTURE_SESSION_KEY, "1");
  } catch {
    /* ignore */
  }
}

/** Returns true once per queued capture intent; clears the flag. */
export function consumeStartActivityCapture(): boolean {
  try {
    if (sessionStorage.getItem(START_ACTIVITY_CAPTURE_SESSION_KEY) !== "1") return false;
    sessionStorage.removeItem(START_ACTIVITY_CAPTURE_SESSION_KEY);
    return true;
  } catch {
    return false;
  }
}
