import ConfirmDialog from "../ConfirmDialog";

interface MailReplySendConfirmProps {
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}

export default function MailReplySendConfirm({
  title,
  body,
  confirmLabel,
  cancelLabel,
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
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
}
