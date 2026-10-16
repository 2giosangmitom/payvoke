import ttsc from "@ttsc/unplugin/vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [ttsc({ plugins: [{ transform: "typia/lib/transform" }] })],
  test: {
    environment: "node",
    clearMocks: true,
    restoreMocks: true,
  },
});
