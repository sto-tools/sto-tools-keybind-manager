import { describe, expect, it, vi } from "vitest";

import { request } from "../../src/js/core/requestResponse.js";

describe("Persisted storage browser boundary", () => {
  it("validates and durably adopts roots and settings through the checked-in owner chain", async () => {
    const storage = window.storageService;
    const coordinator = window.dataCoordinator;
    const bus = window.eventBus;
    expect(storage).toBeTruthy();
    expect(coordinator?.getCurrentState?.().ready).toBe(true);
    expect(bus?.hasListeners("rpc:data:reload-state")).toBe(true);
    if (!storage || !coordinator || !bus) return;

    const beforeRoot = localStorage.getItem(storage.storageKey);
    const beforeSettings = localStorage.getItem(storage.settingsKey);
    const beforeBackup = localStorage.getItem(storage.backupKey);
    try {
      const legacyRoot = {
        version: "0.7.0",
        currentProfile: "legacy-browser",
        profiles: {
          "legacy-browser": {
            name: "Legacy browser profile",
            mode: "Ground Mode",
            keys: { G: "Sprint" },
            aliases: {},
            bindsets: {
              Alternate: { ground: { keys: { H: ["Aim"] } } },
            },
            selections: { ground: "G" },
            extension: { retained: true },
          },
        },
        globalAliases: {},
        settings: { language: "fr" },
      };
      localStorage.setItem(storage.storageKey, JSON.stringify(legacyRoot));

      const migrated = storage.getAllData(true);
      expect(migrated).toMatchObject({
        currentProfile: "legacy-browser",
        profiles: {
          "legacy-browser": {
            builds: { ground: { keys: { G: ["Sprint"] } } },
            bindsets: {
              Alternate: { ground: { keys: { H: ["Aim"] } } },
            },
            selections: { ground: "G" },
            extension: { retained: true },
          },
        },
      });
      expect(storage.saveAllData(migrated)).toBe(true);
      const migrationBackup = JSON.parse(
        localStorage.getItem(storage.backupKey),
      );
      expect(migrationBackup).toMatchObject({
        data: JSON.stringify(legacyRoot),
      });
      await request(bus, "data:reload-state");
      await vi.waitFor(() => {
        expect(coordinator.getCurrentState()).toMatchObject({
          ready: true,
          currentProfile: "legacy-browser",
          currentEnvironment: "ground",
          currentProfileData: {
            id: "legacy-browser",
            migrationVersion: "2.1.1",
            builds: { ground: { keys: { G: ["Sprint"] } } },
            bindsets: {
              Alternate: { ground: { keys: { H: ["Aim"] } } },
            },
            selections: { ground: "G" },
            extension: { retained: true },
          },
        });
      });
      const backup = JSON.parse(localStorage.getItem(storage.backupKey));
      const durable = JSON.parse(localStorage.getItem(storage.storageKey));
      expect(durable.lastBackup).toBe(backup.timestamp);
      expect(durable.profiles["legacy-browser"]).toEqual(
        coordinator.getCurrentState().profiles["legacy-browser"],
      );

      const unsafeRoot = JSON.parse(
        '{"version":"1.0.0","currentProfile":null,"profiles":{},"globalAliases":{},"settings":{},"extension":{"constructor":{"polluted":true}}}',
      );
      const unsafeRaw = JSON.stringify(unsafeRoot);
      localStorage.setItem(storage.storageKey, unsafeRaw);
      expect(storage.getAllData(true)).toMatchObject({
        currentProfile: null,
        profiles: {},
      });
      expect(localStorage.getItem(storage.storageKey)).toBe(unsafeRaw);
      expect({}.polluted).toBeUndefined();

      const unsafeSettingsRaw =
        '{"theme":42,"language":"de","plugin:layout":{"density":"compact"},"plugin:unsafe":{"prototype":true}}';
      localStorage.setItem(storage.settingsKey, unsafeSettingsRaw);
      const settings = storage.getSettings();
      expect(settings).toMatchObject({
        theme: "default",
        language: "de",
        "plugin:layout": { density: "compact" },
      });
      expect(settings).not.toHaveProperty("plugin:unsafe");
      const pluginLayout = /** @type {{ density: string }} */ (
        settings["plugin:layout"]
      );
      pluginLayout.density = "mutated";
      expect(storage.getSettings()["plugin:layout"]).toEqual({
        density: "compact",
      });
      expect(localStorage.getItem(storage.settingsKey)).toBe(unsafeSettingsRaw);
    } finally {
      if (beforeRoot === null) localStorage.removeItem(storage.storageKey);
      else localStorage.setItem(storage.storageKey, beforeRoot);
      if (beforeSettings === null) {
        localStorage.removeItem(storage.settingsKey);
      } else {
        localStorage.setItem(storage.settingsKey, beforeSettings);
      }
      if (beforeBackup === null) localStorage.removeItem(storage.backupKey);
      else localStorage.setItem(storage.backupKey, beforeBackup);
      storage.getAllData(true);
      await request(bus, "data:reload-state");
    }
  });
});
