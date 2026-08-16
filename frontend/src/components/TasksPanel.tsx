import { useCallback, useEffect, useMemo, useState, type RefObject } from "react";
import { toast } from "sonner";
import TaskMeetingFab from "./tasks/TaskMeetingFab";
import TaskPromoCleanupBanner from "./tasks/TaskPromoCleanupBanner";
import TasksPanelModals from "./tasks/TasksPanelModals";
import TaskRow from "./tasks/TaskRow";
import TaskSelectBar from "./tasks/TaskSelectBar";
import TaskPanelHeaderActions from "./tasks/TaskPanelHeaderActions";
import { taskSourceBadge } from "./tasks/taskSourceBadge";
import TodayBriefingCard from "./tasks/TodayBriefingCard";
import TodoInboxSection from "./tasks/TodoInboxSection";
import TodoSubNav from "./tasks/TodoSubNav";
import TodoTaskTimeline, { firstOverdueSectionId, todaySectionId } from "./tasks/TodoTaskTimeline";
import TodoUpcomingLater from "./tasks/TodoUpcomingLater";
import TodoTodaySummary from "./tasks/TodoTodaySummary";
import PanelShell from "./ui/PanelShell";
import OfflineStrip from "./ui/OfflineStrip";
import ProTabBanner from "./ui/ProTabBanner";
import EmptyState from "./ui/EmptyState";
import ListSkeleton from "./ui/ListSkeleton";
import { EntitlementBlockedError } from "../api/client";
import { fetchTasks, fetchTaskOpenTarget, setTaskCompleted, syncTasksFromIntegrations, type Task } from "../api/tasks";
import { useSecondBrainNoiseCleanup } from "../hooks/useSecondBrainNoiseCleanup";
import { fetchSchedulerStatus } from "../api/proactive";
import { consumeOpenMeetingModal } from "../utils/deferredPanelActions";
import { useOpenTarget } from "../hooks/useOpenTarget";
import { useTaskSelectActions } from "../hooks/useTaskSelectActions";
import { useTaskSelection } from "../hooks/useTaskSelection";
import { useI18n } from "../i18n/I18nContext";
import { getTodoPanelHeadingKeys } from "../utils/workspacePanelHeadings";
import type { TodoSubTab } from "../utils/todoUi";
import { TODO_SCROLL_SECTION_IDS } from "../utils/todoUi";
import { useScrollSpy } from "../hooks/useScrollSpy";
import type { TodoFeed } from "../hooks/useTodoFeed";
import {
  groupTasksByCompletedDay,
  groupTasksByDueDay,
  groupTasksByUpcomingDay,
  splitTodayTasks,
} from "../utils/taskBuckets";
import { scrollToSectionId } from "../utils/scrollAnchor";
import { taskMayHaveOpenTarget } from "../utils/memoryOrigin";
import { useConversations } from "../hooks/useConversations";
import { queueChatDraft } from "../utils/deferredPanelActions";

interface Props {
  backendOnline: boolean;
  subTab: TodoSubTab;
  /** Parent To Do nav: Tasks, Inbox, and Done on one scrollable page. */
  showAllSections?: boolean;
  scrollRootRef?: RefObject<HTMLElement | null>;
  onScrollSectionReport?: (sectionId: string) => void;
  todoFeed: TodoFeed;
  /** When false, sidebar labels are visible — hide duplicate in-panel sub-nav. */
  sidebarCompact?: boolean;
  onSelectSubTab?: (subTab: TodoSubTab) => void;
  onOpenConversation?: () => void;
  onOpenSources?: () => void;
  onOpenMemoryReview?: () => void;
  proAllowed?: boolean;
  onUpgrade?: () => void;
  onRetryBackend?: () => void | Promise<void>;
}

export default function TasksPanel({
  backendOnline,
  subTab,
  showAllSections = false,
  scrollRootRef,
  onScrollSectionReport,
  todoFeed,
  sidebarCompact = false,
  onSelectSubTab,
  onOpenConversation,
  onOpenSources,
  onOpenMemoryReview,
  proAllowed = true,
  onUpgrade,
  onRetryBackend,
}: Props) {
  const { t } = useI18n();
  useScrollSpy({
    enabled: showAllSections,
    sectionIds: TODO_SCROLL_SECTION_IDS,
    rootRef: scrollRootRef,
    onActiveIdChange: onScrollSectionReport,
  });
  const { openTarget } = useOpenTarget(onOpenConversation);
  const { create: createConversation } = useConversations();
  const retryFailureInChat = useCallback(
    (prompt: string, failureId?: number) => {
      const trimmed = prompt.trim();
      if (!trimmed) return;
      // Leave the open failure card while retrying — upsert/success clears it.
      // Still dismiss optimistically so Inbox doesn't feel like stacked duplicates
      // if the poll lags behind a same-goal re-fail.
      if (typeof failureId === "number") {
        void todoFeed.dismissInboxFailure(failureId);
      }
      // Fresh thread so polluted history / prior demo goals cannot hijack the retry.
      createConversation();
      queueChatDraft(trimmed, "assistant");
      onOpenConversation?.();
    },
    [createConversation, onOpenConversation, todoFeed],
  );
  const showTasks = showAllSections || subTab === "today";
  const showInbox = showAllSections || subTab === "inbox";
  const showDone = showAllSections || subTab === "done";
  const heading = getTodoPanelHeadingKeys(subTab, showAllSections);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [openBusyTaskId, setOpenBusyTaskId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proBlocked, setProBlocked] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [syncReport, setSyncReport] = useState<{
    created: Record<string, number>;
    statuses?: Record<string, string>;
  } | null>(null);
  const [syncDrawerOpen, setSyncDrawerOpen] = useState(false);
  const [meetingOpen, setMeetingOpen] = useState(false);
  const [pendingMeetingOpen, setPendingMeetingOpen] = useState(() => consumeOpenMeetingModal());
  const [laterOpen, setLaterOpen] = useState(false);
  const selection = useTaskSelection();
  const selectActions = useTaskSelectActions(tasks, setTasks, selection);

  const proLocked = !proAllowed || proBlocked;

  useEffect(() => {
    if (!pendingMeetingOpen || !backendOnline || proLocked) return;
    setPendingMeetingOpen(false);
    setMeetingOpen(true);
  }, [pendingMeetingOpen, backendOnline, proLocked]);

  const load = useCallback(async () => {
    if (!backendOnline) return;
    setLoading(true);
    setError(null);
    try {
      setTasks(await fetchTasks(true));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("tasks.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [backendOnline, t]);

  const noiseCleanup = useSecondBrainNoiseCleanup({ onSuccess: () => load() });

  useEffect(() => {
    if (!backendOnline) return;
    void noiseCleanup.refreshPreview();
  }, [backendOnline, noiseCleanup.refreshPreview]);

  const refreshAll = useCallback(async () => {
    if (!backendOnline) return;
    setSyncing(true);
    try {
      const sync = await syncTasksFromIntegrations();
      setSyncReport({ created: sync.created, statuses: sync.statuses });
      setLastSyncAt(new Date().toISOString());
      await load();
      void noiseCleanup.refreshPreview();
      if (sync.total_created > 0) {
        toast.success(
          t(sync.total_created === 1 ? "tasks.toastFoundOne" : "tasks.toastFoundOther", {
            n: sync.total_created,
          }),
        );
      }
    } catch (e) {
      if (e instanceof EntitlementBlockedError) {
        setProBlocked(true);
      } else {
        toast.error(e instanceof Error ? e.message : t("tasks.toastSyncFailed"));
      }
      await load();
    } finally {
      setSyncing(false);
    }
  }, [backendOnline, load, t, noiseCleanup.refreshPreview]);

  useEffect(() => {
    if (!backendOnline) return;
    void load();
    void fetchSchedulerStatus().then((status) => {
      if (!status) return;
      const job = status.jobs.find((j) => j.name === "integration_task_sync");
      if (job?.last_run_at) setLastSyncAt(job.last_run_at);
    });
  }, [backendOnline, load]);

  const todaySplit = useMemo(() => splitTodayTasks(tasks), [tasks]);
  const todayDayGroups = useMemo(() => groupTasksByDueDay(tasks), [tasks]);
  const upcomingDayGroups = useMemo(() => groupTasksByUpcomingDay(tasks), [tasks]);
  const completedDayGroups = useMemo(() => groupTasksByCompletedDay(tasks), [tasks]);
  const somedayTasks = useMemo(
    () => tasks.filter((task) => !task.completed && !task.due_at),
    [tasks],
  );
  const visibleSelectIds = useMemo(() => {
    if (showDone && !showTasks) return tasks.filter((task) => task.completed).map((task) => task.id);
    if (showTasks && !showDone) return tasks.filter((task) => !task.completed).map((task) => task.id);
    return tasks.map((task) => task.id);
  }, [tasks, showTasks, showDone]);

  const clearSelection = selection.clear;
  useEffect(() => {
    clearSelection();
  }, [subTab, clearSelection]);

  const handleToggle = async (task: Task) => {
    try {
      const updated = await setTaskCompleted(task.id, !task.completed);
      setTasks((prev) => prev.map((item) => (item.id === task.id ? updated : item)));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("tasks.toastUpdateFailed"));
    }
  };

  const openSource = (task: Task) => {
    if (!taskMayHaveOpenTarget(task)) return;
    setOpenBusyTaskId(task.id);
    void openTarget(() => fetchTaskOpenTarget(task.id)).finally(() => setOpenBusyTaskId(null));
  };

  const renderTaskRow = (task: Task, dueDisplay: "grouped" | "full" | "none") => (
    <TaskRow
      key={task.id}
      task={task}
      sourceBadge={taskSourceBadge(task.source, t)}
      dueDisplay={dueDisplay}
      onToggle={(item) => void handleToggle(item)}
      onSelect={(item) => selection.onSelect(item.id)}
      selected={selection.isSelected(task.id)}
      selecting={selection.selecting}
      onOpenSource={taskMayHaveOpenTarget(task) ? openSource : undefined}
      openBusy={openBusyTaskId === task.id}
    />
  );

  const scrollToDaySection = (sectionId: string | null) => {
    if (!sectionId) return;
    scrollToSectionId(sectionId, { behavior: "smooth" });
  };

  const todayHasTasks = todaySplit.overdue.length + todaySplit.dueToday.length > 0;
  const hasUpcomingContent = upcomingDayGroups.length > 0 || somedayTasks.length > 0;
  const hasAnyOpenTasks = todayHasTasks || hasUpcomingContent;
  const showSubNav = !proLocked && sidebarCompact && !showAllSections;
  const showSyncAction = !proLocked && (showAllSections || subTab !== "inbox");
  const showMeetingFab = !proLocked && showTasks;

  const sectionHeading = (titleKey: string) =>
    showAllSections ? (
      <h2 className="border-b border-border pb-2 text-base font-semibold text-text-primary">{t(titleKey)}</h2>
    ) : null;

  const renderTasksBody = () => {
    if (proLocked) return null;
    if (loading && tasks.length === 0) return <ListSkeleton />;
    if (loading) return null;

    if (!hasAnyOpenTasks) {
      return (
        <EmptyState
          title={t("tasks.emptyTitle")}
          description={t("tasks.emptyDesc")}
          primaryAction={{
            label: t("tasks.syncFromAccounts"),
            onClick: () => void refreshAll(),
          }}
        />
      );
    }

    return (
      <>
        {todayHasTasks ? (
          <TodoTaskTimeline mode="today" dueGroups={todayDayGroups} renderTask={renderTaskRow} />
        ) : null}
        <div className="mt-6">
          <TodayBriefingCard
            backendOnline={backendOnline}
            proAllowed={proAllowed}
            onUpgrade={onUpgrade}
            hideProCard={proLocked}
          />
        </div>
        {hasUpcomingContent ? (
          <TodoUpcomingLater
            showDivider={todayHasTasks}
            dueGroups={upcomingDayGroups}
            somedayTasks={somedayTasks}
            laterOpen={laterOpen}
            onToggleLater={() => setLaterOpen((value) => !value)}
            renderTask={renderTaskRow}
          />
        ) : null}
      </>
    );
  };

  const renderDoneBody = () => {
    if (loading && tasks.length === 0) return <ListSkeleton />;
    if (loading) return null;
    return completedDayGroups.length > 0 ? (
      <TodoTaskTimeline mode="completed" completedGroups={completedDayGroups} renderTask={renderTaskRow} />
    ) : (
      <EmptyState title={t("todo.doneEmptyTitle")} description={t("todo.doneEmptyDesc")} />
    );
  };

  return (
    <div className="relative w-full pb-20">
      <PanelShell
        title={t(heading.titleKey)}
        subtitle={t(heading.subtitleKey)}
        actions={
          <TaskPanelHeaderActions
            showSelect={!proLocked && !selection.selecting && visibleSelectIds.length > 0}
            selectLabel={t("tasks.select")}
            onSelect={selection.enter}
            showSync={showSyncAction}
            syncDisabled={!backendOnline}
            syncLabel={t("tasks.syncAccounts")}
            syncTitle={t("tasks.syncDetails")}
            onSync={() => setSyncDrawerOpen(true)}
          />
        }
        offlineBanner={
          !backendOnline ? (
            <OfflineStrip
              message={t("tasks.offline")}
              action={
                onRetryBackend
                  ? { label: t("offlineStrip.retryApi"), onClick: onRetryBackend }
                  : undefined
              }
            />
          ) : null
        }
      >
        {proLocked ? (
          <ProTabBanner description={t("pro.tasksFeature")} onUpgrade={() => onUpgrade?.()} />
        ) : null}

        {showSubNav ? (
          <TodoSubNav
            active={subTab}
            onSelect={(next) => onSelectSubTab?.(next)}
            badges={{
              today: todoFeed.counts.today,
              inbox: todoFeed.counts.inbox,
            }}
          />
        ) : null}

        {selection.selecting ? (
          <TaskSelectBar
            selectedCount={selection.selectedIds.length}
            onMarkDone={() => void selectActions.applySelected(true)}
            onMarkNotDone={() => void selectActions.applySelected(false)}
            onRemove={selectActions.requestRemove}
            onSelectAll={() => selection.selectAll(visibleSelectIds)}
            onCancel={selection.clear}
          />
        ) : null}

        {showAllSections ? (
          <div className="space-y-10">
            {showTasks ? (
              <section id="todo-section-today" className="space-y-4">
                {sectionHeading("nav.todoToday")}
                {!proLocked ? (
                  <TodoTodaySummary
                    overdueCount={todaySplit.overdue.length}
                    dueTodayCount={todaySplit.dueToday.length}
                    inboxCount={todoFeed.counts.inbox}
                    onOpenInbox={() => onSelectSubTab?.("inbox")}
                    onScrollToOverdue={() => scrollToDaySection(firstOverdueSectionId(todayDayGroups))}
                    onScrollToToday={() => scrollToDaySection(todaySectionId(todayDayGroups))}
                  />
                ) : null}
                {error ? (
                  <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>
                ) : null}
                {renderTasksBody()}
              </section>
            ) : null}

            {showInbox ? (
              <section id="todo-section-inbox" className="space-y-4 border-t border-border pt-10">
                {sectionHeading("nav.todoInbox")}
                <TodoInboxSection
                  inbox={todoFeed.inbox}
                  onDismissNudge={todoFeed.dismissInboxNudge}
                  onDismissAllNudges={todoFeed.dismissAllInboxNudges}
                  onDismissFailure={todoFeed.dismissInboxFailure}
                  onDismissMailReply={todoFeed.dismissMailReply}
                  onMailReplySent={() => void todoFeed.refresh()}
                  onOpenMemoryReview={() => onOpenMemoryReview?.()}
                  onOpenToday={() => onSelectSubTab?.("today")}
                  onOpenChat={() => onOpenConversation?.()}
                  onRetryFailureInChat={retryFailureInChat}
                />
              </section>
            ) : null}

            {showDone ? (
              <section id="todo-section-done" className="space-y-4 border-t border-border pt-10">
                {sectionHeading("nav.todoDone")}
                {error ? (
                  <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>
                ) : null}
                {renderDoneBody()}
              </section>
            ) : null}
          </div>
        ) : (
          <>
            {showInbox ? (
              <TodoInboxSection
                inbox={todoFeed.inbox}
                onDismissNudge={todoFeed.dismissInboxNudge}
                onDismissAllNudges={todoFeed.dismissAllInboxNudges}
                onDismissFailure={todoFeed.dismissInboxFailure}
                onDismissMailReply={todoFeed.dismissMailReply}
                onMailReplySent={() => void todoFeed.refresh()}
                onOpenMemoryReview={() => onOpenMemoryReview?.()}
                onOpenToday={() => onSelectSubTab?.("today")}
                onOpenChat={() => onOpenConversation?.()}
                onRetryFailureInChat={retryFailureInChat}
              />
            ) : null}

            {!proLocked && showTasks ? (
              <>
              <TaskPromoCleanupBanner
                count={noiseCleanup.taskCandidateCount}
                message={t("tasks.promoCleanupBanner", { n: noiseCleanup.taskCandidateCount })}
                actionLabel={t("cleanup.actionTasks")}
                onRemove={() => void noiseCleanup.openDialog()}
              />
              <TodoTodaySummary
                overdueCount={todaySplit.overdue.length}
                dueTodayCount={todaySplit.dueToday.length}
                inboxCount={todoFeed.counts.inbox}
                onOpenInbox={() => onSelectSubTab?.("inbox")}
                onScrollToOverdue={() => scrollToDaySection(firstOverdueSectionId(todayDayGroups))}
                onScrollToToday={() => scrollToDaySection(todaySectionId(todayDayGroups))}
              />
              </>
            ) : null}

            {!showInbox && error ? (
              <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>
            ) : null}

            {showTasks ? renderTasksBody() : showDone && !loading ? renderDoneBody() : null}
          </>
        )}
      </PanelShell>

      {showMeetingFab ? (
        <TaskMeetingFab
          disabled={!backendOnline}
          label={t("tasks.recordMeeting")}
          onClick={() => setMeetingOpen(true)}
        />
      ) : null}

      <TasksPanelModals
        syncDrawerOpen={syncDrawerOpen}
        onCloseSyncDrawer={() => setSyncDrawerOpen(false)}
        lastSyncAt={lastSyncAt}
        syncReport={syncReport}
        onOpenSources={onOpenSources}
        onSync={() => void refreshAll()}
        syncing={syncing}
        cleanup={noiseCleanup}
        meetingOpen={meetingOpen}
        onCloseMeeting={() => setMeetingOpen(false)}
        backendOnline={backendOnline}
        onMeetingEnded={() => void load()}
        onOpenConversation={onOpenConversation}
        proAllowed={proAllowed}
        onUpgrade={onUpgrade}
        removeOpen={selectActions.removeOpen}
        removeCount={selection.selectedIds.length}
        onCloseRemove={selectActions.closeRemove}
        onConfirmRemove={() => void selectActions.applyRemoved()}
      />
    </div>
  );
}
