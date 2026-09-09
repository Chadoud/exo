import { test, expect } from "@playwright/test";
import { gotoSeededApp, waitForAppShell } from "./helpers/appReady";

/**
 * Chat E2E smoke — composer mounts on the Assistant tab when secrets hydrate.
 * Full SSE round-trip is covered by unit tests (`AssistantChatPanelCore.test.ts`);
 * job classify → apply is covered by `sortHappyPath.spec.ts`.
 */
test.describe("Assistant chat smoke", () => {
  test("Chat tab shows the message composer", async ({ page }) => {
    test.setTimeout(90_000);
    await gotoSeededApp(page);
    await waitForAppShell(page);

    // Chat is a child of Exo in the sidebar, so open that group before clicking.
    await page.locator('[data-tour="nav-exo"]').click();
    await page.locator('[data-tour="nav-assistant"]').click();

    const workspace = page.locator('[data-tour="assistant-workspace"]');
    const input = workspace.getByPlaceholder("Ask anything…");
    await expect(input).toBeVisible({ timeout: 30_000 });
    await input.fill("Hello from E2E");
    await expect(input).toHaveValue("Hello from E2E");
  });
});
