// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import ExternalSourceAccountLine from "./ExternalSourceAccountLine";

describe("ExternalSourceAccountLine", () => {
  function render(props: { email?: string | null; unknown?: boolean; unknownLabel?: string }) {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root: Root = createRoot(host);
    act(() => {
      root.render(createElement(ExternalSourceAccountLine, props));
    });
    return { host, root };
  }

  it("renders the address as visible text", () => {
    const { host, root } = render({ email: "you@gmail.com" });
    expect(host.textContent).toBe("you@gmail.com");
    root.unmount();
    host.remove();
  });

  it("renders the fail copy when the probe missed", () => {
    const { host, root } = render({
      unknown: true,
      unknownLabel: "Couldn't read which account. Disconnect and connect again.",
    });
    expect(host.textContent).toContain("Couldn't read which account");
    root.unmount();
    host.remove();
  });

  it("renders nothing when idle", () => {
    const { host, root } = render({});
    expect(host.textContent).toBe("");
    root.unmount();
    host.remove();
  });
});
