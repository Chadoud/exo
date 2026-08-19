import { test, expect } from "@playwright/test";
import { gotoSeededApp, openSourcesTabShortcut, waitForAppShell } from "./helpers/appReady";

test.describe("External sources tab", () => {
  test("shows External sources heading and connector cards", async ({ page }) => {
    await gotoSeededApp(page);
    await waitForAppShell(page);
    await openSourcesTabShortcut(page);
    await expect(page.getByRole("heading", { name: "External sources" })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("heading", { name: "Google", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Connect" }).first()).toBeVisible();
    await expect(page.getByText("Not connected").first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "WhatsApp", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Slack", exact: true })).toBeVisible();
  });

  test("WhatsApp Business setup modal validates and saves", async ({ page }) => {
    await gotoSeededApp(page);
    await waitForAppShell(page);
    await openSourcesTabShortcut(page);

    await page.getByRole("region", { name: "WhatsApp" }).getByRole("button", { name: "Setup help" }).click();
    await expect(page.getByRole("heading", { name: "WhatsApp Business setup" })).toBeVisible();

    await expect(page.getByText("https://api.exosites.ch/v1/webhooks/whatsapp")).toBeVisible();

    await page.getByRole("button", { name: "Advanced — paste credentials manually" }).click();

    await page.getByRole("button", { name: "Save and verify" }).click();
    await expect(page.getByText("Enter phone number ID, business account ID, and access token.")).toBeVisible();

    await page.getByPlaceholder("From WhatsApp → API setup").fill("123456789");
    await page.getByPlaceholder("From API setup (WABA ID)").fill("987654321");
    await page.getByPlaceholder("From Generate access token in Meta").fill("EAA-test-token");
    await page.getByRole("button", { name: "Save and verify" }).click();

    await expect(page.getByRole("heading", { name: "WhatsApp Business setup" })).not.toBeVisible({
      timeout: 10_000,
    });
  });

  test("WhatsApp health panel shows when Business is connected", async ({ page }) => {
    test.setTimeout(60_000);
    await gotoSeededApp(page);
    await waitForAppShell(page);
    await openSourcesTabShortcut(page);
    await expect(page.getByRole("heading", { name: "External sources" })).toBeVisible({
      timeout: 15_000,
    });

    await page.evaluate(() => {
      const api = window.electronAPI;
      if (!api) return;
      api.integrationGetWhatsAppBusinessStatus = async () => ({
        ok: true,
        connected: true,
        displayPhoneNumber: "+41791234567",
        webhookConfigured: true,
        cloudPollingEnabled: true,
        inboundCount: 2,
        lastInboundMs: Date.now() - 60_000,
        businessAccountId: "987654321",
      });
    });

    const setupHelp = page
      .getByRole("region", { name: "WhatsApp" })
      .getByRole("button", { name: "Setup help" });
    await expect(setupHelp).toBeVisible();
    // No force: an actionability-checked click waits for layout to settle;
    // force-clicking fired at a stale position and missed the button.
    await setupHelp.click();
    await expect(page.getByRole("heading", { name: "WhatsApp Business setup" })).toBeVisible();

    await expect(page.getByText("Business number connected (+41791234567).")).toBeVisible();
    await expect(page.getByText("Inbound replies and delivery status are syncing.")).toBeVisible();
    await expect(page.getByText("Send a test message")).toBeVisible();

    await page.getByRole("button", { name: "Show approved templates" }).click();
    await expect(page.getByText("hello_world")).toBeVisible();

    await page.getByPlaceholder("+41791234567").fill("+41790000000");
    await page.getByRole("button", { name: "Send test" }).click();
    await expect(page.getByText("Test message sent.")).toBeVisible({ timeout: 10_000 });
  });
});
