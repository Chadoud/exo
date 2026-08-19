import { useState } from "react";
import { toast } from "sonner";
import { applyTasksCompleted } from "../components/tasks/applyTasksCompleted";
import { applyTasksRemoved } from "../components/tasks/applyTasksRemoved";
import { restoreTask, type Task } from "../api/tasks";
import { announceUndoable } from "../utils/todoUndoToast";
import { useI18n } from "../i18n/I18nContext";
import type { TodoUndoEntry } from "./useTodoUndo";

type Selection = {
  selectedIds: number[];
  clear: () => void;
};

/** Select-bar mutations: complete, reopen, and remove (dismiss). */
export function useTaskSelectActions(
  tasks: Task[],
  setTasks: (next: Task[]) => void,
  selection: Selection,
  undo?: { push: (entry: TodoUndoEntry) => void; undo: () => Promise<void> },
  onMutated?: () => void,
) {
  const { t } = useI18n();
  const [removeOpen, setRemoveOpen] = useState(false);

  const applySelected = async (completed: boolean) => {
    const ids = selection.selectedIds;
    selection.clear();
    try {
      setTasks(await applyTasksCompleted(tasks, ids, completed));
      onMutated?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("tasks.toastUpdateFailed"));
    }
  };

  const applyRemoved = async () => {
    const ids = selection.selectedIds;
    selection.clear();
    setRemoveOpen(false);
    try {
      setTasks(await applyTasksRemoved(tasks, ids));
      onMutated?.();
      if (undo) {
        undo.push({
          restore: async () => {
            try {
              const restored = await Promise.all(ids.map((id) => restoreTask(id)));
              setTasks([...restored, ...tasks.filter((task) => !ids.includes(task.id))]);
              onMutated?.();
              toast.success(t(ids.length === 1 ? "todo.restoredOne" : "todo.restoredOther", { n: ids.length }));
            } catch (error) {
              toast.error(error instanceof Error ? error.message : t("todo.undoFailed"));
            }
          },
        });
        announceUndoable(
          t(ids.length === 1 ? "tasks.toastRemovedOne" : "tasks.toastRemovedOther", { n: ids.length }),
          t("todo.undo"),
          () => void undo.undo(),
        );
      } else {
        toast.success(t(ids.length === 1 ? "tasks.toastRemovedOne" : "tasks.toastRemovedOther", {
          n: ids.length,
        }));
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("tasks.toastRemoveFailed"));
    }
  };

  return {
    applySelected,
    applyRemoved,
    removeOpen,
    requestRemove: () => setRemoveOpen(true),
    closeRemove: () => setRemoveOpen(false),
  };
}
