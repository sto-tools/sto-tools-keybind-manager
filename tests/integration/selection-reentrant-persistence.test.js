import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DataCoordinator from "../../src/js/components/services/DataCoordinator.js";
import SelectionService from "../../src/js/components/services/SelectionService.js";
import { request } from "../../src/js/core/requestResponse.js";
import { createRealEventBusFixture } from "../fixtures/core/eventBus.js";
import { createLocalStorageFixture } from "../fixtures/core/storage.js";
import { createProjectRepository } from "./helpers/projectRepository.js";

const profile = {
  name: "Captain",
  currentEnvironment: "space",
  builds: {
    space: { keys: { S0: [], S1: [], S2: [] } },
    ground: { keys: {} },
  },
  aliases: {},
  bindsets: {},
  selections: { space: "S0" },
  migrationVersion: "2.1.1",
};

describe("SelectionService reentrant owner publication", () => {
  let bus, local, projectRepository, owner, service;

  beforeEach(async () => {
    bus = await createRealEventBusFixture();
    local = createLocalStorageFixture({
      initialData: {
        sto_keybind_manager_visited: "true",
      },
    });
    localStorage.setItem(
      "sto_keybind_manager",
      JSON.stringify({
        currentProfile: "captain",
        profiles: { captain: profile },
        settings: {},
        globalAliases: {},
        version: "1.0.0",
        lastModified: "2026-01-01T00:00:00.000Z",
      }),
    );
    projectRepository = createProjectRepository();
    owner = new DataCoordinator({
      eventBus: bus.eventBus,
      projectRepository,
      i18n: { t: (key) => key },
    });
    owner.init();
    await owner.initialStateReady;
    service = new SelectionService({ eventBus: bus.eventBus });
    service.init();
    await vi.waitFor(() => expect(service.cache.dataState?.ready).toBe(true));
  });

  afterEach(async () => {
    if (!service.destroyed) service.destroy();
    await service.selectionPersistenceSettled;
    owner.destroy();
    bus.destroy();
    local.destroy();
    vi.restoreAllMocks();
  });

  it("admits a second selection awaited by the first write publication", async () => {
    const initialRevision = owner.getCurrentState().revision;
    const writes = vi.spyOn(projectRepository, "commit");
    const completions = [];
    const selectionStates = [];
    let second = null;
    bus.eventBus.on("selection:state-changed", (state) =>
      selectionStates.push(structuredClone(state)),
    );
    bus.eventBus.on("data:state-changed", async ({ state }) => {
      if (
        second ||
        state.revision !== initialRevision + 1 ||
        state.currentProfileData?.selections?.space !== "S1"
      )
        return;
      completions.push("write-1-listener");
      second = request(
        bus.eventBus,
        "selection:select-key",
        { keyName: "S2" },
        1000,
      ).then((result) => {
        completions.push("write-2-reply");
        return result;
      });
      await second;
      completions.push("write-1-listener-settled");
    });

    const first = request(
      bus.eventBus,
      "selection:select-key",
      { keyName: "S1" },
      1000,
    ).then((result) => {
      completions.push("write-1-reply");
      return result;
    });
    await expect(first).resolves.toBe("S2");
    await expect(second).resolves.toBe("S2");

    expect(
      writes.mock.calls.map(([root]) => root.profiles.captain.selections),
    ).toEqual([{ space: "S1" }, { space: "S2" }]);
    expect(completions).toEqual([
      "write-1-listener",
      "write-2-reply",
      "write-1-listener-settled",
      "write-1-reply",
    ]);
    expect(owner.getCurrentState().revision).toBe(initialRevision + 2);
    expect(projectRepository.load().value.profiles.captain.selections).toEqual({
      space: "S2",
    });
    expect(service.cache.selectedKey).toBe("S2");
    const firstS2 = selectionStates.findIndex(
      ({ selectedKey }) => selectedKey === "S2",
    );
    expect(firstS2).toBeGreaterThanOrEqual(0);
    expect(selectionStates.slice(firstS2 + 1)).not.toContainEqual(
      expect.objectContaining({ selectedKey: "S1" }),
    );
  });

  it("reinitializes inside the first publication without waiting for its reply", async () => {
    const initialRevision = owner.getCurrentState().revision;
    const writes = vi.spyOn(projectRepository, "commit");
    const oldController = service.selectionPersistence;
    let fresh = null;
    bus.eventBus.on("data:state-changed", async ({ state }) => {
      if (
        fresh ||
        state.revision !== initialRevision + 1 ||
        state.currentProfileData?.selections?.space !== "S1"
      )
        return;
      service.destroy();
      service.init();
      expect(service.selectionPersistence).not.toBe(oldController);
      fresh = request(
        bus.eventBus,
        "selection:select-key",
        { keyName: "S2" },
        1000,
      );
      await fresh;
    });

    const old = request(
      bus.eventBus,
      "selection:select-key",
      { keyName: "S1" },
      1000,
    );
    await expect(old).resolves.toBe("S2");
    await expect(fresh).resolves.toBe("S2");
    expect(
      writes.mock.calls.map(([root]) => root.profiles.captain.selections),
    ).toEqual([{ space: "S1" }, { space: "S2" }]);
    expect(owner.getCurrentState().revision).toBe(initialRevision + 2);
    expect(projectRepository.load().value.profiles.captain.selections).toEqual({
      space: "S2",
    });
    expect(service.cache.selectedKey).toBe("S2");
  });
});
