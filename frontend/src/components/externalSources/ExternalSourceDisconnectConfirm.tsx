import ConfirmDialog from "../ConfirmDialog";

type ExternalSourceDisconnectConfirmProps = {
  sourceName: string;
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
};

/** Confirm before dropping a linked account on this device. */
export default function ExternalSourceDisconnectConfirm({
  sourceName,
  title,
  body,
  confirmLabel,
  cancelLabel,
  onCancel,
  onConfirm,
}: ExternalSourceDisconnectConfirmProps) {
  return (
    <ConfirmDialog
      title={title}
      body={body}
      confirmLabel={confirmLabel}
      confirmAriaLabel={`${confirmLabel} ${sourceName}`}
      cancelLabel={cancelLabel}
      onCancel={onCancel}
      onConfirm={onConfirm}
      tone="danger"
    />
  );
}
