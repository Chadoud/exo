// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { THEME_STORAGE_KEY } from "../constants";
import { useTheme } from "./useTheme";

function Harness({ onSnapshot }: { onSnapshot: (value: ReturnType<typeof useTheme>) => void }) {
  onSnapshot(useTheme());
  return null;
}

describe("useTheme", () => {
  let container: HTMLDivElement;
  let root: Root;
  let latest: ReturnType<typeof useTheme> | null = null;

  function mount() {
    act(() => {
      root.render(<Harness onSnapshot={(value) => (latest = value)} />);
    });
  }

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    latest = null;
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("defaults to light when nothing is stored", () => {
    mount();
    expect(latest?.theme).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("defaults to light when the stored value is junk", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "sepia");
    mount();
    expect(latest?.theme).toBe("light");
  });

  it("keeps an existing dark preference", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "dark");
    mount();
    expect(latest?.theme).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("toggle persists the new choice", () => {
    mount();
    act(() => latest?.toggleTheme());
    expect(latest?.theme).toBe("dark");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
  });
});
