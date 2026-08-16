import { setTaskCompleted, type Task } from "../../api/tasks";

/** Set completion on selected ids; skip already-correct rows. */
export async function applyTasksCompleted(
  tasks: Task[],
  ids: number[],
  completed: boolean,
): Promise<Task[]> {
  const next = [...tasks];
  for (const id of ids) {
    const index = next.findIndex((task) => task.id === id);
    if (index < 0 || next[index].completed === completed) continue;
    next[index] = await setTaskCompleted(id, completed);
  }
  return next;
}
