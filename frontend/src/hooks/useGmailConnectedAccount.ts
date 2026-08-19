import { useConnectedSourceAccount } from "./useConnectedSourceAccount";

/** Gmail mailbox line — same probe as other source cards, plus web /gmail/status. */
export function useGmailConnectedAccount(input: {
  connected: boolean;
  backendOnline: boolean;
  desktop: boolean;
}): { email: string | null; probeFailed: boolean } {
  return useConnectedSourceAccount({ ...input, providerId: "google-gmail" });
}
