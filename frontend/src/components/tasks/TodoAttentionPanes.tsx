import type { ReactNode } from "react";
import type { TodoFeed } from "../../hooks/useTodoFeed";
import type { InboxKey } from "../../utils/inboxKeys";
import type { InboxRestoreItem } from "../../utils/restoreInboxItems";
import TodoInboxWired from "./TodoInboxWired";

type TodoAttentionPanesProps = {
  showAllSections: boolean;
  showInbox: boolean;
  sectionHeading: (titleKey: string) => ReactNode;
  feed: TodoFeed;
  dismissItems: (items: InboxRestoreItem[]) => Promise<void>;
  registerUndo: (items: InboxRestoreItem[]) => void;
  onOpenMemoryReview?: () => void;
  onOpenToday: () => void;
  onOpenChat: () => void;
  onRetryFailureInChat: (prompt: string, failureId: number) => void;
  selecting: boolean;
  selectedIds: InboxKey[];
  pendingKeys: InboxKey[];
  isSelected: (key: InboxKey) => boolean;
  onSelect?: (key: InboxKey) => void;
  onSelectAll: (ids: InboxKey[]) => void;
  onClear: () => void;
};

/** Needs you pane — shared between stacked To Do and single-tab views. */
export default function TodoAttentionPanes({
  showAllSections,
  showInbox,
  sectionHeading,
  feed,
  dismissItems,
  registerUndo,
  onOpenMemoryReview,
  onOpenToday,
  onOpenChat,
  onRetryFailureInChat,
  selecting,
  selectedIds,
  pendingKeys,
  isSelected,
  onSelect,
  onSelectAll,
  onClear,
}: TodoAttentionPanesProps) {
  const inbox = (
    <TodoInboxWired
      feed={feed}
      dismissItems={dismissItems}
      registerUndo={registerUndo}
      onOpenMemoryReview={onOpenMemoryReview}
      onOpenToday={onOpenToday}
      onOpenChat={onOpenChat}
      onRetryFailureInChat={onRetryFailureInChat}
      selecting={selecting}
      selectedIds={selectedIds}
      inboxKeys={pendingKeys}
      isSelected={isSelected}
      onSelect={onSelect}
      onSelectAll={onSelectAll}
      onClear={onClear}
    />
  );
  if (!showAllSections) {
    return showInbox ? inbox : null;
  }

  return (
    <>
      {showInbox ? (
        <section id="todo-section-inbox" className="space-y-4 border-t border-border pt-10">
          {sectionHeading("nav.todoInbox")}
          {inbox}
        </section>
      ) : null}
    </>
  );
}
