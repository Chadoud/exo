import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const COMPONENTS_DIR = resolve(import.meta.dirname, ".");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    if (!entry.name.endsWith(".tsx")) return [];
    if (entry.name.endsWith(".test.tsx")) return [];
    return [path];
  });
}

/**
 * Dialog footer buttons are `shrink-0` and the modal surface is `overflow-hidden`,
 * so a footer that cannot wrap will clip its own buttons as soon as a translation
 * is wider than English. Caught in the wild on the French "Quitter les réglages ?"
 * dialog, where the first and last buttons were sliced off at the modal edge.
 */
describe("modal footer rows stay wrappable", () => {
  const files = sourceFiles(COMPONENTS_DIR).filter((path) =>
    readFileSync(path, "utf8").includes("MODAL_FOOTER_ROW_CLASS"),
  );

  it("finds the footer rows to check", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)("%s does not pin the footer to a single line", (path) => {
    const source = readFileSync(path, "utf8");
    const footerRows = source
      .split("MODAL_FOOTER_ROW_CLASS}")
      .slice(1)
      .map((chunk) => chunk.slice(0, chunk.indexOf("`")));
    for (const row of footerRows) {
      expect(row).not.toMatch(/\bflex-nowrap\b/);
    }
  });
});
