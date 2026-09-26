import LocalStorageProjectRepository from "../../../src/js/components/storage/LocalStorageProjectRepository.js";
import { createDefaultPreferencesSettings } from "../../../src/js/components/services/preferencesDefaults.js";

export function createProjectRepository({
  storage = localStorage,
  version = "1.0.0",
  now = () => new Date().toISOString(),
  settingsDefaults = createDefaultPreferencesSettings(),
} = {}) {
  return new LocalStorageProjectRepository({
    storage,
    version,
    now,
    settingsDefaults,
  });
}
