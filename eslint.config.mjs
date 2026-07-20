import js from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import globals from "globals";

import applicationGlobalsPlugin from "./scripts/eslint/applicationGlobals.mjs";

// Existing oversized files cannot grow. Lower a limit whenever the file shrinks
// until every entry reaches the repository-wide 500-line policy.
const legacyMaxLineLimits = {
  "src/js/components/services/DataCoordinator.js": 928,
  "src/js/components/services/ParameterCommandService.js": 550,
  "src/js/components/ui/CommandChainUI.js": 1502,
  "src/js/components/ui/CommandUI.js": 538,
  "src/js/data.js": 1759,
  "src/js/lib/kbf/parsers/KBFDecodePipeline.js": 915,
  "src/js/lib/kbf/translation/ActivityTranslator.js": 1767,
  "tests/unit/lib/ActivityTranslator.test.js": 3250,
  "tests/unit/services/ImportService.test.js": 826,
  "tests/unit/services/SelectionService.test.js": 580,
  "tests/unit/ui/CommandChainUI.test.js": 442,
  "tests/unit/ui/CommandChainUI.title-fix.test.js": 528,
};

export default [
  {
    ignores: [
      ".structural-cache/**",
      "coverage/**",
      "dist/**",
      "html/**",
      "node_modules/**",
      "src/dist/**",
      "src/js/lib/KBFParser.backup.do-not-delete.js",
      "test-results/**",
      "test_browser.old-suite/**",
      "tests.old-suite/**",
    ],
  },
  js.configs.recommended,
  {
    files: ["**/*.{js,mjs,cjs}"],
    languageOptions: {
      ecmaVersion: "latest",
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      sourceType: "module",
    },
    rules: {
      "max-lines": [
        "error",
        {
          max: 500,
          skipBlankLines: true,
          skipComments: true,
        },
      ],
    },
  },
  {
    files: ["src/js/**/*.{js,mjs,cjs}"],
    plugins: {
      "sto-architecture": applicationGlobalsPlugin,
    },
    rules: {
      "sto-architecture/no-unallowlisted-writes": "error",
    },
  },
  {
    files: ["tests/**/*.js"],
    languageOptions: {
      globals: globals.vitest,
    },
  },
  ...Object.entries(legacyMaxLineLimits).map(([file, max]) => ({
    files: [file],
    rules: {
      "max-lines": [
        "error",
        {
          max,
          skipBlankLines: true,
          skipComments: true,
        },
      ],
    },
  })),
  eslintConfigPrettier,
];
