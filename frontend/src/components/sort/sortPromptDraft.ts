import { SORT_PROMPT_DRAFT_STORAGE_KEY } from "../../constants";

/**
 * Unsaved custom sort instructions.
 *
 * The editor unmounts constantly — leaving Settings, collapsing the section,
 * switching sort mode — and its Save button is the only thing allowed to touch
 * `sortSystemPrompt`, since that value is what the classifier actually runs.
 * Parking the draft here keeps typing safe without letting it go live.
 */

export function readSortPromptDraft(): string | null {
  try {
    return localStorage.getItem(SORT_PROMPT_DRAFT_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function writeSortPromptDraft(draft: string): void {
  try {
    localStorage.setItem(SORT_PROMPT_DRAFT_STORAGE_KEY, draft);
  } catch {
    // Storage full or blocked — the draft is a convenience, not a contract.
  }
}

export function clearSortPromptDraft(): void {
  try {
    localStorage.removeItem(SORT_PROMPT_DRAFT_STORAGE_KEY);
  } catch {
    // Nothing to do; a stale draft is discarded on the next Save or Revert.
  }
}
