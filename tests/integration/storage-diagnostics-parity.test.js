import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DataCoordinator from "../../src/js/components/services/DataCoordinator.js";
import PreferencesService from "../../src/js/components/services/PreferencesService.js";
import { createDefaultPreferencesSettings } from "../../src/js/components/services/preferencesDefaults.js";
import { request } from "../../src/js/core/requestResponse.js";
import LocalStorageProjectRepository from "../../src/js/components/storage/LocalStorageProjectRepository.js";
import LocalStorageSettingsRepository from "../../src/js/components/storage/LocalStorageSettingsRepository.js";
import LocalStorageCommandPresentationPersistence from "../../src/js/components/storage/LocalStorageCommandPresentationPersistence.js";
import LocalStorageKeyBrowserPersistence from "../../src/js/components/storage/LocalStorageKeyBrowserPersistence.js";
import LocalStorageVisitedStatePersistence from "../../src/js/components/storage/LocalStorageVisitedStatePersistence.js";
import LocalStorageDevelopmentFlagPersistence from "../../src/js/components/storage/LocalStorageDevelopmentFlagPersistence.js";
import { runStorageSchemaMigration } from "../../src/js/components/storage/storageSchemaMigration.js";
import { createStorageRuntimeDiagnostics } from "../../src/js/components/storage/storageRuntimeDiagnostics.js";
import { materializeStorageDiagnosticSnapshot } from "../../src/js/components/storage/storageDiagnosticSnapshot.js";
import { createEventBusFixture } from "../fixtures/core/eventBus.js";

const ROOT = "sto_keybind_manager";
const SETTINGS = "sto_keybind_settings";
const BACKUP = "sto_keybind_manager_backup";
const TIME = "2026-10-02T17:00:00.000Z";
const fixture = (name) =>
  readFileSync(`tests/fixtures/storage/${name}`, "utf8").trim();
const normalize = (value) =>
  JSON.parse(
    JSON.stringify(value, (key, entry) =>
      key === "authorityEpoch" ? undefined : entry,
    ),
  );

function storageHarness(seed = {}) {
  const bytes = new Map(Object.entries(seed));
  const trace = [];
  const fault = { operation: null, key: null, mode: null };
  const error = new DOMException(
    "private stored content",
    "QuotaExceededError",
  );
  const storage = {
    get length() {
      trace.push(["length"]);
      return bytes.size;
    },
    key(index) {
      trace.push(["key", index]);
      return [...bytes.keys()][index] ?? null;
    },
    getItem(key) {
      trace.push(["get", key]);
      if (fault.operation === "get" && key === fault.key)
        return "verification mismatch";
      return bytes.get(key) ?? null;
    },
    setItem(key, value) {
      trace.push(["set", key, value]);
      if (fault.operation === "set" && key === fault.key) throw error;
      bytes.set(key, value);
    },
    removeItem(key) {
      trace.push(["remove", key]);
      if (fault.operation === "remove" && key === fault.key) throw error;
      bytes.delete(key);
    },
  };
  return { bytes, trace, storage, fault, error };
}

function adapters(harness, observed) {
  const defaults = createDefaultPreferencesSettings();
  const recorder = createStorageRuntimeDiagnostics();
  const projectAdapter = new LocalStorageProjectRepository({
    storage: harness.storage,
    version: "2.0.0",
    now: () => TIME,
  });
  const settingsAdapter = new LocalStorageSettingsRepository({
    storage: harness.storage,
    defaults,
  });
  const project = observed
    ? recorder.observeProjectRepository(projectAdapter)
    : projectAdapter;
  const settings = observed
    ? recorder.observeSettingsRepository(settingsAdapter)
    : settingsAdapter;
  const presentationAdapter = new LocalStorageCommandPresentationPersistence({
    storage: harness.storage,
  });
  const keyAdapter = new LocalStorageKeyBrowserPersistence({
    storage: harness.storage,
  });
  const visitedAdapter = new LocalStorageVisitedStatePersistence({
    storage: harness.storage,
  });
  const flagAdapter = new LocalStorageDevelopmentFlagPersistence({
    storage: harness.storage,
  });
  const presentation = observed
    ? recorder.observeCommandPresentation(presentationAdapter)
    : presentationAdapter;
  const keyBrowser = observed
    ? recorder.observeKeyBrowser(keyAdapter)
    : keyAdapter;
  const visited = observed
    ? recorder.observeVisitedState(visitedAdapter)
    : visitedAdapter;
  const flag = observed
    ? recorder.observeDevelopmentFlag(flagAdapter)
    : flagAdapter;
  const inspect = () => {
    const before = harness.trace.length;
    expect(
      materializeStorageDiagnosticSnapshot(recorder.snapshot()),
    ).not.toBeNull();
    recorder.snapshot();
    expect(harness.trace).toHaveLength(before);
  };
  return {
    projectAdapter,
    settingsAdapter,
    project,
    settings,
    presentation,
    keyBrowser,
    visited,
    flag,
    defaults,
    recorder,
    inspect,
  };
}

function publications(bus) {
  return bus.eventBus.emit.mock.calls.flatMap(([topic, payload]) => {
    if (topic === "rpc:preferences:set-setting")
      return [[topic, normalize(payload.payload)]];
    if (topic.includes("preferences:set-setting::reply::"))
      return [["preferences:set-setting:reply", normalize(payload)]];
    if (
      [
        "data:state-changed",
        "preferences:state-changed",
        "preferences:changed",
        "preferences:saved",
        "profile:updated",
        "profile:switched",
      ].includes(topic)
    )
      return [[topic, normalize(payload)]];
    return [];
  });
}

async function ownerScenario(observed, seedName, failSetting = false) {
  const root = JSON.parse(fixture(seedName));
  if (seedName === "complete-current-root.json") delete root.settings;
  const harness = storageHarness({
    [ROOT]: JSON.stringify(root),
    sto_keybind_manager_visited: "true",
  });
  const ports = adapters(harness, observed);
  const bus = createEventBusFixture();
  const migration = runStorageSchemaMigration({
    settingsRepository: ports.settings,
    settingsInspection: ports.settingsAdapter.createMigrationInspectionPort(),
    projectMigration: ports.projectAdapter.createSchemaMigrationPort(),
    defaults: ports.defaults,
    version: "2.0.0",
    now: () => TIME,
  });
  if (observed) ports.recorder.recordMigrationReceipt(migration);
  const preferences = new PreferencesService({
    settingsRepository: ports.settings,
    defaults: ports.defaults,
    startupMigration: migration,
    eventBus: bus.eventBus,
    i18n: { language: ports.defaults.language, t: (key) => key },
  });
  const data = new DataCoordinator({
    projectRepository: ports.project,
    visitedState: ports.visited,
    eventBus: bus.eventBus,
    i18n: { t: (key) => key },
  });
  try {
    preferences.init();
    await preferences.initialStateReady;
    data.init();
    await data.initialStateReady;
    const before = normalize({
      data: data.getCurrentState(),
      preferences: preferences.getCurrentState(),
    });
    ports.inspect();
    if (failSetting)
      Object.assign(harness.fault, { operation: "set", key: SETTINGS });
    const settingReply = await request(
      bus.eventBus,
      "preferences:set-setting",
      { key: "autoSave", value: false },
    );
    Object.assign(harness.fault, { operation: null, key: null });
    const profileId = data.getCurrentState().currentProfile;
    const profileReply = await data.updateProfile(profileId, {
      properties: { name: "Parity profile" },
    });
    const afterMutation = normalize({
      data: data.getCurrentState(),
      preferences: preferences.getCurrentState(),
    });
    ports.presentation.load();
    ports.presentation.replaceCategory("combat", true);
    ports.presentation.replaceGroup("pivot", false);
    ports.keyBrowser.load();
    ports.keyBrowser.replaceMode("grid");
    ports.keyBrowser.replaceCategory("combat", "key-type", true);
    ports.keyBrowser.replaceBindset("Private named bindset", true);
    ports.visited.loadExact();
    ports.flag.isEnabled();
    ports.inspect();
    const action = data.runApplicationResetTransition.bind(data);
    const reset = observed
      ? ports.recorder.observeWorkflowAction("project", "reset", action)
      : action;
    const completion = await reset(
      async ({ resetProjectPersistence, adoptEmptyProject }) => {
        const persistence = await resetProjectPersistence();
        if (!persistence.success) return persistence;
        return adoptEmptyProject();
      },
    );
    await completion.settlement;
    ports.inspect();
    return {
      migration,
      before,
      settingReply,
      profileReply,
      afterMutation,
      reset: completion.result,
      final: normalize({
        data: data.getCurrentState(),
        preferences: preferences.getCurrentState(),
      }),
      bytes: [...harness.bytes.entries()],
      trace: harness.trace,
      publications: publications(bus),
    };
  } finally {
    data.destroy();
    preferences.destroy();
    bus.destroy();
  }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(TIME));
  vi.spyOn(Math, "random").mockReturnValue(0.25);
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("observed and unobserved real storage composition parity", () => {
  it.each(["complete-current-root.json", "legacy-space-root.json"])(
    "preserves %s migration, owner action/RPC/revision/publication and scalar/reset bytes exactly",
    async (seed) => {
      const plain = await ownerScenario(false, seed);
      const observed = await ownerScenario(true, seed);
      expect(observed).toEqual(plain);
      expect(observed.settingReply).toBe(true);
      expect(observed.reset.success).toBe(true);
      expect(observed.publications.map(([topic]) => topic)).toContain(
        "preferences:set-setting:reply",
      );
      expect(
        observed.publications.findIndex(
          ([topic]) => topic === "preferences:changed",
        ),
      ).toBeLessThan(
        observed.publications.findIndex(
          ([topic]) => topic === "preferences:set-setting:reply",
        ),
      );
    },
  );

  it("preserves settings quota rejection, accepted owner predecessor revision and reply ordering", async () => {
    const plain = await ownerScenario(
      false,
      "complete-current-root.json",
      true,
    );
    const observed = await ownerScenario(
      true,
      "complete-current-root.json",
      true,
    );
    expect(observed).toEqual(plain);
    expect(observed.settingReply).toBe(false);
    expect(observed.afterMutation.preferences).toEqual(
      observed.before.preferences,
    );
  });

  it.each([
    "root-quota",
    "backup-quota",
    "settings-verification",
    "scalar-quota",
  ])(
    "preserves actual adapter %s results, durable bytes and exact persistence trace",
    (failure) => {
      function run(observed) {
        const root = JSON.parse(fixture("complete-current-root.json"));
        delete root.settings;
        const harness = storageHarness({
          [ROOT]: JSON.stringify(root),
          [SETTINGS]: JSON.stringify(createDefaultPreferencesSettings()),
        });
        const ports = adapters(harness, observed);
        const accepted = ports.project.load();
        let result;
        if (failure === "root-quota" || failure === "backup-quota") {
          Object.assign(harness.fault, {
            operation: "set",
            key: failure === "root-quota" ? ROOT : BACKUP,
          });
          result = ports.project.commit(accepted.value);
        } else if (failure === "settings-verification") {
          Object.assign(harness.fault, { operation: "get", key: SETTINGS });
          result = ports.settings.replace(ports.defaults);
        } else {
          Object.assign(harness.fault, {
            operation: "set",
            key: "keyViewMode",
          });
          try {
            ports.keyBrowser.replaceMode("categorized");
          } catch (error) {
            expect(error).toBe(harness.error);
            result = { name: error.name };
          }
        }
        ports.inspect();
        if (observed) {
          const row = ports.recorder
            .snapshot()
            .domains.find(
              (entry) =>
                entry.domain ===
                (failure === "settings-verification"
                  ? "settings"
                  : failure === "scalar-quota"
                    ? "key-browser"
                    : "project"),
            );
          expect(row.lastOperation.error).toBe(
            failure === "backup-quota"
              ? "backup_write_failed"
              : failure === "settings-verification"
                ? "verification_failed"
                : "storage_write_failed",
          );
        }
        return {
          result,
          trace: harness.trace,
          bytes: [...harness.bytes.entries()],
        };
      }
      expect(run(true)).toEqual(run(false));
    },
  );
});
