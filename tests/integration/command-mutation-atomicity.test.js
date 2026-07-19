import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import CommandService from "../../src/js/components/services/CommandService.js";
import DataCoordinator from "../../src/js/components/services/DataCoordinator.js";
import { createServiceFixture } from "../fixtures/index.js";

const profile = {
  name: "Captain",
  description: "Command mutation atomicity fixture",
  currentEnvironment: "space",
  builds: {
    space: { keys: { F1: ["One", "Two"] } },
    ground: { keys: { G1: ["GroundOne", "GroundTwo"] } },
  },
  aliases: {
    Alpha: {
      commands: ["AliasOne", "AliasTwo"],
      description: "Preserve this metadata",
      type: "custom",
    },
  },
  bindsets: {
    Weapons: {
      space: { keys: { F1: ["NamedOne", "NamedTwo"] } },
    },
  },
  keybindMetadata: {
    space: { F1: { stabilizeExecutionOrder: true } },
  },
  migrationVersion: "2.1.1",
};

const root = {
  version: "1.0.0",
  created: "2026-01-01T00:00:00.000Z",
  lastModified: "2026-01-01T00:00:00.000Z",
  currentProfile: "captain",
  profiles: { captain: profile },
  globalAliases: {},
  settings: { theme: "default", autoSave: true },
};

const mutations = [
  {
    label: "add",
    topic: "command-added",
    invoke: (service) => service.addCommand("F1", "Three"),
    commands: ["One", "Two", "Three"],
    event: { key: "F1", command: "Three" },
  },
  {
    label: "delete",
    topic: "command-deleted",
    invoke: (service) => service.deleteCommand("F1", 0),
    commands: ["Two"],
    event: { key: "F1", index: 0, commands: ["Two"] },
  },
  {
    label: "move",
    topic: "command-moved",
    invoke: (service) => service.moveCommand("F1", 0, 1),
    commands: ["Two", "One"],
    event: {
      key: "F1",
      fromIndex: 0,
      toIndex: 1,
      commands: ["Two", "One"],
    },
  },
  {
    label: "edit",
    topic: "command-edited",
    invoke: (service) => service.editCommand("F1", 0, "Changed"),
    commands: ["Changed", "Two"],
    event: {
      key: "F1",
      index: 0,
      updatedCommand: "Changed",
      commands: ["Changed", "Two"],
    },
  },
];

const commandTopics = new Set(mutations.map(({ topic }) => topic));

describe("CommandService mutation owner atomicity", () => {
  let fixture;
  let coordinator;
  let service;
  let ui;

  beforeEach(async () => {
    fixture = createServiceFixture({
      initialStorageData: { sto_keybind_manager: root },
    });
    const i18n = { t: (key) => key };
    ui = { showToast: vi.fn() };
    coordinator = new DataCoordinator({
      eventBus: fixture.eventBus,
      storage: fixture.storage,
      i18n,
    });
    service = new CommandService({
      eventBus: fixture.eventBus,
      i18n,
      ui,
    });

    coordinator.init();
    await vi.waitFor(() => {
      expect(coordinator.getCurrentState().ready).toBe(true);
    });
    service.init();
    await vi.waitFor(() => {
      expect(service.cache.dataState?.ready).toBe(true);
    });

    fixture.eventBusFixture.clearEventHistory();
    fixture.storage.saveProfile.mockClear();
  });

  afterEach(() => {
    if (!service.destroyed) service.destroy();
    if (!coordinator.destroyed) coordinator.destroy();
    fixture.destroy();
    vi.restoreAllMocks();
  });

  it.each(mutations)(
    "keeps owner, cache, durable profile, and events unchanged when $label persistence fails",
    async ({ invoke }) => {
      const ownerBefore = coordinator.getCurrentState();
      const cacheBefore = structuredClone(service.cache.dataState);
      const durableBefore = structuredClone(
        fixture.storage.getProfile("captain"),
      );
      fixture.storage.saveProfile.mockReturnValue(false);
      vi.spyOn(console, "error").mockImplementation(() => {});

      await expect(invoke(service)).resolves.toBe(false);

      expect(fixture.storage.saveProfile).toHaveBeenCalledOnce();
      expect(coordinator.getCurrentState()).toEqual(ownerBefore);
      expect(service.cache.dataState).toEqual(cacheBefore);
      expect(fixture.storage.getProfile("captain")).toEqual(durableBefore);
      expect(
        fixture
          .getEventHistory()
          .filter(
            ({ event }) =>
              event === "data:state-changed" ||
              event === "profile:updated" ||
              commandTopics.has(event),
          ),
      ).toEqual([]);
    },
  );

  it.each(mutations)(
    "publishes one ordered $label commit after durable persistence",
    async ({ invoke, topic, commands, event }) => {
      const order = [];
      const detachState = fixture.eventBus.on("data:state-changed", () =>
        order.push("data:state-changed"),
      );
      const detachProfile = fixture.eventBus.on("profile:updated", () =>
        order.push("profile:updated"),
      );
      const detachMutation = fixture.eventBus.on(topic, (payload) => {
        order.push(topic);
        expect(payload).toEqual(event);
      });
      const ownerBefore = coordinator.getCurrentState();

      try {
        await expect(invoke(service)).resolves.toBe(true);
      } finally {
        detachState();
        detachProfile();
        detachMutation();
      }

      const ownerAfter = coordinator.getCurrentState();
      const durableAfter = fixture.storage.getProfile("captain");
      expect(fixture.storage.saveProfile).toHaveBeenCalledOnce();
      expect(ownerAfter.revision).toBe(ownerBefore.revision + 1);
      expect(ownerAfter.profiles.captain.builds.space.keys.F1).toEqual(
        commands,
      );
      expect(durableAfter.builds.space.keys.F1).toEqual(commands);
      expect(service.cache.dataState).toEqual(ownerAfter);
      expect(ownerAfter.profiles.captain.keybindMetadata).toEqual(
        ownerBefore.profiles.captain.keybindMetadata,
      );
      expect(order).toEqual(["data:state-changed", "profile:updated", topic]);
    },
  );

  it("adds a missing bindset environment without replacing its sibling environment", async () => {
    await expect(coordinator.setEnvironment("ground")).resolves.toEqual({
      success: true,
      environment: "ground",
    });
    await vi.waitFor(() => {
      expect(service.cache.dataState?.currentEnvironment).toBe("ground");
    });
    fixture.eventBusFixture.clearEventHistory();
    fixture.storage.saveProfile.mockClear();

    await expect(
      service.addCommand("G1", "GroundNamed", "Weapons"),
    ).resolves.toBe(true);

    const ownerAfter = coordinator.getCurrentState();
    const durableAfter = fixture.storage.getProfile("captain");
    expect(ownerAfter.profiles.captain.bindsets.Weapons).toEqual({
      space: { keys: { F1: ["NamedOne", "NamedTwo"] } },
      ground: { keys: { G1: ["GroundNamed"] } },
    });
    expect(durableAfter.bindsets.Weapons).toEqual(
      ownerAfter.profiles.captain.bindsets.Weapons,
    );
    expect(service.cache.dataState).toEqual(ownerAfter);
    expect(
      fixture
        .getEventHistory()
        .filter(({ event }) =>
          ["data:state-changed", "profile:updated", "command-added"].includes(
            event,
          ),
        )
        .map(({ event }) => event),
    ).toEqual(["data:state-changed", "profile:updated", "command-added"]);
  });
});
