import { useCallback, useState } from "react";
import { nextSelectedIds } from "./useTaskSelection";
import type { InboxKey } from "../utils/inboxKeys";

/** Multi-select for inbox rows — composite keys so ids do not collide. */
export function useInboxSelection() {
  const [selectedIds, setSelectedIds] = useState<InboxKey[]>([]);
  const [selecting, setSelecting] = useState(false);

  const onSelect = useCallback((id: InboxKey) => {
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

  const selectAll = useCallback((ids: InboxKey[]) => {
    setSelectedIds([...ids]);
    setSelecting(true);
  }, []);

  const isSelected = useCallback((id: InboxKey) => selectedIds.includes(id), [selectedIds]);

  return { selectedIds, selecting, onSelect, enter, clear, selectAll, isSelected };
}
