import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  decodeSettingsRepositoryJson,
  prepareSettingsRepositoryValue,
} from "../../../src/js/components/storage/settingsRepositoryBoundary.js";
import {
  MAX_PROJECT_JSON_BYTES,
  MAX_PROJECT_JSON_DEPTH,
} from "../../../src/js/components/services/jsonDataBoundary.js";

function settings() {
  return JSON.parse(
    readFileSync(
      "tests/fixtures/storage/complete-current-settings.json",
      "utf8",
    ),
  );
}

describe("settings repository boundary", () => {
  it("strictly preserves and detaches all known, compatibility, and extension fields", () => {
    const input = settings();
    const result = prepareSettingsRepositoryValue(input);
    expect(result).toEqual({
      success: true,
      json: JSON.stringify(input),
      value: input,
    });
    expect(result.value).not.toBe(input);
    expect(result.value["plugin:layout"]).not.toBe(input["plugin:layout"]);
    input["plugin:layout"].density = "changed";
    expect(result.value["plugin:layout"].density).toBe("compact");
  });

  it.each([
    "theme",
    "autoSave",
    "showTooltips",
    "confirmDeletes",
    "maxUndoSteps",
    "defaultMode",
    "compactView",
    "language",
    "syncFolderName",
    "syncFolderPath",
    "autoSync",
    "autoSyncInterval",
    "bindToAliasMode",
    "bindsetsEnabled",
    "translateGeneratedMessages",
  ])("rejects missing known field %s rather than filling defaults", (key) => {
    const input = settings();
    delete input[key];
    expect(prepareSettingsRepositoryValue(input)).toEqual({
      success: false,
      error: "invalid_data",
    });
  });

  it.each([
    ["theme", 1],
    ["autoSave", "yes"],
    ["showTooltips", "yes"],
    ["confirmDeletes", 1],
    ["maxUndoSteps", "50"],
    ["defaultMode", false],
    ["compactView", "yes"],
    ["language", null],
    ["syncFolderName", 1],
    ["syncFolderPath", false],
    ["autoSync", 1],
    ["autoSyncInterval", 30],
    ["bindToAliasMode", 1],
    ["bindsetsEnabled", 1],
    ["translateGeneratedMessages", 1],
    ["syncFolderFallback", "false"],
    ["currentProfile", 42],
    ["currentProfile", "__proto__"],
    ["version", 1],
    ["firstRun", "false"],
  ])("rejects invalid field %s (%#)", (key, value) => {
    expect(
      prepareSettingsRepositoryValue({ ...settings(), [key]: value }),
    ).toEqual({ success: false, error: "invalid_data" });
  });

  it.each([null, undefined, [], "settings", 42, true])(
    "rejects non-record input %#",
    (value) => {
      expect(prepareSettingsRepositoryValue(value)).toEqual({
        success: false,
        error: "invalid_data",
      });
    },
  );

  it.each([
    undefined,
    () => true,
    Symbol("hidden"),
    1n,
    NaN,
    Infinity,
    new Date(),
    new Map(),
  ])("rejects non-JSON extension %#", (extension) => {
    expect(
      prepareSettingsRepositoryValue({ ...settings(), extension }),
    ).toEqual({ success: false, error: "invalid_data" });
  });

  it.each(["__proto__", "constructor", "prototype"])(
    "rejects unsafe extension keys %s recursively",
    (key) => {
      const extension = JSON.parse(
        `{"nested":[{${JSON.stringify(key)}:true}]}`,
      );
      expect(
        prepareSettingsRepositoryValue({ ...settings(), extension }),
      ).toEqual({ success: false, error: "invalid_data" });
    },
  );

  it("rejects accessors without calling getters, including nested getters", () => {
    const getter = vi.fn(() => "light");
    const input = settings();
    Object.defineProperty(input, "theme", { get: getter, enumerable: true });
    expect(prepareSettingsRepositoryValue(input).success).toBe(false);
    const extension = Object.defineProperty({}, "secret", {
      get: getter,
      enumerable: true,
    });
    expect(
      prepareSettingsRepositoryValue({ ...settings(), extension }).success,
    ).toBe(false);
    expect(getter).not.toHaveBeenCalled();
  });

  it("rejects hidden or symbol fields rather than silently dropping them", () => {
    const hidden = settings();
    Object.defineProperty(hidden, "hidden", { value: 1 });
    expect(prepareSettingsRepositoryValue(hidden).success).toBe(false);
    expect(
      prepareSettingsRepositoryValue({ ...settings(), [Symbol("field")]: 1 })
        .success,
    ).toBe(false);
  });

  it("rejects cyclic and excessive-depth extensions", () => {
    const cyclic = {};
    cyclic.self = cyclic;
    expect(
      prepareSettingsRepositoryValue({ ...settings(), cyclic }).success,
    ).toBe(false);
    let extension = "leaf";
    for (let level = 0; level < MAX_PROJECT_JSON_DEPTH; level++)
      extension = { next: extension };
    expect(
      prepareSettingsRepositoryValue({ ...settings(), extension }).success,
    ).toBe(false);
  });

  it("rejects oversized UTF-8 data even below the character-count limit", () => {
    const input = {
      ...settings(),
      extension: "é".repeat(MAX_PROJECT_JSON_BYTES / 2),
    };
    expect(JSON.stringify(input).length).toBeLessThan(MAX_PROJECT_JSON_BYTES);
    expect(prepareSettingsRepositoryValue(input)).toEqual({
      success: false,
      error: "invalid_data",
    });
  });

  it.each([
    [null, "missing"],
    ["{", "invalid_json"],
    ["[]", "invalid_data"],
    ["null", "invalid_data"],
    ["42", "invalid_data"],
  ])(
    "recovers detached defaults for unreadable record %#",
    (content, reason) => {
      const defaults = settings();
      const result = decodeSettingsRepositoryJson(content, defaults);
      expect(result).toEqual({
        status: "repair_required",
        reason,
        value: defaults,
      });
      expect(result.value).not.toBe(defaults);
      expect(result.value["plugin:layout"]).not.toBe(defaults["plugin:layout"]);
    },
  );

  it("marks a partial valid record for repair and retains per-field recovery", () => {
    const defaults = settings();
    const raw =
      '{"theme":"dark","autoSave":"bad","firstRun":"bad","plugin:new":{"nested":[1]},"plugin:bad":{"constructor":true}}';
    expect(decodeSettingsRepositoryJson(raw, defaults)).toEqual({
      status: "repair_required",
      reason: "repaired",
      value: { ...defaults, theme: "dark", "plugin:new": { nested: [1] } },
    });
    expect(decodeSettingsRepositoryJson('{"theme":"dark"}', defaults)).toEqual({
      status: "repair_required",
      reason: "repaired",
      value: { ...defaults, theme: "dark" },
    });
  });

  it("recognizes complete current records without losing extensions", () => {
    const input = settings();
    expect(
      decodeSettingsRepositoryJson(JSON.stringify(input), settings()),
    ).toEqual({ status: "current", value: input });
  });
});
