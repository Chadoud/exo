import { describe, expect, it, beforeEach } from "vitest";
import {
  consumeHighlightMemory,
  consumeOpenMeetingModal,
  consumeOpenWhatsAppSetup,
  consumeQueuedMemorySubTab,
  consumeStartActivityCapture,
  queueHighlightMemory,
  queueMemorySubTab,
  queueOpenMeetingModal,
  queueOpenWhatsAppSetup,
  queueStartActivityCapture,
} from "./deferredPanelActions";
import {
  MEMORY_HIGHLIGHT_SESSION_KEY,
  MEMORY_NAV_QUEUE_SESSION_KEY,
  OPEN_MEETING_MODAL_SESSION_KEY,
  OPEN_WHATSAPP_SETUP_SESSION_KEY,
  START_ACTIVITY_CAPTURE_SESSION_KEY,
} from "../constants";

function installSessionStorageMock(): void {
  const store = new Map<string, string>();
  const mock = {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  };
  Object.defineProperty(globalThis, "sessionStorage", { value: mock, configurable: true });
}

describe("deferredPanelActions", () => {
  beforeEach(() => {
    installSessionStorageMock();
    sessionStorage.clear();
  });

  it("queues and consumes highlight memory id once", () => {
    expect(consumeHighlightMemory()).toBeNull();
    queueHighlightMemory(42);
    expect(sessionStorage.getItem(MEMORY_HIGHLIGHT_SESSION_KEY)).toBe("42");
    expect(consumeHighlightMemory()).toBe(42);
    expect(consumeHighlightMemory()).toBeNull();
  });

  it("queues and consumes meeting modal intent once", () => {
    expect(consumeOpenMeetingModal()).toBe(false);
    queueOpenMeetingModal();
    expect(sessionStorage.getItem(OPEN_MEETING_MODAL_SESSION_KEY)).toBe("1");
    expect(consumeOpenMeetingModal()).toBe(true);
    expect(consumeOpenMeetingModal()).toBe(false);
  });

  it("queues and consumes activity capture intent once", () => {
    expect(consumeStartActivityCapture()).toBe(false);
    queueStartActivityCapture();
    expect(sessionStorage.getItem(START_ACTIVITY_CAPTURE_SESSION_KEY)).toBe("1");
    expect(consumeStartActivityCapture()).toBe(true);
    expect(consumeStartActivityCapture()).toBe(false);
  });

  it("queues and consumes Memory sub-tab once", () => {
    expect(consumeQueuedMemorySubTab()).toBeNull();
    queueMemorySubTab("brief");
    expect(sessionStorage.getItem(MEMORY_NAV_QUEUE_SESSION_KEY)).toBe("brief");
    expect(consumeQueuedMemorySubTab()).toBe("brief");
    expect(consumeQueuedMemorySubTab()).toBeNull();
  });

  it("queues and consumes WhatsApp setup intent once", () => {
    expect(consumeOpenWhatsAppSetup()).toBe(false);
    queueOpenWhatsAppSetup();
    expect(sessionStorage.getItem(OPEN_WHATSAPP_SETUP_SESSION_KEY)).toBe("1");
    expect(consumeOpenWhatsAppSetup()).toBe(true);
    expect(consumeOpenWhatsAppSetup()).toBe(false);
  });
});
