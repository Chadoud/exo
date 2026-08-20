/**
 * @vitest-environment jsdom
 */
import { createElement, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../api";
import { POLL_INTERVAL_MS } from "../constants";
import { useJobPolling } from "./useJobPolling";

vi.mock("../api", () => ({
  api: { job: vi.fn() },
}));

type Api = ReturnType<typeof useJobPolling>;
let root: Root | null = null;
let host: HTMLDivElement | null = null;
let latest: Api | null = null;
const onJob = vi.fn();
const onTerminal = vi.fn();
const onError = vi.fn();

function HookProbe({ onResult }: { onResult: (api: Api) => void }) {
  const polling = useJobPolling({ onJob, onTerminal, onError });
  useEffect(() => {
    onResult(polling);
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
        onResult: (next) => {
          latest = next;
        },
      }),
    );
  });
  if (!latest) throw new Error("hook missing");
  return latest;
}

describe("useJobPolling", () => {
  beforeEach(() => {
    latest = null;
    onJob.mockReset();
    onTerminal.mockReset();
    onError.mockReset();
    vi.mocked(api.job).mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    act(() => root?.unmount());
    host?.remove();
    root = null;
    host = null;
    vi.useRealTimers();
  });

  it("reports one error when overlapping polls fail", async () => {
    let rejectFirst: (err: Error) => void = () => {};
    const first = new Promise<never>((_, reject) => {
      rejectFirst = reject;
    });
    vi.mocked(api.job).mockReturnValue(first as Promise<never>);

    await renderHook();
    await act(async () => {
      latest?.startPolling("job-1");
    });

    await act(async () => {
      vi.advanceTimersByTime(POLL_INTERVAL_MS);
    });
    await act(async () => {
      vi.advanceTimersByTime(POLL_INTERVAL_MS);
    });
    expect(api.job).toHaveBeenCalledTimes(1);

    await act(async () => {
      rejectFirst(new Error("Cannot reach the API"));
    });

    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("does not toast when the caller says the wait overlay is showing", async () => {
    const shouldNotifyError = vi.fn(() => false);
    vi.mocked(api.job).mockRejectedValue(new Error("local_assistant_unreachable"));

    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root!.render(
        createElement(function Probe() {
          const polling = useJobPolling({ onJob, onTerminal, onError, shouldNotifyError });
          useEffect(() => {
            latest = polling;
          });
          return null;
        }),
      );
    });
    await act(async () => {
      latest?.startPolling("job-1");
    });
    await act(async () => {
      vi.advanceTimersByTime(POLL_INTERVAL_MS);
    });
    expect(onError).not.toHaveBeenCalled();
    expect(shouldNotifyError).toHaveBeenCalled();
  });

  it("keeps polling after a transient fetch failure", async () => {
    vi.mocked(api.job)
      .mockRejectedValueOnce(new Error("local_assistant_unreachable"))
      .mockResolvedValueOnce({ id: "job-1", status: "running" } as never);

    await renderHook();
    await act(async () => {
      latest?.startPolling("job-1");
    });
    await act(async () => {
      vi.advanceTimersByTime(POLL_INTERVAL_MS);
    });
    expect(onError).toHaveBeenCalledTimes(1);
    await act(async () => {
      vi.advanceTimersByTime(POLL_INTERVAL_MS);
    });
    expect(api.job).toHaveBeenCalledTimes(2);
    expect(onJob).toHaveBeenCalledTimes(1);
  });
});
