type GmailAccountLineState =
  | { kind: "hidden" }
  | { kind: "address"; email: string }
  | { kind: "unknown" };

/** What the Gmail card should show after a live profile probe. */
export function resolveGmailAccountLine(input: {
  connected: boolean;
  email: string | null;
  probeFailed: boolean;
}): GmailAccountLineState {
  if (!input.connected) return { kind: "hidden" };
  const email = (input.email || "").trim();
  if (email) return { kind: "address", email };
  if (input.probeFailed) return { kind: "unknown" };
  return { kind: "hidden" };
}
