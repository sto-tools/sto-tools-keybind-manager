import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import AutoSync from "../../../src/js/components/services/AutoSync.js";
import ComponentBase from "../../../src/js/components/ComponentBase.js";
import {
  createDataCoordinatorState,
  createPreferencesState,
} from "../../fixtures/core/componentState.js";
import { createServiceFixture } from "../../fixtures/index.js";

function createMockSyncManager() {
  return { syncProject: vi.fn().mockResolvedValue({ success: true }) };
}

const i18n = { t: (key) => key };

function projectState(revision, overrides = {}) {
  return createDataCoordinatorState({
    authorityEpoch: 1,
    revision,
    profiles: { captain: { name: `Captain ${revision}` } },
    ...overrides,
  });
}

describe("AutoSync", () => {
  let fixture, eventBus, syncManager, autoSync, services;

  beforeEach(() => {
    fixture = createServiceFixture();
    services = [];
    eventBus = fixture.eventBus;

    syncManager = createMockSyncManager();
    autoSync = new AutoSync({ eventBus, syncManager, i18n });
    services.push(autoSync);
    autoSync.init();
  });

  afterEach(() => {
    services.forEach((service) => {
      if (!service.destroyed) service.destroy();
    });
    vi.useRealTimers();
    fixture.destroy();
  });

  function publish(state, reason = "profile-updated") {
    eventBus.emit("data:state-changed", { reason, state });
  }

  it('enable("change") debounces accepted project changes for exactly 500ms', async () => {
    vi.useFakeTimers();
    autoSync.enable("change");
    publish(projectState(1), "initial-load");
    publish(projectState(2));
    vi.advanceTimersByTime(250);
    publish(projectState(3));
    vi.advanceTimersByTime(499);
    expect(syncManager.syncProject).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(syncManager.syncProject).toHaveBeenCalledTimes(1);
    expect(syncManager.syncProject).toHaveBeenCalledWith("auto");
  });

  it("does not sync initial state or read-only reload, but does sync a committed reload", () => {
    vi.useFakeTimers();
    autoSync.enable("change");
    const initial = projectState(1, {
      profiles: { captain: { name: "Captain", description: "Original" } },
    });
    publish(initial, "initial-load");
    // Different record ordering and a new revision do not represent a write.
    publish(
      projectState(2, {
        profiles: { captain: { description: "Original", name: "Captain" } },
      }),
      "state-reloaded",
    );
    vi.advanceTimersByTime(500);
    expect(syncManager.syncProject).not.toHaveBeenCalled();
    publish(
      projectState(3, {
        profiles: { captain: { name: "Imported", description: "Original" } },
      }),
      "state-reloaded",
    );
    vi.advanceTimersByTime(500);
    expect(syncManager.syncProject).toHaveBeenCalledOnce();
  });

  it.each([
    ["metadata", { metadata: { version: "1.0.0", lastModified: "committed" } }],
    ["current profile", { currentProfile: "captain" }],
    ["environment", { currentEnvironment: "ground" }],
  ])("syncs accepted %s changes", (_field, changed) => {
    vi.useFakeTimers();
    autoSync.enable("change");
    publish(projectState(1));
    publish(
      projectState(2, {
        profiles: { captain: { name: "Captain 1" } },
        ...changed,
      }),
    );
    vi.advanceTimersByTime(500);
    expect(syncManager.syncProject).toHaveBeenCalledOnce();
  });

  it("keeps malformed, duplicate, stale, and pre-ready data publications inert", () => {
    vi.useFakeTimers();
    autoSync.enable("change");
    publish(projectState(2));
    publish(projectState(2, { profiles: { captain: { name: "Duplicate" } } }));
    publish(projectState(1));
    publish(projectState(3, { authorityEpoch: 0 }));
    publish({ ...projectState(3), unexpected: true });
    publish(projectState(4, { ready: /** @type {any} */ ("true") }));
    publish(projectState(5, { profiles: /** @type {any} */ ([]) }));
    vi.advanceTimersByTime(500);
    expect(syncManager.syncProject).not.toHaveBeenCalled();
    publish(projectState(6, { authorityEpoch: 2, ready: false }));
    publish(projectState(7, { authorityEpoch: 2 }));
    vi.advanceTimersByTime(500);
    expect(syncManager.syncProject).not.toHaveBeenCalled();
    publish(projectState(8, { authorityEpoch: 2 }));
    vi.advanceTimersByTime(500);
    expect(syncManager.syncProject).toHaveBeenCalledOnce();
  });

  it("rejects consecutive cyclic inputs before comparison or baseline adoption", () => {
    vi.useFakeTimers();
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    autoSync.enable("change");
    publish(projectState(1));
    const baseline = autoSync._dataBaseline;
    const cycle = () => {
      const value = {};
      value.self = value;
      return value;
    };
    publish(
      projectState(2, {
        profiles: { captain: { name: "Captain 1", extension: cycle() } },
      }),
    );
    publish(
      projectState(3, {
        profiles: { captain: { name: "Captain 1", extension: cycle() } },
      }),
    );
    publish(projectState(4, { currentProfileData: { extension: cycle() } }));
    expect(errors).not.toHaveBeenCalled();
    expect(autoSync._dataBaseline).toBe(baseline);
    expect(autoSync._syncDebounceTimeout).toBeNull();
    vi.advanceTimersByTime(500);
    expect(syncManager.syncProject).not.toHaveBeenCalled();
    publish(projectState(5));
    vi.advanceTimersByTime(500);
    expect(syncManager.syncProject).toHaveBeenCalledOnce();
  });

  it.each([
    ["NaN", NaN],
    ["infinity", Infinity],
    ["undefined", undefined],
    ["date", new Date("2026-10-02T00:00:00.000Z")],
    ["map", new Map([["key", "value"]])],
    ["unsafe key", { constructor: "unsafe" }],
  ])(
    "keeps nested %s profile and current-projection values inert",
    (_description, value) => {
      vi.useFakeTimers();
      autoSync.enable("change");
      publish(projectState(1));
      const baseline = autoSync._dataBaseline;
      publish(
        projectState(2, {
          profiles: { captain: { name: "Captain 1", extension: value } },
        }),
      );
      publish(projectState(3, { currentProfileData: { extension: value } }));
      expect(autoSync._dataBaseline).toBe(baseline);
      expect(autoSync._syncDebounceTimeout).toBeNull();
      vi.advanceTimersByTime(500);
      expect(syncManager.syncProject).not.toHaveBeenCalled();
    },
  );

  it("uses replacement owner readiness as a fresh baseline and cancels predecessor work", () => {
    vi.useFakeTimers();
    autoSync.enable("change");
    publish(projectState(1));
    publish(projectState(2));
    expect(autoSync._syncDebounceTimeout).not.toBeNull();
    publish(projectState(0, { authorityEpoch: 2, ready: false }));
    expect(autoSync._syncDebounceTimeout).toBeNull();
    publish(projectState(1, { authorityEpoch: 2 }), "initial-load");
    publish(projectState(99, { authorityEpoch: 1 }));
    vi.advanceTimersByTime(500);
    expect(syncManager.syncProject).not.toHaveBeenCalled();
    publish(projectState(2, { authorityEpoch: 2 }));
    vi.advanceTimersByTime(500);
    expect(syncManager.syncProject).toHaveBeenCalledOnce();
  });

  it("tracks accepted state while disabled without replaying changes when enabled", () => {
    vi.useFakeTimers();
    publish(projectState(1));
    publish(projectState(2));
    autoSync.enable("change");
    publish(
      projectState(3, { profiles: { captain: { name: "Captain 2" } } }),
      "state-reloaded",
    );
    vi.advanceTimersByTime(500);
    expect(syncManager.syncProject).not.toHaveBeenCalled();
    publish(projectState(4));
    autoSync.disable();
    vi.advanceTimersByTime(500);
    expect(syncManager.syncProject).not.toHaveBeenCalled();
    expect(autoSync._syncDebounceTimeout).toBeNull();
  });

  it.each(["invalid", "0", "-1"])(
    "falls back from interval %s to change mode",
    (interval) => {
      vi.useFakeTimers();
      autoSync.enable(interval);
      expect(autoSync.interval).toBe("change");
      expect(autoSync._intervalId).toBeNull();
      publish(projectState(1));
      publish(projectState(2));
      vi.advanceTimersByTime(500);
      expect(syncManager.syncProject).toHaveBeenCalledOnce();
    },
  );

  it("retains numeric intervals and cancels their work on reconfiguration and teardown", () => {
    vi.useFakeTimers();
    autoSync.enable("2");
    publish(projectState(1));
    publish(projectState(2));
    vi.advanceTimersByTime(1999);
    expect(syncManager.syncProject).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(syncManager.syncProject).toHaveBeenCalledOnce();
    autoSync.enable("change");
    expect(autoSync._intervalId).toBeNull();
    vi.advanceTimersByTime(2000);
    expect(syncManager.syncProject).toHaveBeenCalledOnce();
    publish(projectState(3));
    autoSync.destroy();
    vi.advanceTimersByTime(2000);
    expect(syncManager.syncProject).toHaveBeenCalledOnce();
  });

  it("reconfigures from accepted preferences and preserves immediate preference sync", () => {
    vi.useFakeTimers();
    eventBus.emit("preferences:state-changed", {
      reason: "startup-loaded",
      state: createPreferencesState({ autoSync: true, autoSyncInterval: "2" }),
    });
    expect(autoSync.interval).toBe("2");
    eventBus.emit("preferences:state-changed", {
      reason: "settings-set",
      state: createPreferencesState(
        { autoSync: true, autoSyncInterval: "change" },
        { revision: 2 },
      ),
    });
    eventBus.emit("preferences:changed", {
      changes: { autoSyncInterval: "change" },
    });
    expect(autoSync.interval).toBe("change");
    expect(autoSync._intervalId).toBeNull();
    expect(syncManager.syncProject).toHaveBeenCalledOnce();
    eventBus.emit("preferences:state-changed", {
      reason: "settings-set",
      state: createPreferencesState({ autoSync: false }, { revision: 3 }),
    });
    eventBus.emit("preferences:changed", { key: "autoSync", value: false });
    vi.advanceTimersByTime(2000);
    expect(autoSync.isEnabled).toBe(false);
    expect(syncManager.syncProject).toHaveBeenCalledOnce();
  });

  it("advances sync status only for an accepted sync result", async () => {
    const updateIndicator = vi.spyOn(autoSync, "_updateIndicator");
    autoSync.enable("change");

    await expect(autoSync.sync()).resolves.toEqual({ success: true });

    expect(autoSync.lastSync).toBeInstanceOf(Date);
    expect(updateIndicator).toHaveBeenCalledWith("synced");
  });

  it("retains the prior sync time and reports an error for a rejected result", async () => {
    const previousSync = new Date("2026-07-17T12:00:00.000Z");
    autoSync.lastSync = previousSync;
    syncManager.syncProject.mockResolvedValue({
      success: false,
      error: "no_sync_folder_selected",
    });
    const updateIndicator = vi.spyOn(autoSync, "_updateIndicator");
    autoSync.enable("change");

    await expect(autoSync.sync()).resolves.toEqual({
      success: false,
      error: "no_sync_folder_selected",
    });

    expect(autoSync.lastSync).toBe(previousSync);
    expect(updateIndicator).toHaveBeenCalledWith("error");
    expect(updateIndicator).not.toHaveBeenCalledWith("synced");
  });

  it("converts an unexpected sync rejection into a stable failure", async () => {
    syncManager.syncProject.mockRejectedValue(new Error("transport failed"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const updateIndicator = vi.spyOn(autoSync, "_updateIndicator");
    autoSync.enable("change");

    await expect(autoSync.sync()).resolves.toEqual({
      success: false,
      error: "failed_to_sync_project",
      params: { error: "transport failed" },
    });

    expect(autoSync.lastSync).toBeNull();
    expect(updateIndicator).toHaveBeenCalledWith("error");
  });

  it("renders localized sync status and cancels indicator work on teardown", () => {
    vi.useFakeTimers();
    const indicator = document.createElement("span");
    indicator.id = "modifiedIndicator";
    document.body.appendChild(indicator);
    autoSync.ui = {};
    autoSync.i18n = {
      t: vi.fn((key) =>
        key === "sync_status_synced" ? "Synchronized" : "Sync failed",
      ),
    };

    autoSync._updateIndicator("synced");
    expect(indicator.textContent.trim()).toBe("Synchronized");
    expect(indicator.querySelector("i")?.className).toBe("fas fa-check");
    expect(autoSync._indicatorTimeout).not.toBeNull();

    autoSync._updateIndicator("error");
    expect(indicator.textContent.trim()).toBe("Sync failed");
    expect(indicator.querySelector("i")?.className).toBe(
      "fas fa-exclamation-triangle",
    );
    expect(autoSync.i18n.t).toHaveBeenCalledWith("sync_status_synced");
    expect(autoSync.i18n.t).toHaveBeenCalledWith("sync_status_error");

    autoSync.destroy();
    expect(autoSync._indicatorTimeout).toBeNull();
    expect(indicator.style.display).toBe("none");
    expect(indicator.classList.contains("synced")).toBe(false);
    expect(indicator.classList.contains("error")).toBe(false);
    indicator.remove();
  });

  it("owns preference and accepted-data subscriptions across its lifecycle", () => {
    const expectPreferenceOwner = (expected) => {
      expect(
        eventBus.getListenerCount("preferences:autosync-settings-changed"),
      ).toBe(expected);
      expect(eventBus.getListenerCount("preferences:changed")).toBe(expected);
      expect(eventBus.getListenerCount("preferences:state-changed")).toBe(
        expected,
      );
      expect(eventBus.getListenerCount("data:state-changed")).toBe(expected);
    };

    expectPreferenceOwner(1);
    autoSync.init();
    expectPreferenceOwner(1);

    eventBus.emit("preferences:state-changed", {
      reason: "startup-loaded",
      state: createPreferencesState(
        { autoSync: true, autoSyncInterval: "change" },
        { authorityEpoch: 100, revision: 1 },
      ),
    });

    autoSync.destroy();
    expectPreferenceOwner(0);
    expect(autoSync._syncDebounceTimeout).toBeNull();

    autoSync.init();
    expectPreferenceOwner(1);

    autoSync.destroy();
    const replacement = new AutoSync({ eventBus, syncManager, i18n });
    services.push(replacement);
    expectPreferenceOwner(0);
    replacement.init();
    expectPreferenceOwner(1);
  });

  it("hydrates from an owner-first late join without reading storage", () => {
    autoSync.destroy();
    class PreferencesService extends ComponentBase {
      getCurrentState() {
        return createPreferencesState(
          { autoSync: true, autoSyncInterval: "change" },
          { authorityEpoch: 200, revision: 1 },
        );
      }
    }
    const owner = new PreferencesService(eventBus);
    services.push(owner);
    owner.init();

    const poisonedStorage = {};
    Object.defineProperty(poisonedStorage, "getSettings", {
      get() {
        throw new Error("AutoSync must not read storage");
      },
    });
    const consumer = new AutoSync(
      /** @type {any} */ ({
        eventBus,
        syncManager,
        i18n: { t: (key) => key },
        storage: poisonedStorage,
      }),
    );
    services.push(consumer);

    expect(() => consumer.init()).not.toThrow();
    expect(consumer.cache.preferences.autoSync).toBe(true);
    expect(consumer.isEnabled).toBe(true);
  });

  it("captures late-join and reinitialization data baselines without an initial sync", () => {
    vi.useFakeTimers();
    autoSync.destroy();
    class DataCoordinator extends ComponentBase {
      state = projectState(1);
      getCurrentState() {
        return this.state;
      }
    }
    const owner = new DataCoordinator(eventBus);
    services.push(owner);
    owner.init();
    autoSync.init();
    autoSync.enable("change");
    publish(
      projectState(2, { profiles: { captain: { name: "Captain 1" } } }),
      "state-reloaded",
    );
    vi.advanceTimersByTime(500);
    expect(syncManager.syncProject).not.toHaveBeenCalled();
    publish(projectState(3));
    expect(autoSync._syncDebounceTimeout).not.toBeNull();
    autoSync.destroy();
    owner.state = projectState(4);
    publish(owner.state);
    autoSync.init();
    autoSync.enable("change");
    publish(
      projectState(5, { profiles: { captain: { name: "Captain 4" } } }),
      "state-reloaded",
    );
    vi.advanceTimersByTime(500);
    expect(syncManager.syncProject).not.toHaveBeenCalled();
    publish(projectState(6));
    vi.advanceTimersByTime(500);
    expect(syncManager.syncProject).toHaveBeenCalledOnce();
  });

  it("uses a consumer-first startup snapshot but keeps sync-folder staging inert", () => {
    const setup = vi.spyOn(autoSync, "setupFromSettings");
    eventBus.emit("preferences:state-changed", {
      reason: "sync-folder-staged",
      state: createPreferencesState(
        { autoSync: true, autoSyncInterval: "change" },
        { authorityEpoch: 300, revision: 1 },
      ),
    });

    expect(autoSync.cache.preferences.autoSync).toBe(true);
    expect(autoSync.isEnabled).toBe(false);
    expect(setup).not.toHaveBeenCalled();
    expect(syncManager.syncProject).not.toHaveBeenCalled();

    eventBus.emit("preferences:autosync-settings-changed");
    expect(autoSync.isEnabled).toBe(true);
    expect(setup).toHaveBeenCalledOnce();
    expect(syncManager.syncProject).not.toHaveBeenCalled();
  });

  it("keeps malformed, stale, duplicate, and pre-ready startup publications inert", () => {
    const setup = vi.spyOn(autoSync, "setupFromSettings");
    eventBus.emit("preferences:state-changed", {
      reason: "startup-loaded",
      state: createPreferencesState(
        { autoSync: true, autoSyncInterval: "change" },
        { authorityEpoch: 400, revision: 1 },
      ),
    });
    expect(autoSync.isEnabled).toBe(true);
    setup.mockClear();

    const duplicate = createPreferencesState(
      { autoSync: false },
      { authorityEpoch: 400, revision: 1 },
    );
    eventBus.emit("preferences:state-changed", {
      reason: "startup-loaded",
      state: duplicate,
    });
    eventBus.emit("preferences:state-changed", {
      reason: "startup-loaded",
      state: createPreferencesState(
        { autoSync: false },
        { authorityEpoch: 399, revision: 10 },
      ),
    });
    eventBus.emit("preferences:state-changed", {
      reason: "startup-loaded",
      state: { ...duplicate, unexpected: true },
    });
    eventBus.emit("preferences:state-changed", {
      reason: "startup-loaded",
      state: createPreferencesState(
        { autoSync: false },
        { authorityEpoch: 401, ready: false, revision: 0 },
      ),
    });

    expect(setup).not.toHaveBeenCalled();
    expect(autoSync.isEnabled).toBe(true);
    expect(autoSync.cache.preferences.autoSync).toBe(true);
    expect(autoSync.cache.preferencesState).toMatchObject({
      authorityEpoch: 401,
      ready: false,
      revision: 0,
    });
  });
});
