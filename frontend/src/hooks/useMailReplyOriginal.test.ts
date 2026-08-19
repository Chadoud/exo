/**
 * @vitest-environment jsdom
 */
import { createElement, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchMailReplyOriginal } from "../api/mailReplies";
import { useMailReplyOriginal } from "./useMailReplyOriginal";

vi.mock("../api/mailReplies", () => ({
  fetchMailReplyOriginal: vi.fn(),
}));

type Api = ReturnType<typeof useMailReplyOriginal>;
let root: Root | null = null;
let host: HTMLDivElement | null = null;
let latest: Api | null = null;

function HookProbe({ onResult }: { onResult: (api: Api) => void }) {
  const api = useMailReplyOriginal(7);
  useEffect(() => {
    onResult(api);
  });
  return null;
}

async function renderHook(): Promise<Api> {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      createElement(HookProbe, {
        onResult: (api) => {
          latest = api;
        },
      }),
    );
  });
  if (!latest) throw new Error("hook missing");
  return latest;
}

describe("useMailReplyOriginal", () => {
  beforeEach(() => {
    latest = null;
    vi.mocked(fetchMailReplyOriginal).mockReset();
    vi.mocked(fetchMailReplyOriginal).mockResolvedValue({
      text: "Are you free Thursday at 3?",
      truncated: false,
    });
  });

  afterEach(() => {
    act(() => root?.unmount());
    host?.remove();
    root = null;
    host = null;
  });

  it("fetches once and reuses the cache on hide/show", async () => {
    await renderHook();
    await act(async () => {
      latest?.show();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(latest?.view).toEqual({ kind: "ready", text: "Are you free Thursday at 3?" });
    await act(async () => {
      latest?.hide();
    });
    expect(latest?.view).toEqual({ kind: "closed" });
    await act(async () => {
      latest?.show();
    });
    expect(fetchMailReplyOriginal).toHaveBeenCalledTimes(1);
    expect(latest?.view.kind).toBe("ready");
  });

  it("maps gone errors without storing text", async () => {
    vi.mocked(fetchMailReplyOriginal).mockRejectedValueOnce(new Error("thread_gone"));
    await renderHook();
    await act(async () => {
      latest?.show();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(latest?.view).toEqual({ kind: "failed", fail: "gone" });
  });
});
