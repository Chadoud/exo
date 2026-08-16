import { describe, expect, it } from "vitest";
import { appendVoiceTurnMessages } from "./commitAssistantTurn";
import type { ConversationMessage } from "../../../hooks/useConversations";

describe("appendVoiceTurnMessages", () => {
  const baseContext = { briefingActive: false, msSinceBriefingEnded: 10_000 };

  it("creates separate assistant bubbles per voice turn (no merge)", () => {
    const prev: ConversationMessage[] = [
      {
        id: "whatsapp",
        role: "assistant",
        content: "I opened WhatsApp and searched for mom.",
        voiceSource: "send_message",
      },
    ];

    const next = appendVoiceTurnMessages(prev, {
      userText: "",
      assistantText: "Fetching your briefing now.",
      meta: { toolName: "run_startup_briefing", toolSource: "run_startup_briefing", briefingSection: "news" },
      briefingRunId: "run-1",
      recentAssistantLines: [prev[0].content],
      userCommitContext: baseContext,
      makeMessageId: () => "brief-1",
      nowIso: "2026-06-14T19:00:00.000Z",
    });

    expect(next).toHaveLength(2);
    expect(next[1].content).toBe("Fetching your briefing now.");
    expect(next[1].briefingSection).toBe("news");
    expect(next[1].briefingRunId).toBe("run-1");
  });

  it("does not merge briefing into a prior tool confirmation bubble", () => {
    const prev: ConversationMessage[] = [
      {
        id: "tool",
        role: "assistant",
        content: "I opened WhatsApp and searched for mom.",
        voiceSource: "send_message",
      },
    ];

    const next = appendVoiceTurnMessages(prev, {
      userText: "",
      assistantText: "Good evening sir. Breaking news today.",
      meta: { toolName: "run_startup_briefing", toolSource: "run_startup_briefing", briefingSection: "news" },
      briefingRunId: "run-2",
      recentAssistantLines: [],
      userCommitContext: baseContext,
      makeMessageId: () => "brief-2",
    });

    expect(next).toHaveLength(2);
    expect(next[0].content).toBe("I opened WhatsApp and searched for mom.");
    expect(next[1].voiceSource).toBe("run_startup_briefing");
  });

  it("commits server-authoritative user line when user_committed is true", () => {
    const next = appendVoiceTurnMessages([], {
      userText: "",
      assistantText: "",
      meta: {
        toolName: null,
        toolSource: null,
        briefingSection: null,
        serverTurn: {
          userText: "midi",
          assistantText: "Je l'ai ajouté à votre calendrier pour demain à midi.",
          userCommitted: true,
          dropReason: null,
        },
      },
      briefingRunId: null,
      recentAssistantLines: [],
      userCommitContext: baseContext,
      makeMessageId: () => "srv-1",
    });

    expect(next).toHaveLength(2);
    expect(next[0].role).toBe("user");
    expect(next[0].content).toBe("midi");
    expect(next[1].role).toBe("assistant");
  });

  it("skips user bubble when server marks user_committed false", () => {
    const next = appendVoiceTurnMessages([], {
      userText: " Also,",
      assistantText: "Okay.",
      meta: {
        toolName: null,
        toolSource: null,
        briefingSection: null,
        serverTurn: {
          userText: "",
          assistantText: "Okay.",
          userCommitted: false,
          dropReason: "junk",
        },
      },
      briefingRunId: null,
      recentAssistantLines: [],
      userCommitContext: baseContext,
      makeMessageId: () => "srv-2",
    });

    expect(next).toHaveLength(1);
    expect(next[0].role).toBe("assistant");
  });

  it("skips duplicate back-to-back user bubbles (typed optimistic + voice commit)", () => {
    const typed = "List my calendar events titled WORK this month, then delete them all.";
    const prev: ConversationMessage[] = [
      {
        id: "u1",
        role: "user",
        content: typed,
        voiceSource: "typed",
      },
    ];

    const next = appendVoiceTurnMessages(prev, {
      userText: "",
      assistantText: "On it.",
      meta: {
        toolName: null,
        toolSource: null,
        briefingSection: null,
        serverTurn: {
          userText: typed,
          assistantText: "On it.",
          userCommitted: true,
          dropReason: null,
        },
      },
      briefingRunId: null,
      recentAssistantLines: [],
      userCommitContext: baseContext,
      makeMessageId: () => "srv-dedupe",
    });

    expect(next).toHaveLength(2);
    expect(next[0].content).toBe(typed);
    expect(next[1].role).toBe("assistant");
  });

  it("skips duplicate back-to-back assistant recap bubbles", () => {
    const recap =
      "demain à 15:00, 1 heure — Go by the lake. Je crée l'événement ?";
    const prev: ConversationMessage[] = [
      {
        id: "a1",
        role: "assistant",
        content: recap,
        voiceSource: "google_workspace",
      },
    ];

    const next = appendVoiceTurnMessages(prev, {
      userText: "",
      assistantText: recap,
      meta: { toolName: null, toolSource: null, briefingSection: null },
      briefingRunId: null,
      recentAssistantLines: [recap],
      userCommitContext: baseContext,
      makeMessageId: () => "dup-1",
    });

    expect(next).toHaveLength(1);
  });

  it("does not persist [BRIEFING:] injection text as chat content", () => {
    const next = appendVoiceTurnMessages([], {
      userText: "",
      assistantText:
        "[BRIEFING: MAIL — From: a@b.com — Subject: secret — Preview: invoice]\n[/BRIEFING: MAIL]",
      meta: {
        toolName: "run_startup_briefing",
        toolSource: "run_startup_briefing",
        briefingSection: "mail",
      },
      briefingRunId: "run-sec",
      recentAssistantLines: [],
      userCommitContext: baseContext,
      makeMessageId: () => "inj-1",
    });
    expect(next).toHaveLength(1);
    expect(next[0].content.startsWith("[BRIEFING:")).toBe(false);
    expect(next[0].briefingOutcome).toBe("empty_captions");
    expect(next[0].briefingSection).toBe("mail");
  });

  it("writes empty_captions when a briefing turn has no assistant text", () => {
    const next = appendVoiceTurnMessages([], {
      userText: "",
      assistantText: "",
      meta: {
        toolName: "run_startup_briefing",
        toolSource: "run_startup_briefing",
        briefingSection: "weather",
      },
      briefingRunId: "run-empty",
      recentAssistantLines: [],
      userCommitContext: baseContext,
      makeMessageId: () => "empty-1",
    });
    expect(next).toHaveLength(1);
    expect(next[0].briefingOutcome).toBe("empty_captions");
    expect(next[0].content).toBe("");
  });

  it("skips near-duplicate calendar recaps that only repeat the time in the title", () => {
    const first =
      "demain à 15h, 1 heure — Bord du lac avec Alexandre. Je crée l'événement ?";
    const second =
      "demain à 15h, 1 heure — Bord du lac avec Alexandre à 15h. Je crée l'événement ?";
    const prev: ConversationMessage[] = [
      {
        id: "a1",
        role: "assistant",
        content: first,
        voiceSource: "google_workspace",
      },
    ];

    const next = appendVoiceTurnMessages(prev, {
      userText: "",
      assistantText: second,
      meta: { toolName: null, toolSource: null, briefingSection: null },
      briefingRunId: null,
      recentAssistantLines: [first],
      userCommitContext: baseContext,
      makeMessageId: () => "dup-2",
    });

    expect(next).toHaveLength(1);
  });
});
