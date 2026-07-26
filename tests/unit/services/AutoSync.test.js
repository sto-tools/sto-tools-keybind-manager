import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import AutoSync from "../../../src/js/components/services/AutoSync.js";
import ComponentBase from "../../../src/js/components/ComponentBase.js";
import { createPreferencesState } from "../../fixtures/core/componentState.js";
import { createServiceFixture } from "../../fixtures/index.js";

function createMockSyncManager() {
  return { syncProject: vi.fn().mockResolvedValue({ success: true }) };
}

describe("AutoSync", () => {
  let fixture, eventBus, syncManager, autoSync, services;

  beforeEach(() => {
    fixture = createServiceFixture();
    services = [];
    eventBus = fixture.eventBus;

    syncManager = createMockSyncManager();
    autoSync = new AutoSync({ eventBus, syncManager });
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

  it('enable("change") listens for storage changes and debounces', async () => {
    vi.useFakeTimers();
    autoSync.enable("change");

    // Emit storage change twice quickly
    eventBus.emit("storage:data-changed");
    eventBus.emit("storage:data-changed");

    // Fast-forward debounce delay
    vi.advanceTimersByTime(600);

    expect(syncManager.syncProject).toHaveBeenCalledTimes(1);
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
    expect(indicator.querySelector("i")?.classList.contains("fa-check")).toBe(
      true,
    );
    expect(autoSync._indicatorTimeout).not.toBeNull();

    autoSync._updateIndicator("error");
    expect(indicator.textContent.trim()).toBe("Sync failed");
    expect(
      indicator
        .querySelector("i")
        ?.classList.contains("fa-exclamation-triangle"),
    ).toBe(true);
    expect(autoSync.i18n.t).toHaveBeenCalledWith("sync_status_synced");
    expect(autoSync.i18n.t).toHaveBeenCalledWith("sync_status_error");

    autoSync.destroy();
    expect(autoSync._indicatorTimeout).toBeNull();
    expect(indicator.style.display).toBe("none");
    expect(indicator.classList.contains("synced")).toBe(false);
    expect(indicator.classList.contains("error")).toBe(false);
    indicator.remove();
  });

  it("owns preference and enabled-storage subscriptions across its lifecycle", () => {
    const expectPreferenceOwner = (expected) => {
      expect(
        eventBus.getListenerCount("preferences:autosync-settings-changed"),
      ).toBe(expected);
      expect(eventBus.getListenerCount("preferences:changed")).toBe(expected);
      expect(eventBus.getListenerCount("preferences:state-changed")).toBe(
        expected,
      );
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
    expect(eventBus.getListenerCount("storage:data-changed")).toBe(1);

    autoSync.destroy();
    expectPreferenceOwner(0);
    expect(eventBus.getListenerCount("storage:data-changed")).toBe(0);
    expect(autoSync._syncDebounceTimeout).toBeNull();

    autoSync.init();
    expectPreferenceOwner(1);
    expect(eventBus.getListenerCount("storage:data-changed")).toBe(1);

    autoSync.destroy();
    const replacement = new AutoSync({ eventBus, syncManager });
    services.push(replacement);
    expectPreferenceOwner(0);
    replacement.init();
    expectPreferenceOwner(1);
    expect(eventBus.getListenerCount("storage:data-changed")).toBe(0);
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
        storage: poisonedStorage,
      }),
    );
    services.push(consumer);

    expect(() => consumer.init()).not.toThrow();
    expect(consumer.cache.preferences.autoSync).toBe(true);
    expect(consumer.isEnabled).toBe(true);
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
