import { useEffect, useState } from "react";
import { refreshMailReplies } from "../api/mailReplies";

/** Harvest ready-replies when the Tasks list is visible. */
export function useTasksMailHarvest(
  enabled: boolean,
  onHarvested: (opts?: { silent?: boolean }) => Promise<void>,
): boolean {
  const [harvesting, setHarvesting] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setHarvesting(true);
    void refreshMailReplies()
      .catch(() => undefined)
      .then(async () => {
        if (!cancelled) await onHarvested({ silent: true });
      })
      .finally(() => {
        if (!cancelled) setHarvesting(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, onHarvested]);

  return harvesting;
}
