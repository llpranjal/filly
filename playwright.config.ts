import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: { trace: "retain-on-failure" },
  webServer: {
    command: "node tests/e2e/fixture-server.mjs",
    port: 4173,
    reuseExistingServer: true,
    timeout: 10_000
  }
});
