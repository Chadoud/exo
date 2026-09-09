import { describe, expect, it } from "vitest";
import { SETTINGS_SUBTAB_ICONS } from "../utils/settingsNav";
import { TODO_DONE_ICON, buildMainNavItems } from "./useMainNavItems";

describe("useMainNavItems icons", () => {
  it("does not reuse the Privacy shield for Done", () => {
    expect(TODO_DONE_ICON).not.toBe(SETTINGS_SUBTAB_ICONS.privacyAccount);
  });
});

describe("useMainNavItems capture", () => {
  it("puts Meeting and Activity under Capture, not Memory", () => {
    const items = buildMainNavItems("en");
    const capture = items.find((item) => item.id === "capture");
    const memory = items.find((item) => item.id === "memories");
    expect(capture?.children?.map((c) => c.captureSubTab)).toEqual(["meeting", "activity"]);
    expect(memory?.children?.map((c) => c.memorySubTab)).toEqual(["overview", "map"]);
  });
});
