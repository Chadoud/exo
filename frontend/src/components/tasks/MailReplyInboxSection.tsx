import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useI18n } from "../../i18n/I18nContext";
import { trackProductEvent } from "../../telemetry/assistantTelemetry";
import { TelemetryEventNames } from "../../telemetry/schema";
import type { MailReplyItem } from "../../api/mailReplies";
import MailReplyCard from "./MailReplyCard";

interface MailReplyInboxSectionProps {
  items: MailReplyItem[];
  licensed?: boolean;
  onDismiss: (id: number) => Promise<void>;
  onSent: () => void;
  selecting?: boolean;
  isSelected?: (id: number) => boolean;
  onSelect?: (id: number) => void;
  showHeading?: boolean;
}

export default function MailReplyInboxSection({
  items,
  licensed = false,
  onDismiss,
  onSent,
  selecting = false,
  isSelected,
  onSelect,
  showHeading = true,
}: MailReplyInboxSectionProps) {
  const { t } = useI18n();
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const seen = useRef(new Set<number>());

  useEffect(() => {
    for (const item of items) {
      if (seen.current.has(item.id)) continue;
      seen.current.add(item.id);
      trackProductEvent(TelemetryEventNames.mailReplyProposed, {});
    }
  }, [items]);

  if (items.length === 0 && !licensed) return null;
  if (items.length === 0) {
    return (
      <section className="space-y-3" aria-labelledby="todo-inbox-mail-reply-heading">
        <h3 id="todo-inbox-mail-reply-heading" className="text-sm font-semibold text-text-primary">
          {t("todo.inbox.mailReply.emptyHeading")}
        </h3>
        <p className="mt-1 text-xs text-muted leading-relaxed">{t("todo.inbox.mailReply.emptyLane")}</p>
      </section>
    );
  }

  const focusNext = (removedId: number) => {
    const remaining = items.filter((i) => i.id !== removedId);
    if (remaining.length === 0) {
      headingRef.current?.focus();
      return;
    }
    const next = remaining[0];
    window.setTimeout(() => {
      document.getElementById(`mail-reply-review-${next.id}`)?.focus();
    }, 0);
  };

  return (
    <section className="space-y-3" aria-labelledby={showHeading ? "todo-inbox-mail-reply-heading" : undefined}>
      {showHeading ? (
        <h3
          id="todo-inbox-mail-reply-heading"
          ref={headingRef}
          tabIndex={-1}
          className="text-sm font-semibold text-text-primary"
        >
          {t("todo.inbox.mailReply.heading", { n: items.length })}
        </h3>
      ) : (
        <span ref={headingRef} tabIndex={-1} className="sr-only">
          {t("todo.inbox.mailReply.heading", { n: items.length })}
        </span>
      )}
      <ul className="space-y-2">
        {items.map((item) => (
          <MailReplyCard
            key={item.id}
            item={item}
            expanded={expandedId === item.id}
            onToggle={() => setExpandedId(item.id)}
            onCollapse={() => setExpandedId(null)}
            onDismiss={() => {
              trackProductEvent(TelemetryEventNames.mailReplyDismissed, {});
              void onDismiss(item.id).then(() => focusNext(item.id));
            }}
            selecting={selecting}
            selected={isSelected?.(item.id) ?? false}
            onSelect={onSelect ? () => onSelect(item.id) : undefined}
            onSent={(name) => {
              setExpandedId(null);
              toast.message(
                name
                  ? t("todo.inbox.mailReply.sent", { name })
                  : t("todo.inbox.mailReply.sentGeneric"),
              );
              onSent();
              focusNext(item.id);
            }}
          />
        ))}
      </ul>
    </section>
  );
}
