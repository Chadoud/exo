import { describe, expect, it } from "vitest";
import {
  conversationPersistedMessagesEqual,
  normalizeConversationMessages,
  type ConversationMessage,
} from "./useConversations";

describe("conversationPersistedMessagesEqual", () => {
  const base: ConversationMessage[] = [
    { id: "u1", role: "user", content: "Hello" },
    { id: "a1", role: "assistant", content: "Hi there" },
  ];

  it("returns true for identical persisted lists", () => {
    expect(conversationPersistedMessagesEqual(base, [...base])).toBe(true);
  });

  it("returns false when content differs", () => {
    const changed = base.map((m) => (m.id === "a1" ? { ...m, content: "Changed" } : m));
    expect(conversationPersistedMessagesEqual(base, changed)).toBe(false);
  });

  it("drops ephemeral streaming bubbles from comparison", () => {
    const withStreamingTail: ConversationMessage[] = [
      ...base,
      { id: "a2", role: "assistant", content: "partial…", streaming: true },
    ];
    expect(conversationPersistedMessagesEqual(base, withStreamingTail)).toBe(true);
  });

  it("treats a store write of normalized local messages as equal (no persist loop)", () => {
    const stored = normalizeConversationMessages(base);
    expect(conversationPersistedMessagesEqual(stored, base)).toBe(true);
    expect(conversationPersistedMessagesEqual(stored, normalizeConversationMessages(stored))).toBe(
      true,
    );
  });
});
