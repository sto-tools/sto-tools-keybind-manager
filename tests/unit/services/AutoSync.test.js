import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import AutoSync from "../../../src/js/components/services/AutoSync.js";
import { createServiceFixture } from "../../fixtures/index.js";

function createMockSyncManager() {
  return { syncProject: vi.fn().mockResolvedValue({ success: true }) };
}

describe("AutoSync", () => {
  let fixture, storage, eventBus, syncManager, autoSync, services;

  beforeEach(() => {
    fixture = createServiceFixture();
    services = [];
    storage = fixture.storageService;
    eventBus = fixture.eventBus;

    syncManager = createMockSyncManager();
    autoSync = new AutoSync({ eventBus, storage, syncManager });
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
      expect(eventBus.getListenerCount("preferences:changed")).toBe(
        expected * 2,
      );
    };

    expectPreferenceOwner(1);
    autoSync.init();
    expectPreferenceOwner(1);

    storage.getSettings.mockReturnValue({
      autoSync: true,
      autoSyncInterval: "change",
    });
    autoSync.setupFromSettings();
    expect(eventBus.getListenerCount("storage:data-changed")).toBe(1);

    autoSync.destroy();
    expectPreferenceOwner(0);
    expect(eventBus.getListenerCount("storage:data-changed")).toBe(0);
    expect(autoSync._syncDebounceTimeout).toBeNull();

    autoSync.init();
    expectPreferenceOwner(1);
    expect(eventBus.getListenerCount("storage:data-changed")).toBe(1);

    autoSync.destroy();
    const replacement = new AutoSync({ eventBus, storage, syncManager });
    services.push(replacement);
    expectPreferenceOwner(0);
    replacement.init();
    expectPreferenceOwner(1);
    expect(eventBus.getListenerCount("storage:data-changed")).toBe(1);
  });
});
