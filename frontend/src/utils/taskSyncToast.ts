import { toast } from "sonner";

type SyncResult = {
  total_created: number;
  statuses?: Record<string, string>;
};

type Copy = {
  foundOne: string;
  foundOther: string;
  none: string;
  notConnected: string;
  connectLabel: string;
};

/** Outcome after a header Sync — toast only, no status drawer. */
export function announceTaskSync(
  sync: SyncResult,
  copy: Copy,
  onOpenSources?: () => void,
): void {
  const statuses = Object.values(sync.statuses ?? {});
  const allNotConnected = statuses.length > 0 && statuses.every((status) => status === "not_connected");
  if (allNotConnected) {
    toast.message(copy.notConnected, {
      action: onOpenSources ? { label: copy.connectLabel, onClick: onOpenSources } : undefined,
    });
    return;
  }
  if (sync.total_created > 0) {
    toast.success(sync.total_created === 1 ? copy.foundOne : copy.foundOther);
    return;
  }
  toast.message(copy.none);
}
