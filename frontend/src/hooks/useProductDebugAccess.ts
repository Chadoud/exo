import { useEffect, useState } from "react";
import { api } from "../api";
import type { EntitlementStatus } from "../api";
import { canUseProductDebug, setProductDebugAccessCached } from "../utils/productDebugAccess";
import { hasEntitlementIpc } from "../utils/electronDesktop";

function applyEntitlement(entitlement: EntitlementStatus | null): boolean {
  // Update the cache first: canUseProductDebug falls back to it, and reading the
  // stale value would keep admin debug UI visible after switching to a non-admin
  // account in the same session.
  setProductDebugAccessCached(Boolean(entitlement?.isProductAdmin));
  return canUseProductDebug(entitlement);
}

/**
 * Resolves whether product-admin debug UI should render (assistant snapshots, sort traces, infra).
 * Pass `entitlement` when the app shell already loaded it to avoid a duplicate IPC round-trip.
 */
export function useProductDebugAccess(entitlement?: EntitlementStatus | null): boolean {
  const [enabled, setEnabled] = useState(() =>
    entitlement != null ? applyEntitlement(entitlement) : canUseProductDebug(null),
  );

  useEffect(() => {
    if (entitlement != null) {
      setEnabled(applyEntitlement(entitlement));
      return;
    }

    let cancelled = false;

    const load = async () => {
      try {
        const state = hasEntitlementIpc()
          ? await window.electronAPI!.getEntitlementState!()
          : await api.entitlementStatus();
        if (!cancelled) setEnabled(applyEntitlement(state));
      } catch {
        if (!cancelled) setEnabled(applyEntitlement(null));
      }
    };

    void load();
    const electron = window.electronAPI;
    const off = electron?.onCloudSessionChanged?.(() => {
      void load();
    });
    return () => {
      cancelled = true;
      off?.();
    };
  }, [entitlement]);

  return enabled;
}
