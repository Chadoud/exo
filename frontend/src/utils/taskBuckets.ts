import type { Task } from "../api/tasks";
import { localDayKey, startOfLocalDay } from "./taskDueFormat";

function startOfToday(): Date {
  return startOfLocalDay();
}

function startOfTomorrow(): Date {
  const d = startOfToday();
  d.setDate(d.getDate() + 1);
  return d;
}

export type DueDayLabelKind = "today" | "yesterday" | "overdue" | "upcoming";

export type DueDayGroup = {
  dayKey: string;
  dayStart: Date;
  labelKind: DueDayLabelKind;
  tasks: Task[];
};

export type CompletedDayGroup = {
  dayKey: string;
  dayStart: Date;
  tasks: Task[];
};

type TodayTaskSplit = {
  overdue: Task[];
  dueToday: Task[];
};

/** Overdue day groups shown before "Show older days" control. */
export const OVERDUE_DAYS_INITIAL = 3;
/** Additional overdue day groups revealed per expand click. */
export const OVERDUE_DAYS_EXPAND_BY = 7;
/** When overdue day count exceeds this, collapse older groups. */
export const OVERDUE_DAY_COLLAPSE_THRESHOLD = 4;

function sortTasksByDueAsc(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    const aMs = a.due_at ? new Date(a.due_at).getTime() : 0;
    const bMs = b.due_at ? new Date(b.due_at).getTime() : 0;
    return aMs - bMs;
  });
}

function sortTasksByCompletedDesc(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    const aMs = a.completed_at ? new Date(a.completed_at).getTime() : 0;
    const bMs = b.completed_at ? new Date(b.completed_at).getTime() : 0;
    return bMs - aMs;
  });
}

function labelKindForDueDay(dayStart: Date, todayStart: Date): DueDayLabelKind {
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  const dayMs = dayStart.getTime();
  if (dayMs === todayStart.getTime()) return "today";
  if (dayMs === yesterdayStart.getTime()) return "yesterday";
  return "overdue";
}

function completionDayStart(task: Task): Date | null {
  const iso = task.completed_at ?? task.due_at ?? task.updated_at;
  if (!iso) return null;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  return startOfLocalDay(parsed);
}

/** Split open tasks due before tomorrow into overdue (before today) vs due today. */
export function splitTodayTasks(tasks: Task[]): TodayTaskSplit {
  const todayStart = startOfToday().getTime();
  const tomorrowStart = startOfTomorrow().getTime();
  const overdue: Task[] = [];
  const dueToday: Task[] = [];

  for (const task of tasks) {
    if (task.completed || !task.due_at) continue;
    const dueMs = new Date(task.due_at).getTime();
    if (Number.isNaN(dueMs) || dueMs >= tomorrowStart) continue;
    if (dueMs < todayStart) overdue.push(task);
    else dueToday.push(task);
  }

  return { overdue, dueToday };
}

/** Open tasks due on or before today, grouped by local due day (oldest first). */
export function groupTasksByDueDay(tasks: Task[]): DueDayGroup[] {
  const todayStart = startOfToday();
  const tomorrowStart = startOfTomorrow();
  const map = new Map<string, DueDayGroup>();

  for (const task of tasks) {
    if (task.completed || !task.due_at) continue;
    const due = new Date(task.due_at);
    if (Number.isNaN(due.getTime()) || due >= tomorrowStart) continue;

    const dayKey = localDayKey(task.due_at);
    if (!dayKey) continue;

    let group = map.get(dayKey);
    if (!group) {
      const dayStart = startOfLocalDay(due);
      group = {
        dayKey,
        dayStart,
        labelKind: labelKindForDueDay(dayStart, todayStart),
        tasks: [],
      };
      map.set(dayKey, group);
    }
    group.tasks.push(task);
  }

  const groups = [...map.values()].sort((a, b) => a.dayStart.getTime() - b.dayStart.getTime());
  for (const group of groups) {
    group.tasks = sortTasksByDueAsc(group.tasks);
  }
  return groups;
}

/** Open tasks due tomorrow or later, grouped by local due day. */
export function groupTasksByUpcomingDay(tasks: Task[]): DueDayGroup[] {
  const tomorrowStart = startOfTomorrow();
  const map = new Map<string, DueDayGroup>();

  for (const task of tasks) {
    if (task.completed || !task.due_at) continue;
    const due = new Date(task.due_at);
    if (Number.isNaN(due.getTime()) || due < tomorrowStart) continue;

    const dayKey = localDayKey(task.due_at);
    if (!dayKey) continue;

    let group = map.get(dayKey);
    if (!group) {
      group = {
        dayKey,
        dayStart: startOfLocalDay(due),
        labelKind: "upcoming",
        tasks: [],
      };
      map.set(dayKey, group);
    }
    group.tasks.push(task);
  }

  const groups = [...map.values()].sort((a, b) => a.dayStart.getTime() - b.dayStart.getTime());
  for (const group of groups) {
    group.tasks = sortTasksByDueAsc(group.tasks);
  }
  return groups;
}

/** Completed tasks grouped by completion day (newest day first). */
export function groupTasksByCompletedDay(tasks: Task[]): CompletedDayGroup[] {
  const map = new Map<string, CompletedDayGroup>();

  for (const task of tasks) {
    if (!task.completed) continue;
    const dayStart = completionDayStart(task);
    if (!dayStart) continue;

    const dayKey = `${dayStart.getFullYear()}-${String(dayStart.getMonth() + 1).padStart(2, "0")}-${String(dayStart.getDate()).padStart(2, "0")}`;
    let group = map.get(dayKey);
    if (!group) {
      group = { dayKey, dayStart, tasks: [] };
      map.set(dayKey, group);
    }
    group.tasks.push(task);
  }

  const groups = [...map.values()].sort((a, b) => b.dayStart.getTime() - a.dayStart.getTime());
  for (const group of groups) {
    group.tasks = sortTasksByCompletedDesc(group.tasks);
  }
  return groups;
}

export function countOpenTasks(tasks: Task[]): number {
  return tasks.filter((task) => !task.completed).length;
}

export function countCompletedTasks(tasks: Task[]): number {
  return tasks.filter((task) => task.completed).length;
}

export function countTodayOpenTasks(tasks: Task[]): number {
  const { overdue, dueToday } = splitTodayTasks(tasks);
  return overdue.length + dueToday.length;
}

/** Overdue day groups (everything except the today group). */
export function overdueDayGroups(groups: DueDayGroup[]): DueDayGroup[] {
  return groups.filter((group) => group.labelKind !== "today");
}
