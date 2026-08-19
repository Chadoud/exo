import type { TodoFeed } from "../../hooks/useTodoFeed";
import type { InboxKey } from "../../utils/inboxKeys";
import { selectedInboxItems } from "../../utils/inboxKeys";
import type { InboxRestoreItem } from "../../utils/restoreInboxItems";
import InboxSelectBar from "./InboxSelectBar";
import TodoInboxSection from "./TodoInboxSection";

type TodoInboxWiredProps = {
  feed: TodoFeed;
  dismissItems: (items: InboxRestoreItem[]) => Promise<void>;
  registerUndo: (items: InboxRestoreItem[]) => void;
  onOpenMemoryReview?: () => void;
  onOpenToday: () => void;
  onOpenChat: () => void;
  onRetryFailureInChat: (prompt: string, failureId: number) => void;
  selecting: boolean;
  selectedIds: InboxKey[];
  inboxKeys: InboxKey[];
  isSelected: (key: InboxKey) => boolean;
  onSelect?: (key: InboxKey) => void;
  onSelectAll: (ids: InboxKey[]) => void;
  onClear: () => void;
};

/** Inbox list wired to dismiss + undo — keeps TasksPanel under the line cap. */
export default function TodoInboxWired({
  feed,
  dismissItems,
  registerUndo,
  onOpenMemoryReview,
  onOpenToday,
  onOpenChat,
  onRetryFailureInChat,
  selecting,
  selectedIds,
  inboxKeys,
  isSelected,
  onSelect,
  onSelectAll,
  onClear,
}: TodoInboxWiredProps) {
  return (
    <>
      {selecting ? (
        <InboxSelectBar
          selectedCount={selectedIds.length}
          onDismiss={() => {
            const items = selectedInboxItems(selectedIds);
            onClear();
            void dismissItems(items);
          }}
          onSelectAll={() => onSelectAll(inboxKeys)}
          onCancel={onClear}
        />
      ) : null}
    <TodoInboxSection
      inbox={feed.inbox}
      onDismissNudge={(id) => dismissItems([{ kind: "nudge", id }])}
      onDismissNudges={(ids) => { void dismissItems(ids.map((id) => ({ kind: "nudge", id }))); }}
      onDismissAllNudges={async () => {
        const ids = await feed.dismissAllInboxNudges();
        registerUndo(ids.map((id) => ({ kind: "nudge", id })));
      }}
      onDismissFailure={(id) => dismissItems([{ kind: "failure", id }])}
      onOpenMemoryReview={() => onOpenMemoryReview?.()}
      onOpenToday={onOpenToday}
      onOpenChat={onOpenChat}
      onRetryFailureInChat={onRetryFailureInChat}
      selecting={selecting}
      isSelected={isSelected}
      onSelect={onSelect}
    />
    </>
  );
}
