import { defineConfig } from "@playwright/test";

const port = 4173;
const managedDevelopmentCommand = "pnpm --filter @workspace/safeloc-diligence-workbench run dev";
const managedBaseUrl = process.env.PLAYWRIGHT_BASE_URL;

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "line",
  use: {
    baseURL: managedBaseUrl ?? `http://127.0.0.1:${port}`,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "desktop-chromium",
      use: { viewport: { width: 1440, height: 900 } },
    },
    {
      name: "mobile-chromium",
      use: { viewport: { width: 390, height: 844 } },
    },
  ],
  webServer: managedBaseUrl
    ? undefined
    : {
      command: `PORT=${port} BASE_PATH=/ ${managedDevelopmentCommand}`,
      url: `http://127.0.0.1:${port}/client-route`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
});
