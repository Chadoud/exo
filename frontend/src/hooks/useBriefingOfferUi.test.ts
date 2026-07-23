/**
 * @vitest-environment jsdom
 */
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useBriefingOfferUi, type UseBriefingOfferUiReturn } from "./useBriefingOfferUi";

let root: Root | null = null;
let host: HTMLDivElement | null = null;
let latest: UseBriefingOfferUiReturn | null = null;

function HookProbe({ sendFrame }: { sendFrame: (frame: Record<string, unknown>) => void }) {
  latest = useBriefingOfferUi({ sendFrame });
  return null;
}

function mount(sendFrame: (frame: Record<string, unknown>) => void) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(createElement(HookProbe, { sendFrame }));
  });
}

describe("useBriefingOfferUi", () => {
  beforeEach(() => {
    latest = null;
    // React 19 + vitest: allow act() without @testing-library
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
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

  it("maps server frames to Offering / Loading / Error / Idle", () => {
    const sendFrame = vi.fn();
    mount(sendFrame);

    expect(latest?.phase).toBe("idle");
    expect(latest?.isActive).toBe(false);

    act(() => {
      latest!.handleServerEvent({ type: "briefing_offer" });
    });
    expect(latest?.phase).toBe("offering");
    expect(latest?.isActive).toBe(true);

    act(() => {
      latest!.handleServerEvent({ type: "briefing_loading" });
    });
    expect(latest?.phase).toBe("loading");

    act(() => {
      latest!.handleServerEvent({
        type: "briefing_offer_error",
        message: "Try again later.",
      });
    });
    expect(latest?.phase).toBe("error");
    expect(latest?.errorMessage).toBe("Try again later.");

    act(() => {
      latest!.handleServerEvent({ type: "briefing_offer_clear" });
    });
    expect(latest?.phase).toBe("idle");
    expect(latest?.isActive).toBe(false);
  });

  it("sends accept and clears on skip / never / cancel", () => {
    const sendFrame = vi.fn();
    mount(sendFrame);

    act(() => {
      latest!.handleServerEvent({ type: "briefing_offer" });
    });
    act(() => {
      latest!.accept();
    });
    expect(sendFrame).toHaveBeenCalledWith({ type: "briefing_offer_accept" });
    expect(latest?.phase).toBe("loading");

    act(() => {
      latest!.handleServerEvent({ type: "briefing_offer" });
    });
    act(() => {
      latest!.skipSession();
    });
    expect(sendFrame).toHaveBeenCalledWith({ type: "briefing_offer_skip_session" });
    expect(latest?.phase).toBe("idle");

    act(() => {
      latest!.handleServerEvent({ type: "briefing_offer" });
    });
    act(() => {
      latest!.never();
    });
    expect(sendFrame).toHaveBeenCalledWith({ type: "briefing_offer_never" });
    expect(latest?.phase).toBe("idle");

    act(() => {
      latest!.handleServerEvent({ type: "briefing_loading" });
    });
    act(() => {
      latest!.cancel();
    });
    expect(sendFrame).toHaveBeenCalledWith({ type: "briefing_offer_cancel" });
    expect(latest?.phase).toBe("idle");
  });

  it("requires confirm before sending always", () => {
    const sendFrame = vi.fn();
    mount(sendFrame);

    act(() => {
      latest!.handleServerEvent({ type: "briefing_offer" });
    });
    act(() => {
      latest!.openAlwaysConfirm();
    });
    expect(latest?.confirmAlwaysOpen).toBe(true);
    expect(sendFrame).not.toHaveBeenCalled();

    act(() => {
      latest!.confirmAlways();
    });
    expect(sendFrame).toHaveBeenCalledWith({ type: "briefing_offer_always" });
    expect(latest?.confirmAlwaysOpen).toBe(false);
    expect(latest?.phase).toBe("loading");
  });

  it("clears chrome when briefing starts running", () => {
    const sendFrame = vi.fn();
    mount(sendFrame);

    act(() => {
      latest!.handleServerEvent({ type: "briefing_offer" });
    });
    act(() => {
      latest!.handleServerEvent({ type: "briefing_running" });
    });
    expect(latest?.phase).toBe("idle");
  });
});
