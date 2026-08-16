/**
 * @vitest-environment jsdom
 */
import { createElement, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { draftMailReply, sendMailReply } from "../api/mailReplies";
import { useMailReplyReview, type MailReplyReviewState } from "./useMailReplyReview";

vi.mock("sonner", () => ({ toast: { message: vi.fn(), error: vi.fn() } }));
vi.mock("../telemetry/assistantTelemetry", () => ({ trackProductEvent: vi.fn() }));
vi.mock("../api/mailReplies", () => ({
  draftMailReply: vi.fn(),
  sendMailReply: vi.fn(),
}));

type Api = ReturnType<typeof useMailReplyReview>;

let root: Root | null = null;
let host: HTMLDivElement | null = null;
let latest: Api | null = null;

const copy = {
  threadChanged: "thread changed",
  sendFailed: "send failed",
  draftFailed: "draft failed",
  draftDiscarded: "discarded",
};

function HookProbe({ onResult }: { onResult: (api: Api) => void }) {
  const api = useMailReplyReview(7, copy);
  useEffect(() => {
    onResult(api);
  });
  return null;
}

function mount() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(
      createElement(HookProbe, {
        onResult: (api) => {
          latest = api;
        },
      }),
    );
  });
}

describe("useMailReplyReview", () => {
  beforeEach(() => {
    latest = null;
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.mocked(draftMailReply).mockReset();
    vi.mocked(sendMailReply).mockReset();
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    host?.remove();
    root = null;
    host = null;
    latest = null;
  });

  it("keeps the card in error after the first draft failure", async () => {
    vi.mocked(draftMailReply).mockRejectedValueOnce(new Error("network"));
    mount();
    await act(async () => {
      await latest!.review();
    });
    const state = latest!.state as MailReplyReviewState;
    expect(state.status).toBe("error");
    if (state.status === "error") expect(state.error).toBe("draft failed");
  });

  it("ignores a late draft after collapse", async () => {
    let resolveDraft!: (value: {
      draft_token: string;
      to_name: string;
      to_email: string;
      subject: string;
      body: string;
    }) => void;
    vi.mocked(draftMailReply).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveDraft = resolve;
        }),
    );
    mount();
    let reviewDone: Promise<void> = Promise.resolve();
    await act(async () => {
      reviewDone = latest!.review();
    });
    expect(latest!.state.status).toBe("working");
    act(() => {
      latest!.collapse();
    });
    expect(latest!.state.status).toBe("collapsed");
    await act(async () => {
      resolveDraft({
        draft_token: "tok",
        to_name: "Ada",
        to_email: "ada@example.com",
        subject: "Re: Lunch?",
        body: "See you at noon.",
      });
      await reviewDone;
    });
    expect(latest!.state.status).toBe("collapsed");
  });

  it("exposes To fields after a successful draft", async () => {
    vi.mocked(draftMailReply).mockResolvedValueOnce({
      draft_token: "tok",
      to_name: "Ada",
      to_email: "ada@example.com",
      subject: "Re: Lunch?",
      body: "See you at noon.",
    });
    mount();
    await act(async () => {
      await latest!.review();
    });
    const state = latest!.state;
    expect(state.status).toBe("draft");
    if (state.status === "draft") {
      expect(state.toName).toBe("Ada");
      expect(state.toEmail).toBe("ada@example.com");
    }
  });

  it("uses sendFailed after a confirmed send failure", async () => {
    vi.mocked(draftMailReply).mockResolvedValueOnce({
      draft_token: "tok",
      to_name: "Ada",
      to_email: "ada@example.com",
      subject: "Re: Lunch?",
      body: "See you at noon.",
    });
    vi.mocked(sendMailReply).mockRejectedValueOnce(new Error("network"));
    mount();
    await act(async () => {
      await latest!.review();
    });
    act(() => {
      latest!.openConfirm();
    });
    let ok = true;
    await act(async () => {
      ok = await latest!.send();
    });
    expect(ok).toBe(false);
    const state = latest!.state;
    expect(state.status).toBe("draft");
    if (state.status === "draft") expect(state.error).toBe("send failed");
  });
});
