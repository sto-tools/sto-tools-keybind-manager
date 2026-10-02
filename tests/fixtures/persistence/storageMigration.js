import { vi } from "vitest";
import LocalStorageSettingsRepository from "../../../src/js/components/storage/LocalStorageSettingsRepository.js";
import LocalStorageProjectRepository from "../../../src/js/components/storage/LocalStorageProjectRepository.js";
import { runStorageSchemaMigration } from "../../../src/js/components/storage/storageSchemaMigration.js";
import { createDefaultPreferencesSettings } from "../../../src/js/components/services/preferencesDefaults.js";

export const ROOT = "sto_keybind_manager";
export const SETTINGS = "sto_keybind_settings";
export const BACKUP = "sto_keybind_manager_backup";
export const TIMESTAMP = "2026-10-02T17:00:00.000Z";
export const legacyRoot = {
  version: "2.0.0",
  created: TIMESTAMP,
  lastModified: TIMESTAMP,
  currentProfile: null,
  profiles: {},
  globalAliases: {},
  settings: { theme: "embedded-must-not-win" },
  extension: { nested: { settings: "ordinary extension" } },
};

export function migrationFixture(
  entries = [[ROOT, JSON.stringify(legacyRoot)]],
) {
  const durable = new Map(entries);
  const trace = [];
  const storage = {
    getItem: vi.fn((key) => {
      trace.push(["read", key]);
      return durable.get(key) ?? null;
    }),
    setItem: vi.fn((key, value) => {
      trace.push(["write", key]);
      durable.set(key, value);
    }),
    removeItem: vi.fn((key) => durable.delete(key)),
  };
  const defaults = createDefaultPreferencesSettings();
  const create = () => {
    const settingsRepository = new LocalStorageSettingsRepository({
      storage,
      defaults,
    });
    const projectRepository = new LocalStorageProjectRepository({
      storage,
      version: "2.0.0",
      now: () => TIMESTAMP,
    });
    return {
      settingsRepository,
      projectRepository,
      options: {
        settingsRepository,
        settingsInspection: settingsRepository.createMigrationInspectionPort(),
        projectMigration: projectRepository.createSchemaMigrationPort(),
        defaults,
        version: "2.0.0",
        now: () => TIMESTAMP,
      },
    };
  };
  const current = create();
  return {
    durable,
    storage,
    trace,
    defaults,
    ...current,
    run: () => runStorageSchemaMigration(current.options),
    restart: () => runStorageSchemaMigration(create().options),
  };
}
