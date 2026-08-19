import { useCallback, useState } from "react";

/** First id enters select; same id removes; last removal exits. */
export function nextSelectedIds<T>(prev: T[], id: T): T[] {
  if (prev.length === 0) return [id];
  if (prev.includes(id)) return prev.filter((item) => item !== id);
  return [...prev, id];
}

/** Multi-select for task rows — title or Select enters; empty set can stay in mode. */
export function useTaskSelection() {
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [selecting, setSelecting] = useState(false);

  const onSelect = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = nextSelectedIds(prev, id);
      setSelecting(next.length > 0);
      return next;
    });
  }, []);

  const enter = useCallback(() => {
    setSelecting(true);
  }, []);

  const clear = useCallback(() => {
    setSelectedIds([]);
    setSelecting(false);
  }, []);

  const selectAll = useCallback((ids: number[]) => {
    setSelectedIds([...ids]);
    setSelecting(true);
  }, []);

  const isSelected = useCallback((id: number) => selectedIds.includes(id), [selectedIds]);

  return { selectedIds, selecting, onSelect, enter, clear, selectAll, isSelected };
}
