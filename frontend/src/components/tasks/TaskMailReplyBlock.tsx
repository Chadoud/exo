import { useState } from "react";
import type { MailReplyItem } from "../../api/mailReplies";
import MailReplyCard from "./MailReplyCard";

type TaskMailReplyBlockProps = {
  item: MailReplyItem;
  onDismiss: () => void;
  onSent: (displayName: string) => void;
};

/** Review/send for a joined ready-reply — collapsed until the user opens it. */
export default function TaskMailReplyBlock({
  item,
  onDismiss,
  onSent,
}: TaskMailReplyBlockProps) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="mt-2 border-t border-border pt-2">
      <MailReplyCard
        item={item}
        expanded={expanded}
        onToggle={() => setExpanded((value) => !value)}
        onDismiss={onDismiss}
        onSent={onSent}
        onCollapse={() => setExpanded(false)}
      />
    </div>
  );
}
