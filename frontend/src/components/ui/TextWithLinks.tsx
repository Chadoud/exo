import type { MouseEvent } from "react";
import { openHttpsUrl, splitTextLinks } from "../../utils/textLinks";

type TextWithLinksProps = {
  text: string;
  className?: string;
};

function onLinkClick(event: MouseEvent<HTMLAnchorElement>, href: string) {
  event.preventDefault();
  openHttpsUrl(href);
}

/** Plain text with https URLs as links. Does not render mail HTML. */
export default function TextWithLinks({ text, className }: TextWithLinksProps) {
  const parts = splitTextLinks(text);
  return (
    <p className={className}>
      {parts.map((part) =>
        part.kind === "link" ? (
          <a
            key={`l-${part.start}`}
            href={part.href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent underline underline-offset-2 break-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            onClick={(event) => onLinkClick(event, part.href)}
          >
            {part.text}
          </a>
        ) : (
          <span key={`t-${part.start}`}>{part.text}</span>
        ),
      )}
    </p>
  );
}
