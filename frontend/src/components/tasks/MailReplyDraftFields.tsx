import { useEffect, useRef } from "react";

interface MailReplyDraftFieldsProps {
  subject: string;
  body: string;
  subjectLabel: string;
  bodyLabel: string;
  emptyBodyHint: string;
  noRecipient: string;
  hasRecipient: boolean;
  disabled: boolean;
  onSubjectChange: (value: string) => void;
  onBodyChange: (value: string) => void;
  onOpenConfirm: () => void;
}

export default function MailReplyDraftFields({
  subject,
  body,
  subjectLabel,
  bodyLabel,
  emptyBodyHint,
  noRecipient,
  hasRecipient,
  disabled,
  onSubjectChange,
  onBodyChange,
  onOpenConfirm,
}: MailReplyDraftFieldsProps) {
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bodyRef.current?.focus();
  }, []);

  return (
    <div className="space-y-3">
      <label className="block space-y-1">
        <span className="text-2xs font-medium text-muted">{subjectLabel}</span>
        <input
          type="text"
          value={subject}
          maxLength={200}
          disabled={disabled}
          onChange={(e) => onSubjectChange(e.target.value)}
          className="w-full rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary"
        />
      </label>
      <label className="block space-y-1">
        <span className="text-2xs font-medium text-muted">{bodyLabel}</span>
        <textarea
          ref={bodyRef}
          value={body}
          maxLength={8000}
          disabled={disabled}
          rows={6}
          onChange={(e) => onBodyChange(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              onOpenConfirm();
            }
          }}
          className="w-full resize-y rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary"
        />
      </label>
      {!body.trim() ? <p className="text-2xs text-muted">{emptyBodyHint}</p> : null}
      {!hasRecipient ? (
        <p className="text-2xs text-muted" data-testid="mail-reply-no-recipient">
          {noRecipient}
        </p>
      ) : null}
    </div>
  );
}
