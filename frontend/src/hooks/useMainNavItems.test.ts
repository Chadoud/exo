import { describe, expect, it } from "vitest";
import { SETTINGS_SUBTAB_ICONS } from "../utils/settingsNav";
import { TODO_DONE_ICON } from "./useMainNavItems";

describe("useMainNavItems icons", () => {
  it("does not reuse the Privacy shield for Done", () => {
    expect(TODO_DONE_ICON).not.toBe(SETTINGS_SUBTAB_ICONS.privacyAccount);
  });
});
