import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.spec.mts"],
    environment: "node",
    clearMocks: true,
    restoreMocks: true,
  },
});
