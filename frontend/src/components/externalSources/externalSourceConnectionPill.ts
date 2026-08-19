type ExternalSourceStatusTone = "ready" | "neutral";

/** Uniform Connected / Not connected copy for status pills. */
function connectionStatusLabel(
  connected: boolean,
  loading: boolean,
  t: (key: string) => string,
): string {
  return !loading && connected
    ? t("sources.connectorStatusConnected")
    : t("sources.connectorStatusNotConnected");
}

/** Card button: Connect / Disconnect — the pill already shows status. */
export function connectionActionLabel(
  connected: boolean,
  loading: boolean,
  t: (key: string) => string,
): string {
  return !loading && connected
    ? t("sources.disconnectConfirmAction")
    : t("sources.connectorActionConnect");
}

/**
 * Uniform connection status copy for External sources cards.
 */
export function externalSourceConnectionPill(
  connected: boolean,
  loading: boolean,
  t: (key: string) => string,
): { statusLabel: string; statusTone: ExternalSourceStatusTone } {
  const isConnected = !loading && connected;
  return {
    statusLabel: connectionStatusLabel(connected, loading, t),
    statusTone: isConnected ? "ready" : "neutral",
  };
}
