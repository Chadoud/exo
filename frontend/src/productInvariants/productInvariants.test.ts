import { describe, expect, it } from "vitest";
import {
  checkActiveModelSectionIa,
  checkNoSyntheticProgress,
  checkVoiceCredentialPath,
  runAllProductInvariantChecks,
} from "./checks";
import { PRODUCT_INVARIANTS } from "./invariants";

describe("product invariants", () => {
  it("documents the enforced invariant catalog", () => {
    expect(PRODUCT_INVARIANTS.map((item) => item.id)).toEqual([
      "voice-credential-path",
      "settings-active-models-ia",
      "no-raw-api-base-fetch",
      "no-synthetic-progress",
    ]);
  });

  it("voice credential path: shared ensureVoiceBackendReady module wired at entry points", () => {
    expect(checkVoiceCredentialPath()).toEqual([]);
  });

  it("settings IA: ActiveModelSection does not render a CHAT card", () => {
    expect(checkActiveModelSectionIa()).toEqual([]);
  });

  it(
    "no synthetic progress: frontend/src is free of forbidden progress patterns",
    () => {
      expect(checkNoSyntheticProgress()).toEqual([]);
    },
    60_000,
  );

  it(
    "all product invariants pass together",
    () => {
      const violations = runAllProductInvariantChecks();
      expect(violations, formatViolationReport(violations)).toEqual([]);
    },
    60_000,
  );
});

function formatViolationReport(
  violations: ReturnType<typeof runAllProductInvariantChecks>,
): string {
  if (violations.length === 0) return "";
  return violations
    .map((violation) => {
      const locations = violation.matches?.length
        ? `\n${violation.matches.map((match) => `  ${match.file}:${match.line} ${match.text}`).join("\n")}`
        : "";
      return `[${violation.invariantId}] ${violation.message}${locations}`;
    })
    .join("\n\n");
}
