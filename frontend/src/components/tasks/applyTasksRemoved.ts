import { deleteTask, type Task } from "../../api/tasks";

/** Remove selected ids from EXO; skip unknown rows. */
export async function applyTasksRemoved(tasks: Task[], ids: number[]): Promise<Task[]> {
  const remove = new Set(ids);
  for (const id of ids) {
    if (!tasks.some((task) => task.id === id)) continue;
    await deleteTask(id);
  }
  return tasks.filter((task) => !remove.has(task.id));
}
