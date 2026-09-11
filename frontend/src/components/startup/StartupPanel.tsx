import { useI18n } from "../../i18n/I18nContext";
import { useStartupSubTab } from "../../hooks/useStartupSubTab";
import OfflineStrip from "../ui/OfflineStrip";
import PanelShell from "../ui/PanelShell";
import SegmentedTabBar from "../ui/SegmentedTabBar";
import StartupIncludePane from "./StartupIncludePane";
import StartupTodayPane from "./StartupTodayPane";

type StartupPanelProps = {
  backendOnline: boolean;
  proAllowed?: boolean;
  onUpgrade?: () => void;
  onRetryBackend?: () => void | Promise<void>;
  onOpenTodo: () => void;
};

export default function StartupPanel({
  backendOnline,
  proAllowed = true,
  onUpgrade,
  onRetryBackend,
  onOpenTodo,
}: StartupPanelProps) {
  const { t } = useI18n();
  const { startupSubTab, selectStartupSubTab } = useStartupSubTab();
  const today = startupSubTab === "today";
  return (
    <PanelShell
      title={t("memories.tabs.brief")}
      subtitle={today ? t("startup.todaySubtitle") : t("startup.includeSubtitle")}
      offlineBanner={
        !backendOnline ? (
          <OfflineStrip
            message={t("startup.offline")}
            action={
              onRetryBackend
                ? { label: t("offlineStrip.retryApi"), onClick: onRetryBackend }
                : undefined
            }
          />
        ) : null
      }
    >
      <SegmentedTabBar
        ariaLabel={t("memories.tabs.brief")}
        tabs={[
          { id: "today", label: t("nav.startupToday") },
          { id: "include", label: t("nav.startupInclude") },
        ]}
        activeId={startupSubTab}
        onSelect={selectStartupSubTab}
      />
      {today ? (
        <StartupTodayPane
          backendOnline={backendOnline}
          proAllowed={proAllowed}
          onUpgrade={onUpgrade}
          onOpenTodo={onOpenTodo}
        />
      ) : (
        <StartupIncludePane backendOnline={backendOnline} />
      )}
    </PanelShell>
  );
}
