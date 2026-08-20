import type { ReactNode } from "react";
import HoverHelpCard from "../ui/HoverHelpCard";
import { useI18n } from "../../i18n/I18nContext";

type QueuePanelHeaderProps = {
  backendOnline: boolean;
  backendHealthProbing: boolean;
  backendServiceStarting?: boolean;
  needsCloudAccount: boolean;
  canStartSort: boolean;
  sortIntroHint: ReactNode;
  onOpenAccountSettings: () => void;
  onOpenLicenseSettings: () => void;
};

/** Queue panel title and backend / entitlement banners. */
export function QueuePanelHeader({
  backendOnline,
  backendHealthProbing,
  backendServiceStarting = false,
  needsCloudAccount,
  canStartSort,
  sortIntroHint,
  onOpenAccountSettings,
  onOpenLicenseSettings,
}: QueuePanelHeaderProps) {
  const { t } = useI18n();

  return (
    <header data-tour="queue-panel-intro" className="space-y-1">
      <div className="flex flex-wrap items-center gap-2 gap-y-1 min-w-0">
        <HoverHelpCard hint={sortIntroHint} className="space-y-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <h1 className="text-lg font-semibold text-text-primary">{t("queue.heading")}</h1>
          </div>
        </HoverHelpCard>
      </div>
      {(backendHealthProbing || backendServiceStarting) && (
        <p className="text-xs text-muted bg-bg-secondary border border-border rounded-lg px-3 py-2 mt-2 inline-block">
          {t("queue.connecting")} {t("queue.connectingSub")}
        </p>
      )}
      {!backendOnline && !backendHealthProbing && !backendServiceStarting && (
        <p className="text-xs text-warning bg-warning-soft border border-warning-line rounded-lg px-3 py-2 mt-2 inline-block">
          {t("queue.offlineBanner")}
        </p>
      )}
      {backendOnline && !backendHealthProbing && !backendServiceStarting && needsCloudAccount && (
        <p className="text-xs text-warning bg-warning-soft border border-warning-line rounded-lg px-3 py-2 mt-2 inline-block max-w-xl">
          {t("queue.cloudAccountBanner")}{" "}
          <button
            type="button"
            onClick={onOpenAccountSettings}
            className="font-medium text-accent hover:underline"
          >
            {t("cloudAuth.signInCta")}
          </button>
        </p>
      )}
      {backendOnline && !backendHealthProbing && !backendServiceStarting && !needsCloudAccount && !canStartSort && (
        <p className="text-xs text-warning bg-warning-soft border border-warning-line rounded-lg px-3 py-2 mt-2 inline-block max-w-xl">
          {t("queue.entitlementBanner")}{" "}
          <button
            type="button"
            onClick={onOpenLicenseSettings}
            className="font-medium text-accent hover:underline"
          >
            {t("queue.openSettings")}
          </button>
        </p>
      )}
    </header>
  );
}
