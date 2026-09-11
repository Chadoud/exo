/** Split plain text so https URLs can render as links — never trust mail HTML. */

export type TextLinkPart =
  | { kind: "text"; text: string; start: number }
  | { kind: "link"; text: string; href: string; start: number };

const HTTPS_RUN = /https:\/\/[^\s<>"'`]+/gi;
const TRAILING_PUNCT = /[),.;:!?]+$/;
const MAX_URL_LEN = 2048;

export function isSafeHttpsHref(raw: string): boolean {
  if (!raw || raw.length > MAX_URL_LEN) return false;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  if (parsed.username || parsed.password) return false;
  return parsed.hostname.includes(".");
}

export function openHttpsUrl(href: string): void {
  if (!isSafeHttpsHref(href)) return;
  if (window.electronAPI?.openExternal) {
    void window.electronAPI.openExternal(href);
    return;
  }
  window.open(href, "_blank", "noopener,noreferrer");
}

export function splitTextLinks(text: string): TextLinkPart[] {
  const parts: TextLinkPart[] = [];
  const re = new RegExp(HTTPS_RUN.source, "gi");
  let last = 0;
  let match = re.exec(text);
  while (match) {
    const trimmed = match[0].replace(TRAILING_PUNCT, "");
    if (isSafeHttpsHref(trimmed)) {
      if (match.index > last) {
        parts.push({ kind: "text", text: text.slice(last, match.index), start: last });
      }
      parts.push({ kind: "link", text: trimmed, href: trimmed, start: match.index });
      last = match.index + trimmed.length;
      re.lastIndex = last;
    }
    match = re.exec(text);
  }
  if (last < text.length) {
    parts.push({ kind: "text", text: text.slice(last), start: last });
  }
  return parts.length ? parts : [{ kind: "text", text, start: 0 }];
}
