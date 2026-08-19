import { test, expect } from "@playwright/test";
import {
  advanceSortWizard,
  electronAPIStubWithLocalFilesE2E,
  gotoSeededApp,
  stageWorkspaceLocalFiles,
} from "./helpers/appReady";

// The Structure step (instructions strip) is wizard step 2 — reachable only after a
// source is selected, so every spec stages a local fixture then advances one step.
const LOCAL_FIXTURES = ["/tmp/e2e-in/report.pdf"];

test.describe("Sort instructions strip v2", () => {
  test("dropdown switches inline panel", async ({ page }) => {
    test.setTimeout(90_000);
    await page.addInitScript(electronAPIStubWithLocalFilesE2E, LOCAL_FIXTURES);
    await gotoSeededApp(page, { stubElectron: false });
    await stageWorkspaceLocalFiles(page, "report.pdf");
    await advanceSortWizard(page, 1);
    await expect(page.locator('[data-tour="sort-instructions-strip"]')).toBeVisible({
      timeout: 60_000,
    });

    await page.getByRole("button", { name: "How files are grouped" }).click();
    await page.getByRole("option", { name: "Custom instructions" }).click();
    // The editor now renders inline (no "Write instructions" disclosure step).
    await expect(page.getByRole("textbox", { name: "Extra sorting instructions" })).toBeVisible();

    await page.getByRole("button", { name: "How files are grouped" }).click();
    await page.getByRole("option", { name: "Folder structure" }).click();
    await expect(
      page.locator('[data-testid="structure-flow-canvas"], [data-testid="structure-flow-empty"]')
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: "Sorting rules" })).toBeEnabled();
  });

  test("shows migration hint for legacy dual config", async ({ page }) => {
    test.setTimeout(90_000);
    await page.addInitScript(electronAPIStubWithLocalFilesE2E, LOCAL_FIXTURES);
    await gotoSeededApp(page, { stubElectron: false });
    await page.addInitScript(() => {
      const key = "exosites.settings.v1";
      const raw = localStorage.getItem(key);
      const settings = raw ? JSON.parse(raw) : {};
      localStorage.setItem(
        key,
        JSON.stringify({
          ...settings,
          sortClassifyMode: "structure",
          sortSystemPrompt: "Legacy custom prompt",
          sortStructureTemplate: {
            version: 1,
            enabled: true,
            modules: [
              {
                id: "m1",
                theme: "document_type",
                children: [],
                maxFolders: null,
                overflowPolicy: "send_to_uncertain",
              },
            ],
          },
        })
      );
      sessionStorage.removeItem("exosites.sortInstructions.dualConfigDismissed.v1");
    });
    await page.reload();
    await stageWorkspaceLocalFiles(page, "report.pdf");
    await advanceSortWizard(page, 1);
    await expect(page.locator('[data-tour="sort-instructions-strip"]')).toBeVisible({
      timeout: 60_000,
    });
    const migration = page.getByTestId("sort-wizard").getByRole("status");
    await expect(migration).toContainText(/folder structure and custom instructions/i);
    await page.getByRole("button", { name: "Got it" }).click();
    await expect(migration).toHaveCount(0);
  });
});
