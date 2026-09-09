let activeFeature: string | null = null;
let activeTab: string | null = null;

export function setActiveFeature(feature: string | null): void {
  activeFeature = feature ? feature.slice(0, 64) : null;
}

export function setActiveTab(tab: string | null): void {
  activeTab = tab ? tab.slice(0, 64) : null;
}

export function getActiveContext(): { active_feature: string | null; active_tab: string | null } {
  return { active_feature: activeFeature, active_tab: activeTab };
}

/** Map main nav tab ids to analytics feature buckets. */
export function featureFromNavTab(tab: string): string {
  switch (tab) {
    case "assistant":
    case "exo":
      return "assistant";
    case "queue":
    case "overview":
    case "history":
      return "sort";
    case "sources":
      return "external_sources";
    case "settings":
      return "settings";
    case "memories":
      return "memories";
    case "capture":
      return "capture";
    case "tasks":
      return "tasks";
    default:
      return "other";
  }
}
