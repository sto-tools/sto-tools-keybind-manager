import path from "node:path";

import { Linter } from "eslint";
import globals from "globals";

import { noUnallowlistedApplicationGlobalWritesRule } from "../../../scripts/eslint/applicationGlobals.mjs";

const REPOSITORY_ROOT = process.cwd();
const RULE_NAME = "sto-architecture/no-unallowlisted-writes";
const plugin = {
  rules: {
    "no-unallowlisted-writes": noUnallowlistedApplicationGlobalWritesRule,
  },
};

function verify(source, filename, { enforceDeclaredWriters = false } = {}) {
  const linter = new Linter({ configType: "flat" });
  return linter.verify(
    source,
    [
      {
        languageOptions: {
          ecmaVersion: "latest",
          globals: { ...globals.browser, ...globals.node },
          sourceType: "module",
        },
        plugins: { "sto-architecture": plugin },
        rules: {
          [RULE_NAME]: ["error", { enforceDeclaredWriters }],
        },
      },
    ],
    { filename: path.join(REPOSITORY_ROOT, filename) },
  );
}

function messageIds(source, filename, options) {
  return verify(source, filename, options).map((message) => message.messageId);
}

export { REPOSITORY_ROOT, RULE_NAME, messageIds, verify };
