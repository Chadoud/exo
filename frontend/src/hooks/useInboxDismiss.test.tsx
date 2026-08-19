// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { I18nProvider } from "../i18n/I18nContext";
import { useInboxDismiss } from "./useInboxDismiss";
import type { InboxRestoreItem } from "../utils/restoreInboxItems";
import { restoreInboxItems } from "../utils/restoreInboxItems";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("../utils/restoreInboxItems", () => ({
  restoreInboxItems: vi.fn(),
}));

type Api = ReturnType<typeof useInboxDismiss>;

function Harness({
  onReady,
  pushUndo,
  undo,
}: {
  onReady: (api: Api) => void;
  pushUndo: (entry: { restore: () => Promise<void> }) => void;
  undo: () => Promise<void>;
}) {
  const api = useInboxDismiss({
    dismissNudge: vi.fn().mockResolvedValue(undefined),
    dismissFailure: vi.fn().mockResolvedValue(undefined),
    dismissMail: vi.fn().mockResolvedValue(undefined),
    refresh: vi.fn().mockResolvedValue(undefined),
    pushUndo,
    undo,
  });
  onReady(api);
  return null;
}

describe("useInboxDismiss", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    vi.mocked(restoreInboxItems).mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("registers one undo that restores dismissed inbox items", async () => {
    const items: InboxRestoreItem[] = [
      { kind: "nudge", id: 1 },
      { kind: "mail", id: 2 },
    ];
    let api: Api | undefined;
    const pushUndo = vi.fn();
    const undo = vi.fn().mockResolvedValue(undefined);
    await act(async () => {
      root.render(
        <I18nProvider locale="en">
          <Harness onReady={(next) => { api = next; }} pushUndo={pushUndo} undo={undo} />
        </I18nProvider>,
      );
    });
    await act(async () => {
      await api?.dismissItems(items);
    });
    expect(pushUndo).toHaveBeenCalledTimes(1);
    const entry = pushUndo.mock.calls[0][0] as { restore: () => Promise<void> };
    await act(async () => {
      await entry.restore();
    });
    expect(restoreInboxItems).toHaveBeenCalledWith(items);
  });
});
