import LocalStorageVisitedStatePersistence from "../../src/js/components/storage/LocalStorageVisitedStatePersistence.js";
import { describe, it, beforeEach, afterEach, expect } from "vitest";
import { createRealServiceFixture } from "../fixtures";
import DataCoordinator from "../../src/js/components/services/DataCoordinator.js";
import CommandChainService from "../../src/js/components/services/CommandChainService.js";

function createProfileWithKey() {
  return {
    name: "Test Profile",
    description: "",
    currentEnvironment: "space",
    builds: {
      space: {
        keys: {
          F1: ["Attack"],
        },
      },
      ground: { keys: {} },
    },
    aliases: {},
    created: new Date().toISOString(),
    lastModified: new Date().toISOString(),
  };
}

describe("CommandChainService command-chain:clear event", () => {
  let fixture, eventBus, dataCoordinator, chainService;

  beforeEach(async () => {
    const initialStorageData = {
      sto_keybind_manager: {
        currentProfile: "testProfile",
        profiles: {
          testProfile: createProfileWithKey(),
        },
        version: "1.0.0",
        lastModified: new Date().toISOString(),
      },
      sto_keybind_settings: {},
    };

    fixture = await createRealServiceFixture({ initialStorageData });
    eventBus = fixture.eventBus;

    dataCoordinator = new DataCoordinator({
      visitedState: new LocalStorageVisitedStatePersistence({
        storage: localStorage,
      }),
      eventBus,
      projectRepository: fixture.projectRepository,
      i18n: { t: (key) => key },
    });
    await dataCoordinator.init();
    await dataCoordinator.initialStateReady;

    chainService = new CommandChainService({ eventBus });
    await chainService.init();

    // Simulate profile switched broadcast so CommandChainService caches profile
    eventBus.emit("profile:switched", {
      profileId: "testProfile",
      profile: createProfileWithKey(),
      environment: "space",
    });

    // Select key to set internal state (not strictly needed for clear but realistic)
    eventBus.emit("key-selected", { key: "F1", name: "F1" });
  });

  afterEach(() => {
    if (chainService && !chainService.destroyed) chainService.destroy();
    if (dataCoordinator && !dataCoordinator.destroyed) {
      dataCoordinator.destroy();
    }
    fixture?.destroy();
  });

  it("clears the selected command chain through the UI event path", async () => {
    await eventBus.emit(
      "command-chain:clear",
      { key: "F1" },
      { synchronous: true },
    );

    // The durable mutation publishes a new accepted snapshot; no compatibility
    // query route is needed to verify the result.
    expect(
      chainService.cache.dataState.profiles.testProfile.builds.space.keys.F1,
    ).toEqual([]);
    expect(
      fixture.readProjectRoot().profiles.testProfile.builds.space.keys.F1,
    ).toEqual([]);
    expect(fixture.readProjectRoot()).not.toHaveProperty("settings");
    expect(eventBus.hasListeners("rpc:data:get-key-commands")).toBe(false);
  });
});
