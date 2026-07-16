import { describe, it, beforeEach, afterEach, expect } from "vitest";
import { createRealServiceFixture } from "../fixtures";
import AliasBrowserService from "../../src/js/components/services/AliasBrowserService.js";
import DataCoordinator from "../../src/js/components/services/DataCoordinator.js";
import CommandService from "../../src/js/components/services/CommandService.js";
import {
  getSnapshotPrimaryKeyCommands,
  getSnapshotPrimaryKeys,
} from "../../src/js/components/services/dataState.js";
import { request } from "../../src/js/core/requestResponse.js";
import { STOCommandParser } from "../../src/js/lib/STOCommandParser.js";

// Helper profile data for tests
function createProfileWithKey() {
  return {
    name: "Test Profile",
    description: "Profile for regression test",
    currentEnvironment: "space",
    builds: {
      space: {
        keys: {
          F1: ["FireAll", "FirePhasers"],
          F2: ["OldCommand", "AnotherOldCommand"],
        },
      },
      ground: {
        keys: {},
      },
    },
    aliases: {
      sourceAlias: {
        commands: ["FireAll", "FirePhasers"],
        description: "Source alias",
        type: "alias",
      },
      targetAlias: {
        commands: ["OldAliasCommand"],
        description: "Target alias",
        type: "custom",
        metadata: { owner: "captain" },
      },
    },
    created: "2021-01-01T00:00:00Z",
    lastModified: "2021-01-01T00:00:00Z",
    migrationVersion: "2.1.1",
  };
}

describe("Regression: Import from Key or Alias request routing", () => {
  let fixture, eventBus, dataCoordinator, aliasBrowserService, commandService;

  beforeEach(async () => {
    // Seed storage with source and destination key command chains.
    const initialStorageData = {
      sto_keybind_manager: {
        currentProfile: "testProfile",
        profiles: {
          testProfile: createProfileWithKey(),
        },
        settings: {},
        version: "1.0.0",
        lastModified: "2021-01-01T00:00:00Z",
      },
      sto_keybind_settings: {},
    };

    fixture = await createRealServiceFixture({ initialStorageData });
    fixture.eventBusFixture.reset();
    eventBus = fixture.eventBus;

    // Spin up DataCoordinator so it can register respond handlers
    dataCoordinator = new DataCoordinator({
      eventBus,
      storage: fixture.storage,
      i18n: { t: (key) => key },
    });
    await dataCoordinator.init();

    aliasBrowserService = new AliasBrowserService({ eventBus });
    aliasBrowserService.init();
    new STOCommandParser(eventBus);

    commandService = new CommandService({
      eventBus,
      i18n: { t: (key) => key },
    });
    commandService.init();
  });

  afterEach(() => {
    commandService.destroy();
    aliasBrowserService.destroy();
    dataCoordinator.destroy();
    fixture.destroy();
  });

  it("projects complete key state without compatibility query responders", () => {
    expect(eventBus.hasListeners("rpc:data:get-keys")).toBe(false);
    expect(eventBus.hasListeners("rpc:data:get-key-commands")).toBe(false);

    const snapshot = commandService.cache.dataState;
    const keys = getSnapshotPrimaryKeys(snapshot, "space");
    expect(keys).toHaveProperty("F1");
    expect(getSnapshotPrimaryKeyCommands(snapshot, "space", "F1")).toEqual([
      "FireAll",
      "FirePhasers",
    ]);
  });

  it("clears, persists, and broadcasts each imported command in order", async () => {
    const profileUpdates = [];
    const commandAdds = [];
    eventBus.on("profile:updated", (event) => profileUpdates.push(event));
    eventBus.on("command-added", (event) => commandAdds.push(event));
    fixture.storage.saveProfile.mockClear();

    const result = await request(eventBus, "command:import-from-source", {
      sourceValue: "space:F1",
      targetKey: "F2",
      clearDestination: true,
      currentEnvironment: "space",
    });

    expect(result).toEqual({
      success: true,
      importedCount: 2,
      droppedCount: 0,
      sourceType: "space",
      sourceName: "F1",
    });
    expect(
      fixture.storage.saveProfile.mock.calls.map(
        ([, profile]) => profile.builds.space.keys.F2,
      ),
    ).toEqual([[], ["FireAll"], ["FireAll", "FirePhasers"]]);
    expect(
      profileUpdates.map(({ updates }) => updates.modify.builds.space.keys.F2),
    ).toEqual([[], ["FireAll"], ["FireAll", "FirePhasers"]]);
    expect(commandAdds).toEqual([
      { key: "F2", command: "FireAll" },
      { key: "F2", command: "FirePhasers" },
    ]);

    const persisted = fixture.storage.getProfile("testProfile");
    expect(persisted.builds.space.keys).toEqual({
      F1: ["FireAll", "FirePhasers"],
      F2: ["FireAll", "FirePhasers"],
    });
    const { lastModified: persistedAt, ...persistedContent } = persisted;
    const { lastModified: stateAt, ...stateContent } =
      dataCoordinator.state.profiles.testProfile;
    expect(stateContent).toEqual(persistedContent);
    expect(Date.parse(persistedAt)).toBeGreaterThanOrEqual(Date.parse(stateAt));
  });

  it("clears an alias without overwriting its metadata", async () => {
    await dataCoordinator.setEnvironment("alias");
    fixture.storage.saveProfile.mockClear();

    const result = await request(eventBus, "command:import-from-source", {
      sourceValue: "alias:sourceAlias",
      targetKey: "targetAlias",
      clearDestination: true,
      currentEnvironment: "alias",
    });

    expect(result).toMatchObject({ success: true, importedCount: 2 });
    expect(
      fixture.storage.saveProfile.mock.calls.map(
        ([, profile]) => profile.aliases.targetAlias,
      ),
    ).toEqual([
      {
        commands: [],
        description: "Target alias",
        type: "custom",
        metadata: { owner: "captain" },
      },
      {
        commands: ["FireAll"],
        description: "Target alias",
        type: "custom",
        metadata: { owner: "captain" },
      },
      {
        commands: ["FireAll", "FirePhasers"],
        description: "Target alias",
        type: "custom",
        metadata: { owner: "captain" },
      },
    ]);
    expect(
      fixture.storage.getProfile("testProfile").aliases.targetAlias,
    ).toEqual({
      commands: ["FireAll", "FirePhasers"],
      description: "Target alias",
      type: "custom",
      metadata: { owner: "captain" },
    });
  });
});
