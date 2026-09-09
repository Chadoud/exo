/**
 * MemoriesPanel — Memory tab; Overview | Map live in the sidebar under Memory.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { toast } from "sonner";
import MemoryAddForm from "./memory/MemoryAddForm";
import MemoryBulkActionBar from "./memory/MemoryBulkActionBar";
import MemoryFactsList from "./memory/MemoryFactsList";
import MemoryMapSection from "./memory/MemoryMapSection";
import MemoryOverviewSection from "./memory/MemoryOverviewSection";
import MemoryReviewBanner from "./memory/MemoryReviewBanner";
import PanelShell from "./ui/PanelShell";
import { getMemoryPanelHeadingKeys } from "../utils/workspacePanelHeadings";
import OfflineStrip from "./ui/OfflineStrip";
import ProTabBanner from "./ui/ProTabBanner";
import EmptyState from "./ui/EmptyState";
import ListSkeleton from "./ui/ListSkeleton";
import {
  batchMemoryAction,
  backfillMemoryOrigins,
  cleanupSecondBrainNoise,
  deleteMemoryById,
  editMemoryValue,
  fetchAllScopedMemory,
  fetchMemoryOpenTarget,
  restoreMemorySnapshots,
  searchMemory,
  setMemoryReviewed,
  upsertMemoryEntry,
  type MemoryCategory,
  type ScopedMemoryEntry,
} from "../api/memory";
import NoiseCleanupDialog from "./secondBrain/NoiseCleanupDialog";
import { consumeHighlightMemory, consumeMemoryNeedsReview } from "../utils/deferredPanelActions";
import { useSecondBrainNoiseCleanup } from "../hooks/useSecondBrainNoiseCleanup";
import { useOpenTarget } from "../hooks/useOpenTarget";
import { useMemoryListSelection } from "../hooks/useMemoryListSelection";
import { useI18n } from "../i18n/I18nContext";
import {
  countHiddenUnreviewedSuggestions,
  countNeedsReview,
  isSystemManagedMemory,
  loadMemoryListExpanded,
  memoryEntryMatchesFilter,
  memoryKeyFromText,
  MEMORY_SCROLL_SECTION_IDS,
  persistMemoryListExpanded,
  promotionalCandidateIds,
  type MemoryFactsFilter,
  type MemorySubTab,
} from "../utils/memoryUi";
import { useScrollSpy } from "../hooks/useScrollSpy";
import {
  computeMemoryOverviewStats,
  filterEntriesByCategorySlice,
  filterEntriesBySourceSlice,
  type MemoryCategoryCount,
  type MemorySourceCount,
} from "../utils/memoryOverview";

interface Props {
  backendOnline: boolean;
  onOpenConversation?: () => void;
  onOpenTodo?: () => void;
  onHighlightMemory?: (memoryId: number) => void;
  proAllowed?: boolean;
  onUpgrade?: () => void;
  subTab: MemorySubTab;
  /** Parent Memory nav: Overview, Activity, and Map on one scrollable page. */
  showAllSections?: boolean;
  /** Main column scroll root for scroll-spy when `showAllSections`. */
  scrollRootRef?: RefObject<HTMLElement | null>;
  onScrollSectionReport?: (sectionId: string) => void;
  /** Restart the local assistant service (Electron); enables a retry button when offline. */
  onRetryBackend?: () => void | Promise<void>;
}

const FACT_FILTERS: MemoryFactsFilter[] = ["all", "aboutYou", "work", "needsReview"];
const MEMORY_DEFAULT_FILTER_SESSION_KEY = "memory:overview-default-filter";
const MEMORY_ORIGIN_BACKFILL_SESSION_KEY = "memory:origin-backfill-done";

export default function MemoriesPanel({
  backendOnline,
  onOpenConversation,
  onOpenTodo,
  onHighlightMemory,
  proAllowed = true,
  onUpgrade,
  subTab,
  showAllSections = false,
  scrollRootRef,
  onScrollSectionReport,
  onRetryBackend,
}: Props) {
  const { t } = useI18n();
  useScrollSpy({
    enabled: showAllSections,
    sectionIds: MEMORY_SCROLL_SECTION_IDS,
    rootRef: scrollRootRef,
    onActiveIdChange: onScrollSectionReport,
  });
  const showOverview = showAllSections || subTab === "overview";
  const showMap = showAllSections || subTab === "map";
  const mapFullHeight = subTab === "map" && !showAllSections;
  const { openTarget } = useOpenTarget(onOpenConversation);
  const searchRef = useRef<HTMLInputElement>(null);

  const [entries, setEntries] = useState<ScopedMemoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [searchResultIds, setSearchResultIds] = useState<number[] | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [filter, setFilter] = useState<MemoryFactsFilter>("all");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const [adding, setAdding] = useState(false);
  const [proBlocked] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [promotionalIds, setPromotionalIds] = useState<number[]>([]);
  const [cleanupCandidateCount, setCleanupCandidateCount] = useState(0);
  const [listExpanded, setListExpanded] = useState(loadMemoryListExpanded);
  const [categorySlice, setCategorySlice] = useState<MemoryCategoryCount | null>(null);
  const [sourceSlice, setSourceSlice] = useState<MemorySourceCount | null>(null);
  const [openBusyId, setOpenBusyId] = useState<number | null>(null);
  const listContainerRef = useRef<HTMLDivElement>(null);
  const listSectionRef = useRef<HTMLDivElement>(null);

  const proLocked = !proAllowed || proBlocked;

  useEffect(() => {
    if (!showOverview || !backendOnline || proLocked) {
      setCleanupCandidateCount(0);
      return;
    }
    let cancelled = false;
    void cleanupSecondBrainNoise({ dryRun: true, includeConversations: true })
      .then((result) => {
        if (!cancelled) setCleanupCandidateCount(result.total_candidates ?? 0);
      })
      .catch(() => {
        if (!cancelled) setCleanupCandidateCount(0);
      });
    return () => {
      cancelled = true;
    };
  }, [showOverview, backendOnline, proLocked, entries]);

  const load = useCallback(async () => {
    if (!backendOnline) return;
    setLoading(true);
    setError(null);
    try {
      const all = await fetchAllScopedMemory();
      setEntries(all.filter((e) => e.conversation_id === null && !e.archived_at));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("memories.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [backendOnline, t]);

  const noiseCleanup = useSecondBrainNoiseCleanup({
    onSuccess: async () => {
      await load();
      setFilter("all");
    },
  });

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!backendOnline || proLocked || !showOverview) return;
    try {
      if (sessionStorage.getItem(MEMORY_ORIGIN_BACKFILL_SESSION_KEY)) return;
      sessionStorage.setItem(MEMORY_ORIGIN_BACKFILL_SESSION_KEY, "1");
    } catch {
      /* ignore */
    }
    void backfillMemoryOrigins(false)
      .then((result) => {
        if (result.matched > 0) void load();
      })
      .catch(() => {
        /* best-effort */
      });
  }, [backendOnline, proLocked, showOverview, load]);

  const handleOpenMemory = useCallback(
    async (entry: ScopedMemoryEntry) => {
      setOpenBusyId(entry.id);
      try {
        await openTarget(() => fetchMemoryOpenTarget(entry.id));
        await load();
      } finally {
        setOpenBusyId(null);
      }
    },
    [load, openTarget],
  );

  const overviewStats = useMemo(() => computeMemoryOverviewStats(entries), [entries]);

  const expandBrowseList = useCallback(() => {
    setListExpanded(true);
    persistMemoryListExpanded(true);
    requestAnimationFrame(() => {
      listSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

  const collapseBrowseList = useCallback(() => {
    setListExpanded(false);
    persistMemoryListExpanded(false);
    setCategorySlice(null);
    setSourceSlice(null);
    if (filter === "needsReview") setFilter("all");
  }, [filter]);

  useEffect(() => {
    if (query.trim()) {
      setListExpanded(true);
      persistMemoryListExpanded(true);
    }
  }, [query]);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setSearchResultIds(null);
      setSearchError(null);
      return;
    }
    let cancelled = false;
    const handle = setTimeout(() => {
      void searchMemory(trimmed, 50)
        .then((hits) => {
          if (!cancelled) {
            setSearchResultIds(hits.map((h) => h.id));
            setSearchError(null);
          }
        })
        .catch((e) => {
          if (!cancelled) {
            setSearchResultIds([]);
            setSearchError(e instanceof Error ? e.message : t("memories.searchFailed"));
          }
        });
    }, 220);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query, t]);

  const needsReviewCount = useMemo(() => countNeedsReview(entries), [entries]);
  const hiddenSuggestionCount = useMemo(() => countHiddenUnreviewedSuggestions(entries), [entries]);
  const pendingReview = useMemo(
    () => entries.filter((e) => memoryEntryMatchesFilter(e, "needsReview")),
    [entries],
  );

  useEffect(() => {
    if (!showOverview) return;
    if (consumeMemoryNeedsReview()) {
      setFilter("needsReview");
      return;
    }
    if (loading || needsReviewCount === 0) return;
    try {
      if (sessionStorage.getItem(MEMORY_DEFAULT_FILTER_SESSION_KEY)) return;
      sessionStorage.setItem(MEMORY_DEFAULT_FILTER_SESSION_KEY, "1");
      setFilter("needsReview");
      setListExpanded(true);
      persistMemoryListExpanded(true);
    } catch {
      /* ignore */
    }
  }, [showOverview, loading, needsReviewCount]);

  useEffect(() => {
    if (!showOverview || loading) return;
    const highlightId = consumeHighlightMemory();
    if (highlightId == null) return;
    setFilter("all");
    setListExpanded(true);
    persistMemoryListExpanded(true);
    requestAnimationFrame(() => {
      const row = document.querySelector(`[data-memory-row-id="${highlightId}"]`);
      row?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, [showOverview, loading, entries]);

  const visibleEntries = useMemo(() => {
    let list = entries.filter((e) => memoryEntryMatchesFilter(e, filter));
    if (categorySlice) {
      list = filterEntriesByCategorySlice(list, categorySlice, overviewStats.byCategoryDisplay);
    }
    if (sourceSlice) {
      list = filterEntriesBySourceSlice(list, sourceSlice, overviewStats.bySourceDisplay);
    }
    if (searchResultIds !== null) {
      const order = new Map(searchResultIds.map((id, i) => [id, i]));
      list = list
        .filter((e) => order.has(e.id))
        .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    }
    return list;
  }, [entries, filter, categorySlice, sourceSlice, overviewStats, searchResultIds]);

  const disabledSelectionIds = useMemo(
    () => new Set(entries.filter(isSystemManagedMemory).map((entry) => entry.id)),
    [entries],
  );
  const visibleEntryIds = useMemo(
    () => visibleEntries.map((entry) => entry.id),
    [visibleEntries],
  );
  const selection = useMemoryListSelection({
    visibleIds: visibleEntryIds,
    disabledIds: disabledSelectionIds,
  });

  useEffect(() => {
    if (filter !== "needsReview" || !backendOnline) {
      setPromotionalIds([]);
      return;
    }
    let cancelled = false;
    void cleanupSecondBrainNoise({ dryRun: true })
      .then((result) => {
        if (cancelled) return;
        const rawIds = result.memories.ids ?? [];
        const cleanupIds = rawIds
          .map((id) => (typeof id === "number" ? id : Number(id)))
          .filter((id): id is number => Number.isFinite(id));
        setPromotionalIds(promotionalCandidateIds(pendingReview, cleanupIds));
      })
      .catch(() => {
        if (!cancelled) setPromotionalIds([]);
      });
    return () => {
      cancelled = true;
    };
  }, [filter, backendOnline, pendingReview]);

  const targetIdsForBulk = useCallback((): number[] => {
    if (selection.selectedCount > 0) {
      return [...selection.selectedIds];
    }
    if (selection.focusedId != null && selection.isSelectable(selection.focusedId)) {
      return [selection.focusedId];
    }
    return [];
  }, [selection]);

  const runBulkKeep = useCallback(
    async (ids: number[]) => {
      if (ids.length === 0) return;
      setBulkBusy(true);
      try {
        await batchMemoryAction("review", ids);
        setEntries((prev) =>
          prev.map((entry) =>
            ids.includes(entry.id) ? { ...entry, reviewed: true } : entry,
          ),
        );
        selection.clearSelection();
        toast.success(t("memories.bulkKeepDone", { n: ids.length }));
        if (filter === "needsReview") setFilter("all");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t("memories.bulkKeepFailed"));
      } finally {
        setBulkBusy(false);
      }
    },
    [filter, selection, t],
  );

  const runBulkDiscard = useCallback(
    async (ids: number[]) => {
      if (ids.length === 0) return;
      const manualCount = entries.filter(
        (entry) => ids.includes(entry.id) && entry.source === "manual",
      ).length;
      if (
        manualCount > 0 &&
        !window.confirm(t("memories.bulkConfirmDiscardManual", { n: manualCount }))
      ) {
        return;
      }
      setBulkBusy(true);
      try {
        const result = await batchMemoryAction("delete", ids);
        const snapshots = result.snapshots ?? [];
        setEntries((prev) => prev.filter((entry) => !ids.includes(entry.id)));
        selection.clearSelection();
        toast.success(t("memories.bulkDiscardDone", { n: result.affected }), {
          duration: 8000,
          action:
            snapshots.length > 0
              ? {
                  label: t("memories.bulkUndo"),
                  onClick: () => {
                    void (async () => {
                      try {
                        await restoreMemorySnapshots(snapshots);
                        await load();
                        toast.success(t("memories.bulkUndoDone", { n: snapshots.length }));
                      } catch (e) {
                        toast.error(
                          e instanceof Error ? e.message : t("memories.bulkUndoFailed"),
                        );
                      }
                    })();
                  },
                }
              : undefined,
        });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t("memories.bulkDiscardFailed"));
      } finally {
        setBulkBusy(false);
      }
    },
    [entries, load, selection, t],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!showOverview) return;
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      const mod = e.metaKey || e.ctrlKey;

      if (e.key === "/" && tag !== "INPUT") {
        e.preventDefault();
        expandBrowseList();
        searchRef.current?.focus();
        return;
      }

      if (visibleEntries.length === 0) return;

      if (mod && e.key.toLowerCase() === "a") {
        e.preventDefault();
        selection.selectAllVisible();
        return;
      }

      if (e.key === "Escape") {
        if (editingId != null) {
          setEditingId(null);
          return;
        }
        if (selection.selectedCount > 0) {
          e.preventDefault();
          selection.clearSelection();
        }
        return;
      }

      if (e.key === "j") {
        e.preventDefault();
        selection.moveFocus(1);
        return;
      }
      if (e.key === "k") {
        e.preventDefault();
        selection.moveFocus(-1);
        return;
      }
      if (e.key === "x") {
        e.preventDefault();
        const id = selection.focusedId ?? visibleEntryIds[0];
        if (id != null) {
          selection.toggle(id, { shift: e.shiftKey, meta: mod });
        }
        return;
      }
      if (e.key === "y" || e.key === "Enter") {
        e.preventDefault();
        void runBulkKeep(targetIdsForBulk());
        return;
      }
      if (e.key === "d" || e.key === "Backspace") {
        e.preventDefault();
        void runBulkDiscard(targetIdsForBulk());
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    showOverview,
    visibleEntries.length,
    visibleEntryIds,
    editingId,
    selection,
    runBulkKeep,
    runBulkDiscard,
    targetIdsForBulk,
    expandBrowseList,
  ]);

  const handleApprove = async (id: number) => {
    try {
      await setMemoryReviewed(id, true);
      setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, reviewed: true } : e)));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("memories.toastApproveFailed"));
    }
  };

  const handleKeepAll = async () => {
    const pendingIds = pendingReview.map((entry) => entry.id);
    if (pendingIds.length === 0) return;
    await runBulkKeep(pendingIds);
  };

  const handleDiscardPromotional = () => {
    void noiseCleanup.openDialog();
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteMemoryById(id);
      setEntries((prev) => prev.filter((e) => e.id !== id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("memories.toastDeleteFailed"));
    }
  };

  const handleSaveEdit = async (id: number) => {
    const value = editValue.trim();
    if (!value) return;
    try {
      await editMemoryValue(id, value);
      setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, value } : e)));
      setEditingId(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("memories.toastSaveChangeFailed"));
    }
  };

  const handleAdd = async (payload: { category: MemoryCategory; key: string; value: string }) => {
    try {
      await upsertMemoryEntry(payload.category, payload.key || memoryKeyFromText(payload.value), payload.value);
      setAdding(false);
      await load();
      toast.success(t("memories.toastSaved"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("memories.toastSaveFailed"));
    }
  };

  const filterLabel = (f: MemoryFactsFilter) => {
    if (f === "all") return t("memories.filters.all");
    if (f === "aboutYou") return t("memories.filters.aboutYou");
    if (f === "work") return t("memories.filters.work");
    return t("memories.needsReview", { n: needsReviewCount });
  };

  const panelHeading = getMemoryPanelHeadingKeys(subTab, showAllSections);
  const showBrowseList =
    listExpanded ||
    query.trim().length > 0 ||
    filter !== "all" ||
    categorySlice !== null ||
    sourceSlice !== null;

  const handleCategorySliceClick = (slice: MemoryCategoryCount) => {
    setCategorySlice(slice);
    setSourceSlice(null);
    setFilter("all");
    expandBrowseList();
  };

  const handleSourceSliceClick = (slice: MemorySourceCount) => {
    setSourceSlice(slice);
    setCategorySlice(null);
    setFilter("all");
    expandBrowseList();
  };

  const handleNeedsReviewClick = () => {
    setCategorySlice(null);
    setSourceSlice(null);
    setFilter("needsReview");
    expandBrowseList();
  };

  return (
    <div
      className={`w-full pb-6 ${
        mapFullHeight ? "flex min-h-0 min-w-0 flex-1 flex-col" : ""
      }`}
    >
      <PanelShell
        title={t(panelHeading.titleKey)}
        subtitle={t(panelHeading.subtitleKey)}
        offlineBanner={
          !backendOnline ? (
            <OfflineStrip
              message={t("memories.offline")}
              action={
                onRetryBackend
                  ? { label: t("offlineStrip.retryApi"), onClick: onRetryBackend }
                  : undefined
              }
            />
          ) : null
        }
        className={mapFullHeight ? "flex min-h-0 flex-1 flex-col" : undefined}
      >
        {proLocked ? (
          <ProTabBanner
            description={t("pro.activityFeature")}
            onUpgrade={() => onUpgrade?.()}
          />
        ) : null}

        {showOverview && (
          <div id="memory-section-overview" className={`space-y-6 ${showAllSections ? "pb-10" : ""}`}>
            {showAllSections ? (
              <h2 className="border-b border-border pb-2 text-base font-semibold text-text-primary">
                {t("memories.tabs.overview")}
              </h2>
            ) : null}
            <MemoryOverviewSection
              stats={overviewStats}
              loading={loading}
              onNeedsReviewClick={handleNeedsReviewClick}
              onCategorySliceClick={handleCategorySliceClick}
              onSourceSliceClick={handleSourceSliceClick}
              onBrowseAll={expandBrowseList}
              recentEntries={showBrowseList ? [] : overviewStats.recent}
            />

            {showBrowseList ? (
              <div
                id="memory-facts-list"
                ref={listSectionRef}
                className="space-y-4 border-t border-border pt-6"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-text-primary">
                    {t("memories.overview.browseHeading")}
                  </h3>
                  <button
                    type="button"
                    onClick={collapseBrowseList}
                    className="text-xs font-medium text-muted hover:text-text-primary hover:underline"
                  >
                    {t("memories.overview.collapseList")}
                  </button>
                </div>

                {(categorySlice || sourceSlice) && (
                  <p className="text-2xs text-muted">
                    {categorySlice
                      ? t("memories.overview.filteredByCategory", {
                          label: categorySlice.isAggregatedOther
                            ? t("memories.overview.otherCategory")
                            : t(`memories.categories.${categorySlice.category}`),
                        })
                      : sourceSlice
                        ? t("memories.overview.filteredBySource", {
                            label: sourceSlice.isAggregatedOther
                              ? t("memories.overview.otherSource")
                              : sourceSlice.bucket === "manual"
                                ? t("memories.overview.sourceManual")
                                : t(`memories.groups.${sourceSlice.bucket}`),
                          })
                        : null}
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  <input
                    ref={searchRef}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={t("memories.searchPlaceholder")}
                    className="min-w-0 flex-1 rounded-lg border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary placeholder:text-muted focus:border-accent focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setAdding((v) => !v)}
                    className="shrink-0 rounded-lg bg-button-primary px-3 py-2 text-sm font-medium text-white hover:bg-button-hover"
                  >
                    {adding ? t("memories.cancel") : t("memories.addMemory")}
                  </button>
                </div>

                {searchError ? (
                  <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">{searchError}</p>
                ) : null}

                {adding ? (
                  <MemoryAddForm onSave={(p) => void handleAdd(p)} onCancel={() => setAdding(false)} />
                ) : null}

                <div className="flex flex-wrap gap-1.5">
                  {FACT_FILTERS.map((f) => {
                    if (f === "needsReview" && needsReviewCount === 0) return null;
                    return (
                      <button
                        key={f}
                        type="button"
                        onClick={() => {
                          setCategorySlice(null);
                          setSourceSlice(null);
                          setFilter(f);
                        }}
                        className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                          filter === f
                            ? "bg-button-primary text-white"
                            : "bg-bg-secondary text-muted hover:text-text-primary"
                        }`}
                      >
                        {filterLabel(f)}
                      </button>
                    );
                  })}
                </div>

                {filter === "all" && cleanupCandidateCount > 0 ? (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
                    <p className="text-sm text-text-primary">{t("memories.promoCleanupBanner", { n: cleanupCandidateCount })}</p>
                    <button
                      type="button"
                      onClick={handleDiscardPromotional}
                      className="shrink-0 rounded-lg bg-button-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-button-hover"
                    >
                      {t("cleanup.actionMemories")}
                    </button>
                  </div>
                ) : null}

                {filter === "all" && hiddenSuggestionCount > 0 ? (
                  <p className="text-xs text-muted">
                    {t("memories.hiddenPromoHint", { n: hiddenSuggestionCount })}{" "}
                    <button
                      type="button"
                      onClick={handleDiscardPromotional}
                      className="font-medium text-accent hover:underline"
                    >
                      {t("memories.removeHiddenPromo")}
                    </button>
                  </p>
                ) : null}

                {error ? (
                  <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>
                ) : null}

                {filter === "needsReview" && pendingReview.length > 0 ? (
                  <MemoryReviewBanner
                    promotionalCount={promotionalIds.length}
                    selectedCount={selection.selectedCount}
                    loading={bulkBusy}
                    onSelectPromotional={() => selection.selectIds(promotionalIds)}
                    onRemoveSelected={() => void runBulkDiscard([...selection.selectedIds])}
                  />
                ) : null}

                {filter === "needsReview" && pendingReview.length > 1 ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => void handleKeepAll()}
                      disabled={bulkBusy}
                      className="text-xs font-medium text-accent hover:underline disabled:opacity-50"
                    >
                      {t("memories.keepAll")}
                    </button>
                    <button
                      type="button"
                      onClick={handleDiscardPromotional}
                      disabled={bulkBusy}
                      className="text-xs font-medium text-muted hover:text-text-secondary hover:underline disabled:opacity-50"
                    >
                      {t("cleanup.actionMemories")}
                    </button>
                  </div>
                ) : filter === "needsReview" && pendingReview.length === 1 ? (
                  <button
                    type="button"
                    onClick={handleDiscardPromotional}
                    disabled={bulkBusy}
                    className="text-xs font-medium text-muted hover:text-text-secondary hover:underline disabled:opacity-50"
                  >
                    {t("cleanup.actionMemories")}
                  </button>
                ) : null}

                {filter === "needsReview" && pendingReview.length > 0 ? (
                  <p className="text-2xs text-muted">{t("memories.reviewShortcutsHint")}</p>
                ) : null}

                <MemoryBulkActionBar
                  selectedCount={selection.selectedCount}
                  busy={bulkBusy}
                  reviewMode={filter === "needsReview"}
                  onKeep={() => void runBulkKeep([...selection.selectedIds])}
                  onDiscard={() => void runBulkDiscard([...selection.selectedIds])}
                  onClearSelection={selection.clearSelection}
                />

                {loading ? (
                  <ListSkeleton />
                ) : visibleEntries.length === 0 ? (
                  <EmptyState
                    title={
                      query.trim()
                        ? t("memories.emptySearch")
                        : filter === "needsReview"
                          ? t("memories.caughtUp")
                          : filter === "all" && needsReviewCount > 0
                            ? t("memories.emptyAllNeedsReviewTitle", { n: needsReviewCount })
                            : t("memories.empty")
                    }
                    description={
                      query.trim()
                        ? undefined
                        : filter === "needsReview"
                          ? undefined
                          : filter === "all" && needsReviewCount > 0
                            ? t("memories.emptyAllNeedsReviewDesc")
                            : t("memories.emptyDesc")
                    }
                    primaryAction={
                      !query.trim() && filter === "all" && needsReviewCount > 0
                        ? {
                            label: t("memories.emptyAllReviewAction"),
                            onClick: () => {
                              setFilter("needsReview");
                              setListExpanded(true);
                              persistMemoryListExpanded(true);
                            },
                          }
                        : !query.trim() && filter !== "needsReview" && onOpenConversation
                          ? { label: t("memories.openAssistant"), onClick: onOpenConversation }
                          : undefined
                    }
                    secondaryAction={
                      !query.trim() && filter === "all" && needsReviewCount > 0
                        ? onOpenConversation
                          ? { label: t("memories.openAssistant"), onClick: onOpenConversation }
                          : undefined
                        : !query.trim() && filter !== "needsReview"
                          ? { label: t("memories.addNote"), onClick: () => setAdding(true) }
                          : undefined
                    }
                  />
                ) : (
                  <div ref={listContainerRef}>
                    <MemoryFactsList
                      entries={visibleEntries}
                      query={query}
                      editingId={editingId}
                      editValue={editValue}
                      reviewMode={filter === "needsReview"}
                      groupByProvenance={filter === "needsReview"}
                      selectionEnabled
                      selectedIds={selection.selectedIds}
                      focusedId={selection.focusedId}
                      allVisibleSelected={selection.allVisibleSelected}
                      someVisibleSelected={selection.someVisibleSelected}
                      isSelectable={selection.isSelectable}
                      onToggleSelect={selection.toggle}
                      onSelectAllVisible={selection.selectAllVisible}
                      onClearSelection={selection.clearSelection}
                      onSelectGroup={(ids) => {
                        const merged = [
                          ...new Set([
                            ...selection.selectedIds,
                            ...ids.filter((id) => selection.isSelectable(id)),
                          ]),
                        ];
                        selection.selectIds(merged);
                      }}
                      onRowFocus={selection.setFocusedId}
                      onStartEdit={(e) => {
                        setEditingId(e.id);
                        setEditValue(e.value);
                      }}
                      onEditChange={setEditValue}
                      onSaveEdit={(id) => void handleSaveEdit(id)}
                      onCancelEdit={() => setEditingId(null)}
                      onDelete={(id) => void handleDelete(id)}
                      onApprove={(id) => void handleApprove(id)}
                      onOpen={(entry) => void handleOpenMemory(entry)}
                      openBusyId={openBusyId}
                    />
                  </div>
                )}
              </div>
            ) : null}
          </div>
        )}

        {showMap && (
          <div
            id="memory-section-map"
            className={
              showAllSections
                ? "space-y-4 border-t border-border pt-10 pb-10"
                : "flex min-h-0 flex-1 flex-col"
            }
          >
            {showAllSections ? (
              <h2 className="border-b border-border pb-2 text-base font-semibold text-text-primary">
                {t("memories.tabs.map")}
              </h2>
            ) : null}
            <div className={showAllSections ? "flex min-h-[28rem] flex-col" : "flex min-h-0 flex-1 flex-col"}>
              <MemoryMapSection
                backendOnline={backendOnline}
                onOpenConversation={onOpenConversation}
                onOpenTodo={onOpenTodo}
                onHighlightMemory={onHighlightMemory}
              />
            </div>
          </div>
        )}

      </PanelShell>

      <NoiseCleanupDialog
        open={noiseCleanup.dialogOpen}
        preview={noiseCleanup.preview}
        isPreviewing={noiseCleanup.isPreviewing}
        isRunning={noiseCleanup.isRunning}
        onClose={noiseCleanup.closeDialog}
        onConfirm={() => void noiseCleanup.execute()}
      />
    </div>
  );
}
