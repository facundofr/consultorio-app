import { defineConfig, devices } from "@playwright/test";

/**
 * Run through `pnpm test:e2e` (scripts/e2e.ts), which prepares the database
 * and environment. The app runs from the standalone production build.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://127.0.0.1:3100",
    locale: "es-AR",
    timezoneId: "America/Argentina/Buenos_Aires",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    { name: "chromium", use: { ...devices["Desktop Chrome"] }, dependencies: ["setup"] },
  ],
  webServer: {
    command: "node .next/standalone/server.js",
    url: "http://127.0.0.1:3100/healthz",
    reuseExistingServer: false,
    timeout: 60_000,
    stdout: "pipe",
  },
});
