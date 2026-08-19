// @vitest-environment jsdom
import { act } from "react";
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useVoiceWebSocket } from "./useVoiceWebSocket";
import type { VoiceFrameRouterDeps } from "./voiceFrameRouter";

vi.mock("./voiceWsAuth", () => ({
  sendVoiceWsAppAuth: vi.fn(async () => ({ ok: true })),
}));

vi.mock("./voiceSessionPrime", () => ({
  primeVoiceSessionFromRenderer: vi.fn(async () => ({ ok: true })),
}));

vi.mock("../constants", () => ({
  BACKEND_HOST: "127.0.0.1",
  BACKEND_PORT: 7799,
}));

type HookResult = ReturnType<typeof useVoiceWebSocket>;

class MockWebSocket {
  static OPEN = 1;
  static instances: MockWebSocket[] = [];

  url: string;
  binaryType = "";
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: ((event?: { code: number }) => void) | null = null;
  sent: Array<string | ArrayBuffer> = [];

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
    queueMicrotask(() => {
      this.readyState = MockWebSocket.OPEN;
      this.onopen?.();
    });
  }

  send(data: string | ArrayBuffer): void {
    this.sent.push(data);
  }

  close(code = 1000): void {
    this.readyState = 3;
    this.onclose?.({ code });
  }
}

function mountHook(options: Parameters<typeof useVoiceWebSocket>[0]): {
  result: HookResult;
  unmount: () => void;
} {
  let hookResult!: HookResult;
  const container = document.createElement("div");
  const root: Root = createRoot(container);

  function Harness() {
    // eslint-disable-next-line react-hooks/globals -- intentional test probe
    hookResult = useVoiceWebSocket(options);
    return null;
  }

  act(() => {
    root.render(createElement(Harness));
  });

  return {
    get result() {
      return hookResult;
    },
    unmount: () => {
      act(() => root.unmount());
    },
  } as { result: HookResult; unmount: () => void };
}

function createBaseOptions(overrides: Partial<Parameters<typeof useVoiceWebSocket>[0]> = {}) {
  const memoryEnabledRef = { current: true };
  const skipStartupBriefingRef = { current: false };
  const startupFiredRef = { current: false };
  const voiceSessionIdRef = { current: "session-abc-123" };
  const stoppedRef = { current: false };
  const tokensRelayedRef = { current: false };
  const frameRouterDepsRef = { current: null as VoiceFrameRouterDeps | null };
  const setIsListening = vi.fn();
  const setIsReconnecting = vi.fn();
  const onWsClose = vi.fn();
  const attachPcmForwarder = vi.fn();

  return {
    memoryEnabledRef,
    skipStartupBriefingRef,
    startupFiredRef,
    voiceSessionIdRef,
    stoppedRef,
    tokensRelayedRef,
    frameRouterDepsRef,
    setIsListening,
    setIsReconnecting,
    onWsClose,
    attachPcmForwarder,
    ...overrides,
  };
}

describe("useVoiceWebSocket", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    MockWebSocket.instances = [];
    vi.stubGlobal("WebSocket", MockWebSocket as unknown as typeof WebSocket);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("includes session_id in the WebSocket URL without auth token in query", async () => {
    const opts = createBaseOptions();
    const { result, unmount } = mountHook(opts);

    await act(async () => {
      await result.openWebSocket();
    });

    const ws = MockWebSocket.instances[0];
    expect(ws.url).toContain("memory=1");
    expect(ws.url).toContain("startup=1");
    expect(ws.url).not.toContain("token=");
    expect(ws.url).toContain("session_id=session-abc-123");
    expect(opts.attachPcmForwarder).toHaveBeenCalledWith(ws);

    unmount();
  });

  it("sets tokensRelayed and listening after open", async () => {
    const opts = createBaseOptions();
    const { result, unmount } = mountHook(opts);

    await act(async () => {
      await result.openWebSocket();
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(opts.tokensRelayedRef.current).toBe(true);
    expect(opts.setIsListening).toHaveBeenCalledWith(true);
    expect(opts.setIsReconnecting).toHaveBeenCalledWith(false);

    unmount();
  });

  it("schedules reconnect when the socket closes unexpectedly", async () => {
    const opts = createBaseOptions();
    const { result, unmount } = mountHook(opts);

    await act(async () => {
      await result.openWebSocket();
    });

    const first = MockWebSocket.instances[0];
    await act(async () => {
      first.close();
    });

    expect(opts.setIsListening).toHaveBeenCalledWith(false);
    expect(opts.onWsClose).toHaveBeenCalled();
    expect(opts.setIsReconnecting).toHaveBeenCalledWith(true);
    expect(MockWebSocket.instances).toHaveLength(1);

    await act(async () => {
      vi.advanceTimersByTime(2_000);
      await Promise.resolve();
    });

    expect(MockWebSocket.instances).toHaveLength(2);

    unmount();
  });

  it("does not reconnect when the server closes unpaid (4402)", async () => {
    const opts = createBaseOptions();
    const { result, unmount } = mountHook(opts);

    await act(async () => {
      await result.openWebSocket();
    });

    await act(async () => {
      MockWebSocket.instances[0].close(4402);
    });

    expect(opts.stoppedRef.current).toBe(true);
    expect(opts.setIsReconnecting).toHaveBeenCalledWith(false);

    await act(async () => {
      vi.advanceTimersByTime(2_000);
      await Promise.resolve();
    });

    expect(MockWebSocket.instances).toHaveLength(1);
    unmount();
  });

  it("does not reconnect after stop() marks the session stopped", async () => {
    const opts = createBaseOptions();
    const { result, unmount } = mountHook(opts);

    await act(async () => {
      await result.openWebSocket();
    });

    opts.stoppedRef.current = true;
    MockWebSocket.instances[0].close();

    await act(async () => {
      vi.advanceTimersByTime(2_000);
      await Promise.resolve();
    });

    expect(MockWebSocket.instances).toHaveLength(1);

    unmount();
  });

  it("passes memory=0 when memory is disabled", async () => {
    const memoryEnabledRef = { current: false };
    const opts = createBaseOptions({ memoryEnabledRef });
    const { result, unmount } = mountHook(opts);

    await act(async () => {
      await result.openWebSocket();
    });

    expect(MockWebSocket.instances[0].url).toContain("memory=0");

    unmount();
  });
});
