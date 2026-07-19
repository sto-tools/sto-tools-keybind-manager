import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

/** @type {import('vitest/config').TestProjectInlineConfiguration[]} */
const projects = [
  // Unit tests configuration (jsdom environment)
  {
    extends: "./vitest.config.js",
    test: {
      name: "unit",
      environment: "jsdom",
      globals: true,
      setupFiles: ["vitest-localstorage-mock", "./tests/setup.js"],
      mockReset: false,
      testTimeout: 10000,
      include: ["tests/unit/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
    },
    resolve: {
      alias: {
        "@": "./src",
        "@js": "./src/js",
        "@tests": "./tests",
        "pretty-format": "./tests/browser/prettyFormatStub.js",
      },
    },
    define: {
      global: "globalThis",
    },
  },
  // Integration tests configuration (jsdom environment)
  {
    extends: "./vitest.config.js",
    test: {
      name: "integration",
      environment: "jsdom",
      globals: true,
      setupFiles: ["vitest-localstorage-mock", "./tests/setup.js"],
      mockReset: false,
      testTimeout: 10000,
      include: [
        "tests/integration/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}",
      ],
    },
    resolve: {
      alias: {
        "@": "./src",
        "@js": "./src/js",
        "@tests": "./tests",
      },
    },
    define: {
      global: "globalThis",
    },
  },
  // Browser tests configuration (chromium environment)
  {
    extends: "./vitest.config.js",
    test: {
      name: "browser",
      environment: "jsdom", // Fallback; browser mode overrides this with Chromium
      globals: true,
      testTimeout: 30000,
      // Concurrent Chromium workers intermittently fail while fetching Vitest,
      // setup, or test modules before collection. Browser coverage is small and
      // exercises a persistent checked-bundle session, so serialize its files
      // for deterministic full-suite runs.
      fileParallelism: false,
      include: [
        "tests/browser/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}",
      ],
      browser: {
        enabled: true,
        provider: playwright(),
        headless: true,
        instances: [{ browser: "chromium" }],
        api: {
          host: "localhost",
          port: 3001,
        },
      },
      setupFiles: ["./tests/browser-setup.js"],
    },
    resolve: {
      alias: {
        "@": "./src",
        "@js": "./src/js",
        "@tests": "./tests",
      },
    },
    define: {
      global: "globalThis",
    },
    server: {
      fs: {
        allow: [".."],
      },
      middlewareMode: false,
    },
  },
];

const selectedProjectNames =
  process.env.VITEST_PROJECT?.split(",").filter(Boolean);
const selectedProjects = selectedProjectNames
  ? projects.filter((project) =>
      selectedProjectNames.includes(String(project.test?.name)),
    )
  : projects;

if (
  selectedProjectNames &&
  selectedProjects.length !== selectedProjectNames.length
) {
  throw new Error(`Unknown Vitest project: ${selectedProjectNames.join(",")}`);
}

export default defineConfig({
  test: {
    projects: selectedProjects,
  },
});
