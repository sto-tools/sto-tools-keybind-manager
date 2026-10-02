import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AutoSync from "../../src/js/components/services/AutoSync.js";
import DataCoordinator from "../../src/js/components/services/DataCoordinator.js";
import LocalStorageVisitedStatePersistence from "../../src/js/components/storage/LocalStorageVisitedStatePersistence.js";
import { createRealEventBusFixture } from "../fixtures/core/eventBus.js";
import { createLocalStorageFixture } from "../fixtures/core/storage.js";
import {
  destinationRoot,
  importedProject,
} from "../fixtures/services/projectImportOwnerChain.js";
import { createProjectRepository } from "./helpers/projectRepository.js";

describe("AutoSync accepted DataCoordinator owner chain", () => {
  let busFixture, storageFixture, repository, owner, consumer, syncManager;
  const i18n = { t: (key) => key };

  beforeEach(async () => {
    busFixture = await createRealEventBusFixture();
    storageFixture = createLocalStorageFixture({
      initialData: {
        sto_keybind_manager: destinationRoot,
        sto_keybind_manager_visited: "true",
      },
    });
    repository = createProjectRepository();
    owner = new DataCoordinator({
      eventBus: busFixture.eventBus,
      projectRepository: repository,
      visitedState: new LocalStorageVisitedStatePersistence({
        storage: localStorage,
      }),
      defaultProfiles: {},
      i18n,
    });
    syncManager = { syncProject: vi.fn().mockResolvedValue({ success: true }) };
    consumer = new AutoSync({
      eventBus: busFixture.eventBus,
      syncManager,
      i18n,
    });
  });

  afterEach(() => {
    consumer?.destroy();
    owner?.destroy();
    busFixture?.destroy();
    storageFixture?.destroy();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it.each(["consumer-first", "owner-first"])(
    "preserves no-write startup/reload and committed import with %s startup",
    async (order) => {
      if (order === "consumer-first") {
        consumer.init();
        consumer.enable("change");
      }
      owner.init();
      await owner.initialStateReady;
      if (order === "owner-first") {
        consumer.init();
        consumer.enable("change");
      }
      vi.useFakeTimers();
      const acceptedRoot = localStorage.getItem("sto_keybind_manager");
      const commit = vi.spyOn(repository, "commit");
      const initialRevision = consumer.cache.dataState.revision;
      const initialModified = consumer.cache.dataState.metadata.lastModified;
      await expect(owner.reloadState()).resolves.toMatchObject({
        success: true,
      });
      expect(commit).not.toHaveBeenCalled();
      expect(localStorage.getItem("sto_keybind_manager")).toBe(acceptedRoot);
      expect(consumer.cache.dataState.revision).toBe(initialRevision + 1);
      await vi.advanceTimersByTimeAsync(500);
      expect(syncManager.syncProject).not.toHaveBeenCalled();

      const data = structuredClone(importedProject.data);
      delete data.settings;
      const publications = [];
      busFixture.eventBus.on("data:state-changed", (change) =>
        publications.push(change),
      );
      await expect(owner.replaceProjectFromImport(data)).resolves.toMatchObject(
        { success: true },
      );
      expect(commit).toHaveBeenCalledOnce();
      expect(publications).toHaveLength(1);
      expect(publications[0].reason).toBe("state-reloaded");
      expect(consumer.cache.dataState).toBe(owner.getCurrentState());
      expect(consumer.cache.dataState.metadata.lastModified).not.toBe(
        initialModified,
      );
      expect(repository.load().value.currentProfile).toBe("imported");
      await vi.advanceTimersByTimeAsync(499);
      expect(syncManager.syncProject).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(syncManager.syncProject).toHaveBeenCalledExactlyOnceWith("auto");

      syncManager.syncProject.mockClear();
      await owner.reloadState();
      await vi.advanceTimersByTimeAsync(500);
      expect(syncManager.syncProject).not.toHaveBeenCalled();
      await owner.updateProfile("imported", {
        properties: { description: "Accepted edit" },
      });
      await vi.advanceTimersByTimeAsync(500);
      expect(syncManager.syncProject).toHaveBeenCalledExactlyOnceWith("auto");
    },
  );

  it("suppresses a fixed-clock identical committed import with no artifact-visible change", async () => {
    owner.init();
    await owner.initialStateReady;
    consumer.init();
    consumer.enable("change");
    vi.useFakeTimers();
    // Hold wall time fixed across both commits, while allowing debounce time
    // to advance afterward. Both requests are still real durable owner writes.
    const data = structuredClone(importedProject.data);
    delete data.settings;
    const commit = vi.spyOn(repository, "commit");
    const fixedTime = Date.now();
    await owner.replaceProjectFromImport(data);
    const accepted = consumer.cache.dataState;
    await vi.advanceTimersByTimeAsync(500);
    expect(syncManager.syncProject).toHaveBeenCalledExactlyOnceWith("auto");
    syncManager.syncProject.mockClear();
    vi.setSystemTime(fixedTime);
    await owner.replaceProjectFromImport(data);
    const repeated = consumer.cache.dataState;
    expect(commit).toHaveBeenCalledTimes(2);
    expect(repeated.revision).toBe(accepted.revision + 1);
    expect(repeated.profiles).toEqual(accepted.profiles);
    expect(repeated.metadata).toEqual(accepted.metadata);
    expect(repeated.currentProfile).toBe(accepted.currentProfile);
    expect(repeated.currentEnvironment).toBe(accepted.currentEnvironment);
    expect(consumer._syncDebounceTimeout).toBeNull();
    await vi.advanceTimersByTimeAsync(500);
    expect(syncManager.syncProject).not.toHaveBeenCalled();
  });

  it("never schedules a sync for a rejected owner write", async () => {
    owner.init();
    await owner.initialStateReady;
    consumer.init();
    consumer.enable("change");
    vi.useFakeTimers();
    const baseline = consumer.cache.dataState;
    const root = localStorage.getItem("sto_keybind_manager");
    vi.spyOn(repository, "commit").mockReturnValue({
      status: "failed",
      error: "storage_write_failed",
      write: { status: "failed" },
      verification: { status: "not_attempted" },
    });
    await expect(
      owner.updateProfile("existing", {
        properties: { description: "Rejected edit" },
      }),
    ).rejects.toThrow("failed_to_save_profile");
    expect(consumer.cache.dataState).toBe(baseline);
    expect(localStorage.getItem("sto_keybind_manager")).toBe(root);
    await vi.advanceTimersByTimeAsync(500);
    expect(syncManager.syncProject).not.toHaveBeenCalled();
  });
});
