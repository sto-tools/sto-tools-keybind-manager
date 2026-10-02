import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LocalStorageProjectRepository from "../../src/js/components/storage/LocalStorageProjectRepository.js";
import LocalStorageSettingsRepository from "../../src/js/components/storage/LocalStorageSettingsRepository.js";
import { runStorageSchemaMigration } from "../../src/js/components/storage/storageSchemaMigration.js";
import PreferencesService from "../../src/js/components/services/PreferencesService.js";
import { createDefaultPreferencesSettings } from "../../src/js/components/services/preferencesDefaults.js";
import { decodeStoredSettingsJson } from "../../src/js/components/services/settingsDataBoundary.js";
import { createEventBusFixture } from "../fixtures/core/eventBus.js";

const ROOT = "sto_keybind_manager";
const BACKUP = "sto_keybind_manager_backup";
const SETTINGS = "sto_keybind_settings";
const SENTINEL = "sto_app_reset";
const VERSION = "2.0.0";
const TIME = "2026-07-15T12:00:00.000Z";

function fixture(name) {
  return readFileSync(
    join(process.cwd(), "tests/fixtures/storage", name),
    "utf8",
  ).trim();
}

function memoryStorage(initial) {
  const records = new Map(Object.entries(initial));
  return {
    records,
    getItem: vi.fn((key) => records.get(key) ?? null),
    setItem: vi.fn((key, value) => records.set(key, String(value))),
    removeItem: vi.fn((key) => records.delete(key)),
  };
}

describe("project repository parity and settings owner cutover characterization", () => {
  let bus;
  let services;

  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(TIME));
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    bus = createEventBusFixture();
    services = [];
  });

  afterEach(() => {
    for (const service of services) service.destroy();
    bus.destroy();
    localStorage.clear();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function seedBrowserStorage(initial) {
    for (const [key, value] of Object.entries(initial))
      localStorage.setItem(key, value);
  }

  function project(storage) {
    return new LocalStorageProjectRepository({
      storage,
      version: VERSION,
      now: () => TIME,
    });
  }

  function migrate(storage, projectRepository) {
    const defaults = createDefaultPreferencesSettings();
    const settingsRepository = new LocalStorageSettingsRepository({
      storage,
      defaults,
    });
    return runStorageSchemaMigration({
      settingsRepository,
      settingsInspection: settingsRepository.createMigrationInspectionPort(),
      projectMigration: projectRepository.createSchemaMigrationPort(),
      defaults,
      version: VERSION,
      now: () => TIME,
    });
  }

  it.each([
    "complete-current-root.json",
    "legacy-space-root.json",
    "legacy-ground-root.json",
    "malformed-root.txt",
    "missing-profiles-root.json",
    "invalid-profiles-root.json",
    "invalid-profile-root.json",
  ])("matches exact recovery/commit bytes and backup for %s", (file) => {
    const initial = {
      [ROOT]: fixture(file),
      [BACKUP]: "previous backup",
      [SETTINGS]: fixture("complete-current-settings.json"),
      unrelated: "untouched",
    };
    seedBrowserStorage(initial);
    const browserRepository = project(localStorage);
    const events = bus.getEventsOfType("storage:data-changed").length;
    const storage = memoryStorage(initial);
    const repository = project(storage);
    const migration = migrate(storage, repository);
    expect(migration).toMatchObject({
      status: "complete",
      settingsVerified: true,
      exactPriorRootBackedUp: true,
    });
    expect(migrate(localStorage, browserRepository)).toEqual(migration);
    expect(JSON.parse(storage.getItem(BACKUP)).data).toBe(initial[ROOT]);
    const writes = storage.setItem.mock.calls.length;

    const loaded = repository.load();
    const browserLoaded = browserRepository.load();
    expect(loaded.status).not.toBe("read_failed");
    expect(browserLoaded.status).toBe(loaded.status);
    expect(storage.setItem).toHaveBeenCalledTimes(writes);
    expect(storage.removeItem).not.toHaveBeenCalled();
    const receipt = repository.commit(loaded.value, {
      verification: "required",
      purpose: "startup_recovery",
    });
    const browserReceipt = browserRepository.commit(browserLoaded.value, {
      verification: "required",
      purpose: "startup_recovery",
    });
    expect(receipt.status).toBe("committed");
    expect(browserReceipt.status).toBe(receipt.status);

    for (const key of [ROOT, BACKUP, SETTINGS, SENTINEL, "unrelated"]) {
      expect(storage.getItem(key), key).toBe(localStorage.getItem(key));
    }
    expect(JSON.parse(storage.getItem(BACKUP)).data).toBe(initial[ROOT]);
    expect(JSON.parse(storage.getItem(ROOT))).not.toHaveProperty("settings");
    expect(bus.getEventsOfType("storage:data-changed")).toHaveLength(events);
  });

  it.each([null, "", "true", "false"])(
    "matches completed missing-root recovery while deferring sentinel consumption (%s)",
    (marker) => {
      const initial = {
        [SETTINGS]: '{"theme":"dark"}',
        [BACKUP]: "keep existing backup",
      };
      if (marker !== null) initial[SENTINEL] = marker;
      seedBrowserStorage(initial);
      const browserRepository = project(localStorage);
      const storage = memoryStorage(initial);
      const repository = project(storage);
      const loaded = repository.load();
      const browserLoaded = browserRepository.load();
      expect(loaded.status).toBe("repair_required");
      expect(browserLoaded.status).toBe(loaded.status);
      expect(storage.getItem(SENTINEL)).toBe(marker);
      expect(storage.setItem).not.toHaveBeenCalled();
      expect(storage.removeItem).not.toHaveBeenCalled();
      const options = { verification: "required" };
      if (loaded.resetSentinel.status === "pending_consumption") {
        options.consumeResetSentinel = loaded.resetSentinel.expectedValue;
      }
      const receipt = repository.commit(loaded.value, options);
      const browserOptions = { verification: "required" };
      if (browserLoaded.resetSentinel.status === "pending_consumption") {
        browserOptions.consumeResetSentinel =
          browserLoaded.resetSentinel.expectedValue;
      }
      const browserReceipt = browserRepository.commit(
        browserLoaded.value,
        browserOptions,
      );
      expect(receipt.status).toBe("committed");
      expect(browserReceipt.status).toBe(receipt.status);
      for (const key of [ROOT, BACKUP, SETTINGS, SENTINEL]) {
        expect(storage.getItem(key), key).toBe(localStorage.getItem(key));
      }
    },
  );

  it.each([
    null,
    "",
    "{broken",
    "null",
    "[]",
    '{"theme":"dark"}',
    '{"theme":"invalid","language":"de","extension":{"flag":true}}',
    fixture("complete-current-settings.json"),
  ])("matches forgiving standalone settings reads (%s)", (raw) => {
    const initial = raw === null ? {} : { [SETTINGS]: raw };
    const defaults = createDefaultPreferencesSettings();
    const storage = memoryStorage(initial);
    const repository = new LocalStorageSettingsRepository({
      storage,
      defaults,
    });
    // Retain the frozen legacy decoder contract while standalone persistence
    // now belongs exclusively to the Preferences owner/repository chain.
    expect(repository.load().value).toEqual(
      raw ? decodeStoredSettingsJson(raw, defaults).value : defaults,
    );
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.removeItem).not.toHaveBeenCalled();
  });

  it("matches complete settings replacement through the owner without retaining stale extensions", async () => {
    const initial = {
      [SETTINGS]: '{"oldExtension":true}',
      [ROOT]: "keep root",
      [BACKUP]: "keep backup",
      [SENTINEL]: "true",
    };
    seedBrowserStorage(initial);
    const defaults = createDefaultPreferencesSettings();
    const replacement = JSON.parse(fixture("complete-current-settings.json"));
    const owner = new PreferencesService({
      eventBus: bus.eventBus,
      settingsRepository: new LocalStorageSettingsRepository({
        storage: localStorage,
        defaults,
      }),
      defaults,
    });
    services.push(owner);
    owner.init();
    await owner.initialStateReady;
    expect(await owner.setSettings(replacement)).toBe(true);
    const storage = memoryStorage(initial);
    const repository = new LocalStorageSettingsRepository({
      storage,
      defaults,
    });
    expect(repository.replace(replacement).status).toBe("committed");
    expect(storage.getItem(SETTINGS)).toBe(localStorage.getItem(SETTINGS));
    for (const key of [ROOT, BACKUP, SENTINEL])
      expect(storage.getItem(key)).toBe(initial[key]);
  });

  it("intentionally fails closed on unavailable storage rather than adopting legacy fallback defaults", () => {
    const storage = memoryStorage({});
    storage.getItem.mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    const repositories = [
      project(storage),
      new LocalStorageSettingsRepository({
        storage,
        defaults: createDefaultPreferencesSettings(),
      }),
    ];
    for (const repository of repositories) {
      expect(repository.load()).toEqual({
        status: "read_failed",
        error: "storage_read_failed",
        category: "security",
      });
    }
    expect(storage.setItem).not.toHaveBeenCalled();
  });
});
