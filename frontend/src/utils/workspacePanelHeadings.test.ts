import { describe, expect, it } from "vitest";
import {
  getMemoryPanelHeadingKeys,
  getSettingsPanelHeadingKeys,
  getTodoPanelHeadingKeys,
} from "./workspacePanelHeadings";

describe("workspacePanelHeadings", () => {
  it("maps memory sub-tabs to sidebar-aligned title keys", () => {
    expect(getMemoryPanelHeadingKeys("overview").titleKey).toBe("memories.tabs.overview");
    expect(getMemoryPanelHeadingKeys("activity").titleKey).toBe("memories.tabs.activity");
    expect(getMemoryPanelHeadingKeys("map").titleKey).toBe("memories.tabs.map");
  });

  it("maps To Do tabs to the same title keys as the sidebar", () => {
    expect(getTodoPanelHeadingKeys("today").titleKey).toBe("nav.todoToday");
    expect(getTodoPanelHeadingKeys("inbox").titleKey).toBe("nav.todoInbox");
    expect(getTodoPanelHeadingKeys("done").titleKey).toBe("nav.todoDone");
  });

  it("maps settings nav tabs to sidebar-aligned title keys", () => {
    expect(getSettingsPanelHeadingKeys("fileSorting").titleKey).toBe("settings.navTabFileSorting");
    expect(getSettingsPanelHeadingKeys("aiAgents").titleKey).toBe("settings.navTabAiAgents");
    expect(getSettingsPanelHeadingKeys("privacyAccount").titleKey).toBe("settings.navTabPrivacyAccount");
    expect(getSettingsPanelHeadingKeys("aboutHelp").titleKey).toBe("settings.navTabAboutHelp");
  });
});
