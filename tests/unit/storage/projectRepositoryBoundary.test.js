import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import {
  createProjectRepositoryDefaults,
  decodeProjectRepositoryJson,
  detachProjectSettingsDefaults,
  prepareProjectRepositoryCommit,
} from "../../../src/js/components/storage/projectRepositoryBoundary.js";
import { createDefaultPreferencesSettings } from "../../../src/js/components/services/preferencesDefaults.js";
import {
  MAX_PROJECT_JSON_BYTES,
  MAX_PROJECT_JSON_DEPTH,
} from "../../../src/js/components/services/jsonDataBoundary.js";

const version = "2.0.0";
const timestamp = "2026-07-15T12:00:00.000Z";
const fixtureDirectory = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../fixtures/storage",
);
const fixture = (name) =>
  readFileSync(join(fixtureDirectory, name), "utf8").trim();
const defaults = () =>
  createProjectRepositoryDefaults({
    version,
    timestamp,
    settingsDefaults: createDefaultPreferencesSettings(),
  });
const prepare = (root) =>
  prepareProjectRepositoryCommit(root, {
    version,
    timestamp,
    defaults: defaults(),
  });
const decode = (raw, resetSentinel = null) =>
  decodeProjectRepositoryJson(raw, {
    version,
    defaults: defaults(),
    resetSentinel,
  });

describe("project repository boundary", () => {
  it("keeps the complete legacy empty-root schema with detached defaults", () => {
    const settingsDefaults = {
      ...createDefaultPreferencesSettings(),
      extension: { enabled: true },
    };
    const root = createProjectRepositoryDefaults({
      version,
      timestamp,
      settingsDefaults,
    });
    expect(root).toEqual({
      version,
      created: timestamp,
      lastModified: timestamp,
      profiles: {},
      currentProfile: null,
      globalAliases: {},
      settings: settingsDefaults,
    });
    settingsDefaults.extension.enabled = false;
    expect(root.settings.extension.enabled).toBe(true);
  });

  it.each([{}, { theme: "dark" }, null])(
    "rejects incomplete injected defaults %j",
    (value) => {
      expect(() => detachProjectSettingsDefaults(value)).toThrow();
    },
  );

  it.each([null, "", "true", "false", "custom-reset-token"])(
    "uses exact truthiness and preserves sentinel %j while recovering a missing root",
    (sentinel) => {
      const result = decode(null, sentinel);
      expect(result.status).toBe("repair_required");
      expect(result.reason).toBe("missing");
      expect(result.resetSentinel).toEqual(
        sentinel
          ? { status: "pending_consumption", expectedValue: sentinel }
          : { status: "not_applicable" },
      );
    },
  );

  it.each([
    ["{broken", "invalid_json"],
    ["null", "invalid_data"],
    ["{}", "invalid_data"],
    ['{"profiles":{},"currentProfile":"__proto__"}', "invalid_data"],
  ])(
    "recovers invalid stored content without leaking decoder exceptions",
    (raw, reason) => {
      expect(decode(raw, "true")).toEqual({
        status: "repair_required",
        value: defaults(),
        reason,
        resetSentinel: { status: "not_applicable" },
      });
    },
  );

  it("returns a detached current root without changing its stored representation", () => {
    const raw = fixture("complete-current-root.json");
    const result = decode(raw, "true");
    expect(result).toEqual({ status: "current", value: JSON.parse(raw) });
    result.value.settings.extension = { added: true };
    expect(decode(raw).value).toEqual(JSON.parse(raw));
  });

  it.each(["space", "ground"])(
    "retains legacy %s golden migration and commit metadata",
    (mode) => {
      const raw = fixture(`legacy-${mode}-root.json`);
      const loaded = decode(raw);
      expect(loaded.status).toBe("repair_required");
      expect(loaded.reason).toBe("legacy");
      const prepared = prepare(loaded.value);
      expect(prepared.success).toBe(true);
      expect(prepared.value).toEqual(
        JSON.parse(fixture(`legacy-${mode}-expected-root.json`)),
      );
      expect(JSON.parse(prepared.json)).toEqual(prepared.value);
    },
  );

  it("distinguishes non-legacy repair from structural migration", () => {
    const root = defaults();
    root.version = "old-version";
    expect(decode(JSON.stringify(root)).reason).toBe("repaired");
  });

  it.each(["space", "ground"])(
    "rejects direct legacy %s replacement until load has repaired it",
    (mode) => {
      const raw = fixture(`legacy-${mode}-root.json`);
      expect(prepare(JSON.parse(raw))).toEqual({
        success: false,
        error: "invalid_data",
      });
      expect(prepare(decode(raw).value).success).toBe(true);
    },
  );

  it.each([null, "missing-profile"])(
    "rejects selection %j rather than selecting another nonempty profile",
    (currentProfile) => {
      const input = JSON.parse(fixture("complete-current-root.json"));
      input.currentProfile = currentProfile;
      expect(prepare(input)).toEqual({ success: false, error: "invalid_data" });
      expect(prepare(decode(JSON.stringify(input)).value).success).toBe(true);
    },
  );

  it.each(["version", "lastModified", "settings", "globalAliases"])(
    "rejects missing %s instead of silently recovering it during commit",
    (field) => {
      const input = defaults();
      delete input[field];
      expect(prepare(input)).toEqual({ success: false, error: "invalid_data" });
      expect(prepare(decode(JSON.stringify(input)).value).success).toBe(true);
    },
  );

  it("allows an old valid version to be stamped without other repairs", () => {
    const input = defaults();
    input.version = "1.0.0";
    const result = prepare(input);
    expect(result.success).toBe(true);
    expect(result.value.version).toBe(version);
    expect(input.version).toBe("1.0.0");
  });

  it("rejects invalid embedded settings on writes but recovers them on reads", () => {
    const root = defaults();
    root.settings = { theme: 42, validExtension: { items: [1, 2] } };
    expect(prepare(root)).toEqual({ success: false, error: "invalid_data" });
    expect(decode(JSON.stringify(root)).value.settings).toEqual({
      validExtension: { items: [1, 2] },
    });
  });

  it.each([
    ["version", 3],
    ["lastModified", null],
    ["lastBackup", false],
    ["currentProfile", []],
    ["settings", null],
    ["profiles", []],
  ])("rejects invalid %s before metadata can mask it", (field, value) => {
    expect(prepare({ ...defaults(), [field]: value }).success).toBe(false);
  });

  it("stamps metadata once and retains hybrid profiles, settings, and extensions", () => {
    const input = JSON.parse(fixture("complete-current-root.json"));
    const untouched = structuredClone(input);
    const result = prepare(input);
    expect(result.value).toEqual({
      ...input,
      version,
      lastModified: timestamp,
      lastBackup: timestamp,
    });
    expect(input).toEqual(untouched);
    result.value.settings.theme = "changed";
    expect(input.settings.theme).toBe(untouched.settings.theme);
    expect(JSON.parse(result.json).settings.theme).toBe(
      untouched.settings.theme,
    );
  });

  it("rejects accessors without invoking them", () => {
    const getter = vi.fn(() => "surprise");
    const root = defaults();
    Object.defineProperty(root, "extension", { enumerable: true, get: getter });
    expect(prepare(root).success).toBe(false);
    expect(getter).not.toHaveBeenCalled();
  });

  it.each([undefined, NaN, Infinity, new Date(), 3n, () => {}])(
    "rejects non-JSON extension %s",
    (extension) => {
      expect(prepare({ ...defaults(), extension }).success).toBe(false);
    },
  );

  it("rejects cycles, unsafe keys, and over-depth extensions", () => {
    const cyclic = defaults();
    cyclic.extension = cyclic;
    expect(prepare(cyclic).success).toBe(false);
    const unsafe = defaults();
    unsafe.extension = JSON.parse('{"__proto__":{"polluted":true}}');
    expect(prepare(unsafe).success).toBe(false);
    let nested = {};
    for (let depth = 0; depth < MAX_PROJECT_JSON_DEPTH + 1; depth++) {
      nested = { nested };
    }
    expect(prepare({ ...defaults(), nested }).success).toBe(false);
  });

  it("enforces the serialized root byte cap for both reads and writes", () => {
    const oversized = "é".repeat(MAX_PROJECT_JSON_BYTES / 2);
    const root = { ...defaults(), oversized };
    expect(prepare(root).success).toBe(false);
    expect(decode(JSON.stringify(root)).reason).toBe("invalid_data");
  });
});
