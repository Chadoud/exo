// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { I18nProvider } from "../i18n/I18nContext";
import MeetingModePanel from "./MeetingModePanel";

const startMeeting = vi.fn();
const startTranscription = vi.fn();
const transcriptionState = {
  recording: false,
  issue: null as null | "mic_denied" | "unavailable",
};

vi.mock("../api/meetings", () => ({
  startMeeting: (id: string, title: string) => startMeeting(id, title),
  addMeetingNote: vi.fn(),
  fetchMeetingNotes: vi.fn(async () => ({ ok: true, lines: [] })),
  endMeeting: vi.fn(),
}));

vi.mock("../hooks/useConversations", () => ({
  useConversations: () => ({ setActive: vi.fn() }),
}));

vi.mock("../hooks/useMeetingTranscription", () => ({
  useMeetingTranscription: () => ({
    recording: transcriptionState.recording,
    issue: transcriptionState.issue,
    start: startTranscription,
    stop: vi.fn(),
  }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() },
}));

describe("MeetingModePanel", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    startMeeting.mockReset();
    startTranscription.mockReset();
    transcriptionState.recording = false;
    transcriptionState.issue = null;
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  async function renderPanel() {
    await act(async () => {
      root.render(
        <I18nProvider locale="en">
          <MeetingModePanel backendOnline />
        </I18nProvider>,
      );
    });
  }

  it("does not show a second Meeting mode heading", async () => {
    await renderPanel();
    expect(container.textContent).not.toContain("Meeting mode");
    expect(container.textContent).toContain("Capture what was said");
  });

  it("shows Notes only and mapped copy after STT fails — never raw Gemini text", async () => {
    startMeeting.mockResolvedValue({ ok: true });
    startTranscription.mockResolvedValue({ listening: false });
    transcriptionState.issue = "unavailable";
    await renderPanel();

    const start = [...container.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Start meeting"),
    );
    await act(async () => {
      start!.click();
    });

    expect(container.textContent).toContain("Notes only");
    expect(container.textContent).toContain("Couldn't turn speech into notes");
    expect(container.textContent).not.toContain("1007");
    expect(container.textContent).not.toContain("gemini");
    expect(container.textContent).not.toContain("response modalities");
    expect(container.textContent).toContain("Try listening again");
  });
});
