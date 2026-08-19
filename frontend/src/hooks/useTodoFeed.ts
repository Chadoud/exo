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
import {
  dismissMailReply,
  fetchMailReplies,
  type MailReplyItem,
  type MailReplyList,
} from "../api/mailReplies";
import { fetchTasks } from "../api/tasks";
import { isTrashAgentFailure, parseAgentFailureContent } from "../utils/agentFailureContent";
import { countInboxAttentionItems } from "../utils/homeFeed";
import { countNeedsReview } from "../utils/memoryUi";
import { countCompletedTasks, countOpenTasks, countTodayOpenTasks } from "../utils/taskBuckets";
import { unmatchedMailReplies } from "../utils/taskMailReply";

export type TodoFeedCounts = {
  inbox: number;
  replies: number;
  today: number;
  open: number;
  done: number;
  loaded: boolean;
};

export type TodoFeedInbox = {
  nudges: Nudge[];
  failures: AgentFailure[];
  needsReview: number;
  mailReplies: MailReplyItem[];
  mailRepliesLicensed: boolean;
  loading: boolean;
};

export type TodoFeed = {
  counts: TodoFeedCounts;
  inbox: TodoFeedInbox;
  refresh: (opts?: { silent?: boolean }) => Promise<void>;
  dismissInboxNudge: (id: number) => Promise<void>;
  dismissAllInboxNudges: () => Promise<number[]>;
  dismissInboxFailure: (id: number) => Promise<void>;
  dismissMailReply: (id: number) => Promise<void>;
};

const EMPTY_COUNTS: TodoFeedCounts = { inbox: 0, replies: 0, today: 0, open: 0, done: 0, loaded: false };

const EMPTY_INBOX: TodoFeedInbox = {
  nudges: [],
  failures: [],
  needsReview: 0,
  mailReplies: [],
  mailRepliesLicensed: false,
  loading: false,
};

function visibleFailures(failures: AgentFailure[]): AgentFailure[] {
  return failures.filter((row) => !isTrashAgentFailure(parseAgentFailureContent(row.content)));
}

function mailLaneFromList(mailList: MailReplyList | null): {
  mailReplies: MailReplyItem[];
  mailRepliesLicensed: boolean;
} {
  if (!mailList || mailList.gated_reason != null) {
    return { mailReplies: [], mailRepliesLicensed: false };
  }
  return { mailReplies: mailList.items, mailRepliesLicensed: true };
}

/** Shared todo counts + inbox payload — one poll for badges and the Inbox panel. */
export function useTodoFeed(backendOnline: boolean): TodoFeed {
  const [counts, setCounts] = useState<TodoFeedCounts>(EMPTY_COUNTS);
  const [inbox, setInbox] = useState<TodoFeedInbox>(EMPTY_INBOX);

  const refresh = useCallback(async (opts?: { silent?: boolean }) => {
    if (!backendOnline) {
      setCounts(EMPTY_COUNTS);
      setInbox(EMPTY_INBOX);
      return;
    }
    if (!opts?.silent) {
      setInbox((prev) => ({ ...prev, loading: true }));
    }
    try {
      const [tasks, nudges, failures, memories, mailList] = await Promise.all([
        fetchTasks(true).catch(() => []),
        fetchNudges().catch(() => []),
        fetchAgentFailures().catch(() => []),
        fetchAllScopedMemory().catch(() => []),
        fetchMailReplies().catch(() => null),
      ]);
      const needsReview = countNeedsReview(memories);
      const { mailReplies, mailRepliesLicensed } = mailLaneFromList(mailList);
      const failuresVisible = visibleFailures(failures);
      setCounts({
        inbox: countInboxAttentionItems(nudges, failuresVisible, needsReview, 0),
        replies: unmatchedMailReplies(tasks, mailReplies).length,
        today: countTodayOpenTasks(tasks),
        open: countOpenTasks(tasks),
        done: countCompletedTasks(tasks),
        loaded: true,
      });
      setInbox({
        nudges,
        failures: failuresVisible,
        needsReview,
        mailReplies,
        mailRepliesLicensed,
        loading: false,
      });
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
    let hiddenIds: number[] = [];
    setInbox((prev) => {
      hiddenIds = prev.nudges.map((nudge) => nudge.id);
      setCounts((c) => ({ ...c, inbox: Math.max(0, c.inbox - prev.nudges.length) }));
      return { ...prev, nudges: [] };
    });
    try {
      const ids = await dismissAllNudges();
      return ids.length > 0 ? ids : hiddenIds;
    } catch {
      await refresh();
      return [];
    }
  }, [refresh]);

  const dismissInboxFailure = useCallback(
    async (id: number) => {
      setInbox((prev) => {
        const failures = prev.failures.filter((f) => f.id !== id);
        const next = { ...prev, failures };
        setCounts((c) => ({
          ...c,
          inbox: countInboxAttentionItems(next.nudges, failures, next.needsReview, 0),
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
      setInbox((prev) => ({
        ...prev,
        mailReplies: prev.mailReplies.filter((m) => m.id !== id),
      }));
      try {
        await dismissMailReply(id);
        await refresh({ silent: true });
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

  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.onAccountProfileChanged) return;
    return api.onAccountProfileChanged(() => {
      // Clear immediately. Do not refresh here — the old backend may still
      // be serving the previous vault until remount finishes.
      setCounts(EMPTY_COUNTS);
      setInbox(EMPTY_INBOX);
    });
  }, []);

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
