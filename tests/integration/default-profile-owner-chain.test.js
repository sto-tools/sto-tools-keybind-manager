import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import DataCoordinator from "../../src/js/components/services/DataCoordinator.js";
import StorageService from "../../src/js/components/services/StorageService.js";
import { createEventBusFixture } from "../fixtures/core/eventBus.js";

const STORAGE_KEY = "sto_keybind_manager";

const defaultProfile = (name, currentEnvironment) => ({
  id: `${name.toLowerCase()}-source-id`,
  name,
  description: `${name} description`,
  currentEnvironment,
  builds: {
    space: { keys: { F1: "FireAll" } },
    ground: { keys: { G: "Aim" } },
  },
  aliases: { engage: { commands: "FireAll $$ Aim" } },
  bindsets: {},
  selections: { space: "F1", ground: "G", alias: "engage" },
  keybindMetadata: {},
  aliasMetadata: {},
  bindsetMetadata: {},
  migrationVersion: "2.1.1",
  vertigoSettings: { showPlayerSay: true },
  extension: { sourceOnly: true },
});

describe("default-profile real storage owner chain", () => {
  let eventBusFixture;
  let storage;
  let coordinator;

  beforeEach(async () => {
    localStorage.clear();
    localStorage.setItem("sto_keybind_manager_visited", "true");
    eventBusFixture = createEventBusFixture();
    storage = new StorageService({
      eventBus: eventBusFixture.eventBus,
      version: "1.0.0",
      i18n: { t: (key) => key },
    });
    coordinator = new DataCoordinator({
      eventBus: eventBusFixture.eventBus,
      storage,
      i18n: { t: (key) => key },
    });

    storage.init();
    coordinator.init();
    await vi.waitFor(() => {
      expect(coordinator.getCurrentState()).toMatchObject({
        ready: true,
        revision: 1,
        currentProfile: null,
        profiles: {},
      });
    });
    eventBusFixture.clearEventHistory();
  });

  afterEach(() => {
    coordinator?.destroy();
    storage?.destroy();
    eventBusFixture?.destroy();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  function relevantEvents() {
    return eventBusFixture
      .getEventHistory()
      .filter(({ event }) =>
        [
          "storage:data-changed",
          "data:state-changed",
          "profile:switched",
        ].includes(event),
      );
  }

  it("persists and publishes one normalized ordered default batch", async () => {
    const source = {
      first: defaultProfile("First", "ground"),
      second: defaultProfile("Second", "space"),
    };
    const sourceBefore = structuredClone(source);

    await coordinator.createDefaultProfilesFromData(source);

    const state = coordinator.getCurrentState();
    const durable = JSON.parse(localStorage.getItem(STORAGE_KEY));
    expect(state).toMatchObject({
      revision: 2,
      currentProfile: "first",
      currentEnvironment: "ground",
      profiles: {
        first: {
          name: "First",
          builds: {
            space: { keys: { F1: ["FireAll"] } },
            ground: { keys: { G: ["Aim"] } },
          },
          aliases: { engage: { commands: ["FireAll", "Aim"] } },
          migrationVersion: "2.1.1",
        },
        second: { name: "Second", migrationVersion: "2.1.1" },
      },
    });
    expect(Object.keys(state.profiles)).toEqual(["first", "second"]);
    expect(durable.currentProfile).toBe("first");
    expect(durable.profiles).toEqual(state.profiles);
    expect(storage.getAllData().profiles).toEqual(state.profiles);
    expect(state.metadata).toEqual({
      version: durable.version,
      lastModified: durable.lastModified,
    });
    for (const profile of Object.values(state.profiles)) {
      expect(profile).not.toHaveProperty("id");
      expect(profile).not.toHaveProperty("vertigoSettings");
      expect(profile).not.toHaveProperty("extension");
    }
    expect(source).toEqual(sourceBefore);
    expect(
      eventBusFixture.getEventsOfType("storage:data-changed"),
    ).toHaveLength(1);
    expect(relevantEvents().map(({ event }) => event)).toEqual([
      "storage:data-changed",
      "data:state-changed",
      "profile:switched",
    ]);
    expect(relevantEvents()[1].data.reason).toBe("default-profiles-created");
    expect(relevantEvents()[2].data).toMatchObject({
      profileId: "first",
      environment: "ground",
      profile: { id: "first", environment: "ground" },
    });
  });

  it("persists and publishes the exact normalized direct fallback", async () => {
    await coordinator.createDefaultProfilesFromData({});

    const state = coordinator.getCurrentState();
    const durable = JSON.parse(localStorage.getItem(STORAGE_KEY));
    expect(state).toMatchObject({
      revision: 2,
      currentProfile: "default",
      currentEnvironment: "space",
    });
    expect(state.profiles.default).toEqual({
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
    expect(durable.currentProfile).toBe("default");
    expect(durable.profiles).toEqual(state.profiles);
    expect(storage.getAllData().profiles).toEqual(state.profiles);
    expect(
      eventBusFixture.getEventsOfType("storage:data-changed"),
    ).toHaveLength(1);
    expect(relevantEvents().map(({ event }) => event)).toEqual([
      "storage:data-changed",
      "data:state-changed",
      "profile:switched",
    ]);
    expect(relevantEvents()[1].data.reason).toBe("fallback-profiles-created");
    expect(relevantEvents()[2].data).toMatchObject({
      profileId: "default",
      environment: "space",
      profile: { id: "default", environment: "space" },
    });
  });
});
