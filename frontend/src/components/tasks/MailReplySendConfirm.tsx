import ConfirmDialog from "../ConfirmDialog";

interface MailReplySendConfirmProps {
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  confirmDisabled?: boolean;
  statusText?: string;
  onCancel: () => void;
  onConfirm: () => void;
}

export default function MailReplySendConfirm({
  title,
  body,
  confirmLabel,
  cancelLabel,
  confirmDisabled = false,
  statusText,
  onCancel,
  onConfirm,
}: MailReplySendConfirmProps) {
  return (
    <ConfirmDialog
      title={title}
      body={body}
      confirmLabel={confirmLabel}
      cancelLabel={cancelLabel}
      tone="primary"
      confirmDisabled={confirmDisabled}
      statusText={statusText}
      busy={confirmDisabled}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
}
