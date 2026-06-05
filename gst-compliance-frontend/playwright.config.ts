import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 45_000,
  use: {
    baseURL: "http://127.0.0.1:3006",
    trace: "on-first-retry",
  },
  webServer: {
    command: "sh -c 'npm run build && npm run start -- --hostname 127.0.0.1 --port 3006'",
    url: "http://127.0.0.1:3006/login",
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
