import { useCallback, useEffect, useRef } from "react";

export type TodoUndoEntry = {
  restore: () => Promise<void>;
};

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return target.closest("[contenteditable='true'], [role='textbox']") != null;
}

/** One-level undo for the last Inbox dismiss or Tasks Remove. */
export function useTodoUndo() {
  const entryRef = useRef<TodoUndoEntry | null>(null);

  const push = useCallback((entry: TodoUndoEntry) => {
    entryRef.current = entry;
  }, []);

  const undo = useCallback(async () => {
    const entry = entryRef.current;
    entryRef.current = null;
    if (!entry) return;
    await entry.restore();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "z" || event.shiftKey) {
        return;
      }
      if (isTypingTarget(event.target)) return;
      if (!entryRef.current) return;
      event.preventDefault();
      void undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo]);

  return { push, undo };
}
