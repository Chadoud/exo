import DailyBriefing from "../DailyBriefing";
import { useI18n } from "../../i18n/I18nContext";

type StartupTodayPaneProps = {
  backendOnline: boolean;
  proAllowed?: boolean;
  onUpgrade?: () => void;
  onOpenTodo: () => void;
};

export default function StartupTodayPane({
  backendOnline,
  proAllowed,
  onUpgrade,
  onOpenTodo,
}: StartupTodayPaneProps) {
  const { t } = useI18n();

  return (
    <div className="space-y-4">
      {backendOnline ? (
        <DailyBriefing
          backendOnline={backendOnline}
          proAllowed={proAllowed}
          onUpgrade={onUpgrade}
          onOpenTasks={onOpenTodo}
          embedded
          showNudges={false}
        />
      ) : (
        <p className="text-sm text-muted">{t("startup.offlineDigest")}</p>
      )}
      <button
        type="button"
        onClick={onOpenTodo}
        className="min-h-8 text-sm font-medium text-accent hover:underline"
      >
        {t("startup.openTodo")}
      </button>
    </div>
  );
}
