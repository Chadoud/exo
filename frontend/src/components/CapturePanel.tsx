/**
 * Capture — Meeting (what was said) and Activity (what you worked on).
 */
import { useI18n } from "../i18n/I18nContext";
import type { CaptureSubTab } from "../utils/captureUi";
import ActivityTimeline from "./ActivityTimeline";
import MeetingModePanel from "./MeetingModePanel";
import PanelShell from "./ui/PanelShell";

interface CapturePanelProps {
  subTab: CaptureSubTab;
  backendOnline: boolean;
  proAllowed?: boolean;
  onUpgrade?: () => void;
  onOpenConversation?: () => void;
  onMeetingEnded?: () => void;
}

export default function CapturePanel({
  subTab,
  backendOnline,
  proAllowed = true,
  onUpgrade,
  onOpenConversation,
  onMeetingEnded,
}: CapturePanelProps) {
  const { t } = useI18n();

  if (subTab === "activity") {
    return (
      <PanelShell title={t("nav.captureActivity")} subtitle={t("memories.tabs.activitySubtitle")}>
        <ActivityTimeline
          backendOnline={backendOnline}
          proAllowed={proAllowed}
          onUpgrade={onUpgrade}
          hideProCard={!proAllowed}
        />
      </PanelShell>
    );
  }

  return (
    <PanelShell title={t("nav.captureMeeting")} subtitle={t("meeting.placeLead")}>
      <MeetingModePanel
        backendOnline={backendOnline}
        proAllowed={proAllowed}
        onUpgrade={onUpgrade}
        hideProCard
        plain
        onOpenConversation={onOpenConversation}
        onMeetingEnded={onMeetingEnded}
      />
    </PanelShell>
  );
}
