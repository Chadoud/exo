// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { I18nProvider } from "../../i18n/I18nContext";
import ExternalSourceConnectionButton from "./ExternalSourceConnectionButton";

describe("ExternalSourceConnectionButton", () => {
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

  const render = async (props: {
    connected: boolean;
    onConnect?: () => void;
    onDisconnect?: () => void;
  }) => {
    await act(async () => {
      root.render(
        <I18nProvider locale="en">
          <ExternalSourceConnectionButton
            sourceName="Gmail"
            connected={props.connected}
            onConnect={props.onConnect ?? vi.fn()}
            onDisconnect={props.onDisconnect ?? vi.fn()}
          />
        </I18nProvider>,
      );
    });
  };

  const actionButton = () => container.querySelector("button") as HTMLButtonElement;

  const dialog = () => document.querySelector('[role="dialog"]');

  it("labels the action Disconnect when the source is linked", async () => {
    await render({ connected: true });
    expect(actionButton().textContent).toBe("Disconnect");
  });

  it("labels the action Connect when the source is not linked", async () => {
    await render({ connected: false });
    expect(actionButton().textContent).toBe("Connect");
  });

  it("asks for confirmation before disconnecting a linked source", async () => {
    const onDisconnect = vi.fn();
    await render({ connected: true, onDisconnect });

    await act(async () => {
      actionButton().click();
    });

    expect(onDisconnect).not.toHaveBeenCalled();
    expect(dialog()).not.toBeNull();
    expect(document.body.textContent).toContain("Disconnect Gmail?");
    expect(document.body.textContent).toContain(
      "Exo will stop using Gmail on this device.",
    );
    expect(document.body.textContent).toContain(
      "Imported tasks, leftover reply drafts, and calendar notes Exo saved from that account are removed.",
    );
  });

  it("does not disconnect when the user keeps the source connected", async () => {
    const onDisconnect = vi.fn();
    await render({ connected: true, onDisconnect });

    await act(async () => {
      actionButton().click();
    });
    const keepConnected = Array.from(document.querySelectorAll("button")).find(
      (b) => b.textContent === "Keep connected",
    ) as HTMLButtonElement;
    await act(async () => {
      keepConnected.click();
    });

    expect(onDisconnect).not.toHaveBeenCalled();
    expect(dialog()).toBeNull();
  });

  it("disconnects only after the user confirms", async () => {
    const onDisconnect = vi.fn();
    await render({ connected: true, onDisconnect });

    await act(async () => {
      actionButton().click();
    });
    const confirm = Array.from(document.querySelectorAll("button")).find(
      (b) => b.getAttribute("aria-label") === "Disconnect Gmail",
    ) as HTMLButtonElement;
    await act(async () => {
      confirm.click();
    });

    expect(onDisconnect).toHaveBeenCalledTimes(1);
    expect(dialog()).toBeNull();
  });

  it("connects immediately when the source is not linked", async () => {
    const onConnect = vi.fn();
    await render({ connected: false, onConnect });

    await act(async () => {
      actionButton().click();
    });

    expect(onConnect).toHaveBeenCalledTimes(1);
    expect(dialog()).toBeNull();
  });
});
