import { resetConversationsStore } from "../hooks/useConversations";

function clearRendererCaches(): void {
  resetConversationsStore();
}

/** Erase the active account vault (backend SQLite + Electron profile + renderer chat cache). */
export async function wipeAllLocalData(): Promise<{
  ok: boolean;
  cleared?: string[];
  detail?: string;
}> {
  const electron = window.electronAPI;

  if (electron?.privacyWipeAllLocalData) {
    const result = await electron.privacyWipeAllLocalData();
    if (!result?.ok) {
      return {
        ok: false,
        detail: String((result as { detail?: string; reason?: string }).detail || result?.reason || "wipe_failed"),
      };
    }

    clearRendererCaches();
    return { ok: true, cleared: result.cleared };
  }

  const { request } = await import("./client");
  const backend = await request<{ ok: boolean; cleared?: string[]; detail?: string }>(
    "/v1/privacy/wipe-local",
    {
      method: "POST",
      body: JSON.stringify({ confirmed: true }),
    },
  );
  if (!backend.ok) return backend;

  clearRendererCaches();

  if (electron?.privacyWipeElectronFiles) {
    const fileResult = await electron.privacyWipeElectronFiles();
    if (fileResult && typeof fileResult === "object" && "ok" in fileResult && !fileResult.ok) {
      return {
        ok: false,
        detail: String((fileResult as { reason?: string }).reason || "electron_wipe_failed"),
      };
    }
  }

  return backend;
}
