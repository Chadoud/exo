import type { UiLocale } from "../i18n/locale";
import { translate } from "../i18n/translate";
import { modShortcutLabel } from "../utils/platform";
import type { CaptureSubTab } from "../utils/captureUi";
import type { MemorySubTab } from "../utils/memoryUi";
import type { TodoSubTab } from "../utils/todoUi";
import type { SettingsNavTab } from "../utils/settingsNav";
import type { MainNavGroup, MainNavItem, MainNavTab } from "../hooks/useMainNavItems";
import { useSidebarNavExpand } from "../hooks/useSidebarNavExpand";
import { hasSidebarDropdown } from "../utils/sidebarNavExpand";
import { SIDEBAR_SUBNAV_ACTIVE_CLASS } from "../utils/styles";

const CHEVRON_DOWN_PATH = "M19.5 8.25 12 15.75 4.5 8.25";

type SidebarNavProps = {
  items: MainNavItem[];
  activeTab: MainNavTab;
  memorySubTab: MemorySubTab;
  memoryShowAllSections: boolean;
  captureSubTab: CaptureSubTab;
  todoSubTab: TodoSubTab;
  todoShowAllSections: boolean;
  settingsSubTab: SettingsNavTab;
  settingsShowAllSections: boolean;
  settingsHighlightedSubTab?: SettingsNavTab | null;
  memoryHighlightedSubTab?: MemorySubTab | null;
  todoHighlightedSubTab?: TodoSubTab | null;
  onSelect: (
    id: MainNavTab,
    memorySubTab?: MemorySubTab,
    settingsSubTab?: SettingsNavTab,
    todoSubTab?: TodoSubTab,
    openAllSections?: boolean,
    captureSubTab?: CaptureSubTab,
  ) => void;
  uiLocale: UiLocale;
  isAwaitingApproval: boolean;
  installingModel: boolean;
};

type NavButtonProps = {
  item: MainNavItem;
  activeTab: MainNavTab;
  memorySubTab: MemorySubTab;
  memoryShowAllSections: boolean;
  captureSubTab: CaptureSubTab;
  todoSubTab: TodoSubTab;
  todoShowAllSections: boolean;
  settingsSubTab: SettingsNavTab;
  settingsShowAllSections: boolean;
  settingsHighlightedSubTab?: SettingsNavTab | null;
  memoryHighlightedSubTab?: MemorySubTab | null;
  todoHighlightedSubTab?: TodoSubTab | null;
  onSelect: SidebarNavProps["onSelect"];
  uiLocale: UiLocale;
  isAwaitingApproval: boolean;
  installingModel: boolean;
  /** Nested items render smaller and indented to read as children. */
  isChild?: boolean;
  hasDropdown?: boolean;
  dropdownOpen?: boolean;
};

function isNavItemActive(
  item: MainNavItem,
  activeTab: MainNavTab,
  memorySubTab: MemorySubTab,
  memoryShowAllSections: boolean,
  memoryHighlightedSubTab: MemorySubTab | null | undefined,
  todoSubTab: TodoSubTab,
  todoShowAllSections: boolean,
  todoHighlightedSubTab: TodoSubTab | null | undefined,
  settingsSubTab: SettingsNavTab,
  settingsShowAllSections: boolean,
  settingsHighlightedSubTab: SettingsNavTab | null | undefined,
  captureSubTab: CaptureSubTab,
): boolean {
  if (activeTab !== item.id) return false;
  if (item.captureSubTab !== undefined) {
    return captureSubTab === item.captureSubTab;
  }
  if (item.settingsSubTab !== undefined) {
    if (settingsShowAllSections) {
      return settingsHighlightedSubTab === item.settingsSubTab;
    }
    return settingsSubTab === item.settingsSubTab;
  }
  if (item.memorySubTab !== undefined) {
    if (memoryShowAllSections) {
      return memoryHighlightedSubTab === item.memorySubTab;
    }
    return memorySubTab === item.memorySubTab;
  }
  if (item.todoSubTab !== undefined) {
    if (todoShowAllSections) {
      return todoHighlightedSubTab === item.todoSubTab;
    }
    return todoSubTab === item.todoSubTab;
  }
  if (item.id === "memories" && item.children?.some((c) => c.memorySubTab !== undefined)) {
    return memoryShowAllSections && !memoryHighlightedSubTab;
  }
  if (item.id === "tasks" && item.children?.some((c) => c.todoSubTab !== undefined)) {
    return todoShowAllSections && !todoHighlightedSubTab;
  }
  if (item.id === "settings" && item.children?.some((c) => c.settingsSubTab !== undefined)) {
    return settingsShowAllSections && !settingsHighlightedSubTab;
  }
  return true;
}

function NavButton({
  item,
  activeTab,
  memorySubTab,
  memoryShowAllSections,
  captureSubTab,
  todoSubTab,
  todoShowAllSections,
  settingsSubTab,
  settingsShowAllSections,
  settingsHighlightedSubTab = null,
  memoryHighlightedSubTab = null,
  todoHighlightedSubTab = null,
  onSelect,
  uiLocale,
  isAwaitingApproval,
  installingModel,
  isChild = false,
  hasDropdown = false,
  dropdownOpen = false,
}: NavButtonProps) {
  const { id, label, icon, badge, shortcutKey, memorySubTab: itemMemorySubTab, todoSubTab: itemTodoSubTab, settingsSubTab: itemSettingsSubTab, captureSubTab: itemCaptureSubTab } =
    item;
  const childActive = isNavItemActive(
    item,
    activeTab,
    memorySubTab,
    memoryShowAllSections,
    memoryHighlightedSubTab,
    todoSubTab,
    todoShowAllSections,
    todoHighlightedSubTab,
    settingsSubTab,
    settingsShowAllSections,
    settingsHighlightedSubTab,
    captureSubTab,
  );
  const ownsCollapsedRoute =
    !isChild &&
    hasDropdown &&
    !dropdownOpen &&
    (activeTab === id || Boolean(item.children?.some((child) => child.id === activeTab)));
  const isActive = ownsCollapsedRoute || childActive;
  const isParentWithChildren =
    !isChild &&
    ((id === "memories" && item.children?.some((c) => c.memorySubTab !== undefined)) ||
      (id === "capture" && item.children?.some((c) => c.captureSubTab !== undefined)) ||
      (id === "tasks" && item.children?.some((c) => c.todoSubTab !== undefined)) ||
      (id === "settings" && item.children?.some((c) => c.settingsSubTab !== undefined)));

  return (
    <button
      type="button"
      data-tour={`nav-${item.navKey ?? id}`}
      aria-expanded={hasDropdown ? dropdownOpen : undefined}
      aria-controls={hasDropdown ? `sidebar-subnav-${id}` : undefined}
      title={translate(uiLocale, "navShortcutTitle", {
        label,
        shortcut: `${modShortcutLabel()}+${shortcutKey ?? ""}`,
      })}
      onClick={() => {
        onSelect(
          id,
          itemMemorySubTab,
          itemSettingsSubTab,
          itemTodoSubTab,
          isParentWithChildren,
          itemCaptureSubTab,
        );
      }}
      className={`sidebar-nav-btn relative group flex w-full min-w-0 select-none flex-row items-center justify-start gap-2 rounded-xl transition-all font-medium
        ${isChild ? "pl-9 pr-3 py-2 text-[11px]" : "px-3 py-2.5 text-xs"}
        ${
          isActive
            ? isChild
              ? SIDEBAR_SUBNAV_ACTIVE_CLASS
              : "bg-button-primary text-white"
            : "text-muted hover:text-text-primary hover:bg-hover-overlay"
        }`}
    >
      <svg
        className={`${isChild ? "h-4 w-4" : "h-5 w-5"} shrink-0`}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.75}
        aria-hidden
      >
        <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
      </svg>
      <span className="sidebar-nav-label flex min-w-0 flex-1 items-center gap-1.5 text-left leading-tight">
        <span className="min-w-0 truncate">{label}</span>
        {badge ? (
          <span
            className={`shrink-0 rounded px-1 py-px text-[10px] font-semibold leading-none tracking-wide
              ${
                isActive
                  ? isChild
                    ? "bg-accent/15 text-accent"
                    : "bg-white/25 text-white"
                  : "bg-black/5 text-text-secondary dark:bg-white/10 dark:text-text-secondary"
              }`}
          >
            {badge}
          </span>
        ) : null}
      </span>
      {id === "queue" && isAwaitingApproval && (
        <span
          className={`w-2 h-2 shrink-0 rounded-full motion-safe:animate-pulse
          ${isActive ? "bg-white" : "bg-amber-400"}`}
        />
      )}
      {id === "settings" && !itemSettingsSubTab && installingModel && (
        <span
          className={`w-2 h-2 shrink-0 rounded-full motion-safe:animate-pulse
          ${isActive ? "bg-white" : "bg-accent"}`}
        />
      )}
      {hasDropdown ? (
        <svg
          className={`sidebar-nav-chevron h-3.5 w-3.5 shrink-0 transition-transform ${
            dropdownOpen ? "rotate-180" : ""
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden
        >
          <path strokeLinecap="round" strokeLinejoin="round" d={CHEVRON_DOWN_PATH} />
        </svg>
      ) : null}
    </button>
  );
}

function groupLabel(group: MainNavGroup, uiLocale: UiLocale): string {
  if (group === "files") return translate(uiLocale, "nav.groupFiles");
  if (group === "todo") return translate(uiLocale, "nav.groupTodo");
  if (group === "settings") return translate(uiLocale, "nav.groupSettings");
  return translate(uiLocale, "nav.groupAssistant");
}

export default function SidebarNav({
  items,
  activeTab,
  memorySubTab,
  memoryShowAllSections,
  captureSubTab,
  todoSubTab,
  todoShowAllSections,
  settingsSubTab,
  settingsShowAllSections,
  settingsHighlightedSubTab = null,
  memoryHighlightedSubTab = null,
  todoHighlightedSubTab = null,
  onSelect,
  uiLocale,
  isAwaitingApproval,
  installingModel,
}: SidebarNavProps) {
  const { isExpanded, onParentActivate } = useSidebarNavExpand(items, activeTab);

  return (
    <nav className="flex flex-col gap-1 p-2">
      {items.map((item, index) => {
        const previousGroup = index > 0 ? items[index - 1]?.group : undefined;
        const showGroupHeader = item.group && item.group !== previousGroup;
        const dropdown = hasSidebarDropdown(item);
        const dropdownOpen = dropdown && isExpanded(item.id);
        return (
          <div key={item.navKey ?? item.id} className="flex flex-col gap-1">
            {showGroupHeader ? (
              <p className="sidebar-nav-group-label px-3 pb-0.5 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted first:pt-0">
                {groupLabel(item.group!, uiLocale)}
              </p>
            ) : null}
            <NavButton
              item={item}
              activeTab={activeTab}
              memorySubTab={memorySubTab}
              memoryShowAllSections={memoryShowAllSections}
              captureSubTab={captureSubTab}
              todoSubTab={todoSubTab}
              todoShowAllSections={todoShowAllSections}
              settingsSubTab={settingsSubTab}
              settingsShowAllSections={settingsShowAllSections}
              settingsHighlightedSubTab={settingsHighlightedSubTab}
              memoryHighlightedSubTab={memoryHighlightedSubTab}
              todoHighlightedSubTab={todoHighlightedSubTab}
              onSelect={(id, memory, settings, todo, openAll, capture) => {
                if (dropdown && onParentActivate(item.id) === "collapse") return;
                onSelect(id, memory, settings, todo, openAll, capture);
              }}
              uiLocale={uiLocale}
              isAwaitingApproval={isAwaitingApproval}
              installingModel={installingModel}
              hasDropdown={dropdown}
              dropdownOpen={dropdownOpen}
            />
            {dropdown ? (
              <div id={`sidebar-subnav-${item.id}`} role="group" hidden={!dropdownOpen}>
                {item.children?.map((child) => (
                  <NavButton
                    key={child.navKey ?? child.id}
                    item={child}
                    activeTab={activeTab}
                    memorySubTab={memorySubTab}
                    memoryShowAllSections={memoryShowAllSections}
                    captureSubTab={captureSubTab}
                    todoSubTab={todoSubTab}
                    todoShowAllSections={todoShowAllSections}
                    settingsSubTab={settingsSubTab}
                    settingsShowAllSections={settingsShowAllSections}
                    settingsHighlightedSubTab={settingsHighlightedSubTab}
                    memoryHighlightedSubTab={memoryHighlightedSubTab}
                    todoHighlightedSubTab={todoHighlightedSubTab}
                    onSelect={onSelect}
                    uiLocale={uiLocale}
                    isAwaitingApproval={isAwaitingApproval}
                    installingModel={installingModel}
                    isChild
                  />
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </nav>
  );
}
