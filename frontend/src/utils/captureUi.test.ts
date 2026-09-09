// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { CAPTURE_SUB_TAB_STORAGE_KEY } from "../constants";
import { loadCaptureSubTab, persistCaptureSubTab } from "./captureUi";

describe("captureUi", () => {
  afterEach(() => {
    localStorage.removeItem(CAPTURE_SUB_TAB_STORAGE_KEY);
  });

  it("defaults to meeting and persists the last child", () => {
    expect(loadCaptureSubTab()).toBe("meeting");
    persistCaptureSubTab("activity");
    expect(loadCaptureSubTab()).toBe("activity");
  });
});
