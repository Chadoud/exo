import type { ReactNode } from "react";
import type { Task } from "../../api/tasks";
import {
  formatTaskDue,
  formatTaskDueTime,
  isTaskOverdue,
} from "../../utils/taskDueFormat";
import { useI18n } from "../../i18n/I18nContext";

export type TaskSourceBadge = {
  label: string;
  tone: string;
};

type TaskRowProps = {
  task: Task;
  sourceBadge: TaskSourceBadge;
  dueDisplay: "grouped" | "full" | "none";
  onToggle: (task: Task) => void;
  onSelect: (task: Task) => void;
  selected?: boolean;
  selecting?: boolean;
  onOpenSource?: (task: Task) => void;
  openBusy?: boolean;
  replySlot?: ReactNode;
};

/** Phone-matched row: tap body to select; circle marks done unless already selecting. */
export default function TaskRow({
  task,
  sourceBadge,
  dueDisplay,
  onToggle,
  onSelect,
  selected = false,
  selecting = false,
  onOpenSource,
  openBusy = false,
  replySlot,
}: TaskRowProps) {
  const { t } = useI18n();
  const overdue = isTaskOverdue(task.due_at, task.completed);

  const dueLabel =
    dueDisplay === "none" || !task.due_at
      ? null
      : dueDisplay === "grouped"
        ? formatTaskDueTime(task.due_at, task.source, t("tasks.allDay"))
        : `${overdue ? t("tasks.overdue") : t("tasks.due")}${formatTaskDue(task.due_at)}`;

  const cardTone = selected ? "border-accent bg-accent/10" : "border-border bg-bg-secondary";

  return (
    <li className="flex items-start gap-2">
      <TaskRowLeading
        task={task}
        selecting={selecting}
        selected={selected}
        onToggle={onToggle}
        onSelect={onSelect}
      />
      <div
        className={`min-w-0 flex-1 rounded-xl border px-2 transition-colors ${cardTone} ${
          task.completed && !selected ? "opacity-75" : ""
        }`}
      >
      <div className="flex items-stretch">
        <button
          type="button"
          onClick={() => onSelect(task)}
          className="min-w-0 flex-1 cursor-pointer px-1 py-3 text-left"
        >
          <p
            className={`text-sm leading-snug ${
              task.completed ? "text-muted line-through" : "text-text-primary"
            }`}
          >
            {task.description}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${sourceBadge.tone}`}>
              {sourceBadge.label}
            </span>
            {dueLabel ? (
              <span
                className={`text-[11px] ${
                  dueDisplay === "full" && overdue
                    ? "font-medium text-red-400"
                    : dueDisplay === "grouped"
                      ? "text-muted tabular-nums"
                      : "text-muted"
                }`}
              >
                {dueLabel}
              </span>
            ) : null}
          </div>
        </button>
        {onOpenSource ? (
          <button
            type="button"
            onClick={() => onOpenSource(task)}
            disabled={openBusy}
            className="m-3 shrink-0 self-start rounded-md border border-border px-2 py-1 text-xs font-medium text-accent hover:bg-bg-primary disabled:opacity-50"
          >
            {openBusy ? t("memories.opening") : t("memories.open")}
          </button>
        ) : null}
      </div>
      {replySlot}
      </div>
    </li>
  );
}

type TaskRowLeadingProps = {
  task: Task;
  selecting: boolean;
  selected: boolean;
  onToggle: (task: Task) => void;
  onSelect: (task: Task) => void;
};

function TaskRowLeading({ task, selecting, selected, onToggle, onSelect }: TaskRowLeadingProps) {
  const { t } = useI18n();
  const checked = selecting ? selected : task.completed;
  const shape = selecting ? "rounded-[4px]" : "rounded-full";
  return (
    <button
      type="button"
      onClick={() => (selecting ? onSelect(task) : onToggle(task))}
      className={`mt-1 flex h-8 w-8 shrink-0 items-center justify-center border-2 transition-colors ${shape} ${
        selecting
          ? selected
            ? "border-accent bg-button-primary text-white"
            : "border-border hover:border-accent"
          : task.completed
            ? "border-accent bg-button-primary text-white"
            : "border-border hover:border-accent"
      }`}
      aria-label={
        selecting
          ? task.description
          : task.completed
            ? t("tasks.markIncomplete")
            : t("tasks.markComplete")
      }
      aria-pressed={selecting ? selected : undefined}
    >
      {checked ? (
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      ) : null}
    </button>
  );
}
