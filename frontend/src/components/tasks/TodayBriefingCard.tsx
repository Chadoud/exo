import DailyBriefing from "../DailyBriefing";
import PanelCard from "../ui/PanelCard";
import { useI18n } from "../../i18n/I18nContext";

interface Props {
  backendOnline: boolean;
  proAllowed?: boolean;
  onUpgrade?: () => void;
  hideProCard?: boolean;
}

/** Always-open briefing on Tasks — no accordion, no Generate gate. */
export default function TodayBriefingCard({
  backendOnline,
  proAllowed,
  onUpgrade,
  hideProCard,
}: Props) {
  const { t } = useI18n();

  return (
    <PanelCard padding="md" className="space-y-3">
      <h3 className="text-sm font-semibold text-text-primary">{t("briefing.title")}</h3>
      <DailyBriefing
        backendOnline={backendOnline}
        proAllowed={proAllowed}
        onUpgrade={onUpgrade}
        hideProCard={hideProCard}
        showNudges={false}
        embedded
      />
    </PanelCard>
  );
}
