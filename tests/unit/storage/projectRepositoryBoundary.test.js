import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import {
  createProjectRepositoryDefaults,
  decodeProjectRepositoryJson,
  prepareProjectMigrationCommit,
  prepareProjectRepositoryCommit,
} from "../../../src/js/components/storage/projectRepositoryBoundary.js";
import { decodeLegacyStoredApplicationJson } from "../../../src/js/components/services/storedApplicationDataBoundary.js";
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
// Historical fixtures are immutable migration/artifact evidence. Canonical
// repository tests remove only their retired embedded settings field locally.
const canonicalFixture = (name) => {
  const root = JSON.parse(fixture(name));
  delete root.settings;
  return root;
};
const legacyDecode = (raw) =>
  decodeLegacyStoredApplicationJson(raw, { version, defaults: defaults() });
const prepareMigration = (root) =>
  prepareProjectMigrationCommit(root, { version, defaults: defaults() });

describe("project repository boundary", () => {
  // The old injected embedded-settings defaults requirement is retired.
  // Complete standalone defaults are covered by SettingsRepository; this
  // boundary now creates only the independently detached project root.
  it("creates independent settings-free empty-root defaults", () => {
    const root = createProjectRepositoryDefaults({
      version,
      timestamp,
    });
    expect(root).toEqual({
      version,
      created: timestamp,
      lastModified: timestamp,
      profiles: {},
      currentProfile: null,
      globalAliases: {},
    });
    root.profiles.captain = { name: "changed" };
    expect(defaults().profiles).toEqual({});
    expect(root).not.toHaveProperty("settings");
  });

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
        resetSentinel: {
          status: "pending_consumption",
          expectedValue: "true",
        },
      });
    },
  );

  it("returns a detached current root without changing its stored representation", () => {
    const raw = JSON.stringify(canonicalFixture("complete-current-root.json"));
    const result = decode(raw);
    expect(result).toEqual({ status: "current", value: JSON.parse(raw) });
    result.value.extension = { added: true };
    expect(decode(raw).value).toEqual(JSON.parse(raw));
  });

  it("requires verified sentinel recovery even when the stored root is current", () => {
    const raw = JSON.stringify(canonicalFixture("complete-current-root.json"));
    expect(decode(raw, "true")).toEqual({
      status: "repair_required",
      value: JSON.parse(raw),
      reason: "reset_pending",
      resetSentinel: {
        status: "pending_consumption",
        expectedValue: "true",
      },
    });
  });

  it.each(["space", "ground"])(
    "retains legacy %s golden migration and commit metadata",
    (mode) => {
      const raw = fixture(`legacy-${mode}-root.json`);
      const loaded = legacyDecode(raw);
      expect(loaded).toMatchObject({
        success: true,
        changed: true,
        migrated: true,
      });
      const prepared = prepare(loaded.value);
      expect(prepared.success).toBe(true);
      expect(prepared.value).toEqual(
        canonicalFixture(`legacy-${mode}-expected-root.json`),
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
      expect(prepare(legacyDecode(raw).value).success).toBe(true);
    },
  );

  it.each([null, "missing-profile"])(
    "rejects selection %j rather than selecting another nonempty profile",
    (currentProfile) => {
      const input = canonicalFixture("complete-current-root.json");
      input.currentProfile = currentProfile;
      expect(prepare(input)).toEqual({ success: false, error: "invalid_data" });
      expect(prepare(decode(JSON.stringify(input)).value).success).toBe(true);
    },
  );

  it.each(["version", "lastModified", "globalAliases"])(
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

  it.each([null, false, 0, "ignored", [], {}, { theme: "dark" }])(
    "rejects own embedded settings %j on ordinary reads and both commit paths",
    (settings) => {
      const root = { ...defaults(), settings };
      expect(prepare(root)).toEqual({ success: false, error: "invalid_data" });
      expect(prepareMigration(root)).toEqual({
        success: false,
        error: "invalid_data",
      });
      expect(decode(JSON.stringify(root))).toMatchObject({
        status: "repair_required",
        reason: "invalid_data",
        value: defaults(),
      });
    },
  );

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

  it("stamps metadata once and retains hybrid profiles and root extensions", () => {
    const input = canonicalFixture("complete-current-root.json");
    input.extension = { panels: ["commands"] };
    const untouched = structuredClone(input);
    const result = prepare(input);
    expect(result.value).toEqual({
      ...input,
      version,
      lastModified: timestamp,
      lastBackup: timestamp,
    });
    expect(input).toEqual(untouched);
    result.value.extension.panels[0] = "changed";
    expect(input.extension.panels).toEqual(["commands"]);
    expect(JSON.parse(result.json).extension.panels).toEqual(["commands"]);
    expect(result.value).not.toHaveProperty("settings");
  });

  it("prepares migration without rewriting version, timestamps, or extensions", () => {
    const input = canonicalFixture("complete-current-root.json");
    input.extension = { migration: ["preserved"] };
    const result = prepareMigration(input);
    expect(result).toEqual({
      success: true,
      json: JSON.stringify(input),
      value: input,
    });
    expect(result.value).not.toBe(input);
    result.value.extension.migration[0] = "changed";
    expect(input.extension.migration).toEqual(["preserved"]);
  });

  it("does not create optional timestamp fields during migration", () => {
    const input = defaults();
    delete input.created;
    const result = prepareMigration(input);
    expect(result).toEqual({
      success: true,
      json: JSON.stringify(input),
      value: input,
    });
    expect(result.value).not.toHaveProperty("created");
    expect(result.value).not.toHaveProperty("lastBackup");
  });

  it.each(["version", "lastModified", "globalAliases"])(
    "rejects migration requiring %s repair rather than changing its draft",
    (field) => {
      const input = defaults();
      delete input[field];
      expect(prepareMigration(input)).toEqual({
        success: false,
        error: "invalid_data",
      });
    },
  );

  it("requires migration planners to normalize version explicitly", () => {
    const input = { ...defaults(), version: "old-version" };
    expect(prepareMigration(input)).toEqual({
      success: false,
      error: "invalid_data",
    });
    expect(input.version).toBe("old-version");
    input.version = version;
    expect(prepareMigration(input).success).toBe(true);
  });

  it("rejects accessors without invoking them", () => {
    const getter = vi.fn(() => "surprise");
    const root = defaults();
    Object.defineProperty(root, "extension", { enumerable: true, get: getter });
    expect(prepare(root).success).toBe(false);
    expect(prepareMigration(root).success).toBe(false);
    expect(getter).not.toHaveBeenCalled();
  });

  it("rejects embedded-settings accessors without consulting their value", () => {
    const getter = vi.fn(() => {
      throw new Error("must not read settings");
    });
    const root = defaults();
    Object.defineProperty(root, "settings", { enumerable: true, get: getter });
    expect(prepare(root)).toEqual({ success: false, error: "invalid_data" });
    expect(prepareMigration(root)).toEqual({
      success: false,
      error: "invalid_data",
    });
    expect(getter).not.toHaveBeenCalled();
  });

  it.each([undefined, NaN, Infinity, new Date(), 3n, () => {}])(
    "rejects non-JSON extension %s",
    (extension) => {
      expect(prepare({ ...defaults(), extension }).success).toBe(false);
      expect(prepareMigration({ ...defaults(), extension }).success).toBe(
        false,
      );
    },
  );

  it("rejects cycles, unsafe keys, and over-depth extensions", () => {
    const cyclic = defaults();
    cyclic.extension = cyclic;
    expect(prepare(cyclic).success).toBe(false);
    expect(prepareMigration(cyclic).success).toBe(false);
    const unsafe = defaults();
    unsafe.extension = JSON.parse('{"__proto__":{"polluted":true}}');
    expect(prepare(unsafe).success).toBe(false);
    expect(prepareMigration(unsafe).success).toBe(false);
    let nested = {};
    for (let depth = 0; depth < MAX_PROJECT_JSON_DEPTH + 1; depth++) {
      nested = { nested };
    }
    expect(prepare({ ...defaults(), nested }).success).toBe(false);
    expect(prepareMigration({ ...defaults(), nested }).success).toBe(false);
  });

  it("enforces the serialized root byte cap for both reads and writes", () => {
    const oversized = "é".repeat(MAX_PROJECT_JSON_BYTES / 2);
    const root = { ...defaults(), oversized };
    expect(prepare(root).success).toBe(false);
    expect(prepareMigration(root).success).toBe(false);
    expect(decode(JSON.stringify(root)).reason).toBe("invalid_data");
  });
});
