// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import MeetingLiveStatus from "./MeetingLiveStatus";

describe("MeetingLiveStatus", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("shows Listening with pulse when the mic is live", async () => {
    await act(async () => {
      root.render(
        <MeetingLiveStatus
          listening
          issue={null}
          notesEmpty
          listeningLabel="Listening"
          notesOnlyLabel="Notes only"
          micDeniedLabel="mic off"
          unavailableLabel="Couldn't turn speech into notes. You can still type below."
          retryLabel="Try listening again"
          emptyListeningLabel="Speak — notes will appear here."
          onRetry={() => {}}
        />,
      );
    });
    expect(container.textContent).toContain("Listening");
    expect(container.textContent).toContain("Speak — notes will appear here.");
    expect(container.textContent).not.toContain("Notes only");
    expect(container.querySelector(".animate-pulse, .motion-safe\\:animate-pulse")).not.toBeNull();
  });

  it("shows Notes only and a mapped error with no raw API text", async () => {
    const onRetry = vi.fn();
    await act(async () => {
      root.render(
        <MeetingLiveStatus
          listening={false}
          issue="unavailable"
          notesEmpty
          listeningLabel="Listening"
          notesOnlyLabel="Notes only"
          micDeniedLabel="mic off"
          unavailableLabel="Couldn't turn speech into notes. You can still type below."
          retryLabel="Try listening again"
          emptyListeningLabel="Speak — notes will appear here."
          onRetry={onRetry}
        />,
      );
    });
    expect(container.textContent).toContain("Notes only");
    expect(container.textContent).toContain("Couldn't turn speech into notes");
    expect(container.textContent).not.toContain("1007");
    expect(container.textContent).not.toContain("gemini");
    expect(container.querySelector(".animate-pulse, .motion-safe\\:animate-pulse")).toBeNull();

    const retry = [...container.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Try listening again"),
    );
    expect(retry).toBeTruthy();
    await act(async () => {
      retry!.click();
    });
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
