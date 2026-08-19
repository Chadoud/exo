import { toast } from "sonner";
import { useI18n } from "../i18n/I18nContext";
import { announceUndoable } from "../utils/todoUndoToast";
import { restoreInboxItems, type InboxRestoreItem } from "../utils/restoreInboxItems";
import type { TodoUndoEntry } from "./useTodoUndo";

type InboxDismissFns = {
  dismissNudge: (id: number) => Promise<void>;
  dismissFailure: (id: number) => Promise<void>;
  dismissMail: (id: number) => Promise<void>;
  refresh: () => Promise<void>;
  pushUndo: (entry: TodoUndoEntry) => void;
  undo: () => Promise<void>;
};

async function dismissOne(item: InboxRestoreItem, fns: InboxDismissFns): Promise<void> {
  if (item.kind === "nudge") await fns.dismissNudge(item.id);
  else if (item.kind === "failure") await fns.dismissFailure(item.id);
  else await fns.dismissMail(item.id);
}

/** Dismiss inbox rows and register one undo entry. */
export function useInboxDismiss(fns: InboxDismissFns) {
  const { t } = useI18n();

  const registerUndo = (items: InboxRestoreItem[]) => {
    if (items.length === 0) return;
    fns.pushUndo({
      restore: async () => {
        try {
          await restoreInboxItems(items);
          await fns.refresh();
          toast.success(
            t(items.length === 1 ? "todo.restoredOne" : "todo.restoredOther", { n: items.length }),
          );
        } catch (error) {
          toast.error(error instanceof Error ? error.message : t("todo.undoFailed"));
        }
      },
    });
    announceUndoable(
      t(items.length === 1 ? "todo.dismissedOne" : "todo.dismissedOther", { n: items.length }),
      t("todo.undo"),
      () => void fns.undo(),
    );
  };

  const dismissItems = async (items: InboxRestoreItem[]) => {
    if (items.length === 0) return;
    await Promise.all(items.map((item) => dismissOne(item, fns)));
    registerUndo(items);
  };

  return { dismissItems, registerUndo };
}
