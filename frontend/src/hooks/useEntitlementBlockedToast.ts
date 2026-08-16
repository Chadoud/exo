import { useCallback, useEffect } from "react";
import { toast } from "sonner";
import type { EntitlementStatus } from "../api";
import type { UiLocale } from "../i18n/locale";
import { translate } from "../i18n/translate";
import { ENTITLEMENT_BLOCKED_TOAST_ID, entitlementBlockedToastKind } from "../utils/entitlementBlockedToast";
import type { PrimarySettingsSectionKey } from "../utils/settingsNav";

/**
 * Settings already shows LICENSED when a key is saved — dismiss a leftover
 * "trial ended" toast the moment entitlement clears, instead of waiting for
 * the next blocked action to notice.
 */
export function useEntitlementBlockedToast(
  entitlement: EntitlementStatus | null,
  uiLocale: UiLocale,
  openPrimarySettings: (section: PrimarySettingsSectionKey) => void,
): { toastEntitlementBlocked: () => void } {
  useEffect(() => {
    if (entitlementBlockedToastKind(entitlement) === "none") {
      toast.dismiss(ENTITLEMENT_BLOCKED_TOAST_ID);
    }
  }, [entitlement]);

  const toastEntitlementBlocked = useCallback(() => {
    if (entitlementBlockedToastKind(entitlement) === "none") {
      toast.dismiss(ENTITLEMENT_BLOCKED_TOAST_ID);
      return;
    }
    toast.error(translate(uiLocale, "toast.entitlementBlockedTitle"), {
      id: ENTITLEMENT_BLOCKED_TOAST_ID,
      description: translate(uiLocale, "toast.entitlementBlockedDesc"),
      duration: 12000,
    });
    openPrimarySettings("license");
  }, [entitlement, uiLocale, openPrimarySettings]);

  return { toastEntitlementBlocked };
}
