import { describe, expect, it, vi } from "vitest";

import { ActivityTranslator } from "../../../src/js/lib/kbf/translation/ActivityTranslator.js";
import {
  createEmoteCycleAlias,
  createVisibleEmoteCycleAlias,
  translateActivity95,
  translateDecodedCombo,
} from "../../../src/js/lib/kbf/translation/activityTranslationBoundaries.js";

const invalidActivity95Cases = [
  [{ n1: 0, n2: 0, n3: 10 }, "more than ten slots"],
  [{ n1: 0, n2: 5, n3: 4 }, "a reversed range"],
  [{ n1: 0, n2: 0, n3: Number.POSITIVE_INFINITY }, "infinity"],
  [{ n1: 0, n2: 0, n3: Number.MAX_SAFE_INTEGER + 1 }, "an unsafe integer"],
];

describe("ActivityTranslator bounded translation helpers", () => {
  it("builds a bounded inclusive Activity 95 command range", () => {
    expect(translateActivity95(2, 8, 9, "$.activity")).toEqual({
      translation: {
        type: "parameterized_command",
        commands: ["+TrayExecByTray 2 8", "+TrayExecByTray 2 9"],
        aliases: {},
      },
      validation: null,
    });
  });

  it("appends decoded combo tokens and leaves raw combo data unhandled", () => {
    expect(translateDecodedCombo("Ctrl+G", ["Alt", "F1"])).toEqual({
      handled: true,
      key: "Ctrl+G+Alt+F1",
      validation: null,
    });
    expect(translateDecodedCombo("Ctrl+G", "QWx0")).toEqual({
      handled: false,
      key: "Ctrl+G",
      validation: null,
    });
  });

  it("preserves raw-combo failure fallback and diagnostics", () => {
    const addError = vi.fn();
    const translator = new ActivityTranslator({ decoder: { addError } });
    vi.spyOn(translator, "processComboChord").mockImplementation(() => {
      throw new TypeError("bad combo");
    });

    expect(translator.mapKeyToken("G", {}, "raw")).toBe("G");
    expect(addError).toHaveBeenCalledWith(
      "Combo chord processing failed: bad combo",
      {
        category: "handler_error",
        severity: "warning",
        canonicalKey: "G",
        combo: "raw",
        error: "TypeError",
        recoverable: true,
        suggestion:
          "Combo chord processing failed, using base key without chord",
      },
    );
  });

  it("creates stable bindset-scoped aliases for both cycle activities", () => {
    const sanitize = vi.fn((value) =>
      value.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
    );
    const context = {
      bindsetName: "Main",
      baseKeyName: "F1",
      index: 2,
      sanitize,
    };

    expect(createEmoteCycleAlias(context)).toBe("sto_kb_emotecycle_main_f1_2");
    expect(createVisibleEmoteCycleAlias(context)).toBe(
      "sto_kb_emotecyclevisible_main_f1_2",
    );
    expect(sanitize).toHaveBeenCalledWith("Main");
    expect(sanitize).toHaveBeenCalledWith("F1");
    expect(
      createEmoteCycleAlias({ baseKeyName: "F1", index: 2, sanitize }),
    ).toBe("sto_kb_emotecycle_F1_2");
  });

  it.each([createEmoteCycleAlias, createVisibleEmoteCycleAlias])(
    "frames non-simple alias segments without tuple collisions",
    (createAlias) => {
      const sanitize = (value) =>
        value.toLowerCase().replace(/[^a-z0-9]+/g, "_");
      const first = createAlias({
        bindsetName: "foo",
        baseKeyName: "bar_baz",
        index: 0,
        sanitize,
      });
      const second = createAlias({
        bindsetName: "foo_bar",
        baseKeyName: "baz",
        index: 0,
        sanitize,
      });

      expect(first).toContain("_scoped_");
      expect(second).toContain("_scoped_");
      expect(first).not.toBe(second);
      expect(first).toMatch(/^[A-Za-z][A-Za-z0-9_]*$/);
      expect(second).toMatch(/^[A-Za-z][A-Za-z0-9_]*$/);
    },
  );
});

describe("ActivityTranslator Activity 95 boundary", () => {
  it.each(invalidActivity95Cases)(
    "rejects %s without expanding commands (%s)",
    (activityData) => {
      const addError = vi.fn();
      const translator = new ActivityTranslator({ decoder: { addError } });
      const result = translator.generateActivityCommand(95, activityData, {
        baseKeyName: "Space",
        index: 0,
        path: "$.bindsets.master.keys.Space.activities[0]",
      });

      expect(result.commands).toEqual([]);
      expect(result).toMatchObject({
        success: false,
        error: "Activity translation failed: 95",
        errorCategory: "invalid_activity_data",
      });
      expect(addError).toHaveBeenCalledWith(
        "Validation failed for activity95Range: must use safe integers and an ordered slot range from 0 to 9",
        expect.objectContaining({
          category: "validation",
          fieldName: "activity95Range",
          fatal: true,
          path: "$.bindsets.master.keys.Space.activities[0]",
          expectedValue: "non-negative tray and inclusive slot range 0..9",
          suggestion:
            "Activity 95 may expand to at most the ten STO tray slots",
        }),
      );
    },
  );

  it("returns a direct failure for an invalid range without a decoder", () => {
    const result = new ActivityTranslator().translateActivity(95, {
      n1: 0,
      n2: 0,
      n3: 10,
    });

    expect(result).toMatchObject({
      success: false,
      commands: [],
      aliases: {},
      error: "Activity translation failed: 95",
      errorCategory: "invalid_activity_data",
    });
  });

  it.each([
    [["Alt", ""], "an empty segment"],
    [Array.from({ length: 11 }, () => "F1"), "too many segments"],
    [["Alt\nF2"], "a line break"],
    [["Alt+F2"], "an embedded chord delimiter"],
  ])("fails closed for a decoded combo containing %s", (combo) => {
    const addError = vi.fn();
    const translator = new ActivityTranslator({ decoder: { addError } });

    expect(translator.mapKeyToken("G", {}, combo)).toBe("");
    expect(addError).toHaveBeenCalledWith(
      "Validation failed for combo: must contain between one and ten safe decoded key tokens",
      expect.objectContaining({
        category: "validation",
        fieldName: "combo",
        actualValue: combo,
        expectedValue: "string[1..10]",
        suggestion: "Reject malformed or excessive combo chord tokens",
        fatal: true,
      }),
    );
  });

  it.each([
    [97, "sto_kb_emotecycle"],
    [101, "sto_kb_emotecyclevisible"],
  ])("keeps activity %i aliases unique across bindsets", (activity, prefix) => {
    const translator = new ActivityTranslator();
    const sanitize = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, "_");
    const translate = (bindsetName) =>
      translator.generateActivityCommand(
        activity,
        { text: "wave" },
        { bindsetName, baseKeyName: "F1", index: 0, sanitize },
      );

    const master = translate("Master");
    const secondary = translate("Secondary");
    expect(master.commands).toEqual([`${prefix}_master_f1_0`]);
    expect(secondary.commands).toEqual([`${prefix}_secondary_f1_0`]);
    expect(Object.keys(master.aliases)).not.toEqual(
      Object.keys(secondary.aliases),
    );
  });

  it.each([
    [97, "sto_kb_emotecycle"],
    [101, "sto_kb_emotecyclevisible"],
  ])(
    "preserves activity %i historical aliases when no bindset is supplied",
    (activity, prefix) => {
      const result = new ActivityTranslator().translateActivity(activity, {
        text: "wave",
        baseKeyName: "F1",
        index: 0,
      });

      expect(result.commands).toEqual([`${prefix}_F1_0`]);
      expect(Object.keys(result.aliases)).toEqual([
        `${prefix}_F1_0`,
        `${prefix}_F1_0_step0`,
      ]);
      expect(result.metadata.bindsetName).toBe("unknown_bindset");
    },
  );

  it.each([
    ["text", "captain\rF2"],
    ["text", "captain\nF2"],
    ["text2", "message\0F2"],
    ["text2", "message\u2028F2"],
  ])("rejects unsafe command-file characters in %s", (field, value) => {
    const addError = vi.fn();
    const translator = new ActivityTranslator({ decoder: { addError } });
    const path = "$.bindsets.master.keys.F1.activities[0]";
    const result = translator.translateActivity(98, {
      text: "captain",
      text2: "hello",
      [field]: value,
      path,
    });

    expect(result).toMatchObject({
      success: false,
      commands: [],
      aliases: {},
      error: "Activity translation failed: 98",
      errorCategory: "invalid_activity_data",
    });
    expect(addError).toHaveBeenCalledWith(
      `Validation failed for ${field}: must not contain control or line-separator characters`,
      expect.objectContaining({
        fatal: true,
        path: `${path}.${field}`,
      }),
    );
  });
});
