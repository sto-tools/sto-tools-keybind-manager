import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import StorageService from "../../src/js/components/services/StorageService.js";
import LocalStorageProjectRepository from "../../src/js/components/storage/LocalStorageProjectRepository.js";
import LocalStorageSettingsRepository from "../../src/js/components/storage/LocalStorageSettingsRepository.js";
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

describe("unused repository parity with the active StorageService", () => {
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

  function legacy(initial) {
    for (const [key, value] of Object.entries(initial))
      localStorage.setItem(key, value);
    const service = new StorageService({
      eventBus: bus.eventBus,
      version: VERSION,
    });
    services.push(service);
    return service;
  }

  function project(storage, service) {
    return new LocalStorageProjectRepository({
      storage,
      version: VERSION,
      now: () => TIME,
      settingsDefaults: service.getDefaultSettings(),
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
    const service = legacy(initial);
    service.init();
    const events = bus.getEventsOfType("storage:data-changed").length;
    const storage = memoryStorage(initial);
    const repository = project(storage, service);

    const loaded = repository.load();
    expect(loaded.status).not.toBe("read_failed");
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.removeItem).not.toHaveBeenCalled();
    expect(
      repository.commit(loaded.value, { verification: "required" }).status,
    ).toBe("committed");

    for (const key of [ROOT, BACKUP, SETTINGS, SENTINEL, "unrelated"]) {
      expect(storage.getItem(key), key).toBe(localStorage.getItem(key));
    }
    expect(JSON.parse(storage.getItem(BACKUP)).data).toBe(initial[ROOT]);
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
      const service = legacy(initial);
      service.init();
      const storage = memoryStorage(initial);
      const repository = project(storage, service);
      const loaded = repository.load();
      expect(loaded.status).toBe("repair_required");
      expect(storage.getItem(SENTINEL)).toBe(marker);
      expect(storage.setItem).not.toHaveBeenCalled();
      expect(storage.removeItem).not.toHaveBeenCalled();
      const options = { verification: "required" };
      if (loaded.resetSentinel.status === "pending_consumption") {
        options.consumeResetSentinel = loaded.resetSentinel.expectedValue;
      }
      expect(repository.commit(loaded.value, options).status).toBe("committed");
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
    const service = legacy(initial);
    const storage = memoryStorage(initial);
    const repository = new LocalStorageSettingsRepository({
      storage,
      defaults: service.getDefaultSettings(),
    });
    expect(repository.load().value).toEqual(service.getSettings());
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.removeItem).not.toHaveBeenCalled();
  });

  it("matches complete settings replacement without retaining stale extensions", () => {
    const initial = {
      [SETTINGS]: '{"oldExtension":true}',
      [ROOT]: "keep root",
      [BACKUP]: "keep backup",
      [SENTINEL]: "true",
    };
    const service = legacy(initial);
    const replacement = JSON.parse(fixture("complete-current-settings.json"));
    expect(service.saveSettings(replacement, { replace: true })).toBe(true);
    const storage = memoryStorage(initial);
    const repository = new LocalStorageSettingsRepository({
      storage,
      defaults: service.getDefaultSettings(),
    });
    expect(repository.replace(replacement).status).toBe("committed");
    expect(storage.getItem(SETTINGS)).toBe(localStorage.getItem(SETTINGS));
    for (const key of [ROOT, BACKUP, SENTINEL])
      expect(storage.getItem(key)).toBe(initial[key]);
  });

  it("intentionally fails closed on unavailable storage rather than adopting legacy fallback defaults", () => {
    const service = legacy({});
    const storage = memoryStorage({});
    storage.getItem.mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    const repositories = [
      project(storage, service),
      new LocalStorageSettingsRepository({
        storage,
        defaults: service.getDefaultSettings(),
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
