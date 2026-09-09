import { describe, expect, it } from "vitest";
import { computeAppInteractionGates } from "./useAppInteractionGates";

const base = {
  helpOpen: false,
  tourOpen: false,
  showWelcome: false,
  launchSphereSplashOpen: false,
  reassignFile: null,
  needsCloudAccount: false,
};

describe("computeAppInteractionGates", () => {
  it("returns false when no overlay", () => {
    expect(computeAppInteractionGates(base)).toBe(false);
  });

  it("helpOpen blocks palette shortcuts", () => {
    expect(computeAppInteractionGates({ ...base, helpOpen: true })).toBe(true);
  });

  it("reassignFile blocks palette shortcuts", () => {
    expect(computeAppInteractionGates({ ...base, reassignFile: { path: "/x" } })).toBe(true);
  });
});
