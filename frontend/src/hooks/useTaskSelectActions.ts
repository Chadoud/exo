import { useState } from "react";
import { toast } from "sonner";
import { applyTasksCompleted } from "../components/tasks/applyTasksCompleted";
import { applyTasksRemoved } from "../components/tasks/applyTasksRemoved";
import type { Task } from "../api/tasks";
import { useI18n } from "../i18n/I18nContext";

type Selection = {
  selectedIds: number[];
  clear: () => void;
};

/** Select-bar mutations: complete, reopen, and remove (dismiss). */
export function useTaskSelectActions(
  tasks: Task[],
  setTasks: (next: Task[]) => void,
  selection: Selection,
) {
  const { t } = useI18n();
  const [removeOpen, setRemoveOpen] = useState(false);

  const applySelected = async (completed: boolean) => {
    const ids = selection.selectedIds;
    selection.clear();
    try {
      setTasks(await applyTasksCompleted(tasks, ids, completed));
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
      toast.success(t(ids.length === 1 ? "tasks.toastRemovedOne" : "tasks.toastRemovedOther", {
        n: ids.length,
      }));
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
