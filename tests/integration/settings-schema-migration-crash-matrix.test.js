import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PreferencesService from "../../src/js/components/services/PreferencesService.js";
import DataCoordinator from "../../src/js/components/services/DataCoordinator.js";
import LocalStorageProjectRepository from "../../src/js/components/storage/LocalStorageProjectRepository.js";
import LocalStorageSettingsRepository from "../../src/js/components/storage/LocalStorageSettingsRepository.js";
import LocalStorageVisitedStatePersistence from "../../src/js/components/storage/LocalStorageVisitedStatePersistence.js";
import { runStorageSchemaMigration } from "../../src/js/components/storage/storageSchemaMigration.js";
import builtInProfiles from "../../src/js/data/defaultProfiles.js";
import { createDefaultPreferencesSettings } from "../../src/js/components/services/preferencesDefaults.js";
import { createEventBusFixture } from "../fixtures/core/eventBus.js";
import {
  BACKUP,
  ROOT,
  SETTINGS,
  TIMESTAMP,
  migrationFixture,
} from "../fixtures/persistence/storageMigration.js";

const VISITED = "sto_keybind_manager_visited";
const RESET = "sto_app_reset";
const VERSION = "2.0.0";
const LEGACY_RAW = ` \n{
  "version": "2.0.0", "created": "2026-10-02T17:00:00.000Z",
  "lastModified": "2026-10-02T17:00:00.000Z", "currentProfile": "captain",
  "profiles": { "captain": {
    "name": "Captain", "currentEnvironment": "space", "migrationVersion": "2.1.1",
    "builds": { "space": { "keys": { "F1": ["FireAll"] } }, "ground": { "keys": {} } },
    "aliases": {}, "bindsets": {}, "selections": { "space": "F1", "ground": null, "alias": null },
    "keybindMetadata": {}, "aliasMetadata": {}, "bindsetMetadata": {},
    "profileExtension": { "nested": ["retained", { "flag": true }] }
  } }, "globalAliases": {},
  "settings": { "theme": "light", "language": "fr", "embeddedOnly": true },
  "rootExtension": { "nested": { "settings": { "ordinaryExtension": true } } }
}\n `;
const standalone = {
  ...createDefaultPreferencesSettings(),
  theme: "dark",
  language: "de",
  standaloneExtension: { nested: [1, { flag: true }] },
};
const STANDALONE_RAW = JSON.stringify(standalone);
const canonical = JSON.parse(LEGACY_RAW);
delete canonical.settings;
const entries = () => [
  [ROOT, LEGACY_RAW],
  [SETTINGS, STANDALONE_RAW],
  [VISITED, "true"],
];

describe("actual settings migration crash/restart and owner readiness matrix", () => {
  let cleanup;
  beforeEach(() => {
    cleanup = [];
    for (const method of ["log", "warn", "error"])
      vi.spyOn(console, method).mockImplementation(() => {});
  });
  afterEach(() => {
    for (const close of cleanup.reverse()) close();
    vi.restoreAllMocks();
  });

  function setup(initial = entries()) {
    const fixture = migrationFixture(initial);
    const read = fixture.storage.getItem.getMockImplementation();
    const write = fixture.storage.setItem.getMockImplementation();
    const remove = fixture.storage.removeItem.getMockImplementation();
    function restore() {
      fixture.storage.getItem.mockImplementation(read);
      fixture.storage.setItem.mockImplementation(write);
      fixture.storage.removeItem.mockImplementation(remove);
    }
    async function boot(defaultProfiles = {}) {
      const settingsRepository = new LocalStorageSettingsRepository({
        storage: fixture.storage,
        defaults: fixture.defaults,
      });
      const projectRepository = new LocalStorageProjectRepository({
        storage: fixture.storage,
        version: VERSION,
        now: () => TIMESTAMP,
      });
      const receipt = runStorageSchemaMigration({
        settingsRepository,
        settingsInspection: settingsRepository.createMigrationInspectionPort(),
        projectMigration: projectRepository.createSchemaMigrationPort(),
        defaults: fixture.defaults,
        version: VERSION,
        now: () => TIMESTAMP,
      });
      const bus = createEventBusFixture();
      const effects = vi.fn();
      const preferences = new PreferencesService({
        settingsRepository,
        startupMigration: receipt,
        defaults: fixture.defaults,
        eventBus: bus.eventBus,
        localizeCommands: effects,
        applyTranslations: effects,
      });
      const data = new DataCoordinator({
        projectRepository,
        visitedState: new LocalStorageVisitedStatePersistence({
          storage: fixture.storage,
        }),
        eventBus: bus.eventBus,
        i18n: { t: (key) => key },
        defaultProfiles,
      });
      const dataInit = vi.spyOn(data, "init");
      const close = () => {
        data.destroy();
        preferences.destroy();
        bus.destroy();
      };
      cleanup.push(close);
      const writes = fixture.storage.setItem.mock.calls.length;
      preferences.init();
      if (receipt.status !== "absent" && receipt.status !== "complete") {
        const blockReason =
          receipt.error === "storage_read_failed"
            ? "storage_read_failed"
            : "verification_failed";
        await expect(preferences.initialStateReady).rejects.toThrow(
          blockReason,
        );
        expect(preferences.getCurrentState()).toEqual({
          authorityEpoch: expect.any(Number),
          ready: false,
          blocked: true,
          readiness: "blocked",
          durability: "unverified",
          blockReason,
          revision: 0,
          settings: fixture.defaults,
        });
        expect(fixture.storage.setItem).toHaveBeenCalledTimes(writes);
        expect(effects).not.toHaveBeenCalled();
        for (const topic of [
          "preferences:loaded",
          "preferences:saved",
          "preferences:changed",
          "data:state-changed",
        ])
          expect(bus.getEventsOfType(topic), topic).toHaveLength(0);
        for (const topic of [
          "activate-persisted-settings",
          "persist-sync-folder-settings",
          "save-settings",
          "set-setting",
          "set-settings",
        ])
          expect(
            bus.eventBus.hasListeners(`rpc:preferences:${topic}`),
            topic,
          ).toBe(false);
        expect(dataInit).not.toHaveBeenCalled();
        expect(data.getCurrentState().ready).toBe(false);
        return { receipt, preferences, data, bus, effects, close };
      }
      await preferences.initialStateReady;
      data.init();
      let dataError;
      try {
        await data.initialStateReady;
      } catch (error) {
        dataError = error;
      }
      return { receipt, preferences, data, bus, effects, close, dataError };
    }
    return { ...fixture, read, write, restore, boot };
  }

  function expectRecovered(
    fixture,
    result,
    settings = standalone,
    raw = LEGACY_RAW,
  ) {
    expect(["complete", "absent"]).toContain(result.receipt.status);
    expect(result.dataError).toBeUndefined();
    expect(result.preferences.getCurrentState()).toMatchObject({
      ready: true,
      durability: "verified",
      settings,
    });
    expect(result.data.getCurrentState()).toMatchObject({
      ready: true,
      profiles: canonical.profiles,
    });
    expect(JSON.parse(fixture.durable.get(ROOT))).toMatchObject(canonical);
    expect(JSON.parse(fixture.durable.get(ROOT))).not.toHaveProperty(
      "settings",
    );
    expect(JSON.parse(fixture.durable.get(BACKUP))).toEqual({
      data: raw,
      timestamp: TIMESTAMP,
      version: VERSION,
    });
    expect(JSON.parse(fixture.durable.get(SETTINGS))).toEqual(settings);
  }

  it.each([SETTINGS, ROOT])(
    "performs zero writes on initial %s read throw, then restarts fresh",
    async (failedKey) => {
      const fixture = setup();
      fixture.storage.getItem.mockImplementation((key) => {
        if (key === failedKey)
          throw new DOMException("blocked", "SecurityError");
        return fixture.read(key);
      });
      const first = await fixture.boot();
      expect(first.receipt).toEqual({
        status: "failed",
        settingsVerified: false,
        stage: failedKey === SETTINGS ? "settings_read" : "legacy_root_decode",
        error: "storage_read_failed",
      });
      expect(fixture.storage.setItem).not.toHaveBeenCalled();
      expect(fixture.durable.get(ROOT)).toBe(LEGACY_RAW);
      expect(fixture.durable.get(SETTINGS)).toBe(STANDALONE_RAW);
      first.close();
      fixture.restore();
      expectRecovered(fixture, await fixture.boot());
    },
  );

  it.each(
    [SETTINGS, BACKUP, ROOT].flatMap((key) =>
      ["before", "after"].map((point) => [key, point]),
    ),
  )(
    "restarts after a crash %s write %s its durable mutation",
    async (failedKey, point) => {
      const fixture = setup();
      fixture.storage.setItem.mockImplementation((key, value) => {
        if (key !== failedKey || point === "after") fixture.write(key, value);
        if (key === failedKey)
          throw new DOMException("crash", "QuotaExceededError");
      });
      const first = await fixture.boot();
      expect(first.receipt).toMatchObject({
        status: "failed",
        settingsVerified: failedKey !== SETTINGS,
        stage:
          failedKey === SETTINGS
            ? "settings_write"
            : failedKey === BACKUP
              ? "legacy_root_backup"
              : "canonical_root_commit",
        error:
          failedKey === BACKUP ? "backup_write_failed" : "storage_write_failed",
      });
      expect(
        Object.hasOwn(JSON.parse(fixture.durable.get(ROOT)), "settings"),
      ).toBe(failedKey !== ROOT || point === "before");
      const backup = fixture.durable.get(BACKUP);
      first.close();
      fixture.restore();
      expectRecovered(fixture, await fixture.boot());
      if (backup !== undefined)
        expect(fixture.durable.get(BACKUP)).toBe(backup);
    },
  );

  it.each(
    [SETTINGS, BACKUP, ROOT].flatMap((key) =>
      ["throw", "mismatch"].map((mode) => [key, mode]),
    ),
  )(
    "blocks %s %s readback despite durable writes until a fresh restart",
    async (failedKey, mode) => {
      const fixture = setup();
      let written = false;
      fixture.storage.setItem.mockImplementation((key, value) => {
        fixture.write(key, value);
        if (key === failedKey) written = true;
      });
      fixture.storage.getItem.mockImplementation((key) => {
        if (key === failedKey && written) {
          if (mode === "throw") throw new Error("readback unavailable");
          return "null";
        }
        return fixture.read(key);
      });
      const first = await fixture.boot();
      expect(first.receipt).toMatchObject({
        status: "failed",
        stage:
          failedKey === SETTINGS
            ? "settings_verify"
            : failedKey === BACKUP
              ? "legacy_root_backup"
              : "canonical_root_verify",
        error: mode === "throw" ? "storage_read_failed" : "verification_failed",
      });
      expect(fixture.durable.get(ROOT)).toBe(
        failedKey === ROOT ? JSON.stringify(canonical) : LEGACY_RAW,
      );
      first.close();
      fixture.restore();
      expectRecovered(fixture, await fixture.boot());
    },
  );

  it.each([SETTINGS, ROOT])(
    "detects changed %s between verified stages without losing the winning bytes",
    async (changedKey) => {
      const fixture = setup();
      const winner =
        changedKey === SETTINGS
          ? { ...standalone, theme: "light" }
          : { ...JSON.parse(LEGACY_RAW), rootExtension: { successor: true } };
      const winningRaw = JSON.stringify(winner);
      fixture.storage.setItem.mockImplementation((key, value) => {
        fixture.write(key, value);
        if (key === (changedKey === SETTINGS ? BACKUP : SETTINGS))
          fixture.durable.set(changedKey, winningRaw);
      });
      const first = await fixture.boot();
      expect(first.receipt).toMatchObject({
        status: "failed",
        stage:
          changedKey === SETTINGS ? "settings_verify" : "legacy_root_backup",
        error:
          changedKey === SETTINGS
            ? "verification_failed"
            : "operation_cancelled",
      });
      expect(fixture.durable.get(changedKey)).toBe(winningRaw);
      expect(fixture.durable.get(ROOT)).toBe(
        changedKey === ROOT ? winningRaw : LEGACY_RAW,
      );
      first.close();
      fixture.restore();
      const successor = await fixture.boot();
      expect(successor.dataError).toBeUndefined();
      expect(successor.preferences.getSettings()).toEqual(
        changedKey === SETTINGS ? winner : standalone,
      );
      expect(JSON.parse(fixture.durable.get(BACKUP)).data).toBe(
        changedKey === ROOT ? winningRaw : LEGACY_RAW,
      );
      expect(JSON.parse(fixture.durable.get(ROOT))).not.toHaveProperty(
        "settings",
      );
    },
  );

  it.each([
    ["missing", null, {}],
    ["malformed", "{not-json", {}],
    ["non-record", "[]", {}],
    [
      "partial repaired",
      '{"theme":42,"autoSave":false,"validExtension":{"nested":[1,2]}}',
      { autoSave: false, validExtension: { nested: [1, 2] } },
    ],
  ])(
    "recovers %s standalone settings without consulting embedded values",
    async (_name, raw, patch) => {
      const initial = entries().filter(([key]) => key !== SETTINGS);
      if (raw !== null) initial.push([SETTINGS, raw]);
      const fixture = setup(initial);
      const expected = { ...fixture.defaults, ...patch };
      const first = await fixture.boot();
      expectRecovered(fixture, first, expected);
      const backup = fixture.durable.get(BACKUP);
      first.close();
      expectRecovered(fixture, await fixture.boot(), expected);
      expect(fixture.durable.get(BACKUP)).toBe(backup);
    },
  );

  it.each(["{not-json", null])(
    "preserves invalid-root evidence and automatic builtin creation for source %j",
    async (raw) => {
      const initial = [[SETTINGS, STANDALONE_RAW]];
      if (raw !== null) initial.push([ROOT, raw]);
      const fixture = setup(initial);
      const first = await fixture.boot(builtInProfiles);
      expect(first.receipt).toMatchObject(
        raw === null
          ? { status: "absent" }
          : { status: "complete", source: "recovered_invalid" },
      );
      expect(first.dataError).toBeUndefined();
      expect(first.data.getCurrentState().ready).toBe(true);
      expect(Object.keys(first.data.getCurrentState().profiles)).toEqual(
        Object.keys(builtInProfiles),
      );
      expect(fixture.durable.has(VISITED)).toBe(false);
      const durable = JSON.parse(fixture.durable.get(ROOT));
      expect(durable).not.toHaveProperty("settings");
      expect(first.preferences.getSettings()).toEqual(standalone);
      const backup = fixture.durable.get(BACKUP);
      if (raw !== null) expect(JSON.parse(backup).data).toBe(raw);
      first.close();
      const successor = await fixture.boot(builtInProfiles);
      expect(successor.dataError).toBeUndefined();
      expect(successor.data.getCurrentState().profiles).toEqual(
        durable.profiles,
      );
      expect(fixture.durable.get(BACKUP)).toBe(backup);
    },
  );

  it("retains migration checkpoint through failed reset-sentinel removal and replacement startup", async () => {
    const fixture = setup([...entries(), [RESET, "custom-reset-token"]]);
    fixture.storage.removeItem.mockImplementation((key) => {
      if (key === RESET) throw new Error("sentinel removal blocked");
      fixture.durable.delete(key);
    });
    const first = await fixture.boot();
    expect(first.dataError?.message).toBe("failed_to_load_profile_data");
    expect(first.data.getCurrentState().ready).toBe(false);
    expect(first.bus.getEventsOfType("data:state-changed")).toHaveLength(0);
    expect(fixture.durable.get(RESET)).toBe("custom-reset-token");
    const backup = fixture.durable.get(BACKUP);
    expect(JSON.parse(backup).data).toBe(LEGACY_RAW);
    first.close();
    fixture.restore();
    expectRecovered(fixture, await fixture.boot());
    expect(fixture.durable.has(RESET)).toBe(false);
    expect(fixture.durable.get(BACKUP)).toBe(backup);
  });

  it("blocks automatic builtin startup on root readback throw until a fresh owner verifies the durable write", async () => {
    const fixture = setup([
      [ROOT, "{not-json"],
      [SETTINGS, STANDALONE_RAW],
    ]);
    fixture.storage.getItem.mockImplementation((key) => {
      const raw = fixture.durable.get(key);
      if (
        key === ROOT &&
        raw?.startsWith("{") &&
        !raw.startsWith("{not-json") &&
        Object.keys(JSON.parse(raw).profiles).length > 0
      )
        throw new DOMException(
          "automatic default readback blocked",
          "SecurityError",
        );
      return fixture.read(key);
    });
    const first = await fixture.boot(builtInProfiles);
    expect(first.receipt).toMatchObject({
      status: "complete",
      source: "recovered_invalid",
    });
    expect(first.dataError?.message).toBe("failed_to_load_profile_data");
    expect(first.data.getCurrentState().ready).toBe(false);
    for (const topic of [
      "data:state-changed",
      "storage:data-changed",
      "profile:switched",
    ])
      expect(first.bus.getEventsOfType(topic), topic).toHaveLength(0);
    expect(first.bus.eventBus.hasListeners("rpc:data:update-profile")).toBe(
      false,
    );
    const durable = JSON.parse(fixture.durable.get(ROOT));
    expect(Object.keys(durable.profiles)).toEqual(Object.keys(builtInProfiles));
    expect(durable).not.toHaveProperty("settings");
    const backup = fixture.durable.get(BACKUP);
    expect(JSON.parse(backup).data).toBe("{not-json");
    first.close();
    fixture.restore();
    const successor = await fixture.boot(builtInProfiles);
    expect(successor.dataError).toBeUndefined();
    expect(successor.data.getCurrentState()).toMatchObject({
      ready: true,
      profiles: durable.profiles,
    });
    expect(fixture.durable.get(BACKUP)).toBe(backup);
  });

  it("allows explicit user default creation to replace the migration backup normally", async () => {
    const fixture = setup();
    const first = await fixture.boot();
    expectRecovered(fixture, first);
    const beforeRoot = fixture.durable.get(ROOT);
    await first.data.createDefaultProfilesFromData(builtInProfiles);
    expect(JSON.parse(fixture.durable.get(BACKUP)).data).toBe(beforeRoot);
    expect(JSON.parse(fixture.durable.get(BACKUP)).data).not.toBe(LEGACY_RAW);
    expect(JSON.parse(fixture.durable.get(ROOT))).not.toHaveProperty(
      "settings",
    );
  });
});
