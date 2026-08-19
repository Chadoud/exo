import { describe, expect, it } from "vitest";
import type { MailReplyItem } from "../api/mailReplies";
import type { Task } from "../api/tasks";
import { mailReplyForTask, unmatchedMailReplies } from "./taskMailReply";

const reply = { id: 9 } as MailReplyItem;
const task = { id: 1, mail_reply_id: 9 } as Task;

describe("taskMailReply", () => {
  it("joins a task to its drafted reply", () => {
    expect(mailReplyForTask(task, [reply])?.id).toBe(9);
    expect(mailReplyForTask({ id: 2 } as Task, [reply])).toBeUndefined();
  });

  it("lists replies that have no task card", () => {
    expect(unmatchedMailReplies([task], [reply, { id: 3 } as MailReplyItem]).map((r) => r.id)).toEqual([
      3,
    ]);
  });
});
