import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      exclude: ["node_modules/", "tests/", "src/styles.css", "**/*.config.js"],
      include: ["src/js/**/*.js"],
      provider: "v8",
      reporter: ["text-summary", "json-summary", "json", "lcovonly", "html"],
    },
  },
});
