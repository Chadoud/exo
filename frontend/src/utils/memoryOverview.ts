import { MEMORY_CATEGORIES, type MemoryCategory, type ScopedMemoryEntry } from "../api/memory";
import { CATEGORY_COLORS } from "../components/brainMap/graphModel";
import { topNWithOtherRows } from "./topNWithOther";
import {
  countNeedsReview,
  isHiddenInternalMemory,
  isPromptVisibleMemory,
  memoryEntryMatchesFilter,
  memoryProvenanceGroup,
  type MemoryProvenanceGroup,
} from "./memoryUi";

/** Bucket for source donut — manual entries are separate from auto provenance. */
export type MemorySourceBucket = MemoryProvenanceGroup | "manual";

export type MemoryCategoryCount = {
  category: MemoryCategory;
  count: number;
  /** True when this row aggregates smaller categories into “Other”. */
  isAggregatedOther?: boolean;
};

export type MemorySourceCount = {
  bucket: MemorySourceBucket;
  count: number;
  isAggregatedOther?: boolean;
};

export type MemoryWeeklyCount = {
  label: string;
  count: number;
};

export type MemoryOverviewStats = {
  total: number;
  needsReview: number;
  manual: number;
  auto: number;
  aboutYou: number;
  work: number;
  updatedLast7Days: number;
  byCategory: MemoryCategoryCount[];
  byCategoryDisplay: MemoryCategoryCount[];
  bySource: MemorySourceCount[];
  bySourceDisplay: MemorySourceCount[];
  weeklyActivity: MemoryWeeklyCount[];
  recent: ScopedMemoryEntry[];
};

const SOURCE_BUCKET_ORDER: MemorySourceBucket[] = [
  "chat",
  "mail",
  "calendar",
  "meeting",
  "manual",
  "other",
];

const CATEGORY_TOP_N = 6;
const SOURCE_TOP_N = 5;

/** Convert brain-map palette entry to CSS hex. */
function hexFromBrainColor(value: number): string {
  return `#${value.toString(16).padStart(6, "0")}`;
}

export function memoryCategoryColor(category: MemoryCategory): string {
  return hexFromBrainColor(CATEGORY_COLORS[category]);
}

export const MEMORY_SOURCE_COLORS: Record<MemorySourceBucket, string> = {
  chat: "#38bdf8",
  mail: "#f97316",
  calendar: "#4f46e5",
  meeting: "#34d399",
  manual: "#3730a3",
  other: "#94a3b8",
};

export function memorySourceBucket(entry: ScopedMemoryEntry): MemorySourceBucket {
  if (entry.source === "manual") return "manual";
  return memoryProvenanceGroup(entry);
}

function parseUpdatedAtMs(updatedAt: string): number {
  const ms = Date.parse(updatedAt);
  return Number.isFinite(ms) ? ms : 0;
}

function startOfWeekMonday(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

/** Last N calendar weeks (Mon–Sun buckets) by `updated_at`. */
export function computeWeeklyActivity(
  entries: ScopedMemoryEntry[],
  weekCount = 8,
  now = new Date(),
): MemoryWeeklyCount[] {
  const weeks: MemoryWeeklyCount[] = [];
  const anchor = startOfWeekMonday(now);

  for (let i = weekCount - 1; i >= 0; i -= 1) {
    const weekStart = new Date(anchor);
    weekStart.setDate(weekStart.getDate() - i * 7);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);
    const startMs = weekStart.getTime();
    const endMs = weekEnd.getTime();
    const count = entries.filter((entry) => {
      const ms = parseUpdatedAtMs(entry.updated_at);
      return ms >= startMs && ms < endMs;
    }).length;
    weeks.push({
      label: weekStart.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      count,
    });
  }

  return weeks;
}

function aggregateCategoryTail(
  tail: { category: MemoryCategory; count: number }[],
): MemoryCategoryCount {
  return {
    category: "notes",
    count: tail.reduce((sum, row) => sum + row.count, 0),
    isAggregatedOther: true,
  };
}

function aggregateSourceTail(tail: { bucket: MemorySourceBucket; count: number }[]): MemorySourceCount {
  return {
    bucket: "other",
    count: tail.reduce((sum, row) => sum + row.count, 0),
    isAggregatedOther: true,
  };
}

/**
 * Aggregate global memory rows for the Overview dashboard.
 * Caller should pass the same scoped list used by the browse list.
 */
export function computeMemoryOverviewStats(
  entries: ScopedMemoryEntry[],
  now = new Date(),
): MemoryOverviewStats {
  entries = entries.filter((entry) => !isHiddenInternalMemory(entry));
  const categoryMap = new Map<MemoryCategory, number>();
  for (const category of MEMORY_CATEGORIES) {
    categoryMap.set(category, 0);
  }
  const sourceMap = new Map<MemorySourceBucket, number>();
  for (const bucket of SOURCE_BUCKET_ORDER) {
    sourceMap.set(bucket, 0);
  }

  let manual = 0;
  let auto = 0;
  let updatedLast7Days = 0;
  const sevenDaysAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;

  for (const entry of entries) {
    categoryMap.set(entry.category, (categoryMap.get(entry.category) ?? 0) + 1);
    const bucket = memorySourceBucket(entry);
    sourceMap.set(bucket, (sourceMap.get(bucket) ?? 0) + 1);
    if (entry.source === "manual") manual += 1;
    else auto += 1;
    if (parseUpdatedAtMs(entry.updated_at) >= sevenDaysAgo) {
      updatedLast7Days += 1;
    }
  }

  const byCategory = MEMORY_CATEGORIES.map((category) => ({
    category,
    count: categoryMap.get(category) ?? 0,
  })).filter((row) => row.count > 0);

  const bySource = SOURCE_BUCKET_ORDER.map((bucket) => ({
    bucket,
    count: sourceMap.get(bucket) ?? 0,
  })).filter((row) => row.count > 0);

  const categorySorted = [...byCategory].sort((a, b) => b.count - a.count);
  const sourceSorted = [...bySource].sort((a, b) => b.count - a.count);

  const categoryTop = topNWithOtherRows(categorySorted, CATEGORY_TOP_N, aggregateCategoryTail);
  const sourceTop = topNWithOtherRows(sourceSorted, SOURCE_TOP_N, aggregateSourceTail);

  const recent = [...entries]
    .filter((entry) => isPromptVisibleMemory(entry))
    .sort((a, b) => parseUpdatedAtMs(b.updated_at) - parseUpdatedAtMs(a.updated_at))
    .slice(0, 5);

  return {
    total: entries.length,
    needsReview: countNeedsReview(entries),
    manual,
    auto,
    aboutYou: entries.filter((e) => memoryEntryMatchesFilter(e, "aboutYou")).length,
    work: entries.filter((e) => memoryEntryMatchesFilter(e, "work")).length,
    updatedLast7Days,
    byCategory: categorySorted,
    byCategoryDisplay: categoryTop.display,
    bySource: sourceSorted,
    bySourceDisplay: sourceTop.display,
    weeklyActivity: computeWeeklyActivity(entries, 8, now),
    recent,
  };
}

/** Entries visible when a category donut segment is selected. */
export function filterEntriesByCategorySlice(
  entries: ScopedMemoryEntry[],
  slice: MemoryCategoryCount,
  displayRows: MemoryCategoryCount[],
): ScopedMemoryEntry[] {
  if (slice.isAggregatedOther) {
    const topCategories = new Set(
      displayRows.filter((row) => !row.isAggregatedOther).map((row) => row.category),
    );
    return entries.filter((entry) => !topCategories.has(entry.category));
  }
  return entries.filter((entry) => entry.category === slice.category);
}

/** Entries visible when a source donut segment is selected. */
export function filterEntriesBySourceSlice(
  entries: ScopedMemoryEntry[],
  slice: MemorySourceCount,
  displayRows: MemorySourceCount[],
): ScopedMemoryEntry[] {
  if (slice.isAggregatedOther) {
    const topBuckets = new Set(
      displayRows.filter((row) => !row.isAggregatedOther).map((row) => row.bucket),
    );
    return entries.filter((entry) => !topBuckets.has(memorySourceBucket(entry)));
  }
  return entries.filter((entry) => memorySourceBucket(entry) === slice.bucket);
}
