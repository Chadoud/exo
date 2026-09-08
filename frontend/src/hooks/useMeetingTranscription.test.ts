// @vitest-environment jsdom
import { act, createElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMeetingTranscription } from "./useMeetingTranscription";

const { sendVoiceWsAppAuth } = vi.hoisted(() => ({
  sendVoiceWsAppAuth: vi.fn(async (_ws?: WebSocket) => ({ ok: true as const })),
}));

vi.mock("../voice/voiceWsAuth", () => ({
  sendVoiceWsAppAuth,
}));

vi.mock("../constants", () => ({
  BACKEND_HOST: "127.0.0.1",
  BACKEND_PORT: 7799,
  VOICE_CAPTURE_WORKLET_URL: "/voice-capture-processor.js",
}));

class MockWebSocket {
  static OPEN = 1;
  static instances: MockWebSocket[] = [];

  url: string;
  binaryType = "";
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
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

  close(): void {
    this.readyState = 3;
    this.onclose?.();
  }
}

class MockWorkletNode {
  static instances: MockWorkletNode[] = [];
  port = {
    onmessage: null as ((e: MessageEvent<{ pcm: ArrayBuffer }>) => void) | null,
    close() {},
  };
  disconnect() {}

  constructor() {
    MockWorkletNode.instances.push(this);
  }
}

function Probe() {
  const transcription = useMeetingTranscription();
  const [lastStart, setLastStart] = useState<string>("");
  return createElement(
    "div",
    null,
    createElement("p", { "data-recording": String(transcription.recording) }, `rec:${transcription.recording}`),
    createElement("p", { "data-issue": transcription.issue ?? "none" }, `issue:${transcription.issue ?? "none"}`),
    createElement("p", { "data-start": lastStart }, `start:${lastStart}`),
    createElement(
      "button",
      {
        type: "button",
        onClick: () => {
          void transcription.start("meet-1").then((r) => setLastStart(String(r.listening)));
        },
      },
      "go",
    ),
  );
}

describe("useMeetingTranscription", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    MockWebSocket.instances = [];
    MockWorkletNode.instances = [];
    sendVoiceWsAppAuth.mockReset();
    sendVoiceWsAppAuth.mockResolvedValue({ ok: true });
    vi.stubGlobal("WebSocket", MockWebSocket as unknown as typeof WebSocket);
    vi.stubGlobal("AudioWorkletNode", MockWorkletNode as unknown as typeof AudioWorkletNode);
    vi.stubGlobal(
      "AudioContext",
      class {
        state = "running";
        audioWorklet = { addModule: async () => undefined };
        createMediaStreamSource() {
          return { connect() {}, disconnect() {} };
        }
        close() {
          return Promise.resolve();
        }
      } as unknown as typeof AudioContext,
    );
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: async () => ({
          getTracks: () => [{ stop() {} }],
        }),
      },
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  async function renderProbe() {
    await act(async () => {
      root.render(createElement(Probe));
    });
  }

  async function clickStart() {
    const button = container.querySelector("button") as HTMLButtonElement;
    await act(async () => {
      button.click();
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  it("does not send PCM until auth succeeds", async () => {
    let resolveAuth: (value: { ok: true }) => void = () => {};
    sendVoiceWsAppAuth.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveAuth = resolve;
        }),
    );

    await renderProbe();
    await clickStart();

    const ws = MockWebSocket.instances[0];
    const worklet = MockWorkletNode.instances[0];
    expect(ws).toBeTruthy();
    worklet.port.onmessage?.({ data: { pcm: new ArrayBuffer(8) } } as MessageEvent<{ pcm: ArrayBuffer }>);
    expect(ws.sent.some((item) => item instanceof ArrayBuffer && item.byteLength === 8)).toBe(false);

    await act(async () => {
      resolveAuth({ ok: true });
      await Promise.resolve();
    });

    worklet.port.onmessage?.({ data: { pcm: new ArrayBuffer(8) } } as MessageEvent<{ pcm: ArrayBuffer }>);
    expect(ws.sent.some((item) => item instanceof ArrayBuffer && item.byteLength === 8)).toBe(true);
    expect(container.textContent).toContain("rec:true");
    expect(container.textContent).toContain("start:true");
  });

  it("maps auth failure to unavailable and does not send binary", async () => {
    sendVoiceWsAppAuth.mockResolvedValue({ ok: false, reason: "mint_unavailable" } as never);

    await renderProbe();
    await clickStart();

    expect(container.textContent).toContain("start:false");
    expect(container.textContent).toContain("issue:unavailable");
    expect(container.textContent).toContain("rec:false");
    const ws = MockWebSocket.instances[0];
    expect(ws.sent.some((item) => item instanceof ArrayBuffer && item.byteLength > 0)).toBe(false);
  });

  it("maps a server error frame to unavailable without keeping the message", async () => {
    await renderProbe();
    await clickStart();

    const ws = MockWebSocket.instances[0];
    await act(async () => {
      ws.onmessage?.({
        data: JSON.stringify({
          type: "error",
          message: "1007 None. models/gemini-2.5-flash-native-audio",
        }),
      } as MessageEvent);
    });

    expect(container.textContent).toContain("issue:unavailable");
    expect(container.textContent).toContain("rec:false");
    expect(container.textContent).not.toContain("gemini");
    expect(container.textContent).not.toContain("1007");
  });
});
