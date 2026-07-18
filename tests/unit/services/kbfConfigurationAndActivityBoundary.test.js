import { describe, expect, it } from "vitest";

import {
  decodeKBFActivity95Range,
  decodeKBFActivityInteger,
  decodeKBFActivityOrder,
  decodeKBFImportConfiguration,
  validateKBFActivitySemantics,
} from "../../../src/js/components/services/kbfDataBoundary.js";

/** @param {unknown} result @param {string} path @param {string} error */
function expectFailure(result, path, error) {
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

describe("KBF import configuration boundary", () => {
  it("validates against available names, preserves mode, and deeply detaches", () => {
    const source = {
      selectedBindsets: ["Master", "toString"],
      bindsetMappings: Object.assign(Object.create(null), {
        Master: "primary",
        toString: "custom",
      }),
      bindsetRenames: Object.assign(Object.create(null), {
        toString: "Utility Bindset",
      }),
      singleBindsetMode: false,
    };

    const decoded = decodeKBFImportConfiguration(source, [
      "Master",
      "Secondary",
      "toString",
    ]);

    expect(decoded).toEqual({ success: true, value: source });
    expect(decoded.success && decoded.value).not.toBe(source);
    if (!decoded.success || !decoded.value) return;
    expect(decoded.value.selectedBindsets).not.toBe(source.selectedBindsets);
    expect(decoded.value.bindsetMappings).not.toBe(source.bindsetMappings);
    expect(Object.hasOwn(decoded.value.bindsetMappings, "toString")).toBe(true);
    source.selectedBindsets.push("Secondary");
    source.bindsetRenames.toString = "Caller mutation";
    expect(decoded.value.selectedBindsets).toEqual(["Master", "toString"]);
    expect(decoded.value.bindsetRenames.toString).toBe("Utility Bindset");
  });

  it("retains the automatic null configuration branch", () => {
    expect(decodeKBFImportConfiguration(null, ["Master"])).toEqual({
      success: true,
      value: null,
    });
    expect(decodeKBFImportConfiguration(undefined, ["Master"])).toEqual({
      success: true,
      value: null,
    });
  });

  it("defaults omitted collections without sharing available names", () => {
    const available = ["Master", "Secondary"];
    const decoded = decodeKBFImportConfiguration({}, available);

    expect(decoded).toEqual({
      success: true,
      value: {
        selectedBindsets: ["Master", "Secondary"],
        bindsetMappings: {},
        bindsetRenames: {},
      },
    });
    available.push("Later");
    expect(decoded.success && decoded.value?.selectedBindsets).toEqual([
      "Master",
      "Secondary",
    ]);
  });

  it("materializes the primary mapping implied by single-bindset mode", () => {
    expect(
      decodeKBFImportConfiguration(
        { selectedBindsets: ["Master"], singleBindsetMode: true },
        ["Master"],
      ),
    ).toEqual({
      success: true,
      value: {
        selectedBindsets: ["Master"],
        bindsetMappings: { Master: "primary" },
        bindsetRenames: {},
        singleBindsetMode: true,
      },
    });
  });

  it.each([
    ["non-record", [], ["Master"], "$"],
    [
      "duplicate selected name",
      { selectedBindsets: ["Master", "Master"] },
      ["Master"],
      "$.selectedBindsets[1]",
    ],
    [
      "unknown selected name",
      { selectedBindsets: ["Missing"] },
      ["Master"],
      "$.selectedBindsets[0]",
    ],
    [
      "invalid mapping",
      { bindsetMappings: { Master: "elsewhere" } },
      ["Master"],
      "$.bindsetMappings.Master",
    ],
    [
      "mapping for unknown name",
      { bindsetMappings: { Missing: "custom" } },
      ["Master"],
      "$.bindsetMappings.Missing",
    ],
    [
      "empty destination",
      { bindsetRenames: { Master: "   " } },
      ["Master"],
      "$.bindsetRenames.Master",
    ],
    [
      "unsafe destination",
      { bindsetRenames: { Master: "constructor" } },
      ["Master"],
      "$.bindsetRenames.Master",
    ],
    [
      "invalid single mode",
      { selectedBindsets: ["Master", "Secondary"], singleBindsetMode: true },
      ["Master", "Secondary"],
      "$.selectedBindsets",
    ],
    [
      "custom single mode",
      {
        selectedBindsets: ["Master"],
        bindsetMappings: { Master: "custom" },
        singleBindsetMode: true,
      },
      ["Master"],
      "$.bindsetMappings.Master",
    ],
    [
      "duplicate available name",
      null,
      ["Master", "Master"],
      "availableBindsetNames[1]",
    ],
    ["unsafe available name", null, ["__proto__"], "availableBindsetNames[0]"],
  ])("rejects %s", (_label, value, available, path) => {
    expectFailure(
      decodeKBFImportConfiguration(value, available),
      path,
      "invalid_kbf_configuration",
    );
  });

  it.each(["__proto__", "prototype", "constructor"])(
    "rejects unsafe configuration-map key %s",
    (unsafe) => {
      const mappings = {};
      setOwn(mappings, unsafe, "custom");
      expectFailure(
        decodeKBFImportConfiguration({ bindsetMappings: mappings }, ["Master"]),
        `$.bindsetMappings.${unsafe}`,
        "invalid_kbf_configuration",
      );
    },
  );

  it("rejects maps with executable prototypes", () => {
    const mappings = Object.create({ inherited: "custom" });
    mappings.Master = "primary";
    expectFailure(
      decodeKBFImportConfiguration({ bindsetMappings: mappings }, ["Master"]),
      "$.bindsetMappings",
      "invalid_kbf_configuration",
    );
  });

  it.each([
    [
      {
        selectedBindsets: ["Alpha", "Beta"],
        bindsetMappings: { Alpha: "custom", Beta: "custom" },
        bindsetRenames: { Alpha: "Shared", Beta: "Shared" },
      },
      "$.bindsetRenames.Beta",
    ],
    [
      {
        selectedBindsets: ["Alpha", "Beta"],
        bindsetMappings: { Alpha: "custom", Beta: "custom" },
        bindsetRenames: { Alpha: "Beta" },
      },
      "$.bindsetMappings.Beta",
    ],
  ])("rejects a second colliding custom destination %#", (value, path) => {
    expectFailure(
      decodeKBFImportConfiguration(value, ["Alpha", "Beta"]),
      path,
      "invalid_kbf_configuration",
    );
  });

  it("allows the same rename for an unselected or primary-mapped source", () => {
    expect(
      decodeKBFImportConfiguration(
        {
          selectedBindsets: ["Alpha", "Beta"],
          bindsetMappings: { Alpha: "custom", Beta: "primary" },
          bindsetRenames: { Alpha: "Shared", Beta: "Shared" },
        },
        ["Alpha", "Beta"],
      ),
    ).toMatchObject({ success: true });
    expect(
      decodeKBFImportConfiguration(
        {
          selectedBindsets: ["Alpha"],
          bindsetMappings: { Alpha: "custom", Beta: "custom" },
          bindsetRenames: { Alpha: "Shared", Beta: "Shared" },
        },
        ["Alpha", "Beta"],
      ),
    ).toMatchObject({ success: true });
  });
});

describe("KBF activity semantic boundary", () => {
  it.each([0, -1, 123, Number.MAX_SAFE_INTEGER])(
    "accepts safe integer %s without coercion",
    (value) => {
      expect(decodeKBFActivityInteger(value, "activity.n1")).toEqual({
        success: true,
        value,
      });
    },
  );

  it.each([NaN, Infinity, -Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1, "1"])(
    "rejects unsafe activity integer %s",
    (value) => {
      expectFailure(
        decodeKBFActivityInteger(value, "activity.n1"),
        "activity.n1",
        "invalid_kbf_activity",
      );
    },
  );

  it("accepts only non-negative safe execution order", () => {
    expect(decodeKBFActivityOrder(0)).toEqual({ success: true, value: 0 });
    expect(decodeKBFActivityOrder(42)).toEqual({ success: true, value: 42 });
    expectFailure(
      decodeKBFActivityOrder(-1),
      "$.order",
      "invalid_kbf_activity",
    );
    expectFailure(
      decodeKBFActivityOrder(1.5),
      "$.order",
      "invalid_kbf_activity",
    );
  });

  it("caps activity 95 to the complete ten-slot STO range", () => {
    expect(
      decodeKBFActivity95Range({ n1: 3, n2: 0, n3: 9 }, "activity"),
    ).toEqual({
      success: true,
      value: { tray: 3, fromSlot: 0, toSlot: 9, outputCount: 10 },
    });
    expect(decodeKBFActivity95Range({}, "activity")).toEqual({
      success: true,
      value: { tray: 0, fromSlot: 0, toSlot: 0, outputCount: 1 },
    });
  });

  it.each([
    [{ n1: -1, n2: 0, n3: 0 }, "activity.n1"],
    [{ n1: 0, n2: -1, n3: 0 }, "activity.n2"],
    [{ n1: 0, n2: 0, n3: 10 }, "activity.n3"],
    [{ n1: 0, n2: 7, n3: 2 }, "activity.n3"],
    [{ n1: Infinity, n2: 0, n3: 1 }, "activity.n1"],
    [{ n1: Number.MAX_SAFE_INTEGER + 1, n2: 0, n3: 1 }, "activity.n1"],
  ])("rejects unsafe activity 95 range %#", (value, path) => {
    expectFailure(
      decodeKBFActivity95Range(value, "activity"),
      path,
      "invalid_kbf_activity",
    );
  });

  it("validates, normalizes, and detaches the translator record", () => {
    const source = {
      activity: 95,
      text: "",
      text2: null,
      n1: 2,
      n2: 3,
      n3: 5,
      order: 4,
      context: { record: 2 },
    };

    const decoded = validateKBFActivitySemantics(source, "activity");

    expect(decoded).toEqual({ success: true, value: source });
    expect(decoded.success && decoded.value).not.toBe(source);
    source.context.record = 9;
    expect(decoded.success && decoded.value.context).toEqual({ record: 2 });
  });

  it("normalizes omitted activity 95 numeric inputs before translation", () => {
    expect(
      validateKBFActivitySemantics(
        { activity: 95, order: null, n1: null, n2: null, n3: null },
        "activity",
      ),
    ).toEqual({
      success: true,
      value: { activity: 95, order: 0, n1: 0, n2: 0, n3: 0 },
    });
  });

  it.each([
    [{ activity: 124, order: 0 }, "activity.activity"],
    [{ activity: 95, order: -1 }, "activity.order"],
    [{ activity: 95, order: 0, n1: -1, n2: 0, n3: 0 }, "activity.n1"],
    [{ activity: 95, order: 0, n1: 1.5 }, "activity.n1"],
    [{ activity: 95, order: 0, n2: 0, n3: 10 }, "activity.n3"],
    [{ activity: 1, order: 0, text: 42 }, "activity.text"],
    [new Date(), "activity"],
  ])("rejects semantically unsafe activity data %#", (value, path) => {
    expectFailure(
      validateKBFActivitySemantics(value, "activity"),
      path,
      "invalid_kbf_activity",
    );
  });
});
