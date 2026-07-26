import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const source = (relativePath) =>
  readFileSync(join(process.cwd(), "src/js", relativePath), "utf8");

describe("preferences startup architecture ratchets", () => {
  it("keeps AutoSync on accepted cached state without a storage dependency", () => {
    const autoSync = source("components/services/AutoSync.js");

    expect(autoSync).not.toMatch(/\bthis\.storage\b/);
    expect(autoSync).not.toMatch(/\bgetSettings\s*\(/);
    expect(autoSync).toContain("this.cache.preferences");
    expect(autoSync).toContain("onPreferencesStateAccepted");
  });

  it("keeps PreferencesUI state reads off retired startup RPCs", () => {
    const preferencesUI = source("components/ui/PreferencesUI.js");

    expect(preferencesUI).not.toContain('"preferences:init"');
    expect(preferencesUI).not.toContain('"preferences:load-settings"');
    expect(preferencesUI).toContain("this.cache.preferences");
  });

  it("keeps main bootstrap out of Preferences storage and activation work", () => {
    const main = source("main.js");

    expect(main).not.toMatch(/storageService\.getSettings\s*\(/);
    expect(main).not.toMatch(/i18next\.changeLanguage\s*\(/);
    expect(main).not.toMatch(/\blocalizeCommands\s*\(/);
    expect(main).toContain("applyTranslations,");
  });

  it("keeps the owner free of ambient translation reads and startup responders", () => {
    const preferences = source("components/services/PreferencesService.js");

    expect(preferences).not.toMatch(/window\.applyTranslations/);
    expect(preferences).not.toContain('"preferences:init"');
    expect(preferences).not.toContain('"preferences:load-settings"');
  });

  it("keeps serialized owner mutation operations behind the Preferences facade", () => {
    const preferences = source("components/services/PreferencesService.js");
    const operations = source(
      "components/services/preferencesOwnerMutationOperations.js",
    );

    expect(preferences).toContain("commitPreferenceSetting(this, key, value)");
    expect(preferences).toContain(
      "replacePreferenceSettings(this, newSettings)",
    );
    expect(preferences).toContain(
      "persistSyncFolderPreferenceSettings(this, mutation)",
    );
    expect(preferences).toContain("activatePersistedPreferences(this, source)");
    expect(preferences).not.toContain("this._enqueueMutation(async");
    expect(operations).toContain("owner._enqueueMutation(async");
    expect(operations).toContain("owner.persistSettings(prepared.settings)");
    expect(operations).toContain("publishPreferencesTransitionReceipts(");
  });
});
