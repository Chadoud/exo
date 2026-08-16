import { useCallback, useEffect, useState } from "react";
import { fetchAllScopedMemory } from "../api/memory";
import {
  dismissAgentFailure,
  dismissAllNudges,
  dismissNudge,
  fetchAgentFailures,
  fetchNudges,
  type AgentFailure,
  type Nudge,
} from "../api/proactive";
import { dismissMailReply, fetchMailReplies, type MailReplyItem } from "../api/mailReplies";
import { fetchTasks } from "../api/tasks";
import { countInboxAttentionItems } from "../utils/homeFeed";
import { countNeedsReview } from "../utils/memoryUi";
import { countOpenTasks, countTodayOpenTasks } from "../utils/taskBuckets";

export type TodoFeedCounts = {
  inbox: number;
  today: number;
  open: number;
  loaded: boolean;
};

export type TodoFeedInbox = {
  nudges: Nudge[];
  failures: AgentFailure[];
  needsReview: number;
  mailReplies: MailReplyItem[];
  loading: boolean;
};

export type TodoFeed = {
  counts: TodoFeedCounts;
  inbox: TodoFeedInbox;
  refresh: () => Promise<void>;
  dismissInboxNudge: (id: number) => Promise<void>;
  dismissAllInboxNudges: () => Promise<void>;
  dismissInboxFailure: (id: number) => Promise<void>;
  dismissMailReply: (id: number) => Promise<void>;
};

const EMPTY_COUNTS: TodoFeedCounts = { inbox: 0, today: 0, open: 0, loaded: false };

const EMPTY_INBOX: TodoFeedInbox = {
  nudges: [],
  failures: [],
  needsReview: 0,
  mailReplies: [],
  loading: false,
};

/** Shared todo counts + inbox payload — one poll for badges and the Inbox panel. */
export function useTodoFeed(backendOnline: boolean): TodoFeed {
  const [counts, setCounts] = useState<TodoFeedCounts>(EMPTY_COUNTS);
  const [inbox, setInbox] = useState<TodoFeedInbox>(EMPTY_INBOX);

  const refresh = useCallback(async () => {
    if (!backendOnline) {
      setCounts(EMPTY_COUNTS);
      setInbox(EMPTY_INBOX);
      return;
    }
    setInbox((prev) => ({ ...prev, loading: true }));
    try {
      const [tasks, nudges, failures, memories, mailList] = await Promise.all([
        fetchTasks(false).catch(() => []),
        fetchNudges().catch(() => []),
        fetchAgentFailures().catch(() => []),
        fetchAllScopedMemory().catch(() => []),
        fetchMailReplies().catch(() => null),
      ]);
      const needsReview = countNeedsReview(memories);
      const mailReplies = mailList?.gated_reason ? [] : mailList?.items ?? [];
      setCounts({
        inbox: countInboxAttentionItems(nudges, failures, needsReview, mailReplies.length),
        today: countTodayOpenTasks(tasks),
        open: countOpenTasks(tasks),
        loaded: true,
      });
      setInbox({ nudges, failures, needsReview, mailReplies, loading: false });
    } catch {
      setCounts((prev) => ({ ...prev, loaded: true }));
      setInbox((prev) => ({ ...prev, loading: false }));
    }
  }, [backendOnline]);

  const dismissInboxNudge = useCallback(
    async (id: number) => {
      setInbox((prev) => ({
        ...prev,
        nudges: prev.nudges.filter((n) => n.id !== id),
      }));
      setCounts((prev) => ({ ...prev, inbox: Math.max(0, prev.inbox - 1) }));
      try {
        await dismissNudge(id);
      } catch {
        await refresh();
      }
    },
    [refresh],
  );

  const dismissAllInboxNudges = useCallback(async () => {
    setInbox((prev) => {
      setCounts((c) => ({ ...c, inbox: Math.max(0, c.inbox - prev.nudges.length) }));
      return { ...prev, nudges: [] };
    });
    try {
      await dismissAllNudges();
    } catch {
      await refresh();
    }
  }, [refresh]);

  const dismissInboxFailure = useCallback(
    async (id: number) => {
      setInbox((prev) => {
        const failures = prev.failures.filter((f) => f.id !== id);
        const next = { ...prev, failures };
        setCounts((c) => ({
          ...c,
          inbox: countInboxAttentionItems(
            next.nudges,
            failures,
            next.needsReview,
            next.mailReplies.length,
          ),
        }));
        return next;
      });
      try {
        await dismissAgentFailure(id);
      } catch {
        await refresh();
      }
    },
    [refresh],
  );

  const dismissInboxMailReply = useCallback(
    async (id: number) => {
      setInbox((prev) => {
        const mailReplies = prev.mailReplies.filter((m) => m.id !== id);
        const next = { ...prev, mailReplies };
        setCounts((c) => ({
          ...c,
          inbox: countInboxAttentionItems(next.nudges, next.failures, next.needsReview, mailReplies.length),
        }));
        return next;
      });
      try {
        await dismissMailReply(id);
      } catch {
        await refresh();
      }
    },
    [refresh],
  );

  useEffect(() => {
    void refresh();
    if (!backendOnline) return;
    const handle = window.setInterval(() => void refresh(), 60_000);
    return () => window.clearInterval(handle);
  }, [backendOnline, refresh]);

  return {
    counts,
    inbox,
    refresh,
    dismissInboxNudge,
    dismissAllInboxNudges,
    dismissInboxFailure,
    dismissMailReply: dismissInboxMailReply,
  };
}
