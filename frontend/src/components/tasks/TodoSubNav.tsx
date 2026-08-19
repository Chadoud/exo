import type { TodoSubTab } from "../../utils/todoUi";
import { TODO_TAB_ICONS } from "../../utils/todoNavIcons";
import { useI18n } from "../../i18n/I18nContext";

const SUB_TABS: TodoSubTab[] = ["today", "inbox", "done"];

const LABEL_KEYS: Record<TodoSubTab, string> = {
  today: "nav.todoToday",
  inbox: "nav.todoInbox",
  done: "nav.todoDone",
};

type TodoSubNavProps = {
  active: TodoSubTab;
  onSelect: (tab: TodoSubTab) => void;
  badges?: Partial<Record<TodoSubTab, number>>;
};

/** Compact-rail To Do tabs — same names as the sidebar, not equal-width pills. */
export default function TodoSubNav({ active, onSelect, badges }: TodoSubNavProps) {
  const { t } = useI18n();

  return (
    <nav
      className="mb-4 flex w-full gap-1.5 overflow-x-auto border-b border-border pb-3"
      aria-label={t("nav.todo")}
    >
      {SUB_TABS.map((tab) => {
        const count = badges?.[tab] ?? 0;
        const isActive = tab === active;
        const label = t(LABEL_KEYS[tab]);
        return (
          <button
            key={tab}
            type="button"
            aria-current={isActive ? "page" : undefined}
            onClick={() => onSelect(tab)}
            className={`inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors min-h-8
              ${
                isActive
                  ? "bg-button-primary text-white"
                  : "text-muted hover:bg-hover-overlay hover:text-text-primary"
              }`}
          >
            <svg
              className="h-3.5 w-3.5 shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.75}
              aria-hidden
            >
              <path strokeLinecap="round" strokeLinejoin="round" d={TODO_TAB_ICONS[tab]} />
            </svg>
            <span>{label}</span>
            {count > 0 ? (
              <span
                className={`rounded-full px-1.5 py-px text-[10px] font-bold tabular-nums leading-none
                  ${isActive ? "bg-white/25 text-white" : "bg-accent/15 text-accent"}`}
                aria-label={t("todo.tabBadge", { label, n: count })}
              >
                {count > 99 ? "99+" : count}
              </span>
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}
