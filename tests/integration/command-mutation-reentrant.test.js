import LocalStorageVisitedStatePersistence from "../../src/js/components/storage/LocalStorageVisitedStatePersistence.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CommandService from "../../src/js/components/services/CommandService.js";
import CommandChainService from "../../src/js/components/services/CommandChainService.js";
import DataCoordinator from "../../src/js/components/services/DataCoordinator.js";
import { createRealEventBusFixture } from "../fixtures/core/eventBus.js";
import { createLocalStorageFixture } from "../fixtures/core/index.js";
import { createProjectRepository } from "./helpers/projectRepository.js";

describe("Command mutation reentrant owner listeners", () => {
  let bus, local, projectRepository, owner, commands, chain, release;
  beforeEach(async () => {
    bus = await createRealEventBusFixture();
    local = createLocalStorageFixture({
      initialData: {
        sto_keybind_manager: {
          version: "1.0.0",
          currentProfile: "captain",
          profiles: {
            captain: {
              name: "Captain",
              currentEnvironment: "space",
              builds: {
                space: { keys: { F1: ["One"] } },
                ground: { keys: {} },
              },
              aliases: {},
              migrationVersion: "2.1.1",
            },
          },
          globalAliases: {},
        },
      },
    });
    projectRepository = createProjectRepository();
    owner = new DataCoordinator({
      visitedState: new LocalStorageVisitedStatePersistence({
        storage: localStorage,
      }),
      eventBus: bus.eventBus,
      projectRepository,
      i18n: { t: (key) => key },
    });
    commands = new CommandService({
      eventBus: bus.eventBus,
      i18n: { t: (key) => key },
    });
    chain = new CommandChainService({
      eventBus: bus.eventBus,
      i18n: { t: (key) => key },
    });
    owner.init();
    commands.init();
    chain.init();
    await owner.initialStateReady;
    chain.cache.selectedKey = "F1";
  });
  afterEach(() => {
    release?.();
    commands.destroy();
    chain.destroy();
    owner.destroy();
    bus.destroy();
    local.destroy();
    vi.restoreAllMocks();
  });

  it("allows a committed command listener to await a later command without a queue cycle", async () => {
    const revision = owner.getCurrentState().revision;
    const write = vi.spyOn(projectRepository, "commit");
    let nested;
    bus.eventBus.on("data:state-changed", ({ state }) => {
      if (state.revision === revision + 1) {
        nested = commands.addCommand("F1", "Three");
        return nested;
      }
    });
    await expect(commands.addCommand("F1", "Two")).resolves.toBe(true);
    await expect(nested).resolves.toBe(true);
    expect(
      write.mock.calls.map(
        ([root]) => root.profiles.captain.builds.space.keys.F1,
      ),
    ).toEqual([
      ["One", "Two"],
      ["One", "Two", "Three"],
    ]);
    expect(owner.getCurrentState().revision).toBe(revision + 2);
  });

  it("allows a later reply before a held listener without rewinding accepted commands", async () => {
    const revision = owner.getCurrentState().revision;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const published = [];
    bus.eventBus.on("command-added", ({ command }) => published.push(command));
    bus.eventBus.on("data:state-changed", ({ state }) => {
      if (state.revision === revision + 1) return gate;
    });
    let firstSettled = false;
    const first = commands.addCommand("F1", "Two").then((result) => {
      firstSettled = true;
      return result;
    });
    await vi.waitFor(() =>
      expect(owner.getCurrentState().revision).toBe(revision + 1),
    );
    await expect(commands.addCommand("F1", "Three")).resolves.toBe(true);
    expect(firstSettled).toBe(false);
    release();
    await expect(first).resolves.toBe(true);
    expect(published).toEqual(["Three", "Two"]);
    expect(
      commands.cache.dataState.profiles.captain.builds.space.keys.F1,
    ).toEqual(["One", "Two", "Three"]);
    expect(
      projectRepository.load().value.profiles.captain.builds.space.keys.F1,
    ).toEqual(["One", "Two", "Three"]);
  });

  it.each([
    {
      topic: "command-edited",
      invoke: (service) => service.editCommand("F1", 0, "Changed"),
      expected: ["Changed", "Two", "Three"],
    },
    {
      topic: "command-deleted",
      invoke: (service) => service.deleteCommand("F1", 0),
      expected: ["Two", "Three"],
    },
    {
      topic: "command-moved",
      invoke: (service) => service.moveCommand("F1", 0, 1),
      expected: ["Two", "One", "Three"],
    },
  ])(
    "retains late $topic notifications with the current accepted chain",
    async ({ topic, invoke, expected }) => {
      await commands.addCommand("F1", "Two");
      const revision = owner.getCurrentState().revision;
      const gate = new Promise((resolve) => {
        release = resolve;
      });
      const notification = vi.fn();
      const projection = vi.fn();
      bus.eventBus.on(topic, notification);
      bus.eventBus.on("chain-data-changed", projection);
      bus.eventBus.on("data:state-changed", ({ state }) => {
        if (state.revision === revision + 1) return gate;
      });
      const first = invoke(commands);
      await vi.waitFor(() =>
        expect(owner.getCurrentState().revision).toBe(revision + 1),
      );
      await expect(commands.addCommand("F1", "Three")).resolves.toBe(true);
      expect(notification).not.toHaveBeenCalled();
      release();
      await expect(first).resolves.toBe(true);
      await vi.waitFor(() => expect(notification).toHaveBeenCalledOnce());
      expect(notification).toHaveBeenCalledWith(
        expect.objectContaining({ key: "F1", commands: expected }),
      );
      await vi.waitFor(() =>
        expect(projection).toHaveBeenLastCalledWith(
          expect.objectContaining({ commands: expected }),
        ),
      );
      expect(
        projectRepository.load().value.profiles.captain.builds.space.keys.F1,
      ).toEqual(expected);
    },
  );
});
