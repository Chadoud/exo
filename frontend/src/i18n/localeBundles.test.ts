import { describe, expect, it } from "vitest";
import { getCachedLocaleBundle, getEnglishBundle, loadLocaleBundle } from "./localeBundles";

describe("localeBundles", () => {
  it("loads English synchronously from cache", async () => {
    const bundle = await loadLocaleBundle("en");
    expect(bundle).toBe(getEnglishBundle());
    expect(getCachedLocaleBundle("en")).toBe(bundle);
  });

  it("lazy-loads non-English bundles on demand", async () => {
    expect(getCachedLocaleBundle("de")).toBeUndefined();
    const de = await loadLocaleBundle("de");
    expect(getCachedLocaleBundle("de")).toBe(de);
    expect(getString(de, "settings.navTabFileSorting")).toBeTruthy();
  }, 30_000);
});

function getString(tree: unknown, key: string): string | undefined {
  const parts = key.split(".");
  let cur: unknown = tree;
  for (const p of parts) {
    if (cur !== null && typeof cur === "object" && p in cur) {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      return undefined;
    }
  }
  return typeof cur === "string" ? cur : undefined;
}
