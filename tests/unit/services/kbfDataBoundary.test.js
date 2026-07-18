import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

import { decodeKBFParseResult } from "../../../src/js/components/services/kbfDataBoundary.js";
import { KBFParser } from "../../../src/js/lib/KBFParser.js";

const FIXTURE_ROOT = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../fixtures/kbf",
);

function parseResult() {
  return {
    bindsets: {
      Master: {
        keys: {
          F1: {
            commands: ["+TrayExecByTray 0 0", "cycle_controller"],
            metadata: {
              stabilizeExecutionOrder: true,
            },
          },
          F2: ["Target_Enemy_Near"],
        },
        aliases: {},
        metadata: { displayName: "Master" },
      },
    },
    aliases: {
      cycle_controller: {
        steps: ["cycle_step_0"],
        currentIndex: 0,
        name: "cycle_controller",
        type: "cycle",
        isGenerated: true,
        metadata: { source: "activity-95" },
      },
      cycle_step_0: {
        commands: ["emote_notext wave"],
        next: "cycle_step_0",
        name: "cycle_step_0",
        description: "Cycle step",
        category: "generated",
        isLoader: false,
      },
    },
    errors: [
      {
        message: "No KEY entries found in KEYSET",
        layer: 0,
        keysetRecordIndex: 1,
        keysetName: "Empty",
        recoverable: true,
      },
    ],
    warnings: ["Recoverable warning"],
    stats: {
      totalBindsets: 1,
      totalKeys: 2,
      totalAliases: 2,
      processedLayers: [1, 2, 3, 4, 5, 6],
      skippedActivities: 1,
      totalActivities: 3,
    },
  };
}

/** @param {unknown} result @param {string} path @param {string} [error] */
function expectFailure(result, path, error = "invalid_kbf_parse_result") {
  expect(result).toEqual({ success: false, error, params: { path } });
}

/** @param {Record<string, unknown>} value @param {string} key @param {unknown} fieldValue */
function setOwn(value, key, fieldValue) {
  Object.defineProperty(value, key, {
    value: fieldValue,
    enumerable: true,
    configurable: true,
    writable: true,
  });
}

describe("kbfDataBoundary", () => {
  describe("final parser-result decoding", () => {
    it("preserves current key, alias-cycle, metadata, stats, and diagnostic shapes", () => {
      const source = parseResult();

      const decoded = decodeKBFParseResult(source);

      expect(decoded).toEqual({
        success: true,
        value: {
          ...source,
          bindsets: {
            Master: {
              ...source.bindsets.Master,
              keys: {
                F1: source.bindsets.Master.keys.F1,
                F2: { commands: ["Target_Enemy_Near"], metadata: {} },
              },
            },
          },
        },
      });
      expect(decoded.success && decoded.value.aliases.cycle_controller).toEqual(
        expect.objectContaining({
          steps: ["cycle_step_0"],
          currentIndex: 0,
          name: "cycle_controller",
        }),
      );
    });

    it("accepts and detaches the generated cycle aliases from the real fixture", () => {
      const log = vi.spyOn(console, "log").mockImplementation(() => {});
      try {
        const source = new KBFParser().parseFile(
          readFileSync(join(FIXTURE_ROOT, "keyset.KBF"), "utf8"),
          { targetEnvironment: "space", includeMetadata: true },
        );

        const decoded = decodeKBFParseResult(source);

        expect(decoded.success).toBe(true);
        if (!decoded.success) return;
        const controller = Object.values(decoded.value.aliases).find(
          (alias) => alias.steps,
        );
        expect(controller).toEqual({
          steps: [expect.stringMatching(/^sto_kb_emotecycle_.+_step0$/)],
          currentIndex: 0,
          name: expect.stringMatching(/^sto_kb_emotecycle_.+$/),
        });
        const stepName = controller?.steps?.[0];
        expect(decoded.value.aliases[stepName]).toEqual({
          commands: ["emote_notext "],
          next: stepName,
          name: stepName,
        });
        expect(decoded.value).not.toBe(source);
        expect(decoded.value.bindsets).not.toBe(source.bindsets);
        expect(decoded.value.aliases).not.toBe(source.aliases);
      } finally {
        log.mockRestore();
      }
    });

    it("deeply detaches every accepted mutable branch", () => {
      const source = parseResult();
      const decoded = decodeKBFParseResult(source);
      expect(decoded.success).toBe(true);
      if (!decoded.success) return;

      source.bindsets.Master.keys.F1.commands.push("caller command");
      source.bindsets.Master.keys.F1.metadata.stabilizeExecutionOrder = false;
      source.bindsets.Master.metadata.displayName = "Caller";
      source.aliases.cycle_controller.steps.push("caller_step");
      source.aliases.cycle_controller.metadata.source = "caller";
      source.errors[0].keysetName = "caller";
      source.stats.processedLayers.pop();

      expect(decoded.value.bindsets.Master.keys.F1.commands).toEqual([
        "+TrayExecByTray 0 0",
        "cycle_controller",
      ]);
      expect(decoded.value.bindsets.Master.keys.F1.metadata).toEqual({
        stabilizeExecutionOrder: true,
      });
      expect(decoded.value.bindsets.Master.metadata).toEqual({
        displayName: "Master",
      });
      expect(decoded.value.aliases.cycle_controller.steps).toEqual([
        "cycle_step_0",
      ]);
      expect(decoded.value.aliases.cycle_controller.metadata).toEqual({
        source: "activity-95",
      });
      expect(decoded.value.errors[0]).toMatchObject({ keysetName: "Empty" });
      expect(decoded.value.stats.processedLayers).toEqual([1, 2, 3, 4, 5, 6]);

      decoded.value.aliases.cycle_controller.steps.push("decoded_step");
      expect(source.aliases.cycle_controller.steps).toEqual([
        "cycle_step_0",
        "caller_step",
      ]);
    });

    it("preserves recoverable diagnostics and rejects an explicitly fatal one", () => {
      const recoverable = parseResult();
      recoverable.errors.push({ message: "Still usable", fatal: false });
      expect(decodeKBFParseResult(recoverable)).toMatchObject({
        success: true,
      });

      const fatal = parseResult();
      fatal.errors.push({ message: "Stop", fatal: true });
      expectFailure(decodeKBFParseResult(fatal), "$.errors[1].fatal");
    });

    it.each([
      [null, "$"],
      [[], "$"],
      [{}, "$.bindsets"],
    ])("rejects incomplete or non-record root input %#", (value, path) => {
      expectFailure(decodeKBFParseResult(value), path);
    });

    it.each([
      [
        "bindset",
        () => {
          const value = parseResult();
          value.bindsets.Master = new Date();
          return value;
        },
        "$.bindsets.Master",
      ],
      [
        "key",
        () => {
          const value = parseResult();
          value.bindsets.Master.keys.F1 = new Map();
          return value;
        },
        "$.bindsets.Master.keys.F1",
      ],
      [
        "alias",
        () => {
          const value = parseResult();
          value.aliases.cycle_controller = [];
          return value;
        },
        "$.aliases.cycle_controller",
      ],
      [
        "metadata",
        () => {
          const value = parseResult();
          value.bindsets.Master.metadata = new Date();
          return value;
        },
        "$.bindsets.Master.metadata",
      ],
      [
        "stats",
        () => {
          const value = parseResult();
          value.stats = [];
          return value;
        },
        "$.stats",
      ],
      [
        "diagnostic",
        () => {
          const value = parseResult();
          value.errors = [new Error("not data")];
          return value;
        },
        "$.errors[0]",
      ],
    ])("rejects a non-data %s record", (_label, create, path) => {
      expectFailure(decodeKBFParseResult(create()), path);
    });

    it.each(["__proto__", "prototype", "constructor"])(
      "rejects unsafe dynamic name %s at every map boundary",
      (unsafe) => {
        const bindset = parseResult();
        bindset.bindsets = {};
        setOwn(bindset.bindsets, unsafe, {
          keys: {},
          aliases: {},
          metadata: {},
        });
        bindset.stats.totalKeys = 0;
        expectFailure(decodeKBFParseResult(bindset), `$.bindsets.${unsafe}`);

        const key = parseResult();
        setOwn(key.bindsets.Master.keys, unsafe, []);
        key.stats.totalKeys += 1;
        expectFailure(
          decodeKBFParseResult(key),
          `$.bindsets.Master.keys.${unsafe}`,
        );

        const alias = parseResult();
        setOwn(alias.aliases, unsafe, { commands: [] });
        alias.stats.totalAliases += 1;
        expectFailure(decodeKBFParseResult(alias), `$.aliases.${unsafe}`);
      },
    );

    it("rejects unsafe nested metadata without invoking prototype setters", () => {
      const value = parseResult();
      value.aliases.cycle_controller.metadata.extension = JSON.parse(
        '{"__proto__":{"polluted":true}}',
      );

      expectFailure(
        decodeKBFParseResult(value),
        "$.aliases.cycle_controller.metadata.extension.__proto__",
      );
      expect({}.polluted).toBeUndefined();
    });

    it.each([
      [
        "key",
        () => {
          const value = parseResult();
          value.bindsets.Master.keys.F1.commands[0] = { command: "FireAll" };
          return value;
        },
        "$.bindsets.Master.keys.F1.commands[0]",
      ],
      [
        "alias",
        () => {
          const value = parseResult();
          value.aliases.cycle_step_0.commands[0] = 42;
          return value;
        },
        "$.aliases.cycle_step_0.commands[0]",
      ],
    ])("rejects a non-string %s command", (_label, create, path) => {
      expectFailure(decodeKBFParseResult(create()), path);
    });

    it.each([
      ["totalBindsets", 2, "$.stats.totalBindsets"],
      ["totalKeys", 3, "$.stats.totalKeys"],
      ["totalAliases", 3, "$.stats.totalAliases"],
      ["skippedActivities", -1, "$.stats.skippedActivities"],
      ["totalActivities", 0, "$.stats.totalActivities"],
      ["totalKeys", Number.MAX_SAFE_INTEGER + 1, "$.stats.totalKeys"],
      ["totalKeys", Number.POSITIVE_INFINITY, "$.stats.totalKeys"],
    ])("rejects invalid or inconsistent stat %s=%s", (field, stat, path) => {
      const value = parseResult();
      value.stats[field] = stat;
      expectFailure(decodeKBFParseResult(value), path);
    });

    it.each([
      [[1, 2, 2], "$.stats.processedLayers[2]"],
      [[1, 3, 2], "$.stats.processedLayers[2]"],
      [[0], "$.stats.processedLayers[0]"],
      [[7], "$.stats.processedLayers[0]"],
      [[1.5], "$.stats.processedLayers[0]"],
    ])("rejects invalid processed-layer order %#", (layers, path) => {
      const value = parseResult();
      value.stats.processedLayers = layers;
      expectFailure(decodeKBFParseResult(value), path);
    });

    it.each([
      [
        "unknown alias field",
        () => {
          const value = parseResult();
          value.aliases.cycle_controller.unknown = true;
          return value;
        },
        "$.aliases.cycle_controller.unknown",
      ],
      [
        "cycle index without steps",
        () => {
          const value = parseResult();
          delete value.aliases.cycle_controller.steps;
          return value;
        },
        "$.aliases.cycle_controller.currentIndex",
      ],
      [
        "cycle index out of range",
        () => {
          const value = parseResult();
          value.aliases.cycle_controller.currentIndex = 1;
          return value;
        },
        "$.aliases.cycle_controller.currentIndex",
      ],
      [
        "mismatched alias name",
        () => {
          const value = parseResult();
          value.aliases.cycle_controller.name = "other";
          return value;
        },
        "$.aliases.cycle_controller.name",
      ],
      [
        "non-safe diagnostic index",
        () => {
          const value = parseResult();
          value.errors[0].recordIndex = Number.MAX_SAFE_INTEGER + 1;
          return value;
        },
        "$.errors[0].recordIndex",
      ],
      [
        "unsupported key metadata",
        () => {
          const value = parseResult();
          value.bindsets.Master.keys.F1.metadata.extension = true;
          return value;
        },
        "$.bindsets.Master.keys.F1.metadata.extension",
      ],
      [
        "invalid key metadata",
        () => {
          const value = parseResult();
          value.bindsets.Master.keys.F1.metadata.stabilizeExecutionOrder =
            "yes";
          return value;
        },
        "$.bindsets.Master.keys.F1.metadata.stabilizeExecutionOrder",
      ],
      [
        "unsupported bindset metadata",
        () => {
          const value = parseResult();
          value.bindsets.Master.metadata.extension = true;
          return value;
        },
        "$.bindsets.Master.metadata.extension",
      ],
      [
        "invalid bindset metadata",
        () => {
          const value = parseResult();
          value.bindsets.Master.metadata.displayName = 42;
          return value;
        },
        "$.bindsets.Master.metadata.displayName",
      ],
    ])("rejects %s", (_label, create, path) => {
      expectFailure(decodeKBFParseResult(create()), path);
    });
  });
});
