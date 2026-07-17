import js from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import globals from "globals";

// Existing oversized files cannot grow. Lower a limit whenever the file shrinks
// until every entry reaches the repository-wide 500-line policy.
const legacyMaxLineLimits = {
  "src/js/components/services/CommandChainService.js": 723,
  "src/js/components/services/CommandService.js": 825,
  "src/js/components/services/DataCoordinator.js": 1032,
  "src/js/components/services/ExportService.js": 594,
  "src/js/components/services/ImportService.js": 1266,
  "src/js/components/services/ParameterCommandService.js": 626,
  "src/js/components/services/SelectionService.js": 711,
  "src/js/components/ui/CommandChainUI.js": 1587,
  "src/js/components/ui/CommandLibraryUI.js": 508,
  "src/js/components/ui/CommandUI.js": 538,
  "src/js/components/ui/ImportUI.js": 1502,
  "src/js/components/ui/KeyBrowserUI.js": 1194,
  "src/js/components/ui/KeyCaptureUI.js": 1164,
  "src/js/components/ui/ParameterCommandUI.js": 513,
  "src/js/data.js": 1902,
  "src/js/lib/kbf/parsers/FieldParser.js": 511,
  "src/js/lib/kbf/parsers/KBFDecodePipeline.js": 931,
  "src/js/lib/kbf/translation/ActivityTranslator.js": 1772,
  "tests/unit/lib/ActivityTranslator.test.js": 3250,
  "tests/unit/services/ImportService.test.js": 1349,
  "tests/unit/services/SelectionService.test.js": 580,
  "tests/unit/ui/CommandChainUI.test.js": 473,
  "tests/unit/ui/CommandChainUI.title-fix.test.js": 528,
  "tests/unit/ui/ImportUI.toast.test.js": 638,
  "tests/unit/ui/ParameterCommandUI.test.js": 534,
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
        i18next: "readonly",
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
