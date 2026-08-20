import { describe, expect, it } from "vitest";
import {
  computeMemoryOverviewStats,
  computeWeeklyActivity,
  memorySourceBucket,
} from "./memoryOverview";
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
    updated_at: partial.updated_at ?? "2026-06-01T12:00:00Z",
    provenance: partial.provenance,
    noise_score: partial.noise_score,
    archived_at: partial.archived_at,
  };
}

describe("memorySourceBucket", () => {
  it("treats manual entries as manual", () => {
    expect(memorySourceBucket(entry({ id: 1, source: "manual" }))).toBe("manual");
  });

  it("maps auto provenance", () => {
    expect(memorySourceBucket(entry({ id: 2, source: "auto", provenance: "mail" }))).toBe("mail");
  });
});

describe("computeMemoryOverviewStats", () => {
  it("returns empty stats for no entries", () => {
    const stats = computeMemoryOverviewStats([]);
    expect(stats.total).toBe(0);
    expect(stats.needsReview).toBe(0);
    expect(stats.recent).toEqual([]);
  });

  it("counts categories, review queue, and recency", () => {
    const now = new Date("2026-06-15T12:00:00Z");
    const stats = computeMemoryOverviewStats(
      [
        entry({
          id: 1,
          category: "identity",
          source: "auto",
          reviewed: false,
          updated_at: "2026-06-14T10:00:00Z",
        }),
        entry({ id: 2, category: "projects", source: "manual", updated_at: "2026-06-14T10:00:00Z" }),
        entry({
          id: 3,
          category: "projects",
          source: "auto",
          provenance: "chat",
          reviewed: true,
          updated_at: "2026-06-10T10:00:00Z",
        }),
      ],
      now,
    );
    expect(stats.total).toBe(3);
    expect(stats.needsReview).toBe(1);
    expect(stats.manual).toBe(1);
    expect(stats.work).toBe(2);
    expect(stats.aboutYou).toBe(1);
    expect(stats.updatedLast7Days).toBe(3);
    expect(stats.byCategory.find((row) => row.category === "projects")?.count).toBe(2);
    expect(stats.recent).toHaveLength(3);
  });

  it("omits internal briefing flags from totals and recent", () => {
    const stats = computeMemoryOverviewStats([
      entry({ id: 1, category: "preferences", key: "startup_briefing_consent", value: "granted" }),
      entry({ id: 2, category: "preferences", key: "startup_briefing_consent_v2", value: "1" }),
    ]);
    expect(stats.total).toBe(1);
    expect(stats.recent.map((row) => row.key)).toEqual(["startup_briefing_consent"]);
  });
});

describe("computeWeeklyActivity", () => {
  it("returns fixed number of week buckets", () => {
    const weeks = computeWeeklyActivity([entry({ id: 1 })], 4, new Date("2026-06-15T12:00:00Z"));
    expect(weeks).toHaveLength(4);
    expect(weeks.every((w) => typeof w.count === "number")).toBe(true);
  });
});
