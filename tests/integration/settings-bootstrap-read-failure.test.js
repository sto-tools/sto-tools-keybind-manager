import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Collect the real composition dependency graph with the test module. Main's
// side-effectful bootstrap itself is imported afresh inside each test below.
import "../../src/js/app.js";
import { createLocalStorageFixture } from "../fixtures/core/storage.js";
import { createPreferencesState } from "../fixtures/core/componentState.js";

const legacyRoot =
  '{ "version": "legacy", "profiles": {}, "settings": { "language": "de", "theme": "dark" } }';
const legacyBackup = '{ "data": "exact previous root", "version": "legacy" }';

describe("real settings bootstrap failure barrier", () => {
  let storageFixture;
  let eventBus;
  let preferencesInit;
  let previousDevMonitor;

  beforeEach(() => {
    vi.resetModules();
    previousDevMonitor = Object.getOwnPropertyDescriptor(window, "devMonitor");
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(document, "readyState", "get").mockReturnValue("complete");
    vi.spyOn(navigator, "language", "get").mockReturnValue("fr-CA");
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["fr-CA"]);
    storageFixture = createLocalStorageFixture({
      initialData: {
        sto_keybind_manager: legacyRoot,
        sto_keybind_manager_backup: legacyBackup,
      },
    });
  });

  afterEach(() => {
    for (const owner of preferencesInit?.mock.contexts ?? []) {
      if (!owner.destroyed) owner.destroy();
    }
    eventBus?.clear();
    storageFixture?.destroy();
    if (previousDevMonitor) {
      Object.defineProperty(window, "devMonitor", previousDevMonitor);
    } else {
      delete window.devMonitor;
    }
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it.each([
    ["capability getter", 0, "storage_read_failed", 0],
    ["initial read", 1, "storage_read_failed", 0],
    ["replacement readback", 2, "verification_failed", 1],
    ["replacement write", -1, "verification_failed", 1],
    ["replacement readback mismatch", -2, "verification_failed", 1],
  ])(
    "stops real composition after the settings %s fails",
    async (_label, throwOnRead, blockReason, expectedWrites) => {
      const [
        busModule,
        preferencesModule,
        repositoryModule,
        storageModule,
        coordinatorModule,
        appModule,
      ] = await Promise.all([
        import("../../src/js/core/eventBus.js"),
        import("../../src/js/components/services/PreferencesService.js"),
        import(
          "../../src/js/components/storage/LocalStorageSettingsRepository.js"
        ),
        import("../../src/js/components/services/StorageService.js"),
        import("../../src/js/components/services/DataCoordinator.js"),
        import("../../src/js/app.js"),
      ]);
      eventBus = busModule.default;
      eventBus.clear();
      const publications = [];
      eventBus.on("preferences:state-changed", (publication) =>
        publications.push(publication),
      );
      const success = vi.fn();
      for (const topic of [
        "preferences:loaded",
        "preferences:saved",
        "preferences:changed",
      ]) {
        eventBus.on(topic, success);
      }
      const subscribe = vi.spyOn(eventBus, "on");
      preferencesInit = vi.spyOn(preferencesModule.default.prototype, "init");
      const preferencesDestroy = vi.spyOn(
        preferencesModule.default.prototype,
        "destroy",
      );
      const load = vi.spyOn(repositoryModule.default.prototype, "load");
      const replace = vi.spyOn(repositoryModule.default.prototype, "replace");
      const storageInit = vi.spyOn(storageModule.default.prototype, "init");
      const coordinatorInit = vi.spyOn(
        coordinatorModule.default.prototype,
        "init",
      );
      const appInit = vi.spyOn(appModule.default.prototype, "init");
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const browserStorage = storageFixture.localStorage;
      const read = browserStorage.getItem.bind(browserStorage);
      let settingsReads = 0;
      vi.spyOn(browserStorage, "getItem").mockImplementation((key) => {
        if (key === "sto_keybind_settings") {
          settingsReads += 1;
          if (settingsReads === throwOnRead) {
            throw new DOMException(
              "standalone storage inaccessible",
              "SecurityError",
            );
          }
          if (throwOnRead === -2 && settingsReads === 2) return "{}";
        }
        return read(key);
      });
      const write = vi.spyOn(browserStorage, "setItem");
      if (throwOnRead === -1) {
        write.mockImplementation(() => {
          throw new DOMException(
            "standalone quota exceeded",
            "QuotaExceededError",
          );
        });
      }
      const remove = vi.spyOn(browserStorage, "removeItem");
      if (throwOnRead === 0) {
        Object.defineProperty(globalThis, "localStorage", {
          configurable: true,
          get() {
            throw new DOMException(
              "browser storage capability inaccessible",
              "SecurityError",
            );
          },
        });
      }

      await import("../../src/js/main.js");
      await vi.waitFor(() => {
        expect(consoleError).toHaveBeenCalledWith(
          "Preferences initialization failed:",
          expect.objectContaining({ message: blockReason }),
        );
        expect(preferencesDestroy).toHaveBeenCalledOnce();
      });

      expect(preferencesInit).toHaveBeenCalledOnce();
      const defaults = createPreferencesState({ language: "fr" }).settings;
      expect(publications).toEqual([
        {
          reason: "startup-blocked",
          state: {
            authorityEpoch: 1,
            ready: false,
            blocked: true,
            readiness: "blocked",
            durability: "unverified",
            blockReason,
            revision: 0,
            settings: defaults,
          },
        },
      ]);
      expect(success).not.toHaveBeenCalled();
      expect(
        subscribe.mock.calls.filter(([topic]) =>
          topic.startsWith("rpc:preferences:"),
        ),
      ).toEqual([]);
      expect(eventBus.hasListeners("rpc:preferences:set-setting")).toBe(false);
      expect(load).toHaveBeenCalledOnce();
      expect(replace).toHaveBeenCalledTimes(expectedWrites);
      expect(write).toHaveBeenCalledTimes(expectedWrites);
      expect(remove).not.toHaveBeenCalled();
      if (expectedWrites === 0) {
        expect(read("sto_keybind_settings")).toBeNull();
        expect(load.mock.results[0].value).toEqual({
          status: "read_failed",
          error: "storage_read_failed",
          category: "security",
        });
      } else if (throwOnRead === -1) {
        expect(read("sto_keybind_settings")).toBeNull();
        expect(replace.mock.results[0].value).toMatchObject({
          status: "write_failed",
          write: { status: "indeterminate", category: "quota" },
          verification: { status: "not_attempted" },
        });
      } else {
        expect(replace).toHaveBeenCalledWith(defaults);
        expect(read("sto_keybind_settings")).toBe(JSON.stringify(defaults));
        expect(replace.mock.results[0].value).toMatchObject({
          status: "verification_failed",
          write: { status: "acknowledged" },
        });
        expect(write).toHaveBeenCalledWith(
          "sto_keybind_settings",
          JSON.stringify(defaults),
        );
      }
      expect(read("sto_keybind_manager")).toBe(legacyRoot);
      expect(read("sto_keybind_manager_backup")).toBe(legacyBackup);
      expect(storageInit).not.toHaveBeenCalled();
      expect(coordinatorInit).not.toHaveBeenCalled();
      expect(appInit).not.toHaveBeenCalled();
    },
  );
});
