import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { sourceRoot } from "../../fixtures/tooling/persistenceScanner.js";

describe("persistence access architecture ratchet", () => {
  it("freezes exact storage namespace, key, prefix, and value definitions", () => {
    const snippetsByFile = {
      "components/storage/LocalStorageProjectRepository.js": [
        'const ROOT_KEY = "sto_keybind_manager"',
        'const BACKUP_KEY = "sto_keybind_manager_backup"',
        'const RESET_KEY = "sto_app_reset"',
      ],
      "components/storage/projectRepositoryReset.js": [
        'storage.removeItem("sto_keybind_manager")',
        'storage.removeItem("sto_keybind_manager_backup")',
        'storage.setItem("sto_app_reset", "true")',
      ],
      "components/storage/LocalStorageSettingsRepository.js": [
        'const SETTINGS_KEY = "sto_keybind_settings"',
      ],
      "components/storage/projectSchemaMigrationPersistence.js": [
        'const ROOT_KEY = "sto_keybind_manager"',
        'const BACKUP_KEY = "sto_keybind_manager_backup"',
      ],
      "components/storage/LocalStorageCommandPresentationPersistence.js": [
        'const SUFFIX = "_collapsed"',
        'const CATEGORY_PREFIX = "commandCategory_"',
        "`commandGroup_${group}${SUFFIX}`",
      ],
      "components/storage/LocalStorageKeyBrowserPersistence.js": [
        'const SUFFIX = "_collapsed"',
        '"keyCategory_"',
        '"keyTypeCategory_"',
        "`bindsetSection_${bindsetName}${SUFFIX}`",
        'const MODE_KEY = "keyViewMode"',
      ],
      "components/services/FileSystemService.js": [
        'const DB_NAME = "sto-sync-handles"',
        'const STORE_NAME = "directories"',
        'export const KEY_SYNC_FOLDER = "sync-folder"',
        'const KEY_SYNC_FOLDER_TRANSITION = "sync-folder-transition-pending"',
        "const SYNC_FOLDER_TRANSITION_MARKER = true",
      ],
      "components/storage/LocalStorageVisitedStatePersistence.js": [
        'const VISITED_KEY = "sto_keybind_manager_visited"',
      ],
      "components/storage/LocalStorageDevelopmentFlagPersistence.js": [
        'this.#storage.getItem("dev-mode") === "true"',
      ],
    };

    for (const [fileName, snippets] of Object.entries(snippetsByFile)) {
      const source = readFileSync(join(sourceRoot, fileName), "utf8");
      for (const snippet of snippets)
        expect(source, fileName).toContain(snippet);
    }
  });
});
