import { useState } from "react";
import { useI18n } from "../../i18n/I18nContext";
import ConfirmDialog from "../ConfirmDialog";

interface QueueCancelJobButtonProps {
  onCancel: () => Promise<void>;
}

/** Cancel-job trigger + confirm dialog — a mis-click here would stop an in-progress sort. */
export function QueueCancelJobButton({ onCancel }: QueueCancelJobButtonProps) {
  const { t } = useI18n();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const confirmCancel = () => {
    setConfirmOpen(false);
    void onCancel();
  };

  return (
    <>
      <button
        onClick={() => setConfirmOpen(true)}
        title={t("queue.cancelJobTitle")}
        className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-error-line text-error hover:bg-error-soft transition-colors"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
        </svg>
        {t("queue.cancel")}
      </button>
      {confirmOpen ? (
        <ConfirmDialog
          title={t("queue.cancelJobConfirmTitle")}
          body={t("queue.cancelJobConfirmBody")}
          confirmLabel={t("queue.cancelJobConfirmAction")}
          cancelLabel={t("queue.cancelJobConfirmKeepGoing")}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={confirmCancel}
          tone="danger"
        />
      ) : null}
    </>
  );
}
