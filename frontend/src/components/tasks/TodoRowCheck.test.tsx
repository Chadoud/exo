// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import TodoRowCheck from "./TodoRowCheck";

describe("TodoRowCheck", () => {
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

  it("uses the same circle whether idle or checked", async () => {
    await act(async () => {
      root.render(<TodoRowCheck checked={false} label="Pick" onClick={vi.fn()} />);
    });
    const idle = container.querySelector("button");
    expect(idle?.className).toContain("rounded-full");
    expect(idle?.className).not.toContain("rounded-[4px]");

    await act(async () => {
      root.render(<TodoRowCheck checked label="Pick" onClick={vi.fn()} pressed />);
    });
    const on = container.querySelector("button");
    expect(on?.className).toContain("rounded-full");
    expect(on?.getAttribute("aria-pressed")).toBe("true");
    expect(on?.querySelector("svg")).toBeTruthy();
  });
});
