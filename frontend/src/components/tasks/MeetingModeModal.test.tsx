// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { I18nProvider } from "../../i18n/I18nContext";
import MeetingModeModal from "./MeetingModeModal";

const panelProps: {
  onSessionActiveChange?: (active: boolean) => void;
} = {};
const endSession = vi.fn(async () => {});

vi.mock("../MeetingModePanel", () => ({
  default: function MockMeetingModePanel(props: {
    onSessionActiveChange?: (active: boolean) => void;
    bindEndSession?: (end: () => Promise<void>) => void;
  }) {
    panelProps.onSessionActiveChange = props.onSessionActiveChange;
    const bindEndSession = props.bindEndSession;
    useEffect(() => {
      bindEndSession?.(endSession);
    }, [bindEndSession]);
    return <div>meeting-panel</div>;
  },
}));

describe("MeetingModeModal", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    panelProps.onSessionActiveChange = undefined;
    endSession.mockClear();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  async function renderModal(onClose = vi.fn()) {
    await act(async () => {
      root.render(
        <I18nProvider locale="en">
          <MeetingModeModal open onClose={onClose} backendOnline onMeetingEnded={() => {}} />
        </I18nProvider>,
      );
    });
    return onClose;
  }

  it("closes immediately when no meeting is active", async () => {
    const onClose = await renderModal();
    const close = document.querySelector('[aria-label="Close"]') as HTMLButtonElement;
    await act(async () => {
      close.click();
    });
    expect(onClose).toHaveBeenCalledOnce();
    expect(document.body.textContent).not.toContain("End this meeting and save notes?");
  });

  it("asks before closing an active meeting and can keep listening", async () => {
    const onClose = await renderModal();
    await act(async () => {
      panelProps.onSessionActiveChange?.(true);
    });

    const close = document.querySelector('[aria-label="Close"]') as HTMLButtonElement;
    await act(async () => {
      close.click();
    });

    expect(onClose).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("End this meeting and save notes?");

    const keep = [...document.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Keep listening"),
    );
    await act(async () => {
      keep!.click();
    });
    expect(onClose).not.toHaveBeenCalled();
    expect(endSession).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain("End this meeting and save notes?");
  });

  it("End & summarize on close confirm ends the session without dismissing first", async () => {
    const onClose = await renderModal();
    await act(async () => {
      panelProps.onSessionActiveChange?.(true);
    });

    const close = document.querySelector('[aria-label="Close"]') as HTMLButtonElement;
    await act(async () => {
      close.click();
    });

    const confirm = [...document.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("End & summarize"),
    );
    await act(async () => {
      confirm!.click();
    });

    expect(endSession).toHaveBeenCalledOnce();
    expect(onClose).not.toHaveBeenCalled();
  });
});
