/**
 * Vault keys hidden from Memory UI, search, and chat prompts.
 * Keep in sync with backend/signal_quality/constants.py MEMORY_HIDDEN_FROM_UI_KEYS.
 */
export const HIDDEN_INTERNAL_MEMORY_KEYS = new Set(["startup_briefing_consent_v2"]);
