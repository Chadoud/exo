// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRememberDevicePreference } from "./useRememberDevicePreference";

type Api = ReturnType<typeof useRememberDevicePreference>;

function Harness({ onReady }: { onReady: (api: Api) => void }) {
  const api = useRememberDevicePreference();
  onReady(api);
  return null;
}

describe("useRememberDevicePreference", () => {
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
    window.electronAPI = undefined as unknown as Window["electronAPI"];
  });

  it("starts opted out so closing the app signs out unless the user checks the box", () => {
    let api: Api | undefined;
    act(() => {
      root.render(<Harness onReady={(next) => { api = next; }} />);
    });
    expect(api?.rememberDevice).toBe(false);
  });

  it("persists an explicit opt-in through Electron", async () => {
    const setRememberDevice = vi.fn().mockResolvedValue({ ok: true });
    const getRememberDevice = vi.fn().mockResolvedValue(false);
    window.electronAPI = {
      getRememberDevice,
      setRememberDevice,
    } as unknown as Window["electronAPI"];

    let api: Api | undefined;
    act(() => {
      root.render(<Harness onReady={(next) => { api = next; }} />);
    });
    await act(async () => {
      await api?.setRememberDevice(true);
    });
    expect(setRememberDevice).toHaveBeenCalledWith(true);
  });
});
