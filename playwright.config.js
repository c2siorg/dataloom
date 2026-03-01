import { defineConfig, devices } from "@playwright/test";

const isCI = !!process.env.CI;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: 1,
  reporter: isCI ? [["github"], ["html", { open: "never" }]] : [["html", { open: "on-failure" }]],
  timeout: 90_000,
  globalSetup: "./e2e/global-setup.js",

  expect: {
    timeout: 10_000,
  },

  use: {
    baseURL: "http://localhost:3200",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: isCI ? "retain-on-failure" : "off",
    navigationTimeout: 30_000,
    actionTimeout: 10_000,
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: [
    {
      command: "cd dataloom-backend && uv run uvicorn app.main:app --port 4200",
      url: "http://localhost:4200/docs",
      reuseExistingServer: !isCI,
      timeout: 30_000,
      env: {
        DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/dataloom",
      },
    },
    {
      command: "cd dataloom-frontend && npm run dev",
      url: "http://localhost:3200",
      reuseExistingServer: !isCI,
      timeout: 15_000,
    },
  ],
});
