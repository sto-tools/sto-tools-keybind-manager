import path from "node:path";

import { Linter } from "eslint";
import globals from "globals";

import {
  noUnallowlistedApplicationGlobalReadsRule,
  noUnallowlistedApplicationGlobalWritesRule,
} from "../../../scripts/eslint/applicationGlobals.mjs";

const REPOSITORY_ROOT = process.cwd();
const READ_RULE_NAME = "sto-architecture/no-unallowlisted-reads";
const RULE_NAME = "sto-architecture/no-unallowlisted-writes";
const plugin = {
  rules: {
    "no-unallowlisted-reads": noUnallowlistedApplicationGlobalReadsRule,
    "no-unallowlisted-writes": noUnallowlistedApplicationGlobalWritesRule,
  },
};

function verifyRule(source, filename, ruleName, options) {
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
          [ruleName]: ["error", options],
        },
      },
    ],
    { filename: path.join(REPOSITORY_ROOT, filename) },
  );
}

function verify(source, filename, { enforceDeclaredWriters = false } = {}) {
  return verifyRule(source, filename, RULE_NAME, { enforceDeclaredWriters });
}

function verifyReads(
  source,
  filename,
  { enforceDeclaredReaders = false } = {},
) {
  return verifyRule(source, filename, READ_RULE_NAME, {
    enforceDeclaredReaders,
  });
}

function messageIds(source, filename, options) {
  return verify(source, filename, options).map((message) => message.messageId);
}

function readMessageIds(source, filename, options) {
  return verifyReads(source, filename, options).map(
    (message) => message.messageId,
  );
}

export {
  READ_RULE_NAME,
  REPOSITORY_ROOT,
  RULE_NAME,
  messageIds,
  readMessageIds,
  verify,
  verifyReads,
};
