import { describe, expect, it } from "vitest";
import {
  PRIMARY_SETTINGS_SECTION_DOM_IDS,
  SETTINGS_NAV_ENTRIES,
  firstSettingsSectionIdForTab,
  isSettingsSectionInTab,
  loadSettingsNavTab,
  settingsNavSectionForTourHighlight,
  settingsNavTabForEntryId,
  settingsNavTabForTourHighlight,
} from "./settingsNav";

/** Group scroll anchors that may exist in DOM but not in the side nav list. */
const PRIMARY_SECTIONS_OPTIONAL_IN_NAV = new Set([
  "settings-anchor-general",
  "settings-vision-models",
]);

describe("settingsNav primary sections", () => {
  it("every primary settings scroll id appears in SETTINGS_NAV_ENTRIES (except group anchors)", () => {
    const navIds = new Set(SETTINGS_NAV_ENTRIES.map((e) => e.id));
    for (const domId of Object.values(PRIMARY_SETTINGS_SECTION_DOM_IDS)) {
      if (PRIMARY_SECTIONS_OPTIONAL_IN_NAV.has(domId)) continue;
      expect(navIds.has(domId), `Missing nav entry for ${domId}`).toBe(true);
    }
  });
});

describe("settingsNavSectionForTourHighlight", () => {
  it("maps the output folder tour step to the sorting side-nav item", () => {
    expect(settingsNavSectionForTourHighlight("settings-output-folder")).toBe("sorting-output");
  });

  it("returns null when tour is not on settings", () => {
    expect(settingsNavSectionForTourHighlight(null)).toBeNull();
    expect(settingsNavSectionForTourHighlight("sort-tab")).toBeNull();
  });
});

describe("settingsNavTabForEntryId", () => {
  it("maps sections to their category tab", () => {
    expect(settingsNavTabForEntryId("sorting-scans")).toBe("fileSorting");
    expect(settingsNavTabForEntryId("sorting-output")).toBe("fileSorting");
    expect(settingsNavTabForEntryId("settings-anchor-models")).toBe("fileSorting");
    expect(settingsNavTabForEntryId("settings-anchor-ai-provider")).toBe("aiAgents");
    expect(settingsNavTabForEntryId("settings-routing")).toBe("aiAgents");
    expect(settingsNavTabForEntryId("settings-anchor-voice")).toBe("aiAgents");
    expect(settingsNavTabForEntryId("settings-anchor-memory")).toBe("aiAgents");
    expect(settingsNavTabForEntryId("settings-anchor-features")).toBe("features");
    expect(settingsNavTabForEntryId("settings-app-language")).toBe("aboutHelp");
  });
});

describe("settingsNavTabForTourHighlight", () => {
  it("opens File sorting when tour highlights local models overview", () => {
    expect(settingsNavTabForTourHighlight("settings-models-overview")).toBe("fileSorting");
  });

  it("opens File sorting when tour highlights output folder", () => {
    expect(settingsNavTabForTourHighlight("settings-output-folder")).toBe("fileSorting");
  });

  it("opens About & help when tour highlights system status", () => {
    expect(settingsNavTabForTourHighlight("settings-system")).toBe("aboutHelp");
  });
});

describe("subscription nav hierarchy", () => {
  it("nests trial and license under Subscription", () => {
    const parent = SETTINGS_NAV_ENTRIES.find((e) => e.id === "settings-anchor-license");
    const trial = SETTINGS_NAV_ENTRIES.find((e) => e.id === "license-trial");
    const key = SETTINGS_NAV_ENTRIES.find((e) => e.id === "license-key");
    expect(parent?.depth).toBe(0);
    expect(parent?.labelKey).toBe("settings.nav.licenseTrial");
    expect(trial?.depth).toBe(1);
    expect(key?.depth).toBe(1);
    expect(trial?.tab).toBe("privacyAccount");
    expect(key?.tab).toBe("privacyAccount");
  });
});

describe("firstSettingsSectionIdForTab", () => {
  it("returns the first depth-0 section for each category tab", () => {
    expect(firstSettingsSectionIdForTab("fileSorting")).toBe("settings-anchor-models");
    expect(firstSettingsSectionIdForTab("aiAgents")).toBe("settings-anchor-ai-provider");
    expect(firstSettingsSectionIdForTab("features")).toBe("settings-anchor-features");
    expect(firstSettingsSectionIdForTab("privacyAccount")).toBe("settings-anchor-account");
    expect(firstSettingsSectionIdForTab("aboutHelp")).toBe("settings-anchor-system");
  });
});

describe("isSettingsSectionInTab", () => {
  it("matches section ids to their category tab", () => {
    expect(isSettingsSectionInTab("sorting-output", "fileSorting")).toBe(true);
    expect(isSettingsSectionInTab("settings-anchor-models", "fileSorting")).toBe(true);
    expect(isSettingsSectionInTab("settings-anchor-ai-provider", "aiAgents")).toBe(true);
    expect(isSettingsSectionInTab("settings-anchor-ai-provider", "fileSorting")).toBe(false);
    expect(isSettingsSectionInTab("settings-anchor-voice", "aiAgents")).toBe(true);
  });
});

describe("loadSettingsNavTab", () => {
  it("defaults to AI agents", () => {
    expect(loadSettingsNavTab()).toBe("aiAgents");
  });
});
