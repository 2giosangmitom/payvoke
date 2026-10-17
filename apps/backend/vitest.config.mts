import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [".test-build/test/**/*.spec.mjs"],
    environment: "node",
    clearMocks: true,
    restoreMocks: true,
  },
});
