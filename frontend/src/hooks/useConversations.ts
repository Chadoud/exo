import { useSyncExternalStore } from "react";
import { randomHexId } from "../utils/randomHexId";
import { maybeDistill, mirrorConversation } from "../assistant/conversationSync";
import { repairConversationMessages } from "../features/assistant/chat/splitMergedVoiceMessages";
import { coerceMessageContent } from "../utils/coerceMessageContent";

// ── Types ──────────────────────────────────────────────────────────────────────

import type { CalendarDeleteDraft } from "../utils/calendarDeleteConfirm";

export interface ConversationMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
  prefetching?: boolean;
  mailRecap?: boolean;
  /** Mail manage action (block/filter/move). */
  mailManage?: boolean;
  /** Fetched calendar listing (structured sections, no LLM). */
  calendarContext?: boolean;
  /** Deeplinks for a write-intent response (create/edit not supported, open provider instead). */
  calendarWriteLinks?: Array<{ provider: string; label: string; url: string; logoSrc: string }>;
  /**
   * Structured event draft for the interactive creation card.
   * Stored so the card can rehydrate its form after localStorage restore.
   */
  calendarEventDraft?: {
    title: string;
    startIso: string;
    endIso?: string;
    sourceText?: string;
    awaitingConfirm?: boolean;
    /** Null means all providers should be shown (no bridge / unavailable). */
    connectedProviderIds: string[] | null;
    toolName?: string;
  };
  /** Structured delete draft for recurring scope confirmation chips. */
  calendarDeleteDraft?: CalendarDeleteDraft;
  /** Deeplinks for a mail compose intent. */
  mailComposeLinks?: Array<{ provider: string; label: string; url: string; logoSrc: string }>;
  mailComposeDraft?: {
    subject: string;
    to: string;
    body: string;
    connectedProviderIds: string[] | null;
  };
  /** Set when the message is an autonomous agent task card. */
  agentGoal?: string;
  /** Backend task ID returned by POST /agent/task. Set after submission. */
  agentTaskId?: string;
  /** Codegen Studio session id (POST /codegen/session). */
  codegenSessionId?: string;
  /** Marker — content is __codegen_studio__ for in-chat progress card. */
  codegenGoal?: string;
  /** Internal marker — "content" is __agent_task__ for these messages. */
  createdAt?: string;
  /** Tool name that produced this voice response (e.g. "send_message"). Drives brand icon in chat. */
  voiceSource?: string | null;
  /** Briefing pipeline section when this bubble is part of a startup briefing run. */
  briefingSection?: string | null;
  /** Groups briefing section bubbles from the same run_startup_briefing invocation. */
  briefingRunId?: string | null;
  /**
   * Closed briefing outcome for muted i18n bodies.
   * Omit or `spoken` = full-weight gist in `content`.
   */
  briefingOutcome?:
    | "spoken"
    | "skipped_fail"
    | "skipped_reconnect"
    | "nothing"
    | "empty_captions"
    | "aborted"
    | "dropped"
    | null;
  /** Plain tasks-honesty line (no briefing header). */
  briefingTasksHonesty?: boolean;
  /** Assistant reply explaining that the local app service is required for this request. */
  localAppServiceHint?: boolean;
  /** Inline image from composer attach (preview only; content stays a short caption). */
  imageAttachment?: { name: string; dataUrl: string };
  /** Document attach meta (extracted text lives in content for the model). */
  documentAttachment?: {
    name: string;
    pages?: number | null;
    truncated?: boolean;
    source?: string;
    /** First-page preview when available (PDF). */
    previewDataUrl?: string;
  };
}

/** Hidden tool results kept for memory origin linking (not shown in chat UI). */
export interface ConversationToolContext {
  name: string;
  content: string;
}

export interface Conversation {
  id: string;
  /** Auto-derived from the first user message, editable. */
  title: string;
  messages: ConversationMessage[];
  /** Trimmed mail/calendar tool JSON for distillation origin catalog. */
  toolContext?: ConversationToolContext[];
  createdAt: number;
  updatedAt: number;
  /**
   * Auto-generated rolling summary of earlier turns, produced in the background
   * when the conversation exceeds a length threshold. Injected into the system
   * prompt so the model stays oriented even after the sliding history window
   * has moved past the opening exchanges.
   */
  summary?: string;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const STORAGE_KEY = "assistant_conversations_v1";
const MAX_CONVERSATIONS = 50;
const MAX_TOOL_CONTEXT = 24;
const MAX_MESSAGE_CONTENT_BYTES = 8_192;
const UNTITLED_TITLE = "New conversation";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Random id for conversations and assistant messages (stable across HMR and non-colliding with persisted rows). */
export function makeId(): string {
  return randomHexId();
}

/**
 * Repairs persisted or in-memory message lists where duplicate `id` values
 * break React reconciliation (e.g. legacy `m-1` counters or double-appends).
 */
function ensureDistinctMessageIds(messages: ConversationMessage[]): ConversationMessage[] {
  const seen = new Set<string>();
  const out: ConversationMessage[] = [];
  for (const m of messages) {
    let id = typeof m.id === "string" ? m.id : "";
    if (!id || seen.has(id)) {
      id = makeId();
    }
    seen.add(id);
    out.push(id === m.id ? m : { ...m, id });
  }
  return out;
}

/** Distinct ids + split legacy merged voice assistant blobs. */
function sanitizeConversationMessage(msg: ConversationMessage): ConversationMessage {
  return { ...msg, content: coerceMessageContent(msg.content) };
}

export function normalizeConversationMessages(messages: ConversationMessage[]): ConversationMessage[] {
  return ensureDistinctMessageIds(
    repairConversationMessages(messages.map(sanitizeConversationMessage)),
  );
}

function persistedMessagesFingerprint(messages: ConversationMessage[]): string {
  return JSON.stringify(
    normalizeConversationMessages(messages.filter((m) => !m.streaming && !m.prefetching)),
  );
}

/** True when non-streaming message lists match after normalize (avoids redundant store writes). */
export function conversationPersistedMessagesEqual(
  a: ConversationMessage[],
  b: ConversationMessage[],
): boolean {
  return persistedMessagesFingerprint(a) === persistedMessagesFingerprint(b);
}

function trimMessageContent(msg: ConversationMessage): ConversationMessage {
  if (
    typeof msg.content === "string" &&
    new TextEncoder().encode(msg.content).length > MAX_MESSAGE_CONTENT_BYTES
  ) {
    return { ...msg, content: msg.content.slice(0, MAX_MESSAGE_CONTENT_BYTES) + "…" };
  }
  return msg;
}

function sanitizeForStorage(convs: Conversation[]): Conversation[] {
  return convs.map((c) => ({
    ...c,
    // Drop transient streaming flags before persisting
    messages: c.messages
      .filter((m) => !m.streaming && !m.prefetching)
      .map(trimMessageContent),
  }));
}

function loadFromStorage(): Conversation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (c) =>
          typeof c.id === "string" &&
          typeof c.title === "string" &&
          Array.isArray(c.messages)
      )
      .map((c) => ({
        ...c,
        messages: normalizeConversationMessages(c.messages as ConversationMessage[]),
      }));
  } catch {
    return [];
  }
}

function saveToStorage(convs: Conversation[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitizeForStorage(convs)));
  } catch {
    // Quota or private browsing — silently ignore
  }
}

function deriveTitleFromText(text: string): string {
  return text.trim().slice(0, 40) || UNTITLED_TITLE;
}

function makeBlankConversation(): Conversation {
  const now = Date.now();
  return {
    id: makeId(),
    title: UNTITLED_TITLE,
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
}

function initialConversations(): { conversations: Conversation[]; activeId: string } {
  const stored = loadFromStorage();
  if (stored.length > 0) {
    return { conversations: stored, activeId: stored[0].id };
  }
  const blank = makeBlankConversation();
  return { conversations: [blank], activeId: blank.id };
}

// ── Hook ──────────────────────────────────────────────────────────────────────

interface UseConversationsReturn {
  conversations: Conversation[];
  activeId: string;
  active: Conversation;
  create: () => void;
  remove: (id: string) => void;
  rename: (id: string, title: string) => void;
  updateMessages: (id: string, msgs: ConversationMessage[]) => void;
  appendToolContext: (id: string, entry: ConversationToolContext) => void;
  updateSummary: (id: string, summary: string) => void;
  setActive: (id: string) => void;
}

// ── Shared store ────────────────────────────────────────────────────────────
//
// A single process-wide store backs every `useConversations()` caller so the
// Exo HUD and the Assistant tab read and write the SAME conversation list.
// Previously each caller held independent `useState`, so a message sent in one
// surface was invisible to the other and concurrent writes to the shared
// localStorage key clobbered each other.

interface ConversationsState {
  conversations: Conversation[];
  activeId: string;
}

let storeState: ConversationsState | null = null;
const listeners = new Set<() => void>();

function getState(): ConversationsState {
  if (storeState === null) {
    const init = initialConversations();
    storeState = { conversations: init.conversations, activeId: init.activeId };
  }
  return storeState;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Replace the store and notify subscribers. A returned-equal state is a no-op. */
function setState(updater: (state: ConversationsState) => ConversationsState): void {
  const current = getState();
  const next = updater(current);
  if (next === current) return;
  storeState = next;
  for (const listener of listeners) listener();
}

function createConversation(): void {
  const blank = makeBlankConversation();
  setState((state) => {
    // Distill the conversation being left before opening a fresh one.
    maybeDistill(state.conversations.find((c) => c.id === state.activeId));
    const capped = state.conversations.slice(0, MAX_CONVERSATIONS - 1);
    const next = [blank, ...capped];
    saveToStorage(next);
    return { conversations: next, activeId: blank.id };
  });
}

function removeConversation(id: string): void {
  setState((state) => {
    // Capture knowledge before the conversation is discarded locally.
    maybeDistill(state.conversations.find((c) => c.id === id));
    const next = state.conversations.filter((c) => c.id !== id);
    let activeId = state.activeId;
    if (id === activeId) {
      if (next.length === 0) {
        const blank = makeBlankConversation();
        saveToStorage([blank]);
        return { conversations: [blank], activeId: blank.id };
      }
      activeId = next[0].id;
    }
    saveToStorage(next);
    return { conversations: next, activeId };
  });
}

function renameConversation(id: string, title: string): void {
  setState((state) => {
    const next = state.conversations.map((c) =>
      c.id === id ? { ...c, title: title.trim() || UNTITLED_TITLE, updatedAt: Date.now() } : c
    );
    saveToStorage(next);
    return { ...state, conversations: next };
  });
}

function updateConversationMessages(id: string, msgs: ConversationMessage[]): void {
  const normalized = normalizeConversationMessages(msgs);
  setState((state) => {
    const conv = state.conversations.find((c) => c.id === id);
    if (!conv) return state;
    if (conversationPersistedMessagesEqual(conv.messages, normalized)) return state;
    const firstUser = normalized.find((m) => m.role === "user");
    const newTitle =
      conv.title === UNTITLED_TITLE && firstUser
        ? deriveTitleFromText(firstUser.content)
        : conv.title;
    const updated = { ...conv, title: newTitle, messages: normalized, updatedAt: Date.now() };
    const next = state.conversations.map((c) => (c.id === id ? updated : c));
    saveToStorage(next);
    // Best-effort durable mirror (debounced) so the assistant can recall it later.
    mirrorConversation(updated);
    return { ...state, conversations: next };
  });
}

function appendConversationToolContext(id: string, entry: ConversationToolContext): void {
  const name = entry.name.trim();
  const content = entry.content.trim();
  if (!name || !content) return;
  setState((state) => {
    const conv = state.conversations.find((c) => c.id === id);
    if (!conv) return state;
    const prev = conv.toolContext ?? [];
    const deduped = prev.filter((t) => !(t.name === name && t.content === content));
    const toolContext = [...deduped, { name, content }].slice(-MAX_TOOL_CONTEXT);
    const updated = { ...conv, toolContext, updatedAt: Date.now() };
    const next = state.conversations.map((c) => (c.id === id ? updated : c));
    saveToStorage(next);
    mirrorConversation(updated);
    return { ...state, conversations: next };
  });
}

function updateConversationSummary(id: string, summary: string): void {
  setState((state) => {
    const next = state.conversations.map((c) =>
      c.id === id ? { ...c, summary, updatedAt: Date.now() } : c
    );
    saveToStorage(next);
    return { ...state, conversations: next };
  });
}

function setActiveConversation(id: string): void {
  setState((state) => {
    if (state.activeId === id) return state;
    // Distill the conversation the user is leaving.
    maybeDistill(state.conversations.find((c) => c.id === state.activeId));
    return { ...state, activeId: id };
  });
}

/**
 * Drop in-memory + localStorage chat state when the account vault remounts.
 * Clearing localStorage alone is not enough — the module store would rewrite prior chats.
 */
export function resetConversationsStore(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  const blank = makeBlankConversation();
  storeState = { conversations: [blank], activeId: blank.id };
  for (const listener of listeners) listener();
}

/** Test helper — inspect shared store without mounting React. */
export function getConversationsStoreSnapshotForTests(): ConversationsState {
  return getState();
}

/** Test helper — seed shared store + localStorage. */
export function seedConversationsStoreForTests(state: ConversationsState): void {
  storeState = state;
  saveToStorage(state.conversations);
  for (const listener of listeners) listener();
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useConversations(): UseConversationsReturn {
  const state = useSyncExternalStore(subscribe, getState, getState);

  const active =
    state.conversations.find((c) => c.id === state.activeId) ??
    state.conversations[0] ??
    makeBlankConversation();

  return {
    conversations: state.conversations,
    activeId: state.activeId,
    active,
    create: createConversation,
    remove: removeConversation,
    rename: renameConversation,
    updateMessages: updateConversationMessages,
    appendToolContext: appendConversationToolContext,
    updateSummary: updateConversationSummary,
    setActive: setActiveConversation,
  };
}