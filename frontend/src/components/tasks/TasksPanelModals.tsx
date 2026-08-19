import MeetingModeModal from "./MeetingModeModal";
import NoiseCleanupDialog from "../secondBrain/NoiseCleanupDialog";
import ConfirmDialog from "../ConfirmDialog";
import { useI18n } from "../../i18n/I18nContext";
import type { CleanupSecondBrainNoiseResult } from "../../api/memory";

interface TasksPanelModalsProps {
  cleanup: {
    dialogOpen: boolean;
    preview: CleanupSecondBrainNoiseResult | null;
    isPreviewing: boolean;
    isRunning: boolean;
    closeDialog: () => void;
    execute: () => void;
  };
  meetingOpen: boolean;
  onCloseMeeting: () => void;
  backendOnline: boolean;
  onMeetingEnded: () => void;
  onOpenConversation?: () => void;
  proAllowed?: boolean;
  onUpgrade?: () => void;
  removeOpen: boolean;
  removeCount: number;
  onCloseRemove: () => void;
  onConfirmRemove: () => void;
}

export default function TasksPanelModals({
  cleanup,
  meetingOpen,
  onCloseMeeting,
  backendOnline,
  onMeetingEnded,
  onOpenConversation,
  proAllowed,
  onUpgrade,
  removeOpen,
  removeCount,
  onCloseRemove,
  onConfirmRemove,
}: TasksPanelModalsProps) {
  const { t } = useI18n();
  return (
    <>
      <NoiseCleanupDialog
        open={cleanup.dialogOpen}
        preview={cleanup.preview}
        isPreviewing={cleanup.isPreviewing}
        isRunning={cleanup.isRunning}
        onClose={cleanup.closeDialog}
        onConfirm={cleanup.execute}
      />
      <MeetingModeModal
        open={meetingOpen}
        onClose={onCloseMeeting}
        backendOnline={backendOnline}
        onMeetingEnded={onMeetingEnded}
        onOpenConversation={onOpenConversation}
        proAllowed={proAllowed}
        onUpgrade={onUpgrade}
      />
      {removeOpen ? (
        <ConfirmDialog
          title={t("tasks.removeConfirmTitle")}
          body={t("tasks.removeConfirmBody")}
          confirmLabel={t("tasks.remove")}
          cancelLabel={t("tasks.cancel")}
          tone="danger"
          onCancel={onCloseRemove}
          onConfirm={onConfirmRemove}
          confirmAriaLabel={
            removeCount === 1
              ? t("tasks.remove")
              : t("tasks.removeConfirmAria", { n: removeCount })
          }
        />
      ) : null}
    </>
  );
}
