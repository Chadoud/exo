/**
 * @vitest-environment jsdom
 */
import { createElement, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { draftMailReply, saveMailReplyDraft, sendMailReply } from "../api/mailReplies";
import { useMailReplyReview, type MailReplyReviewState } from "./useMailReplyReview";

vi.mock("sonner", () => ({ toast: { message: vi.fn(), error: vi.fn() } }));
vi.mock("../telemetry/assistantTelemetry", () => ({ trackProductEvent: vi.fn() }));
vi.mock("../api/mailReplies", () => ({
  draftMailReply: vi.fn(),
  saveMailReplyDraft: vi.fn(),
  sendMailReply: vi.fn(),
}));

type Api = ReturnType<typeof useMailReplyReview>;

let root: Root | null = null;
let host: HTMLDivElement | null = null;
let latest: Api | null = null;

const copy = {
  threadChanged: "thread changed",
  sendFailed: "send failed",
  checkFailed: "check failed",
};

const seed = { subject: "Re: Lunch?", body: "See you at noon.", toName: "Ada" };

function HookProbe({ onResult }: { onResult: (api: Api) => void }) {
  const api = useMailReplyReview(7, copy, seed);
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
    vi.mocked(saveMailReplyDraft).mockReset().mockResolvedValue(undefined);
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

  it("shows the saved reply immediately and keeps it after a mint failure", async () => {
    vi.mocked(draftMailReply).mockRejectedValueOnce(new Error("network"));
    mount();
    await act(async () => {
      await latest!.review();
    });
    const state = latest!.state as MailReplyReviewState;
    expect(state.status).toBe("ready");
    if (state.status === "ready") {
      expect(state.body).toBe("See you at noon.");
      expect(state.check).toBe("fail");
      expect(state.error).toBe("check failed");
    }
  });

  it("ignores a late mint after collapse", async () => {
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
    expect(latest!.state.status).toBe("ready");
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

  it("exposes To fields after a successful mint", async () => {
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
    expect(state.status).toBe("ready");
    if (state.status === "ready") {
      expect(state.toName).toBe("Ada");
      expect(state.toEmail).toBe("ada@example.com");
      expect(state.check).toBe("ok");
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
    expect(state.status).toBe("ready");
    if (state.status === "ready") expect(state.error).toBe("send failed");
  });

  it("persists edits on collapse without a discard toast", async () => {
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
    act(() => {
      latest!.setBody("Edited.");
    });
    act(() => {
      latest!.collapse();
    });
    expect(saveMailReplyDraft).toHaveBeenCalledWith(7, { subject: "Re: Lunch?", body: "Edited." });
    expect(latest!.state.status).toBe("collapsed");
  });
});
