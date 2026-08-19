import type { MailReplyItem } from "../api/mailReplies";
import type { Task } from "../api/tasks";

/** Draft attached to this mail task by the server (opaque reply id). */
export function mailReplyForTask(
  task: Task,
  replies: readonly MailReplyItem[],
): MailReplyItem | undefined {
  const replyId = task.mail_reply_id;
  if (typeof replyId !== "number") return undefined;
  return replies.find((item) => item.id === replyId);
}

/** Ready-replies that are not already shown on a task card. */
export function unmatchedMailReplies(
  tasks: readonly Task[],
  replies: readonly MailReplyItem[],
): MailReplyItem[] {
  const used = new Set(
    tasks.map((task) => task.mail_reply_id).filter((id): id is number => typeof id === "number"),
  );
  return replies.filter((item) => !used.has(item.id));
}
