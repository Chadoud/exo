import type { ReactNode } from "react";
import type { Task } from "../../api/tasks";
import { useI18n } from "../../i18n/I18nContext";
import TodoTaskTimeline from "./TodoTaskTimeline";
import type { DueDayGroup } from "../../utils/taskBuckets";

type TodoUpcomingLaterProps = {
  showDivider: boolean;
  dueGroups: DueDayGroup[];
  somedayTasks: Task[];
  laterOpen: boolean;
  onToggleLater: () => void;
  renderTask: (task: Task, dueDisplay: "grouped" | "full" | "none") => ReactNode;
};

export default function TodoUpcomingLater({
  showDivider,
  dueGroups,
  somedayTasks,
  laterOpen,
  onToggleLater,
  renderTask,
}: TodoUpcomingLaterProps) {
  const { t } = useI18n();
  return (
    <div
      id="todo-upcoming-section"
      className={showDivider ? "mt-10 space-y-5 border-t border-border pt-10" : "space-y-5"}
    >
      {showDivider ? (
        <h2 className="text-base font-semibold text-text-primary">{t("nav.todoUpcoming")}</h2>
      ) : null}
      <TodoTaskTimeline mode="upcoming" dueGroups={dueGroups} renderTask={renderTask} />
      {somedayTasks.length > 0 ? (
        <section className="space-y-2">
          <button
            type="button"
            onClick={onToggleLater}
            className="flex w-full items-center justify-between px-0.5 text-sm font-medium text-muted hover:text-text-primary"
          >
            {t("tasks.laterSection", { n: somedayTasks.length })}
            <svg
              className={`h-4 w-4 transition-transform ${laterOpen ? "rotate-180" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {laterOpen ? (
            <ul className="space-y-2">{somedayTasks.map((task) => renderTask(task, "none"))}</ul>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
