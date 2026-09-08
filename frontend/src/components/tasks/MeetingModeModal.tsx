import { useCallback, useState } from "react";
import { useI18n } from "../../i18n/I18nContext";
import ConfirmDialog from "../ConfirmDialog";
import MeetingModePanel from "../MeetingModePanel";
import ModalShell from "../ModalShell";

interface Props {
  open: boolean;
  onClose: () => void;
  backendOnline: boolean;
  onMeetingEnded: () => void;
  onOpenConversation?: () => void;
  proAllowed?: boolean;
  onUpgrade?: () => void;
}

export default function MeetingModeModal({
  open,
  onClose,
  backendOnline,
  onMeetingEnded,
  onOpenConversation,
  proAllowed,
  onUpgrade,
}: Props) {
  const { t } = useI18n();
  const [sessionActive, setSessionActive] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [endSession, setEndSession] = useState<(() => Promise<void>) | null>(null);

  const bindEndSession = useCallback((end: () => Promise<void>) => {
    setEndSession(() => end);
  }, []);

  const requestClose = useCallback(() => {
    if (sessionActive) {
      setConfirmClose(true);
      return;
    }
    setConfirmClose(false);
    onClose();
  }, [onClose, sessionActive]);

  const keepListening = useCallback(() => {
    setConfirmClose(false);
  }, []);

  const confirmEnd = useCallback(() => {
    setConfirmClose(false);
    void endSession?.();
  }, [endSession]);

  if (!open) return null;

  return (
    <>
      <ModalShell
        title={t("tasks.recordMeeting")}
        onClose={requestClose}
        maxWidthClass="max-w-lg"
        dismissible={!confirmClose}
      >
        <MeetingModePanel
          backendOnline={backendOnline}
          onMeetingEnded={() => {
            onMeetingEnded();
            onClose();
          }}
          onOpenConversation={onOpenConversation}
          proAllowed={proAllowed}
          onUpgrade={onUpgrade}
          hideProCard
          plain
          onSessionActiveChange={setSessionActive}
          bindEndSession={bindEndSession}
        />
      </ModalShell>
      {confirmClose && (
        <ConfirmDialog
          title={t("meeting.closeConfirm")}
          body={t("meeting.closeConfirmBody")}
          confirmLabel={t("meeting.end")}
          cancelLabel={t("meeting.keepListening")}
          tone="danger"
          onCancel={keepListening}
          onConfirm={confirmEnd}
        />
      )}
    </>
  );
}
