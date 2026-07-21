// Integration test to verify selection restoration fix on page reload

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import eventBus from "../../src/js/core/eventBus.js";
import SelectionService from "../../src/js/components/services/SelectionService.js";
import DataCoordinator from "../../src/js/components/services/DataCoordinator.js";
import StorageService from "../../src/js/components/services/StorageService.js";
import InterfaceModeService from "../../src/js/components/services/InterfaceModeService.js";
import ComponentBase from "../../src/js/components/ComponentBase.js";

class SelectionCacheConsumer extends ComponentBase {}

describe("Selection Restoration Fix - Page Reload", () => {
  let selectionService,
    selectionConsumer,
    dataCoordinator,
    storageService,
    interfaceModeService;

  beforeEach(async () => {
    // Set up storage with profile containing selections
    storageService = new StorageService({ eventBus });
    await storageService.init();

    const testProfile = {
      name: "Test Profile",
      description: "Test profile with selections",
      currentEnvironment: "ground",
      builds: {
        space: { keys: { F1: [{ command: "space_command" }] } },
        ground: { keys: { F2: [{ command: "ground_command" }] } },
      },
      aliases: {
        TestAlias: { commands: ['say "Hello"'], description: "Test alias" },
      },
      selections: {
        space: "F1",
        ground: "F2",
        alias: "TestAlias",
      },
      created: new Date().toISOString(),
      lastModified: new Date().toISOString(),
    };

    await storageService.saveProfile("test-profile", testProfile);
    const allData = storageService.getAllData();
    allData.currentProfile = "test-profile";
    await storageService.saveAllData(allData);

    // Initialize DataCoordinator first (simulates app startup order)
    dataCoordinator = new DataCoordinator({
      eventBus,
      storage: storageService,
    });
    await dataCoordinator.init();

    // Initialize the real environment owner in the same order as the app.
    interfaceModeService = new InterfaceModeService({
      eventBus,
      storage: storageService,
    });
    interfaceModeService.init();

    // Initialize SelectionService second (simulates app startup order)
    selectionService = new SelectionService({ eventBus });
    await selectionService.init();
    selectionConsumer = new SelectionCacheConsumer(eventBus);
    await selectionConsumer.init();

    await vi.waitFor(() => {
      expect(dataCoordinator.getCurrentState().ready).toBe(true);
      expect(interfaceModeService.currentMode).toBe("ground");
      expect(selectionService.cache.currentEnvironment).toBe("ground");
    });
  });

  afterEach(() => {
    interfaceModeService?.destroy?.();
    selectionConsumer?.destroy?.();
    selectionService?.destroy?.();
    dataCoordinator?.destroy?.();
    storageService?.destroy?.();
    vi.clearAllMocks();
  });

  it("should restore key selection from profile during initialization", () => {
    // Accepted startup broadcasts and late-join snapshots restore the cache;
    // no synthetic user action is needed to select the persisted key.

    // Verify the selection was restored correctly in the cache
    expect(selectionService.cache.selectedKey).toBe("F2");
    expect(selectionService.cache.currentEnvironment).toBe("ground");
    expect(selectionService.cachedSelections.ground).toBe("F2");

    // Verify that validateKeyExists works correctly for the restored selection
    expect(selectionService.validateKeyExists("F2", "ground")).toBe(true);
    expect(selectionService.validateKeyExists("F1", "ground")).toBe(false);
  });

  it("should correctly restore all selection state from profile", () => {
    // Verify the SelectionService state matches the profile
    expect(selectionService.cache.currentEnvironment).toBe("ground");
    expect(selectionService.cache.selectedKey).toBe("F2");
    expect(selectionService.cache.selectedAlias).toBe(null); // Should be null since environment is 'ground', not 'alias'
    expect(selectionService.cachedSelections).toEqual({
      space: "F1",
      ground: "F2",
      alias: "TestAlias",
    });
  });

  it("should handle alias environment restoration", async () => {
    // Test with alias environment
    const aliasProfile = {
      name: "Alias Profile",
      description: "Test profile with alias selection",
      currentEnvironment: "alias",
      builds: {
        space: { keys: {} },
        ground: { keys: {} },
      },
      aliases: {
        TestAlias: { commands: ['say "Hello"'], description: "Test alias" },
      },
      selections: {
        space: null,
        ground: null,
        alias: "TestAlias",
      },
      created: new Date().toISOString(),
      lastModified: new Date().toISOString(),
    };

    await storageService.saveProfile("alias-profile", aliasProfile);
    const allData = storageService.getAllData();
    allData.currentProfile = "alias-profile";
    await storageService.saveAllData(allData);

    // Tear down the old authority before creating the replacement, matching the
    // application's single-writer lifecycle during a page reload.
    interfaceModeService.destroy();
    selectionConsumer.destroy();
    selectionConsumer = null;
    selectionService.destroy();
    dataCoordinator.destroy();

    // Create new instances to simulate page reload
    dataCoordinator = new DataCoordinator({
      eventBus,
      storage: storageService,
    });
    await dataCoordinator.init();

    interfaceModeService = new InterfaceModeService({
      eventBus,
      storage: storageService,
    });
    interfaceModeService.init();

    selectionService = new SelectionService({ eventBus });
    await selectionService.init();

    await vi.waitFor(() => {
      expect(dataCoordinator.getCurrentState().ready).toBe(true);
      expect(interfaceModeService.currentMode).toBe("alias");
      expect(selectionService.cache.currentEnvironment).toBe("alias");
    });

    // Should restore alias selection
    expect(selectionService.cache.currentEnvironment).toBe("alias");
    expect(selectionService.cache.selectedAlias).toBe("TestAlias");
    expect(selectionService.cache.selectedKey).toBe(null); // Should be null in alias environment
    expect(selectionService.cachedSelections.alias).toBe("TestAlias");

    // Verify that validateAliasExists works correctly for the restored selection
    expect(selectionService.validateAliasExists("TestAlias")).toBe(true);
    expect(selectionService.validateAliasExists("NonExistentAlias")).toBe(
      false,
    );
  });

  it("should work with DataCoordinator late-join handshake mechanism", () => {
    // The test setup itself validates the late-join handshake works
    // If we get here with correct state, the handshake succeeded

    // Verify DataCoordinator has the profile data
    const dcState = dataCoordinator.getCurrentState();
    expect(dcState.currentProfileData).toBeDefined();
    expect(dcState.currentProfileData.selections).toEqual({
      space: "F1",
      ground: "F2",
      alias: "TestAlias",
    });

    // Verify SelectionService received and processed this data
    expect(selectionService.cache.currentProfile).toBe("test-profile");
    expect(selectionService.cache.profile).toBeDefined();
  });

  it("auto-selects aliases from late-join state without a state RPC", async () => {
    const requestSpy = vi.spyOn(selectionService, "request");

    const selectedAlias = await selectionService.autoSelectFirst("alias");

    expect(selectedAlias).toBe("TestAlias");
    expect(selectionService.cache.selectedAlias).toBe("TestAlias");
    expect(requestSpy).not.toHaveBeenCalledWith("data:get-aliases");
  });

  it("does not expose retired selection snapshot RPCs", () => {
    for (const topic of [
      "key:get-selected",
      "selection:get-cached",
      "selection:get-editing-context",
      "selection:get-selected",
      "selection:get-state",
    ]) {
      expect(eventBus.hasListeners(`rpc:${topic}`)).toBe(false);
    }
  });

  it("propagates a complete live owner snapshot to component caches", () => {
    selectionService.cache.selectedKey = "F1";
    selectionService.cache.selectedAlias = null;
    selectionService.cache.currentEnvironment = "space";
    selectionService.selectionEnvironment = "space";
    selectionService.editingContext = { isEditing: true, editIndex: 3 };
    selectionService.cachedSelections = {
      space: "F1",
      ground: "F2",
      alias: "TestAlias",
    };

    selectionService.broadcastState();

    expect(selectionConsumer.cache).toMatchObject({
      selectedKey: "F1",
      selectedAlias: null,
      currentEnvironment: "space",
      editingContext: { isEditing: true, editIndex: 3 },
      cachedSelections: {
        space: "F1",
        ground: "F2",
        alias: "TestAlias",
      },
    });
  });
});
