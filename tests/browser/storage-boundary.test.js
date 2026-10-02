import { runtime } from "../fixtures/ui/applicationRuntime.js";
import { describe, expect, it, vi } from "vitest";

import { request } from "../../src/js/core/requestResponse.js";
import { readPreferencesState } from "../fixtures/ui/preferencesState.js";
import {
  PROJECT_BACKUP_KEY,
  PROJECT_ROOT_KEY,
} from "../fixtures/ui/projectStorage.js";

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
  it("uses the sole settings owner and the sole project adapter in production composition", async () => {
    const app = runtime();
    const { dataCoordinator: coordinator, eventBus: bus } = app;
    expect(app).not.toHaveProperty("storageService");
    expect(app).not.toHaveProperty("projectRepository");
    expect(coordinator.getCurrentState().ready).toBe(true);
    expect(
      JSON.parse(localStorage.getItem(PROJECT_ROOT_KEY)),
    ).not.toHaveProperty("settings");
    expect(coordinator.projectRepository).not.toHaveProperty(
      "createSchemaMigrationPort",
    );
    const beforePreferences = await readPreferencesState(bus);
    const beforeProfileId = coordinator.getCurrentState().currentProfile;
    expect(beforeProfileId).toBeTruthy();
    const beforeRoot = localStorage.getItem(PROJECT_ROOT_KEY);
    const beforeSettings = localStorage.getItem("sto_keybind_settings");
    const beforeBackup = localStorage.getItem(PROJECT_BACKUP_KEY);
    const keys = [
      PROJECT_ROOT_KEY,
      "sto_keybind_settings",
      PROJECT_BACKUP_KEY,
      "sto_app_reset",
    ];
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
      expect(canonicalWrites()).toEqual(["sto_keybind_settings"]);
      expect(removeItem).not.toHaveBeenCalled();
      expect(clear).not.toHaveBeenCalled();
      expect((await readPreferencesState(bus)).settings.theme).toBe(nextTheme);

      setItem.mockClear();
      removeItem.mockClear();
      clear.mockClear();

      await request(bus, "data:update-profile", {
        profileId: beforeProfileId,
        properties: { description: "Tranche 2 checked-bundle writer probe" },
      });
      expect(canonicalWrites()).toEqual([PROJECT_BACKUP_KEY, PROJECT_ROOT_KEY]);
      expect(removeItem).not.toHaveBeenCalled();
      expect(clear).not.toHaveBeenCalled();
      expect(
        coordinator.getCurrentState().profiles[beforeProfileId].description,
      ).toBe("Tranche 2 checked-bundle writer probe");
    } finally {
      setItem.mockRestore();
      removeItem.mockRestore();
      clear.mockRestore();
      await request(bus, "preferences:set-setting", {
        key: "theme",
        value: beforePreferences.settings.theme,
      });
      for (const [key, value] of [
        [PROJECT_ROOT_KEY, beforeRoot],
        ["sto_keybind_settings", beforeSettings],
      ]) {
        if (value === null) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
      }
      await request(bus, "data:reload-state");
      if (beforeBackup === null) localStorage.removeItem(PROJECT_BACKUP_KEY);
      else localStorage.setItem(PROJECT_BACKUP_KEY, beforeBackup);
    }
  });

  it("keeps the preference owner unchanged when the checked bundle cannot persist", async () => {
    const bus = runtime().eventBus;
    expect(bus?.hasListeners("rpc:preferences:set-setting")).toBe(true);
    if (!bus) return;

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

  it("keeps accepted preferences unchanged after an acknowledged write fails readback", async () => {
    const { eventBus: bus } = runtime();
    const beforeState = await readPreferencesState(bus);
    const beforeRaw = localStorage.getItem("sto_keybind_settings");
    const beforeRoot = localStorage.getItem(PROJECT_ROOT_KEY);
    const beforeBackup = localStorage.getItem(PROJECT_BACKUP_KEY);
    const success = vi.fn();
    const detach = ["saved", "changed", "state-changed"].map((event) =>
      bus.on(`preferences:${event}`, success),
    );
    const originalGetItem = Storage.prototype.getItem;
    const read = (key) => originalGetItem.call(localStorage, key);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const getItem = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(function (key) {
        if (key === "sto_keybind_settings") {
          throw new DOMException("readback failed", "SecurityError");
        }
        return originalGetItem.call(this, key);
      });

    try {
      const autoSave = !beforeState.settings.autoSave;
      await expect(
        request(bus, "preferences:set-setting", {
          key: "autoSave",
          value: autoSave,
        }),
      ).resolves.toBe(false);
      expect(
        setItem.mock.calls.filter(([key]) => key === "sto_keybind_settings"),
      ).toHaveLength(1);
      expect(JSON.parse(read("sto_keybind_settings"))).toEqual({
        ...beforeState.settings,
        autoSave,
      });
      expect(await readPreferencesState(bus)).toEqual(beforeState);
      expect(success).not.toHaveBeenCalled();
      expect(read(PROJECT_ROOT_KEY)).toBe(beforeRoot);
      expect(read(PROJECT_BACKUP_KEY)).toBe(beforeBackup);
    } finally {
      getItem.mockRestore();
      setItem.mockRestore();
      error.mockRestore();
      for (const stop of detach) stop();
      if (beforeRaw === null) localStorage.removeItem("sto_keybind_settings");
      else localStorage.setItem("sto_keybind_settings", beforeRaw);
    }
  });

  it("does not publish sync-folder success when the checked bundle cannot persist its settings", async () => {
    const bus = runtime().eventBus;
    expect(bus?.hasListeners("rpc:sync:select-folder")).toBe(true);
    expect(
      bus?.hasListeners("rpc:preferences:persist-sync-folder-settings"),
    ).toBe(true);
    if (!bus) return;

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
    const coordinator = runtime().dataCoordinator;
    const bus = runtime().eventBus;
    expect(coordinator?.getCurrentState?.().ready).toBe(true);
    expect(bus?.hasListeners("rpc:data:reload-state")).toBe(true);
    if (!coordinator || !bus) return;

    const beforeRoot = localStorage.getItem(PROJECT_ROOT_KEY);
    const beforeSettings = localStorage.getItem("sto_keybind_settings");
    const beforeBackup = localStorage.getItem(PROJECT_BACKUP_KEY);
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
      };
      localStorage.setItem(PROJECT_ROOT_KEY, JSON.stringify(legacyRoot));

      await request(bus, "data:reload-state");
      const migrated = JSON.parse(localStorage.getItem(PROJECT_ROOT_KEY));
      expect(migrated).toMatchObject({
        currentProfile: "legacy-browser",
        profiles: {
          "legacy-browser": {
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
          "current-browser": {
            migrationVersion: "2.1.1",
            lastModified: "2001-02-03T04:05:06.000Z",
            builds: {
              space: { keys: { F1: ["TrayExecByTray 1 3 4"] } },
            },
          },
        },
      });
      const migrationBackup = JSON.parse(
        localStorage.getItem(PROJECT_BACKUP_KEY),
      );
      expect(migrationBackup).toMatchObject({
        data: JSON.stringify(legacyRoot),
      });
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
      const backup = JSON.parse(localStorage.getItem(PROJECT_BACKUP_KEY));
      const durable = JSON.parse(localStorage.getItem(PROJECT_ROOT_KEY));
      expect(durable).not.toHaveProperty("settings");
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
      if (beforeRoot === null) localStorage.removeItem(PROJECT_ROOT_KEY);
      else localStorage.setItem(PROJECT_ROOT_KEY, beforeRoot);
      if (beforeSettings === null) {
        localStorage.removeItem("sto_keybind_settings");
      } else {
        localStorage.setItem("sto_keybind_settings", beforeSettings);
      }
      if (beforeBackup === null) localStorage.removeItem(PROJECT_BACKUP_KEY);
      else localStorage.setItem(PROJECT_BACKUP_KEY, beforeBackup);
      await request(bus, "data:reload-state");
    }
  });
});
