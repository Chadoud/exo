import { useCallback, useRef, useState } from "react";
import { EntitlementBlockedError } from "../api/client";
import { fetchMailReplyOriginal } from "../api/mailReplies";

export type OriginalFailKind = "generic" | "disconnected" | "offline" | "gone";

export type OriginalView =
  | { kind: "closed" }
  | { kind: "loading" }
  | { kind: "ready"; text: string }
  | { kind: "empty" }
  | { kind: "truncated"; text: string }
  | { kind: "failed"; fail: OriginalFailKind };

function failKind(err: unknown): OriginalFailKind {
  if (err instanceof EntitlementBlockedError) return "generic";
  const msg = err instanceof Error ? err.message : "";
  if (msg.includes("no_scope") || msg.includes("toggle_off")) return "disconnected";
  if (msg.includes("thread_gone") || msg.includes("thread_changed")) return "gone";
  if (err instanceof TypeError || /failed to fetch|network|offline/i.test(msg)) return "offline";
  return "generic";
}

/** Fetch last inbound once per card; Show/Hide does not refetch. */
export function useMailReplyOriginal(cardId: number) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<OriginalView>({ kind: "closed" });
  const cache = useRef<{ text: string; truncated: boolean } | null>(null);

  const load = useCallback(async () => {
    if (cache.current) {
      const { text, truncated } = cache.current;
      if (!text) setView({ kind: "empty" });
      else setView(truncated ? { kind: "truncated", text } : { kind: "ready", text });
      return;
    }
    setView({ kind: "loading" });
    try {
      const data = await fetchMailReplyOriginal(cardId);
      cache.current = data;
      if (!data.text.trim()) setView({ kind: "empty" });
      else if (data.truncated) setView({ kind: "truncated", text: data.text });
      else setView({ kind: "ready", text: data.text });
    } catch (err) {
      setView({ kind: "failed", fail: failKind(err) });
    }
  }, [cardId]);

  const show = useCallback(() => {
    setOpen(true);
    void load();
  }, [load]);

  const hide = useCallback(() => {
    setOpen(false);
  }, []);

  const toggle = useCallback(() => {
    if (open) hide();
    else show();
  }, [hide, open, show]);

  return { open, view: open ? view : { kind: "closed" as const }, show, hide, toggle, retry: load };
}
