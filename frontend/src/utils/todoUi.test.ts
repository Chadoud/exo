import { beforeEach, describe, expect, it, vi } from "vitest";
import { TODO_SUB_TAB_STORAGE_KEY } from "../constants";
import { loadTodoSubTab } from "./todoUi";

describe("loadTodoSubTab", () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    storage.clear();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
      clear: () => storage.clear(),
    });
  });

  it("defaults to today when storage is empty", () => {
    expect(loadTodoSubTab()).toBe("today");
  });

  it("returns stored inbox and done tabs", () => {
    storage.set(TODO_SUB_TAB_STORAGE_KEY, "inbox");
    expect(loadTodoSubTab()).toBe("inbox");
    storage.set(TODO_SUB_TAB_STORAGE_KEY, "done");
    expect(loadTodoSubTab()).toBe("done");
  });

  it("migrates the removed Replies tab to Tasks", () => {
    storage.set(TODO_SUB_TAB_STORAGE_KEY, "replies");
    expect(loadTodoSubTab()).toBe("today");
  });

  it("migrates legacy upcoming tab to today", () => {
    storage.set(TODO_SUB_TAB_STORAGE_KEY, "upcoming");
    expect(loadTodoSubTab()).toBe("today");
  });

  it("falls back to today for unknown values", () => {
    storage.set(TODO_SUB_TAB_STORAGE_KEY, "someday");
    expect(loadTodoSubTab()).toBe("today");
  });
});
