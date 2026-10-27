import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 2,
  retries: 0,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /navigation|lesson|puzzle/ },
  ],
  // Tests run against the production static export (build first: npm run build).
  webServer: { command: "node scripts/serve.mjs", env: { PORT: String(PORT) }, url: `http://localhost:${PORT}`, reuseExistingServer: true, timeout: 30_000 },
});
