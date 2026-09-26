import { readFileSync } from "node:fs";

import { afterEach, describe, expect, it, vi } from "vitest";

import PreferencesService from "../../src/js/components/services/PreferencesService.js";
import { createDefaultPreferencesSettings } from "../../src/js/components/services/preferencesDefaults.js";
import LocalStorageProjectRepository from "../../src/js/components/storage/LocalStorageProjectRepository.js";
import LocalStorageSettingsRepository from "../../src/js/components/storage/LocalStorageSettingsRepository.js";
import { preflightStorageSchemaMigration } from "../../src/js/components/storage/storageSchemaMigration.js";
import { createEventBusFixture } from "../fixtures/core/eventBus.js";

const SETTINGS = "sto_keybind_settings";
const ROOT = "sto_keybind_manager";
const BACKUP = "sto_keybind_manager_backup";
const defaults = createDefaultPreferencesSettings("fr");
const golden = JSON.parse(
  readFileSync(
    "tests/fixtures/storage/two-location-settings-golden.json",
    "utf8",
  ),
);
const legacyRaw = JSON.stringify(golden.root, null, 2);
const settingsFreeRoot = { ...golden.root };
delete settingsFreeRoot.settings;
const settingsFreeRaw = JSON.stringify(settingsFreeRoot);
const backupRaw = '{ "data": "untouched historical backup" }';
const partialRaw = '{"autoSave":false,"plugin:layout":{"panels":["one"]}}';
const repaired = {
  ...defaults,
  autoSave: false,
  "plugin:layout": { panels: ["one"] },
};

describe("read-only settings migration preflight with real owners", () => {
  const cleanups = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0).reverse()) cleanup();
    vi.restoreAllMocks();
  });

  function setup(settingsRaw = null, rootRaw = legacyRaw) {
    const durable = new Map([[BACKUP, backupRaw]]);
    if (rootRaw !== null) durable.set(ROOT, rootRaw);
    if (settingsRaw !== null) durable.set(SETTINGS, settingsRaw);
    const storage = {
      getItem: vi.fn((key) => durable.get(key) ?? null),
      setItem: vi.fn((key, value) => durable.set(key, value)),
      removeItem: vi.fn((key) => durable.delete(key)),
    };
    const projectRepository = new LocalStorageProjectRepository({
      storage,
      version: "1.0.0",
      now: () => "2026-09-26T00:00:00.000Z",
      settingsDefaults: defaults,
    });
    function newOwner() {
      const bus = createEventBusFixture();
      const repository = new LocalStorageSettingsRepository({
        storage,
        defaults,
      });
      const replace = vi.spyOn(repository, "replace");
      const effects = vi.fn();
      const owner = new PreferencesService({
        settingsRepository: repository,
        defaults,
        eventBus: bus.eventBus,
        localizeCommands: effects,
        applyTranslations: effects,
      });
      cleanups.push(() => {
        owner.destroy();
        bus.destroy();
      });
      return { owner, repository, replace, bus, effects };
    }
    function preflight(candidate) {
      const writes = storage.setItem.mock.calls.length;
      const removes = storage.removeItem.mock.calls.length;
      const state = candidate.owner.getCurrentState();
      const events = candidate.bus.getEventsOfType(
        "preferences:state-changed",
      ).length;
      const result = preflightStorageSchemaMigration({
        settingsInspection:
          candidate.repository.createMigrationInspectionPort(),
        projectInspection: projectRepository.createMigrationInspectionPort(),
        settingsWriteResult: candidate.replace.mock.results.at(-1)?.value,
      });
      expect(storage.setItem).toHaveBeenCalledTimes(writes);
      expect(storage.removeItem).toHaveBeenCalledTimes(removes);
      expect(candidate.owner.getCurrentState()).toEqual(state);
      expect(
        candidate.bus.getEventsOfType("preferences:state-changed"),
      ).toHaveLength(events);
      expect(durable.get(ROOT) ?? null).toBe(rootRaw);
      expect(durable.get(BACKUP)).toBe(backupRaw);
      return result;
    }
    return { durable, storage, newOwner, preflight };
  }

  it.each([
    [
      "valid standalone / legacy root",
      () => JSON.stringify(golden.standalone),
      legacyRaw,
      golden.standalone,
      "pending",
    ],
    [
      "valid standalone / settings-free root",
      () => JSON.stringify(golden.standalone),
      settingsFreeRaw,
      golden.standalone,
      "absent",
    ],
    [
      "valid standalone / missing root",
      () => JSON.stringify(golden.standalone),
      null,
      golden.standalone,
      "absent",
    ],
    [
      "valid standalone / invalid raw root",
      () => JSON.stringify(golden.standalone),
      "{invalid-root",
      golden.standalone,
      "pending",
    ],
    [
      "missing standalone / hostile embedded record",
      () => null,
      legacyRaw,
      defaults,
      "pending",
    ],
    [
      "missing standalone / settings-free root",
      () => null,
      settingsFreeRaw,
      defaults,
      "absent",
    ],
    ["empty standalone", () => "", legacyRaw, defaults, "pending"],
    ["malformed standalone", () => "{invalid", legacyRaw, defaults, "pending"],
    ["non-record standalone", () => "[]", legacyRaw, defaults, "pending"],
    [
      "oversized standalone",
      () => JSON.stringify({ extension: "x".repeat(16 * 1024 * 1024) }),
      legacyRaw,
      defaults,
      "pending",
    ],
    ["partial standalone", () => partialRaw, legacyRaw, repaired, "pending"],
    [
      "unsafe standalone fields",
      () =>
        '{"theme":42,"autoSave":false,"plugin:layout":{"panels":["one"]},"plugin:unsafe":{"prototype":true}}',
      legacyRaw,
      repaired,
      "pending",
    ],
    [
      "invalid embedded value",
      () => JSON.stringify(golden.standalone),
      JSON.stringify({ ...golden.root, settings: true }),
      golden.standalone,
      "pending",
    ],
  ])(
    "preserves standalone authority and exact root bytes: %s",
    async (_name, makeRaw, rootRaw, expected, status) => {
      const originalRaw = makeRaw();
      const fixture = setup(originalRaw, rootRaw);
      const first = fixture.newOwner();
      first.owner.init();
      await first.owner.initialStateReady;
      expect(first.owner.getSettings()).toEqual(expected);
      expect(first.replace).toHaveBeenCalledOnce();
      expect(fixture.durable.get(SETTINGS)).toBe(JSON.stringify(expected));
      expect(fixture.storage.setItem.mock.calls).toEqual([
        [SETTINGS, JSON.stringify(expected)],
      ]);
      expect(
        fixture.storage.getItem.mock.calls.every(([key]) => key === SETTINGS),
      ).toBe(true);
      const receipt =
        status === "pending"
          ? { status, settingsVerified: true, stage: "legacy_root_backup" }
          : { status, settingsVerified: true };
      const result = { mode: "preflight", schemaComplete: false, receipt };
      expect(fixture.preflight(first)).toEqual(result);
      expect(fixture.preflight(first)).toEqual(result);
      first.owner.destroy();
      const successor = fixture.newOwner();
      successor.owner.init();
      await successor.owner.initialStateReady;
      expect(successor.owner.getSettings()).toEqual(expected);
      expect(fixture.durable.get(SETTINGS)).toBe(JSON.stringify(expected));
      expect(fixture.preflight(successor)).toEqual(result);
    },
  );

  it.each([
    ["initial read", "settings_read", "storage_read_failed", false],
    ["write before mutation", "settings_write", "storage_write_failed", false],
    ["write after mutation", "settings_write", "storage_write_failed", true],
    ["readback throw", "settings_verify", "verification_failed", true],
    ["readback mismatch", "settings_verify", "verification_failed", true],
  ])(
    "restarts from physical standalone bytes after %s",
    async (fault, stage, error, changed) => {
      const fixture = setup(partialRaw);
      let didWrite = false;
      fixture.storage.getItem.mockImplementation((key) => {
        if (key === SETTINGS) {
          if (
            fault === "initial read" ||
            (didWrite && fault === "readback throw")
          )
            throw new DOMException("private failure", "SecurityError");
          if (didWrite && fault === "readback mismatch") return "{}";
        }
        return fixture.durable.get(key) ?? null;
      });
      fixture.storage.setItem.mockImplementation((key, value) => {
        if (fault === "write before mutation")
          throw new Error("private failure");
        fixture.durable.set(key, value);
        didWrite = true;
        if (fault === "write after mutation")
          throw new Error("private failure");
      });
      const first = fixture.newOwner();
      first.owner.init();
      await expect(first.owner.initialStateReady).rejects.toThrow();
      expect(first.owner.getCurrentState()).toMatchObject({
        ready: false,
        blocked: true,
        durability: "unverified",
        revision: 0,
      });
      expect(first.effects).not.toHaveBeenCalled();
      expect(first.bus.getEventsOfType("preferences:loaded")).toHaveLength(0);
      expect(first.bus.getEventsOfType("preferences:saved")).toHaveLength(0);
      expect(
        first.bus.eventBus.hasListeners("rpc:preferences:set-setting"),
      ).toBe(false);
      expect(fixture.durable.get(SETTINGS)).toBe(
        changed ? JSON.stringify(repaired) : partialRaw,
      );
      expect(fixture.preflight(first)).toEqual({
        mode: "preflight",
        schemaComplete: false,
        receipt: { status: "failed", settingsVerified: false, stage, error },
      });

      first.owner.destroy();
      fixture.storage.getItem.mockImplementation(
        (key) => fixture.durable.get(key) ?? null,
      );
      fixture.storage.setItem.mockImplementation((key, value) =>
        fixture.durable.set(key, value),
      );
      const successor = fixture.newOwner();
      successor.owner.init();
      await successor.owner.initialStateReady;
      expect(successor.owner.getSettings()).toEqual(repaired);
      expect(fixture.durable.get(SETTINGS)).toBe(JSON.stringify(repaired));
      expect(fixture.preflight(successor)).toEqual({
        mode: "preflight",
        schemaComplete: false,
        receipt: {
          status: "pending",
          settingsVerified: true,
          stage: "legacy_root_backup",
        },
      });
      const stableRaw = fixture.durable.get(SETTINGS);
      expect(fixture.preflight(successor).schemaComplete).toBe(false);
      expect(fixture.durable.get(SETTINGS)).toBe(stableRaw);
    },
  );

  it("leaves the verified owner ready when root inspection fails", async () => {
    const fixture = setup(JSON.stringify(golden.standalone));
    const first = fixture.newOwner();
    first.owner.init();
    await first.owner.initialStateReady;
    fixture.storage.getItem.mockImplementation((key) => {
      if (key === ROOT) throw new DOMException("private root", "SecurityError");
      return fixture.durable.get(key) ?? null;
    });
    expect(fixture.preflight(first)).toEqual({
      mode: "preflight",
      schemaComplete: false,
      receipt: {
        status: "failed",
        settingsVerified: true,
        stage: "legacy_root_decode",
        error: "storage_read_failed",
      },
    });
    expect(first.owner.getCurrentState().ready).toBe(true);
    expect(fixture.durable.get(SETTINGS)).toBe(
      JSON.stringify(golden.standalone),
    );
  });
});
