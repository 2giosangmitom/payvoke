import { defineConfig } from "@playwright/test";

export default defineConfig({
  expect: { timeout: 10_000 },
  testDir: "./e2e",
  use: { baseURL: "http://localhost:3100", trace: "retain-on-failure" },
  webServer: {
    command: "pnpm exec vite dev --port 3100",
    url: "http://localhost:3100",
    env: {
      VITE_SUPABASE_URL: "https://workspace-test.supabase.co",
      VITE_SUPABASE_PUBLISHABLE_KEY: "test-public-key",
      VITE_API_HOST: "http://localhost:8100",
    },
    reuseExistingServer: false,
  },
});
