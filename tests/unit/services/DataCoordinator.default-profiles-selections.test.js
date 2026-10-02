import LocalStorageVisitedStatePersistence from "../../../src/js/components/storage/LocalStorageVisitedStatePersistence.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServiceFixture } from "../../fixtures/index.js";
import DataCoordinator from "../../../src/js/components/services/DataCoordinator.js";

const defaultProfilesData = {
  default: {
    name: "Default",
    description: "Default keybind configuration",
    currentEnvironment: "space",
    builds: {
      space: { keys: { F1: ["+TrayExecByTray 9 0"] } },
      ground: { keys: { F1: ["+TrayExecByTray 6 0"] } },
    },
    aliases: { toggle_combatlog: { commands: ["combatlog"] } },
    selections: { space: "F1", ground: "F1", alias: "toggle_combatlog" },
  },
};

describe("DataCoordinator default profiles - selections propagation", () => {
  let fixture;
  let eventBus;
  let projectRepository;
  let dataCoordinator;

  beforeEach(async () => {
    // Seed storage as first-run with no profiles
    fixture = createServiceFixture({
      initialStorageData: {
        sto_keybind_manager: {
          currentProfile: null,
          profiles: {},
          settings: {},
        },
        sto_keybind_settings: {},
      },
    });
    eventBus = fixture.eventBus;
    projectRepository = fixture.projectRepository;
    projectRepository.load.mockReturnValue({
      status: "current",
      value: {
        currentProfile: null,
        profiles: {},
        settings: {},
        globalAliases: {},
        version: "1.0.0",
        lastModified: "2026-07-19T00:00:00.000Z",
      },
    });
    projectRepository.commit.mockImplementation((candidate) => ({
      status: "committed",
      value: structuredClone(candidate),
    }));
    localStorage.setItem("sto_keybind_manager_visited", "true");
    dataCoordinator = new DataCoordinator({
      visitedState: new LocalStorageVisitedStatePersistence({
        storage: localStorage,
      }),
      eventBus,
      projectRepository,
      defaultProfiles: defaultProfilesData,
    });
    dataCoordinator.init();
    await dataCoordinator.initialStateReady;
    projectRepository.commit.mockClear();
  });

  afterEach(() => {
    fixture.destroy();
    localStorage.removeItem("sto_keybind_manager_visited");
  });

  it("copies selections from defaultProfiles into created profile", async () => {
    await dataCoordinator.createDefaultProfilesFromData(defaultProfilesData);

    // Verify state contains selections copied over
    const created = dataCoordinator.state.profiles["default"];
    expect(created).toBeDefined();
    expect(created.selections).toEqual({
      space: "F1",
      ground: "F1",
      alias: "toggle_combatlog",
    });

    // Also verify persistence happened with selections present
    const persisted = projectRepository.commit.mock.calls[0][0];
    expect(persisted.profiles["default"]).toBeDefined();
    expect(persisted.profiles["default"].selections).toEqual({
      space: "F1",
      ground: "F1",
      alias: "toggle_combatlog",
    });
  });

  it("loads validated defaults directly without consulting RPC transport", async () => {
    const request = vi.spyOn(dataCoordinator, "request");

    await expect(dataCoordinator.loadDefaultData()).resolves.toEqual({
      success: true,
      profilesCreated: 1,
      currentProfile: "default",
    });

    expect(request).not.toHaveBeenCalled();
    expect(projectRepository.commit).toHaveBeenCalledTimes(1);
    expect(dataCoordinator.state.profiles.default.selections).toEqual(
      defaultProfilesData.default.selections,
    );
  });

  it("normalizes the detached allowlisted draft without preserving source-only fields", async () => {
    const source = {
      name: "Allowlisted Default",
      description: "Facade projection",
      currentEnvironment: "ground",
      builds: {
        space: { keys: {} },
        ground: { keys: { G: "Aim" } },
      },
      aliases: { engage: { commands: "FireAll $$ Aim" } },
      bindsets: {},
      selections: { ground: "G", alias: "engage" },
      keybindMetadata: {},
      aliasMetadata: {},
      bindsetMetadata: {},
      id: "source-id",
      migrationVersion: "2.1.1",
      created: "source-created",
      lastModified: "source-modified",
      vertigoSettings: { showPlayerSay: true },
      extension: { nested: ["source only"] },
    };
    const sourceBefore = structuredClone(source);

    await dataCoordinator.createDefaultProfilesFromData({
      allowlisted: source,
    });

    const created = dataCoordinator.state.profiles.allowlisted;
    expect(created).toMatchObject({
      name: "Allowlisted Default",
      description: "Facade projection",
      currentEnvironment: "ground",
      builds: {
        space: { keys: {} },
        ground: { keys: { G: ["Aim"] } },
      },
      aliases: { engage: { commands: ["FireAll", "Aim"] } },
      selections: { ground: "G", alias: "engage" },
      migrationVersion: "2.1.1",
      created: expect.any(String),
      lastModified: expect.any(String),
    });
    for (const omitted of ["id", "vertigoSettings", "extension"]) {
      expect(created).not.toHaveProperty(omitted);
    }
    expect(created.created).not.toBe("source-created");
    expect(created.lastModified).not.toBe("source-modified");
    expect(
      projectRepository.commit.mock.calls[0][0].profiles.allowlisted,
    ).toEqual(created);
    expect(source).toEqual(sourceBefore);
  });

  it("routes an empty direct batch through the exact normalized fallback", async () => {
    await dataCoordinator.createDefaultProfilesFromData({});

    const fallback = dataCoordinator.state.profiles.default;
    expect(fallback).toEqual({
      name: "Default",
      description: "Basic space build profile",
      currentEnvironment: "space",
      builds: {
        space: { keys: {} },
        ground: { keys: {} },
      },
      bindsets: {},
      aliases: {},
      created: expect.any(String),
      lastModified: expect.any(String),
      migrationVersion: "2.1.1",
    });
    expect(dataCoordinator.state.currentProfile).toBe("default");
    expect(dataCoordinator.state.currentEnvironment).toBe("space");
    expect(projectRepository.commit.mock.calls[0][0].profiles.default).toEqual(
      fallback,
    );
    expect(projectRepository.commit).toHaveBeenCalledTimes(1);
  });
});
