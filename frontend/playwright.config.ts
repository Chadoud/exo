import { defineConfig, devices } from "@playwright/test";

/**
 * E2E smoke — starts Vite when not already running (`reuseExistingServer`).
 * Run: `npx playwright install chromium` once, then `npm run test:e2e`.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // One retry everywhere: local machines absorb load spikes, CI absorbs flakes.
  retries: 1,
  // Local dev-mode Vite serves every worker from one process; beyond ~3 workers
  // module transforms contend and per-test time doubles past the 30s budget.
  workers: process.env.CI ? undefined : 3,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "on-first-retry",
    ...devices["Desktop Chrome"],
  },
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
