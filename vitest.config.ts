import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["tests/unit/**/*.test.ts", "tests/contracts/**/*.test.ts", "tests/performance/**/*.test.ts"],
    coverage: { reporter: ["text", "html"] }
  }
});
