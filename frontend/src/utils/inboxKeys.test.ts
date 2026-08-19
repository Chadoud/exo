import { describe, expect, it } from "vitest";
import { collectInboxKeys, inboxKey, parseInboxKey, selectedInboxItems } from "./inboxKeys";

describe("inboxKeys", () => {
  it("parses composite keys", () => {
    expect(parseInboxKey("nudge:12")).toEqual({ kind: "nudge", id: 12 });
    expect(parseInboxKey("failure:4")).toEqual({ kind: "failure", id: 4 });
    expect(parseInboxKey("mail:9")).toEqual({ kind: "mail", id: 9 });
    expect(parseInboxKey("task:1")).toBeNull();
  });

  it("collects dismissible rows and skips colliding numeric ids", () => {
    const keys = collectInboxKeys({
      failures: [{ id: 1, content: "x", created_at: "t" }],
      mailReplies: [{ id: 1, from_name: "Ada", from_local_part: "ada", subject: "Hi", created_at: "t", draft_subject: "Re: Hi", draft_body: "Thanks." }],
      nudges: [{ id: 1, kind: "suggestion", title: "Ping", body: "", meta: {}, dismissed: false, created_at: "t" }],
    });
    expect(keys).toEqual(["failure:1", "mail:1", "nudge:1"]);
    expect(selectedInboxItems(keys)).toHaveLength(3);
    expect(inboxKey("mail", 1)).toBe("mail:1");
  });

  it("can collect pending keys without mail and mail-only keys", () => {
    const inbox = {
      failures: [{ id: 1, content: "x", created_at: "t" }],
      mailReplies: [{ id: 2, from_name: "Ada", from_local_part: "ada", subject: "Hi", created_at: "t", draft_subject: "Re: Hi", draft_body: "Thanks." }],
      nudges: [{ id: 3, kind: "suggestion", title: "Ping", body: "", meta: {}, dismissed: false, created_at: "t" }],
    };
    expect(collectInboxKeys(inbox, { mail: false })).toEqual(["failure:1", "nudge:3"]);
    expect(collectInboxKeys(inbox, { failures: false, nudges: false, mail: true })).toEqual(["mail:2"]);
  });
});
