import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import LocalStorageSettingsRepository from "../../../src/js/components/storage/LocalStorageSettingsRepository.js";
import LocalStorageProjectRepository from "../../../src/js/components/storage/LocalStorageProjectRepository.js";
import { preflightStorageSchemaMigration } from "../../../src/js/components/storage/storageSchemaMigration.js";
import { materializeStorageSchemaMigrationReceipt } from "../../../src/js/components/storage/storageSchemaMigrationReceipt.js";
import { createDefaultPreferencesSettings } from "../../../src/js/components/services/preferencesDefaults.js";
import { MAX_PROJECT_JSON_BYTES } from "../../../src/js/components/services/jsonDataBoundary.js";

const SETTINGS = "sto_keybind_settings";
const ROOT = "sto_keybind_manager";
const BACKUP = "sto_keybind_manager_backup";
const root = {
  version: "2.0.0",
  lastModified: "2026-07-15T12:00:00.000Z",
  currentProfile: null,
  profiles: {},
  globalAliases: {},
  storageSchemaVersion: { extension: "never reserved" },
};
const absent = { status: "absent", settingsVerified: true };
const pending = {
  status: "pending",
  settingsVerified: true,
  stage: "legacy_root_backup",
};
const failed = (stage, error, settingsVerified = false) => ({
  status: "failed",
  settingsVerified,
  stage,
  error,
});

function setup(raw = JSON.stringify(root)) {
  const durable = new Map([[BACKUP, "exact old backup"]]);
  if (raw !== null) durable.set(ROOT, raw);
  const storage = {
    getItem: vi.fn((key) => durable.get(key) ?? null),
    setItem: vi.fn((key, value) => {
      durable.set(key, value);
    }),
    removeItem: vi.fn((key) => {
      durable.delete(key);
    }),
  };
  const defaults = createDefaultPreferencesSettings();
  const settingsRepository = new LocalStorageSettingsRepository({
    storage,
    defaults,
  });
  const projectRepository = new LocalStorageProjectRepository({
    storage,
    settingsDefaults: defaults,
    version: "2.0.0",
    now: () => root.lastModified,
  });
  const settingsWriteResult = settingsRepository.replace({
    ...defaults,
    "plugin:layout": { panels: ["retained"] },
  });
  const options = {
    settingsInspection: settingsRepository.createMigrationInspectionPort(),
    projectInspection: projectRepository.createMigrationInspectionPort(),
    settingsWriteResult,
  };
  storage.setItem.mockClear();
  storage.getItem.mockClear();
  const before = [...durable];
  const run = (overrides = {}) => {
    const result = preflightStorageSchemaMigration({
      ...options,
      ...overrides,
    });
    expect(result.mode).toBe("preflight");
    expect(result.schemaComplete).toBe(false);
    expect(result.receipt.status).not.toBe("complete");
    expect(materializeStorageSchemaMigrationReceipt(result.receipt)).toEqual(
      result.receipt,
    );
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.removeItem).not.toHaveBeenCalled();
    return result;
  };
  return { storage, durable, options, before, run };
}

describe("read-only storage schema migration preflight", () => {
  it.each([null, JSON.stringify(root), JSON.stringify(root, null, 2)])(
    "observes absence without claiming layout completion %#",
    (raw) => {
      const { run, before, durable } = setup(raw);
      expect(run().receipt).toEqual(absent);
      expect(run().receipt).toEqual(absent);
      expect([...durable]).toEqual(before);
    },
  );

  it.each([
    { language: "hostile embedded", theme: "different" },
    null,
    false,
    "not a record",
    [],
    JSON.parse('{"__proto__":{"polluted":true}}'),
  ])("reports only pending for legacy embedded value %#", (settings) => {
    const { run, before, durable, options } = setup(
      JSON.stringify({ ...root, settings }),
    );
    expect(run().receipt).toEqual(pending);
    expect(run().receipt).toEqual(pending);
    expect([...durable]).toEqual(before);
    expect(durable.get(SETTINGS)).toBe(
      JSON.stringify(options.settingsWriteResult.value),
    );
    expect({}.polluted).toBeUndefined();
  });

  it.each([
    "{invalid",
    "",
    "null",
    "[]",
    "{}",
    JSON.stringify({ ...root, profiles: [] }),
    JSON.stringify({ ...root, currentProfile: "__proto__" }),
    JSON.stringify({ ...root, version: undefined }),
    JSON.stringify({ ...root, globalAliases: undefined }),
    JSON.stringify({ ...root, lastModified: undefined }),
    '{"profiles":{},"currentProfile":null,"extension":{"constructor":true}}',
  ])(
    "preserves invalid or repair-required root for later exact backup %#",
    (raw) => {
      const { run, durable, before } = setup(raw);
      expect(run().receipt).toEqual(pending);
      expect([...durable]).toEqual(before);
    },
  );

  it.each([
    "complete-current-root.json",
    "legacy-space-root.json",
    "legacy-ground-root.json",
  ])("retains exact golden source and backup for %s", (name) => {
    const raw = readFileSync(`tests/fixtures/storage/${name}`, "utf8");
    const { run, before, durable } = setup(raw);
    expect(run().receipt).toEqual(pending);
    expect([...durable]).toEqual(before);
  });

  it("accepts a settings-free current golden without changing open extensions", () => {
    const value = JSON.parse(
      readFileSync("tests/fixtures/storage/complete-current-root.json", "utf8"),
    );
    delete value.settings;
    const { run, before, durable } = setup(JSON.stringify(value));
    expect(run().receipt).toEqual(absent);
    expect([...durable]).toEqual(before);
  });

  it.each([
    () => " ".repeat(MAX_PROJECT_JSON_BYTES + 1),
    () =>
      JSON.stringify({
        ...root,
        extension: "😀".repeat(MAX_PROJECT_JSON_BYTES / 3),
      }),
    () => '{"extension":'.repeat(102) + "null" + "}".repeat(102),
  ])("bounds oversized or deep root inspection %#", (makeRaw) => {
    const { run, before, durable } = setup(makeRaw());
    expect(run().receipt).toEqual(pending);
    expect([...durable]).toEqual(before);
  });

  it.each([undefined, null, {}, { status: "committed" }])(
    "does not promote current settings shape without captured verified receipt %#",
    (settingsWriteResult) => {
      const { run, storage } = setup();
      expect(run({ settingsWriteResult }).receipt).toEqual(
        failed("settings_verify", "verification_failed"),
      );
      expect(storage.getItem.mock.calls.some(([key]) => key === ROOT)).toBe(
        false,
      );
    },
  );

  it("rejects accessor receipt metadata without invoking it or inspecting storage", () => {
    const { run, options, storage } = setup();
    const getter = vi.fn(() => "committed");
    const receipt = { ...options.settingsWriteResult };
    Object.defineProperty(receipt, "status", { get: getter, enumerable: true });
    expect(run({ settingsWriteResult: receipt }).receipt).toEqual(
      failed("settings_verify", "verification_failed"),
    );
    expect(getter).not.toHaveBeenCalled();
    expect(storage.getItem).not.toHaveBeenCalled();
  });

  it.each([
    [
      "invalid_data",
      "rejected",
      { status: "not_attempted" },
      { status: "not_attempted" },
    ],
    [
      "serialization_failed",
      "rejected",
      { status: "not_attempted" },
      { status: "not_attempted" },
    ],
    [
      "storage_write_failed",
      "write_failed",
      {
        status: "indeterminate",
        error: "storage_write_failed",
        category: "quota",
      },
      { status: "not_attempted" },
    ],
    [
      "verification_failed",
      "verification_failed",
      { status: "acknowledged" },
      { status: "failed", error: "verification_failed", reason: "read_failed" },
    ],
  ])(
    "retains the original settings-stage failure %s",
    (error, status, write, verification) => {
      const { run, storage } = setup();
      expect(
        run({ settingsWriteResult: { status, error, write, verification } })
          .receipt,
      ).toEqual(
        failed(
          status === "verification_failed"
            ? "settings_verify"
            : "settings_write",
          error,
        ),
      );
      expect(storage.getItem).not.toHaveBeenCalled();
    },
  );

  it.each([
    null,
    "{malformed",
    JSON.stringify(createDefaultPreferencesSettings()),
  ])(
    "rejects stale evidence when current standalone bytes changed %#",
    (actual) => {
      const { run, durable } = setup();
      if (actual === null) durable.delete(SETTINGS);
      else durable.set(SETTINGS, actual);
      expect(run().receipt).toEqual(
        failed("settings_verify", "verification_failed"),
      );
    },
  );

  it.each([
    ["settingsInspection", "settings_read", false],
    ["projectInspection", "legacy_root_decode", true],
  ])(
    "contains %s throws and rejects malformed raw envelopes",
    (port, stage, verified) => {
      const { run, options } = setup();
      const inspectRaw = vi.fn(() => {
        throw new Error("private settings/profile");
      });
      expect(run({ [port]: { ...options[port], inspectRaw } }).receipt).toEqual(
        failed(stage, "storage_read_failed", verified),
      );
      for (const raw of [
        false,
        {},
        { status: "read" },
        { status: "read", raw: 1 },
        { status: "read", raw: null, extra: true },
      ]) {
        inspectRaw.mockReturnValue(raw);
        expect(
          run({ [port]: { ...options[port], inspectRaw } }).receipt,
        ).toEqual(failed(stage, "invalid_data", verified));
      }
      inspectRaw.mockReturnValue({
        status: "read_failed",
        error: "storage_read_failed",
        category: "security",
      });
      expect(run({ [port]: { ...options[port], inspectRaw } }).receipt).toEqual(
        failed(stage, "storage_read_failed", verified),
      );
    },
  );

  it.each([
    {},
    { status: "verified", extra: true },
    {
      status: "failed",
      error: "verification_failed",
      reason: "value_mismatch",
    },
  ])("rejects incomplete or failed fresh verification %#", (result) => {
    const { run, options } = setup();
    expect(
      run({
        settingsInspection: {
          ...options.settingsInspection,
          verify: () => result,
        },
      }).receipt,
    ).toEqual(failed("settings_verify", "verification_failed"));
  });

  it("contains a fresh verification throw and detects a change between reads", () => {
    const { run, options, durable } = setup();
    expect(
      run({
        settingsInspection: {
          ...options.settingsInspection,
          verify() {
            throw new Error("private contents");
          },
        },
      }).receipt,
    ).toEqual(failed("settings_verify", "verification_failed"));
    expect(
      run({
        settingsInspection: {
          ...options.settingsInspection,
          verify(expected) {
            durable.set(SETTINGS, "changed between reads");
            return options.settingsInspection.verify(expected);
          },
        },
      }).receipt,
    ).toEqual(failed("settings_verify", "verification_failed"));
  });
});
