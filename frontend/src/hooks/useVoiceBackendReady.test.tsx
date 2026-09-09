// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { DEFAULT_APP_SETTINGS } from "../settings/appSettingsHydration";
import { VOICE_READINESS_DEBOUNCE_MS, useVoiceBackendReadiness } from "./useVoiceBackendReady";
import type { VoiceBackendReadyResult } from "../voice/ensureVoiceBackendReady";

vi.mock("../voice/ensureVoiceBackendReady", () => ({
  ensureVoiceBackendReady: vi.fn(),
}));

function Harness({
  hydrated = true,
  online = true,
  onSnapshot,
}: {
  hydrated?: boolean;
  online?: boolean;
  onSnapshot: (value: ReturnType<typeof useVoiceBackendReadiness>) => void;
}) {
  const readiness = useVoiceBackendReadiness(DEFAULT_APP_SETTINGS, online, hydrated);
  onSnapshot(readiness);
  return null;
}

describe("useVoiceBackendReadiness", () => {
  let container: HTMLDivElement;
  let root: Root;
  let latest: ReturnType<typeof useVoiceBackendReadiness> | null = null;

  beforeEach(async () => {
    vi.useFakeTimers();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    latest = null;
    const { ensureVoiceBackendReady } = await import("../voice/ensureVoiceBackendReady");
    vi.mocked(ensureVoiceBackendReady).mockReset();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  const renderHook = async (props: { hydrated?: boolean; online?: boolean } = {}) => {
    await act(async () => {
      root.render(
        <Harness
          hydrated={props.hydrated}
          online={props.online}
          onSnapshot={(value) => {
            latest = value;
          }}
        />,
      );
    });
  };

  it("stays checking until settings hydrate", async () => {
    await renderHook({ hydrated: false, online: true });
    expect(latest?.state).toBe("checking");
    const { ensureVoiceBackendReady } = await import("../voice/ensureVoiceBackendReady");
    expect(ensureVoiceBackendReady).not.toHaveBeenCalled();
  });

  it("is unavailable when the backend is offline after hydrate", async () => {
    await renderHook({ hydrated: true, online: false });
    expect(latest).toMatchObject({ state: "unavailable", reason: "offline" });
  });

  it("maps a ready result after debounce", async () => {
    const { ensureVoiceBackendReady } = await import("../voice/ensureVoiceBackendReady");
    vi.mocked(ensureVoiceBackendReady).mockResolvedValue({
      ready: true,
      model: "gemini-live",
    } satisfies VoiceBackendReadyResult);
    await renderHook();
    expect(latest?.state).toBe("checking");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(VOICE_READINESS_DEBOUNCE_MS);
    });
    expect(latest).toMatchObject({ state: "ready", model: "gemini-live" });
  });

  it("maps missing_key from the verified result", async () => {
    const { ensureVoiceBackendReady } = await import("../voice/ensureVoiceBackendReady");
    vi.mocked(ensureVoiceBackendReady).mockResolvedValue({
      ready: false,
      reason: "missing_key",
    });
    await renderHook();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(VOICE_READINESS_DEBOUNCE_MS);
    });
    expect(latest?.state).toBe("missing_key");
  });

  it("keeps sync_failed as unavailable", async () => {
    const { ensureVoiceBackendReady } = await import("../voice/ensureVoiceBackendReady");
    vi.mocked(ensureVoiceBackendReady).mockResolvedValue({
      ready: false,
      reason: "sync_failed",
    });
    await renderHook();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(VOICE_READINESS_DEBOUNCE_MS);
    });
    expect(latest).toMatchObject({ state: "unavailable", reason: "sync_failed" });
  });

  it("ignores a stale result after refresh", async () => {
    const { ensureVoiceBackendReady } = await import("../voice/ensureVoiceBackendReady");
    let resolveFirst: ((value: VoiceBackendReadyResult) => void) | undefined;
    vi.mocked(ensureVoiceBackendReady)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValueOnce({ ready: true, model: "fresh" });
    await renderHook();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(VOICE_READINESS_DEBOUNCE_MS);
    });
    await act(async () => {
      latest?.refresh();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(VOICE_READINESS_DEBOUNCE_MS);
    });
    resolveFirst?.({ ready: false, reason: "missing_key" });
    await act(async () => {
      await Promise.resolve();
    });
    expect(latest).toMatchObject({ state: "ready", model: "fresh" });
  });
});
