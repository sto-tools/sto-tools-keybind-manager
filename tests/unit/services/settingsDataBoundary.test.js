import { describe, expect, it } from "vitest";

import {
  decodeStoredSettingsJson,
  decodeProjectSettings,
  isSettingsRecord,
  sanitizeStoredSettings,
  sanitizeStoredSettingsPatch,
} from "../../../src/js/components/services/settingsDataBoundary.js";
import {
  getInvalidDataPath,
  MAX_PROJECT_JSON_BYTES,
  MAX_PROJECT_JSON_DEPTH,
} from "../../../src/js/components/services/jsonDataBoundary.js";

const defaults = Object.freeze({
  theme: "default",
  autoSave: true,
  showTooltips: true,
  confirmDeletes: true,
  maxUndoSteps: 50,
  defaultMode: "space",
  compactView: false,
  language: "en",
  syncFolderName: null,
  syncFolderPath: null,
  autoSync: false,
  autoSyncInterval: "change",
  bindToAliasMode: false,
  bindsetsEnabled: false,
  translateGeneratedMessages: false,
});

/** @param {unknown} value @param {string} path */
function expectInvalidSettings(value, path) {
  /** @type {unknown} */
  let caught;
  try {
    decodeProjectSettings(value);
  } catch (error) {
    caught = error;
  }

  expect(caught).toBeInstanceOf(TypeError);
  expect(caught).toMatchObject({ message: "invalid_project_file" });
  expect(getInvalidDataPath(caught)).toBe(path);
}

/** @param {number} levels */
function nestedValue(levels) {
  /** @type {unknown} */
  let value = "leaf";
  for (let index = 0; index < levels; index += 1) {
    value = { next: value };
  }
  return value;
}

describe("settingsDataBoundary", () => {
  describe("forgiving stored-settings recovery", () => {
    it("keeps valid known values and extensions while defaulting invalid known values", () => {
      const extension = {
        density: "compact",
        panels: [{ id: "commands", visible: true }],
      };
      const stored = {
        theme: "light",
        autoSave: "yes",
        maxUndoSteps: null,
        syncFolderName: 42,
        syncFolderPath: "/keybinds",
        "plugin:layout": extension,
      };

      const recovered = sanitizeStoredSettings(stored, defaults);

      expect(recovered).toEqual({
        ...defaults,
        theme: "light",
        syncFolderPath: "/keybinds",
        "plugin:layout": extension,
      });
      expect(recovered).not.toBe(stored);
      expect(recovered).not.toBe(defaults);
      // Persisted extension values are state ingress, so shallow aliasing is no
      // longer an accepted requirement.
      expect(recovered["plugin:layout"]).not.toBe(extension);
      expect(recovered["plugin:layout"].panels).not.toBe(extension.panels);
      expect(recovered["plugin:layout"].panels[0]).not.toBe(
        extension.panels[0],
      );

      extension.panels[0].visible = false;
      expect(recovered["plugin:layout"].panels[0].visible).toBe(true);
    });

    it.each([null, undefined, [], "settings", 42, true])(
      "recovers complete detached defaults from non-record input %#",
      (stored) => {
        const recovered = sanitizeStoredSettings(stored, defaults);

        expect(recovered).toEqual(defaults);
        expect(recovered).not.toBe(defaults);
      },
    );

    it("defines toString and valueOf extension fields as safe own data", () => {
      const stored = Object.create(null);
      Object.defineProperty(stored, "toString", {
        value: "literal-to-string",
        enumerable: true,
      });
      Object.defineProperty(stored, "valueOf", {
        value: { mode: "literal-value" },
        enumerable: true,
      });

      const recovered = sanitizeStoredSettings(stored, defaults);

      expect(Object.hasOwn(recovered, "toString")).toBe(true);
      expect(Object.hasOwn(recovered, "valueOf")).toBe(true);
      expect(recovered.toString).toBe("literal-to-string");
      expect(recovered.valueOf).toEqual({ mode: "literal-value" });
      expect(recovered.valueOf).not.toBe(stored.valueOf);
    });

    it("retains PreferencesService bulk-validation semantics", () => {
      expect(
        isSettingsRecord({
          theme: "dark",
          autoSave: false,
          currentProfile: 123,
          "plugin:layout": { density: "compact" },
        }),
      ).toBe(true);
      expect(isSettingsRecord({ theme: 123 })).toBe(false);
      expect(isSettingsRecord([])).toBe(false);
    });
  });

  describe("forgiving persisted-settings patches", () => {
    it("preserves valid present fields, compatibility data, and detached extensions", () => {
      const stored = {
        theme: "light",
        syncFolderFallback: false,
        currentProfile: "captain",
        version: "2.1.1",
        firstRun: false,
        "plugin:layout": {
          panels: [{ id: "commands", visible: true }],
        },
      };

      const recovered = sanitizeStoredSettingsPatch(stored);

      expect(recovered).toEqual({ value: stored, repaired: false });
      expect(recovered.value).not.toBe(stored);
      expect(recovered.value["plugin:layout"]).not.toBe(
        stored["plugin:layout"],
      );
      expect(recovered.value["plugin:layout"].panels).not.toBe(
        stored["plugin:layout"].panels,
      );
    });

    it("omits invalid known, compatibility, and extension fields independently", () => {
      const recovered = sanitizeStoredSettingsPatch({
        theme: 42,
        autoSave: false,
        currentProfile: 123,
        firstRun: "false",
        "plugin:function": () => true,
        "plugin:date": new Date("2025-01-02T03:04:05.000Z"),
        "plugin:safe": { density: "compact" },
      });

      expect(recovered).toEqual({
        value: {
          autoSave: false,
          "plugin:safe": { density: "compact" },
        },
        repaired: true,
      });
    });

    it.each(["__proto__", "prototype", "constructor"])(
      "drops reserved key %s at the patch root",
      (key) => {
        const stored = JSON.parse(
          `{"theme":"light",${JSON.stringify(key)}:true}`,
        );

        expect(sanitizeStoredSettingsPatch(stored)).toEqual({
          value: { theme: "light" },
          repaired: true,
        });
      },
    );

    it.each(["__proto__", "prototype", "constructor"])(
      "drops an extension containing reserved key %s recursively",
      (key) => {
        const stored = JSON.parse(
          `{"autoSave":false,"plugin:unsafe":{"items":[{${JSON.stringify(
            key,
          )}:true}]},"plugin:safe":{"enabled":true}}`,
        );

        expect(sanitizeStoredSettingsPatch(stored)).toEqual({
          value: {
            autoSave: false,
            "plugin:safe": { enabled: true },
          },
          repaired: true,
        });
      },
    );

    it.each(["__proto__", "prototype", "constructor"])(
      "drops reserved current-profile identifier %s",
      (currentProfile) => {
        expect(
          sanitizeStoredSettingsPatch({ currentProfile, firstRun: false }),
        ).toEqual({ value: { firstRun: false }, repaired: true });
      },
    );

    it("retains the exact depth limit and drops an extension one level deeper", () => {
      const exact = sanitizeStoredSettingsPatch({
        "plugin:nested": nestedValue(MAX_PROJECT_JSON_DEPTH - 1),
      });
      const tooDeep = sanitizeStoredSettingsPatch({
        theme: "light",
        "plugin:nested": nestedValue(MAX_PROJECT_JSON_DEPTH),
      });

      expect(exact.repaired).toBe(false);
      expect(exact.value).toHaveProperty("plugin:nested");
      expect(tooDeep).toEqual({
        value: { theme: "light" },
        repaired: true,
      });
    });

    it.each([null, undefined, [], "settings", 42, true])(
      "returns a repaired empty patch for non-record input %#",
      (stored) => {
        expect(sanitizeStoredSettingsPatch(stored)).toEqual({
          value: {},
          repaired: true,
        });
      },
    );
  });

  describe("raw persisted-settings JSON decoding", () => {
    it("returns a full default-backed snapshot without inventing repair for a partial record", () => {
      const decoded = decodeStoredSettingsJson(
        JSON.stringify({
          theme: "light",
          currentProfile: "captain",
          "plugin:layout": { density: "compact" },
        }),
        defaults,
      );

      expect(decoded).toEqual({
        value: {
          ...defaults,
          theme: "light",
          currentProfile: "captain",
          "plugin:layout": { density: "compact" },
        },
        repaired: false,
      });
    });

    it("recovers invalid fields from defaults and reports lazy repair without a parse error", () => {
      const raw = JSON.stringify({
        theme: 42,
        autoSave: false,
        currentProfile: 123,
        "plugin:safe": ["one", "two"],
      });

      const decoded = decodeStoredSettingsJson(raw, defaults);

      expect(decoded).toEqual({
        value: {
          ...defaults,
          autoSave: false,
          "plugin:safe": ["one", "two"],
        },
        repaired: true,
      });
      expect(decoded).not.toHaveProperty("error");
    });

    it("distinguishes invalid JSON from parsed non-record data", () => {
      expect(decodeStoredSettingsJson('{"theme":', defaults)).toEqual({
        value: defaults,
        repaired: true,
        error: "invalid_json",
      });
      expect(decodeStoredSettingsJson("[]", defaults)).toEqual({
        value: defaults,
        repaired: true,
        error: "invalid_data",
      });
    });

    it.each([null, undefined, {}, [], 42, true])(
      "rejects non-string raw input %# with detached defaults",
      (raw) => {
        const decoded = decodeStoredSettingsJson(raw, defaults);

        expect(decoded).toEqual({
          value: defaults,
          repaired: true,
          error: "invalid_data",
        });
        expect(decoded.value).not.toBe(defaults);
      },
    );

    it("accepts the exact UTF-8 byte limit and rejects the next byte", () => {
      const prefix = '{"plugin:value":"';
      const suffix = '"}';
      const exact = `${prefix}${"a".repeat(
        MAX_PROJECT_JSON_BYTES - prefix.length - suffix.length,
      )}${suffix}`;
      const oversized = `${exact} `;

      expect(new TextEncoder().encode(exact)).toHaveLength(
        MAX_PROJECT_JSON_BYTES,
      );
      expect(decodeStoredSettingsJson(exact, defaults)).toMatchObject({
        repaired: false,
      });
      expect(decodeStoredSettingsJson(oversized, defaults)).toEqual({
        value: defaults,
        repaired: true,
        error: "invalid_data",
      });
    });

    it("enforces the byte limit for multibyte JSON below the string-length limit", () => {
      const prefix = '{"plugin:value":"';
      const suffix = '"}';
      const overheadBytes = new TextEncoder().encode(
        `${prefix}${suffix}`,
      ).length;
      const exactMultibyteCount = Math.floor(
        (MAX_PROJECT_JSON_BYTES - overheadBytes) / 2,
      );
      const remainingByte =
        MAX_PROJECT_JSON_BYTES - overheadBytes - exactMultibyteCount * 2;
      const exact = `${prefix}${"é".repeat(exactMultibyteCount)}${"a".repeat(
        remainingByte,
      )}${suffix}`;
      const oversized = `${exact} `;

      expect(exact.length).toBeLessThan(MAX_PROJECT_JSON_BYTES);
      expect(new TextEncoder().encode(exact)).toHaveLength(
        MAX_PROJECT_JSON_BYTES,
      );
      expect(decodeStoredSettingsJson(exact, defaults)).toMatchObject({
        repaired: false,
      });
      expect(oversized.length).toBeLessThan(MAX_PROJECT_JSON_BYTES);
      expect(new TextEncoder().encode(oversized)).toHaveLength(
        MAX_PROJECT_JSON_BYTES + 1,
      );
      expect(decodeStoredSettingsJson(oversized, defaults)).toEqual({
        value: defaults,
        repaired: true,
        error: "invalid_data",
      });
    });
  });

  describe("strict project settings decoding", () => {
    it("accepts every known field and supported compatibility field", () => {
      const settings = {
        theme: "light",
        autoSave: false,
        showTooltips: false,
        confirmDeletes: false,
        maxUndoSteps: 75,
        defaultMode: "ground",
        compactView: true,
        language: "de",
        syncFolderName: "STO Sync",
        syncFolderPath: null,
        autoSync: true,
        autoSyncInterval: "30",
        bindToAliasMode: true,
        bindsetsEnabled: true,
        translateGeneratedMessages: true,
        syncFolderFallback: false,
        currentProfile: null,
        version: "1.0.0",
        firstRun: false,
      };

      expect(decodeProjectSettings(settings)).toEqual(settings);
    });

    it.each([
      ["theme", 1],
      ["autoSave", "true"],
      ["showTooltips", "true"],
      ["confirmDeletes", "true"],
      ["maxUndoSteps", "50"],
      ["defaultMode", false],
      ["compactView", "false"],
      ["language", null],
      ["syncFolderName", 1],
      ["syncFolderPath", false],
      ["autoSync", "false"],
      ["autoSyncInterval", 30],
      ["bindToAliasMode", 1],
      ["bindsetsEnabled", null],
      ["translateGeneratedMessages", "true"],
    ])("rejects invalid known field %s", (key, value) => {
      expectInvalidSettings({ [key]: value }, `data.settings.${key}`);
    });

    it.each([
      ["syncFolderFallback", "false"],
      ["currentProfile", 42],
      ["version", 1],
      ["firstRun", "false"],
    ])("rejects invalid compatibility field %s", (key, value) => {
      expectInvalidSettings({ [key]: value }, `data.settings.${key}`);
    });

    it("preserves and deeply detaches JSON extension data", () => {
      const input = {
        "plugin:layout": {
          density: "compact",
          panels: [{ id: "commands", visible: true }],
        },
      };

      const decoded = decodeProjectSettings(input);

      expect(decoded).toEqual(input);
      expect(decoded).not.toBe(input);
      expect(decoded["plugin:layout"]).not.toBe(input["plugin:layout"]);
      expect(decoded["plugin:layout"].panels).not.toBe(
        input["plugin:layout"].panels,
      );
      expect(decoded["plugin:layout"].panels[0]).not.toBe(
        input["plugin:layout"].panels[0],
      );

      input["plugin:layout"].panels[0].visible = false;
      expect(decoded["plugin:layout"].panels[0].visible).toBe(true);
      decoded["plugin:layout"].density = "spacious";
      expect(input["plugin:layout"].density).toBe("compact");
    });

    it("treats toString and valueOf as ordinary detached extension fields", () => {
      const input = JSON.parse(
        '{"toString":"literal","valueOf":{"nested":[1,2,3]}}',
      );

      const decoded = decodeProjectSettings(input);

      expect(Object.hasOwn(decoded, "toString")).toBe(true);
      expect(Object.hasOwn(decoded, "valueOf")).toBe(true);
      expect(decoded.toString).toBe("literal");
      expect(decoded.valueOf).toEqual({ nested: [1, 2, 3] });
      expect(decoded.valueOf).not.toBe(input.valueOf);
    });

    it.each(["__proto__", "prototype", "constructor"])(
      "rejects reserved key %s at the settings root",
      (key) => {
        const input = JSON.parse(`{${JSON.stringify(key)}:true}`);
        expectInvalidSettings(input, `data.settings.${key}`);
      },
    );

    it.each(["__proto__", "prototype", "constructor"])(
      "rejects reserved key %s recursively inside extensions",
      (key) => {
        const input = JSON.parse(
          `{"plugin":{"safe":[{${JSON.stringify(key)}:true}]}}`,
        );
        expectInvalidSettings(input, `data.settings.plugin.safe[0].${key}`);
      },
    );

    it.each(["__proto__", "prototype", "constructor"])(
      "rejects reserved current-profile identifier %s",
      (key) => {
        expectInvalidSettings(
          { currentProfile: key },
          "data.settings.currentProfile",
        );
      },
    );

    it.each([
      ["undefined", () => undefined],
      ["function", () => () => true],
      ["symbol", () => Symbol("setting")],
      ["bigint", () => 1n],
      ["NaN", () => Number.NaN],
      ["positive infinity", () => Number.POSITIVE_INFINITY],
      ["negative infinity", () => Number.NEGATIVE_INFINITY],
    ])("rejects non-JSON extension value %s", (_label, createValue) => {
      expectInvalidSettings(
        { "plugin:value": createValue() },
        "data.settings.plugin:value",
      );
    });

    it.each([null, undefined, [], "settings", 42, true])(
      "rejects non-record settings input %#",
      (settings) => {
        expectInvalidSettings(settings, "data.settings");
      },
    );

    it("rejects cyclic extension data as an invalid project file", () => {
      const cyclic = {};
      cyclic.self = cyclic;

      expect(() =>
        decodeProjectSettings({ "plugin:cyclic": cyclic }),
      ).toThrowError("invalid_project_file");
    });

    it("accepts practical nesting and rejects data beyond the depth limit", () => {
      expect(() =>
        decodeProjectSettings({ "plugin:nested": nestedValue(10) }),
      ).not.toThrow();

      /** @type {unknown} */
      let caught;
      try {
        decodeProjectSettings({
          "plugin:nested": nestedValue(MAX_PROJECT_JSON_DEPTH + 1),
        });
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(TypeError);
      expect(caught).toMatchObject({ message: "invalid_project_file" });
      expect(getInvalidDataPath(caught)).toMatch(
        /^data\.settings\.plugin:nested(?:\.next)+$/,
      );
    });

    it.each([
      ["Date", () => new Date("2025-01-02T03:04:05.000Z")],
      ["Map", () => new Map([["key", "value"]])],
    ])("rejects non-JSON object type %s", (_label, createValue) => {
      expectInvalidSettings(
        { "plugin:value": createValue() },
        "data.settings.plugin:value",
      );
    });
  });
});
