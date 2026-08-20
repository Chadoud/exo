import { describe, expect, it } from "vitest";
import {
  AUTO_MEMORY_HIDDEN_NOISE_THRESHOLD,
  countHiddenUnreviewedSuggestions,
  countNeedsReview,
  formatMemorySourceLine,
  groupMemoryEntriesByProvenance,
  isPromptVisibleMemory,
  isHiddenInternalMemory,
  isSystemManagedMemory,
  memoryEntryMatchesFilter,
  memoryKeyFromText,
  memoryProvenanceGroup,
  promotionalCandidateIds,
  splitHighlightSegments,
  systemMemoryLabelKey,
} from "./memoryUi";
import type { ScopedMemoryEntry } from "../api/memory";

function entry(partial: Partial<ScopedMemoryEntry> & Pick<ScopedMemoryEntry, "id">): ScopedMemoryEntry {
  return {
    id: partial.id,
    category: partial.category ?? "notes",
    key: partial.key ?? "key",
    value: partial.value ?? "value",
    source: partial.source ?? "manual",
    reviewed: partial.reviewed ?? true,
    conversation_id: partial.conversation_id ?? null,
    updated_at: partial.updated_at ?? "2026-01-01T00:00:00Z",
    provenance: partial.provenance,
    noise_score: partial.noise_score,
    archived_at: partial.archived_at,
    origin_kind: partial.origin_kind,
    origin_ref: partial.origin_ref,
    origin_url: partial.origin_url,
    origin_label: partial.origin_label,
    linked_task_id: partial.linked_task_id,
  };
}

describe("isPromptVisibleMemory", () => {
  it("shows manual and reviewed auto rows", () => {
    expect(isPromptVisibleMemory(entry({ id: 1, source: "manual" }))).toBe(true);
    expect(isPromptVisibleMemory(entry({ id: 2, source: "auto", reviewed: true }))).toBe(true);
  });

  it("hides unreviewed auto rows at or above noise threshold", () => {
    expect(
      isPromptVisibleMemory(
        entry({ id: 3, source: "auto", reviewed: false, noise_score: AUTO_MEMORY_HIDDEN_NOISE_THRESHOLD }),
      ),
    ).toBe(false);
  });
});

describe("memoryEntryMatchesFilter", () => {
  it("maps all to prompt-visible entries only", () => {
    expect(memoryEntryMatchesFilter(entry({ id: 1, source: "manual" }), "all")).toBe(true);
    expect(
      memoryEntryMatchesFilter(
        entry({ id: 2, source: "auto", reviewed: false, noise_score: 0.5 }),
        "all",
      ),
    ).toBe(false);
    expect(
      memoryEntryMatchesFilter(entry({ id: 3, source: "auto", reviewed: false, noise_score: 0.1 }), "all"),
    ).toBe(true);
  });

  it("maps aboutYou to identity, preferences, relationships", () => {
    expect(memoryEntryMatchesFilter(entry({ id: 1, category: "identity" }), "aboutYou")).toBe(true);
    expect(memoryEntryMatchesFilter(entry({ id: 2, category: "projects" }), "aboutYou")).toBe(false);
  });

  it("maps work to projects and context", () => {
    expect(memoryEntryMatchesFilter(entry({ id: 1, category: "projects" }), "work")).toBe(true);
    expect(memoryEntryMatchesFilter(entry({ id: 2, category: "notes" }), "work")).toBe(false);
  });

  it("maps needsReview to auto unreviewed entries below triage threshold", () => {
    expect(
      memoryEntryMatchesFilter(entry({ id: 1, source: "auto", reviewed: false }), "needsReview"),
    ).toBe(true);
    expect(
      memoryEntryMatchesFilter(
        entry({ id: 2, source: "auto", reviewed: false, noise_score: AUTO_MEMORY_HIDDEN_NOISE_THRESHOLD }),
        "needsReview",
      ),
    ).toBe(false);
    expect(
      memoryEntryMatchesFilter(entry({ id: 3, source: "auto", reviewed: true }), "needsReview"),
    ).toBe(false);
  });
});

describe("countHiddenUnreviewedSuggestions", () => {
  it("counts noisy unreviewed auto rows", () => {
    const entries = [
      entry({ id: 1, source: "auto", reviewed: false, noise_score: 0.5 }),
      entry({ id: 2, source: "auto", reviewed: false, noise_score: 0.1 }),
      entry({ id: 3, source: "manual", reviewed: false }),
    ];
    expect(countHiddenUnreviewedSuggestions(entries)).toBe(1);
    expect(countNeedsReview(entries)).toBe(1);
  });
});

describe("memoryKeyFromText", () => {
  it("builds a slug from the first words", () => {
    expect(memoryKeyFromText("My dog is named Rex")).toBe("my_dog_is_named_rex");
  });

  it("falls back when text is empty", () => {
    expect(memoryKeyFromText("   ")).toMatch(/^note_/);
  });
});

describe("splitHighlightSegments", () => {
  it("highlights a case-insensitive match", () => {
    expect(splitHighlightSegments("Hello world", "world")).toEqual([
      { text: "Hello ", highlight: false },
      { text: "world", highlight: true },
    ]);
  });
});

describe("systemMemoryLabelKey", () => {
  it("maps startup briefing consent to plain labels", () => {
    const granted = entry({
      id: 1,
      category: "preferences",
      key: "startup_briefing_consent",
      value: "granted",
    });
    expect(systemMemoryLabelKey(granted)).toBe("memories.systemFacts.startupBriefingGranted");
    expect(isSystemManagedMemory(granted)).toBe(true);

    const declined = entry({ ...granted, id: 2, value: "declined" });
    expect(systemMemoryLabelKey(declined)).toBe("memories.systemFacts.startupBriefingDeclined");
  });

  it("returns null for normal user facts", () => {
    expect(systemMemoryLabelKey(entry({ id: 3, category: "notes", key: "dog", value: "Rex" }))).toBeNull();
  });
});

describe("isHiddenInternalMemory", () => {
  it("hides the briefing v2 migration flag", () => {
    const flag = entry({
      id: 10,
      category: "preferences",
      key: "startup_briefing_consent_v2",
      value: "1",
    });
    expect(isHiddenInternalMemory(flag)).toBe(true);
    expect(memoryEntryMatchesFilter(flag, "all")).toBe(false);
    expect(isPromptVisibleMemory(flag)).toBe(false);
  });

  it("keeps the friendly briefing preference and startup routine", () => {
    expect(
      isHiddenInternalMemory(
        entry({
          id: 11,
          category: "preferences",
          key: "startup_briefing_consent",
          value: "granted",
        }),
      ),
    ).toBe(false);
    expect(
      isHiddenInternalMemory(
        entry({
          id: 12,
          category: "preferences",
          key: "startup_routine",
          value: "news, weather for Geneva",
        }),
      ),
    ).toBe(false);
  });
});

describe("groupMemoryEntriesByProvenance", () => {
  it("groups review rows by provenance", () => {
    const grouped = groupMemoryEntriesByProvenance([
      entry({ id: 1, source: "auto", reviewed: false, provenance: "mail" }),
      entry({ id: 2, source: "auto", reviewed: false, provenance: "chat" }),
    ]);
    expect(grouped.map((g) => g.group)).toEqual(["mail", "chat"]);
    expect(memoryProvenanceGroup(entry({ id: 3, provenance: "calendar" }))).toBe("calendar");
  });
});

describe("formatMemorySourceLine", () => {
  const t = (key: string) => key;

  it("shows origin provider and label when present", () => {
    const line = formatMemorySourceLine(
      entry({
        id: 1,
        source: "auto",
        reviewed: false,
        origin_kind: "google_calendar_event",
        origin_label: "Team standup",
      }),
      t,
    );
    expect(line).toBe("memories.source.googleCalendar · Team standup");
  });

  it("falls back to promotional copy for hidden suggestions", () => {
    const line = formatMemorySourceLine(
      entry({
        id: 2,
        source: "auto",
        reviewed: false,
        noise_score: 0.5,
        provenance: "mail",
      }),
      t,
    );
    expect(line).toBe("memories.looksPromotional");
  });
});

describe("promotionalCandidateIds", () => {
  it("intersects cleanup ids with visible entries", () => {
    const visible = [
      entry({ id: 1, source: "auto", reviewed: false }),
      entry({ id: 2, source: "auto", reviewed: false }),
    ];
    expect(promotionalCandidateIds(visible, [2, 99])).toEqual([2]);
  });
});
