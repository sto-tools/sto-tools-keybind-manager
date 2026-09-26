import { runtime } from "../fixtures/ui/applicationRuntime.js";
import { describe, expect, it, vi } from "vitest";

import { request } from "../../src/js/core/requestResponse.js";
import { readPreferencesState } from "../fixtures/ui/preferencesState.js";

function createSyncDirectoryHandle(name) {
  return {
    kind: "directory",
    name,
    getDirectoryHandle: vi.fn(),
    getFileHandle: vi
      .fn()
      .mockRejectedValue(new DOMException("not found", "NotFoundError")),
    queryPermission: vi.fn().mockResolvedValue("granted"),
    requestPermission: vi.fn().mockResolvedValue("granted"),
  };
}

describe("Persisted storage browser boundary", () => {
  it("uses the sole settings owner and keeps legacy project writes separate in production composition", async () => {
    const {
      storageService: storage,
      dataCoordinator: coordinator,
      eventBus: bus,
    } = runtime();
    expect(coordinator.getCurrentState().ready).toBe(true);
    const beforePreferences = await readPreferencesState(bus);
    const beforeProfileId = coordinator.getCurrentState().currentProfile;
    expect(beforeProfileId).toBeTruthy();
    const beforeRoot = localStorage.getItem(storage.storageKey);
    const beforeSettings = localStorage.getItem("sto_keybind_settings");
    const beforeBackup = localStorage.getItem(storage.backupKey);
    const keys = [
      storage.storageKey,
      "sto_keybind_settings",
      storage.backupKey,
      "sto_app_reset",
    ];
    expect(storage).not.toHaveProperty("saveSettings");
    expect(storage).not.toHaveProperty("getSettings");
    expect(storage).not.toHaveProperty("clearSettings");
    const saveAllData = vi.spyOn(storage, "saveAllData");
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const removeItem = vi.spyOn(Storage.prototype, "removeItem");
    const clear = vi.spyOn(Storage.prototype, "clear");
    const canonicalWrites = () =>
      setItem.mock.calls
        .filter(([key]) => keys.includes(key))
        .map(([key]) => key);

    try {
      const nextTheme =
        beforePreferences.settings.theme === "dark" ? "default" : "dark";
      await expect(
        request(bus, "preferences:set-setting", {
          key: "theme",
          value: nextTheme,
        }),
      ).resolves.toBe(true);
      expect(saveAllData).not.toHaveBeenCalled();
      expect(canonicalWrites()).toEqual(["sto_keybind_settings"]);
      expect(removeItem).not.toHaveBeenCalled();
      expect(clear).not.toHaveBeenCalled();
      expect((await readPreferencesState(bus)).settings.theme).toBe(nextTheme);

      saveAllData.mockClear();
      setItem.mockClear();
      removeItem.mockClear();
      clear.mockClear();

      await request(bus, "data:update-profile", {
        profileId: beforeProfileId,
        properties: { description: "Tranche 2 checked-bundle writer probe" },
      });
      expect(saveAllData).toHaveBeenCalledTimes(1);
      expect(canonicalWrites()).toEqual([
        storage.backupKey,
        storage.storageKey,
      ]);
      expect(removeItem).not.toHaveBeenCalled();
      expect(clear).not.toHaveBeenCalled();
      expect(
        coordinator.getCurrentState().profiles[beforeProfileId].description,
      ).toBe("Tranche 2 checked-bundle writer probe");
    } finally {
      saveAllData.mockRestore();
      setItem.mockRestore();
      removeItem.mockRestore();
      clear.mockRestore();
      await request(bus, "preferences:set-setting", {
        key: "theme",
        value: beforePreferences.settings.theme,
      });
      for (const [key, value] of [
        [storage.storageKey, beforeRoot],
        ["sto_keybind_settings", beforeSettings],
      ]) {
        if (value === null) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
      }
      storage.getAllData(true);
      await request(bus, "data:reload-state");
      if (beforeBackup === null) localStorage.removeItem(storage.backupKey);
      else localStorage.setItem(storage.backupKey, beforeBackup);
    }
  });

  it("keeps the preference owner unchanged when the checked bundle cannot persist", async () => {
    const storage = runtime().storageService;
    const bus = runtime().eventBus;
    expect(storage).toBeTruthy();
    expect(bus?.hasListeners("rpc:preferences:set-setting")).toBe(true);
    if (!storage || !bus) return;

    const beforeRaw = localStorage.getItem("sto_keybind_settings");
    const beforeState = await readPreferencesState(bus);
    const saved = [];
    const changed = [];
    const detachSaved = bus.on("preferences:saved", (payload) =>
      saved.push(payload),
    );
    const detachChanged = bus.on("preferences:changed", (payload) =>
      changed.push(payload),
    );
    const originalSetItem = Storage.prototype.setItem;
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(function (key, value) {
        if (key === "sto_keybind_settings") {
          throw new DOMException(
            "Storage quota exceeded",
            "QuotaExceededError",
          );
        }
        return originalSetItem.call(this, key, value);
      });

    try {
      const nextTheme =
        beforeState.settings.theme === "dark" ? "default" : "dark";
      await expect(
        request(bus, "preferences:set-setting", {
          key: "theme",
          value: nextTheme,
        }),
      ).resolves.toBe(false);

      expect(await readPreferencesState(bus)).toEqual(beforeState);
      expect(localStorage.getItem("sto_keybind_settings")).toBe(beforeRaw);
      expect(saved).toHaveLength(0);
      expect(changed).toHaveLength(0);
    } finally {
      setItem.mockRestore();
      error.mockRestore();
      detachSaved();
      detachChanged();
    }
  });

  it("does not publish sync-folder success when the checked bundle cannot persist its settings", async () => {
    const storage = runtime().storageService;
    const bus = runtime().eventBus;
    expect(storage).toBeTruthy();
    expect(bus?.hasListeners("rpc:sync:select-folder")).toBe(true);
    expect(
      bus?.hasListeners("rpc:preferences:persist-sync-folder-settings"),
    ).toBe(true);
    if (!storage || !bus) return;

    const beforeRaw = localStorage.getItem("sto_keybind_settings");
    const beforeState = await readPreferencesState(bus);
    const folderSet = [];
    const toasts = [];
    const stateChanges = [];
    const saved = [];
    const changed = [];
    const detachFolderSet = bus.on("sync:folder-set", (payload) =>
      folderSet.push(payload),
    );
    const detachToast = bus.on("toast:show", (payload) => toasts.push(payload));
    const detachState = bus.on("preferences:state-changed", (payload) =>
      stateChanges.push(payload),
    );
    const detachSaved = bus.on("preferences:saved", (payload) =>
      saved.push(payload),
    );
    const detachChanged = bus.on("preferences:changed", (payload) =>
      changed.push(payload),
    );
    const handle = createSyncDirectoryHandle("Quota Folder");
    const pickerDescriptor = Object.getOwnPropertyDescriptor(
      window,
      "showDirectoryPicker",
    );
    const picker = vi.fn().mockResolvedValue(handle);
    Object.defineProperty(window, "showDirectoryPicker", {
      configurable: true,
      value: picker,
    });
    const originalSetItem = Storage.prototype.setItem;
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(function (key, value) {
        if (key === "sto_keybind_settings") {
          throw new DOMException(
            "Storage quota exceeded",
            "QuotaExceededError",
          );
        }
        return originalSetItem.call(this, key, value);
      });

    try {
      await expect(
        request(bus, "sync:select-folder", { autoSync: true }, 0),
      ).resolves.toEqual({ success: false });

      expect(picker).toHaveBeenCalledOnce();
      expect(await readPreferencesState(bus)).toEqual(beforeState);
      expect(localStorage.getItem("sto_keybind_settings")).toBe(beforeRaw);
      expect(stateChanges).toHaveLength(0);
      expect(saved).toHaveLength(0);
      expect(changed).toHaveLength(0);
      expect(folderSet).toHaveLength(0);
      expect(toasts.filter(({ type }) => type === "success")).toHaveLength(0);
    } finally {
      setItem.mockRestore();
      error.mockRestore();
      detachFolderSet();
      detachToast();
      detachState();
      detachSaved();
      detachChanged();
      if (pickerDescriptor) {
        Object.defineProperty(window, "showDirectoryPicker", pickerDescriptor);
      } else {
        delete window.showDirectoryPicker;
      }
    }
  });

  it("waits for saved consumers before resolving a checked-bundle mutation", async () => {
    const bus = runtime().eventBus;
    expect(bus?.hasListeners("rpc:preferences:set-setting")).toBe(true);
    if (!bus) return;

    const beforeState = await readPreferencesState(bus);
    const beforeTheme = beforeState.settings.theme;
    const nextTheme = beforeTheme === "dark" ? "default" : "dark";
    /** @type {() => void} */
    let releaseSavedConsumer = () => {};
    const savedConsumerReleased = new Promise((resolve) => {
      releaseSavedConsumer = resolve;
    });
    let savedConsumerStarted = false;
    const detachSaved = bus.on("preferences:saved", async () => {
      savedConsumerStarted = true;
      await savedConsumerReleased;
    });
    const mutation = request(bus, "preferences:set-setting", {
      key: "theme",
      value: nextTheme,
    });
    let settled = false;
    void mutation.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );

    try {
      await vi.waitFor(() => {
        expect(savedConsumerStarted).toBe(true);
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(settled).toBe(false);
      expect((await readPreferencesState(bus)).settings.theme).toBe(nextTheme);

      releaseSavedConsumer();
      await expect(mutation).resolves.toBe(true);
    } finally {
      detachSaved();
      releaseSavedConsumer();
      await mutation.catch(() => undefined);
      const currentTheme = (await readPreferencesState(bus)).settings.theme;
      if (currentTheme !== beforeTheme) {
        await request(bus, "preferences:set-setting", {
          key: "theme",
          value: beforeTheme,
        });
      }
    }
  });

  it("validates and durably adopts roots and settings through the checked-in owner chain", async () => {
    const storage = runtime().storageService;
    const coordinator = runtime().dataCoordinator;
    const bus = runtime().eventBus;
    expect(storage).toBeTruthy();
    expect(coordinator?.getCurrentState?.().ready).toBe(true);
    expect(bus?.hasListeners("rpc:data:reload-state")).toBe(true);
    if (!storage || !coordinator || !bus) return;

    const beforeRoot = localStorage.getItem(storage.storageKey);
    const beforeSettings = localStorage.getItem("sto_keybind_settings");
    const beforeBackup = localStorage.getItem(storage.backupKey);
    try {
      const legacyRoot = {
        version: "0.7.0",
        currentProfile: "legacy-browser",
        profiles: {
          "legacy-browser": {
            name: "Legacy browser profile",
            mode: "Ground Mode",
            keys: { G: ["TrayExecByTray 1 1 2"] },
            aliases: {
              LegacyTray: { commands: ["TrayExecByTray 1 1 2"] },
            },
            bindsets: {
              Alternate: {
                ground: { keys: { H: ["TrayExecByTray 1 1 2"] } },
              },
            },
            selections: { ground: "G" },
            extension: { retained: true },
          },
          "current-browser": {
            name: "Already current browser profile",
            currentEnvironment: "space",
            builds: {
              space: { keys: { F1: ["TrayExecByTray 1 3 4"] } },
              ground: { keys: {} },
            },
            aliases: {},
            bindsets: {},
            migrationVersion: "2.1.1",
            lastModified: "2001-02-03T04:05:06.000Z",
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
            builds: {
              ground: { keys: { G: ["TrayExecByTray 1 1 2"] } },
            },
            aliases: {
              LegacyTray: { commands: ["TrayExecByTray 1 1 2"] },
            },
            bindsets: {
              Alternate: {
                ground: { keys: { H: ["TrayExecByTray 1 1 2"] } },
              },
            },
            selections: { ground: "G" },
            extension: { retained: true },
          },
          "current-browser": {
            migrationVersion: "2.1.1",
            lastModified: "2001-02-03T04:05:06.000Z",
            builds: {
              space: { keys: { F1: ["TrayExecByTray 1 3 4"] } },
            },
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
            builds: {
              ground: { keys: { G: ["+TrayExecByTray 1 2"] } },
            },
            aliases: {
              LegacyTray: { commands: ["+TrayExecByTray 1 2"] },
            },
            bindsets: {
              Alternate: {
                ground: { keys: { H: ["TrayExecByTray 1 1 2"] } },
              },
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
      expect(coordinator.getCurrentState().profiles["current-browser"]).toEqual(
        expect.objectContaining({
          migrationVersion: "2.1.1",
          lastModified: "2001-02-03T04:05:06.000Z",
          builds: {
            space: { keys: { F1: ["TrayExecByTray 1 3 4"] } },
            ground: { keys: {} },
          },
        }),
      );
      expect(durable.profiles["current-browser"]).toEqual(
        coordinator.getCurrentState().profiles["current-browser"],
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
      localStorage.setItem("sto_keybind_settings", unsafeSettingsRaw);
      const accepted = await readPreferencesState(bus);
      await expect(
        request(bus, "preferences:set-settings", JSON.parse(unsafeSettingsRaw)),
      ).rejects.toThrow("Invalid preferences settings payload");
      expect(await readPreferencesState(bus)).toEqual(accepted);
      accepted.settings.theme = "consumer-mutation";
      expect((await readPreferencesState(bus)).settings.theme).not.toBe(
        "consumer-mutation",
      );
      expect(localStorage.getItem("sto_keybind_settings")).toBe(
        unsafeSettingsRaw,
      );
      // Startup repair is exercised through the real repository/owner chain in
      // settings-repository-owner-chain.test.js, not a removed storage getter.
    } finally {
      if (beforeRoot === null) localStorage.removeItem(storage.storageKey);
      else localStorage.setItem(storage.storageKey, beforeRoot);
      if (beforeSettings === null) {
        localStorage.removeItem("sto_keybind_settings");
      } else {
        localStorage.setItem("sto_keybind_settings", beforeSettings);
      }
      if (beforeBackup === null) localStorage.removeItem(storage.backupKey);
      else localStorage.setItem(storage.backupKey, beforeBackup);
      storage.getAllData(true);
      await request(bus, "data:reload-state");
    }
  });
});
