import { useCallback, useEffect, useMemo, useState, type RefObject } from "react";
import { toast } from "sonner";
import { announceTaskSync } from "../utils/taskSyncToast";
import TaskMeetingFab from "./tasks/TaskMeetingFab";
import TaskPromoCleanupBanner from "./tasks/TaskPromoCleanupBanner";
import TasksPanelModals from "./tasks/TasksPanelModals";
import TaskSelectBar from "./tasks/TaskSelectBar";
import TaskPanelHeaderActions from "./tasks/TaskPanelHeaderActions";
import TodoAttentionPanes from "./tasks/TodoAttentionPanes";
import TodoOpenTasksBody from "./tasks/TodoOpenTasksBody";
import TodoSubNav from "./tasks/TodoSubNav";
import TodoTaskTimeline, { firstOverdueSectionId, todaySectionId } from "./tasks/TodoTaskTimeline";
import TodoTodaySummary from "./tasks/TodoTodaySummary";
import PanelShell from "./ui/PanelShell";
import OfflineStrip from "./ui/OfflineStrip";
import ProTabBanner from "./ui/ProTabBanner";
import EmptyState from "./ui/EmptyState";
import ListSkeleton from "./ui/ListSkeleton";
import { EntitlementBlockedError } from "../api/client";
import { fetchTasks, fetchTaskOpenTarget, setTaskCompleted, syncTasksFromIntegrations, type Task } from "../api/tasks";
import MailReplyInboxSection from "./tasks/MailReplyInboxSection";
import { useTasksPanelMail } from "../hooks/useTasksPanelMail";
import { useSecondBrainNoiseCleanup } from "../hooks/useSecondBrainNoiseCleanup";
import { consumeOpenMeetingModal } from "../utils/deferredPanelActions";
import { useOpenTarget } from "../hooks/useOpenTarget";
import { useInboxDismiss } from "../hooks/useInboxDismiss";
import { useInboxSelection } from "../hooks/useInboxSelection";
import { useTaskSelectActions } from "../hooks/useTaskSelectActions";
import { useTaskSelection } from "../hooks/useTaskSelection";
import { useTodoSelectHeader } from "../hooks/useTodoSelectHeader";
import { useTodoUndo } from "../hooks/useTodoUndo";
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
  const [meetingOpen, setMeetingOpen] = useState(false);
  const [pendingMeetingOpen, setPendingMeetingOpen] = useState(() => consumeOpenMeetingModal());
  const [laterOpen, setLaterOpen] = useState(true);
  const selection = useTaskSelection();
  const inboxSelection = useInboxSelection();
  const todoUndo = useTodoUndo();
  const selectActions = useTaskSelectActions(tasks, setTasks, selection, todoUndo, () => {
    void todoFeed.refresh({ silent: true });
  });
  const inboxDismiss = useInboxDismiss({
    dismissNudge: todoFeed.dismissInboxNudge,
    dismissFailure: todoFeed.dismissInboxFailure,
    dismissMail: todoFeed.dismissMailReply,
    refresh: todoFeed.refresh,
    pushUndo: todoUndo.push,
    undo: todoUndo.undo,
  });

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
      await load();
      void noiseCleanup.refreshPreview();
      announceTaskSync(
        sync,
        {
          foundOne: t("tasks.toastFoundOne", { n: sync.total_created }),
          foundOther: t("tasks.toastFoundOther", { n: sync.total_created }),
          none: t("tasks.toastNone"),
          notConnected: t("tasks.toastNotConnected"),
          connectLabel: t("tasks.connectInSources"),
        },
        onOpenSources,
      );
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
  }, [backendOnline, load, t, noiseCleanup.refreshPreview, onOpenSources]);

  useEffect(() => {
    if (!backendOnline) return;
    void load();
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
  const clearInboxSelection = inboxSelection.clear;
  useEffect(() => {
    clearSelection();
    clearInboxSelection();
  }, [subTab, clearSelection, clearInboxSelection]);

  const { pendingKeys, showSelect, onHeaderSelect } = useTodoSelectHeader({
    proLocked,
    subTab,
    showAllSections,
    taskSelecting: selection.selecting,
    inboxSelecting: inboxSelection.selecting,
    visibleTaskIds: visibleSelectIds,
    inbox: todoFeed.inbox,
    enterTasks: selection.enter,
  });

  const handleToggle = async (task: Task) => {
    try {
      const updated = await setTaskCompleted(task.id, !task.completed);
      setTasks((prev) => prev.map((item) => (item.id === task.id ? updated : item)));
      void todoFeed.refresh({ silent: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("tasks.toastUpdateFailed"));
    }
  };

  const openSource = (task: Task) => {
    if (!taskMayHaveOpenTarget(task)) return;
    setOpenBusyTaskId(task.id);
    void openTarget(() => fetchTaskOpenTarget(task.id)).finally(() => setOpenBusyTaskId(null));
  };

  const { mailHarvesting, unmatchedReplies, renderTaskRow, onMailHarvested } = useTasksPanelMail({
    backendOnline,
    harvestEnabled: backendOnline && showTasks && !proLocked,
    refreshFeed: todoFeed.refresh,
    setTasks,
    tasks,
    mailReplies: todoFeed.inbox.mailReplies,
    t,
    onToggle: (item) => void handleToggle(item),
    onSelect: (item) => selection.onSelect(item.id),
    isSelected: selection.isSelected,
    selecting: selection.selecting,
    openSource,
    openBusyTaskId,
    dismissMail: inboxDismiss.dismissItems,
  });

  const scrollToDaySection = (sectionId: string | null) => {
    if (!sectionId) return;
    scrollToSectionId(sectionId, { behavior: "smooth" });
  };

  const todayHasTasks = todaySplit.overdue.length + todaySplit.dueToday.length > 0;
  const hasUpcomingContent = upcomingDayGroups.length > 0 || somedayTasks.length > 0;
  const hasAnyOpenTasks = todayHasTasks || hasUpcomingContent || unmatchedReplies.length > 0;
  const showSubNav = !proLocked && sidebarCompact && !showAllSections;
  const showSyncAction = !proLocked && (showAllSections || subTab !== "inbox");
  const showMeetingFab = !proLocked && showTasks;
  const sectionHeading = (titleKey: string) =>
    showAllSections ? (
      <h2 className="border-b border-border pb-2 text-base font-semibold text-text-primary">{t(titleKey)}</h2>
    ) : null;

  const renderTasksBody = () => (
    <TodoOpenTasksBody
      proLocked={proLocked}
      loading={loading}
      hasLoadedTasks={tasks.length > 0}
      hasAnyOpenTasks={hasAnyOpenTasks}
      todayHasTasks={todayHasTasks}
      hasUpcomingContent={hasUpcomingContent}
      backendOnline={backendOnline}
      proAllowed={proAllowed}
      onUpgrade={onUpgrade}
      todayDayGroups={todayDayGroups}
      upcomingDayGroups={upcomingDayGroups}
      somedayTasks={somedayTasks}
      laterOpen={laterOpen}
      onToggleLater={() => setLaterOpen((value) => !value)}
      renderTask={renderTaskRow}
      unmatchedReplies={
        unmatchedReplies.length > 0 ? (
          <MailReplyInboxSection
            items={unmatchedReplies}
            licensed
            showHeading={false}
            onDismiss={(id) => inboxDismiss.dismissItems([{ kind: "mail", id }])}
            onSent={() => void onMailHarvested({ silent: true })}
          />
        ) : null
      }
      mailHarvesting={mailHarvesting}
      readingLabel={t("todo.inbox.mailReply.reading")}
      readyRepliesHeading={t("todo.readyRepliesHeading")}
      emptyTitle={t("tasks.emptyTitle")}
      emptyDesc={t("tasks.emptyDesc")}
      syncLabel={t("tasks.syncFromAccounts")}
      onSync={() => void refreshAll()}
    />
  );

  const renderDoneBody = () => {
    if (loading && tasks.length === 0) return <ListSkeleton />;
    if (loading) return null;
    return completedDayGroups.length > 0 ? (
      <TodoTaskTimeline mode="completed" completedGroups={completedDayGroups} renderTask={renderTaskRow} />
    ) : (
      <EmptyState title={t("todo.doneEmptyTitle")} description={t("todo.doneEmptyDesc")} />
    );
  };

  const attentionPanes = (
    <TodoAttentionPanes
      showAllSections={showAllSections}
      showInbox={showInbox}
      sectionHeading={sectionHeading}
      feed={todoFeed}
      dismissItems={inboxDismiss.dismissItems}
      registerUndo={inboxDismiss.registerUndo}
      onOpenMemoryReview={onOpenMemoryReview}
      onOpenToday={() => onSelectSubTab?.("today")}
      onOpenChat={() => onOpenConversation?.()}
      onRetryFailureInChat={retryFailureInChat}
      selecting={inboxSelection.selecting}
      selectedIds={inboxSelection.selectedIds}
      pendingKeys={pendingKeys}
      isSelected={inboxSelection.isSelected}
      onSelect={backendOnline ? inboxSelection.onSelect : undefined}
      onSelectAll={inboxSelection.selectAll}
      onClear={inboxSelection.clear}
    />
  );

  return (
    <div className="relative w-full pb-20">
      <PanelShell
        title={t(heading.titleKey)}
        subtitle={t(heading.subtitleKey)}
        actions={
          <TaskPanelHeaderActions
            showSelect={showSelect && backendOnline}
            selectLabel={t("tasks.select")}
            onSelect={onHeaderSelect}
            showSync={showSyncAction}
            syncDisabled={!backendOnline || syncing}
            syncLabel={syncing ? t("tasks.syncing") : t("tasks.syncAccounts")}
            syncTitle={t("tasks.syncDetails")}
            onSync={() => void refreshAll()}
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
              today: todoFeed.counts.open + todoFeed.counts.replies,
              inbox: todoFeed.counts.inbox,
              done: todoFeed.counts.done,
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
                    undatedCount={somedayTasks.length}
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

            {attentionPanes}

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
            {attentionPanes}

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
                undatedCount={somedayTasks.length}
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
