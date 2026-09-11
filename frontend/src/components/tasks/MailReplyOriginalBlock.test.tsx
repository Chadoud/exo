// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MailReplyOriginalBlock from "./MailReplyOriginalBlock";

describe("MailReplyOriginalBlock", () => {
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

  it("makes https URLs in the original message clickable", async () => {
    await act(async () => {
      root.render(
        <MailReplyOriginalBlock
          view={{
            kind: "ready",
            text: "Enroll now >\nhttps://developer.apple.com/enroll/",
          }}
          headingId="h"
          regionId="r"
          heading="Their message"
          loading="Loading"
          empty="Empty"
          truncated="Truncated"
          failed="Failed"
          retryLabel="Retry"
          onRetry={() => undefined}
        />,
      );
    });
    const link = container.querySelector("a");
    expect(link?.getAttribute("href")).toBe("https://developer.apple.com/enroll/");
    expect(link?.textContent).toBe("https://developer.apple.com/enroll/");
    const openExternal = vi.fn().mockResolvedValue(undefined);
    window.electronAPI = { openExternal } as unknown as Window["electronAPI"];
    await act(async () => {
      link?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    expect(openExternal).toHaveBeenCalledWith("https://developer.apple.com/enroll/");
    window.electronAPI = undefined as unknown as Window["electronAPI"];
  });
});
