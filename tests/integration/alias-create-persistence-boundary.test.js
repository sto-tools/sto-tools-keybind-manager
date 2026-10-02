import LocalStorageVisitedStatePersistence from "../../src/js/components/storage/LocalStorageVisitedStatePersistence.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AliasService from "../../src/js/components/services/AliasService.js";
import DataCoordinator from "../../src/js/components/services/DataCoordinator.js";
import SelectionService from "../../src/js/components/services/SelectionService.js";
import { request } from "../../src/js/core/requestResponse.js";
import {
  createEventBusFixture,
  createLocalStorageFixture,
} from "../fixtures/core/index.js";
import { createProjectRepository } from "./helpers/projectRepository.js";

const profileId = "captain";
const root = {
  version: "1.0.0",
  created: "2026-01-01T00:00:00.000Z",
  lastModified: "2026-01-01T00:00:00.000Z",
  currentProfile: profileId,
  profiles: {
    [profileId]: {
      name: "Captain",
      currentEnvironment: "space",
      migrationVersion: "2.1.1",
      builds: { space: { keys: {} }, ground: { keys: {} } },
      aliases: {},
      selections: { space: null, ground: null, alias: null },
    },
  },
  globalAliases: {},
};

describe("Alias creation persistence boundary", () => {
  let eventBusFixture;
  let localStorageFixture;
  let projectRepository;
  let owner;
  let selection;
  let aliases;

  beforeEach(async () => {
    eventBusFixture = createEventBusFixture();
    localStorageFixture = createLocalStorageFixture({
      initialData: { sto_keybind_manager: root },
    });
    projectRepository = createProjectRepository({
      version: "1.0.0",
    });
    owner = new DataCoordinator({
      visitedState: new LocalStorageVisitedStatePersistence({
        storage: localStorage,
      }),
      eventBus: eventBusFixture.eventBus,
      projectRepository,
      i18n: { t: (key) => key },
    });
    selection = new SelectionService({ eventBus: eventBusFixture.eventBus });
    aliases = new AliasService({ eventBus: eventBusFixture.eventBus });

    owner.init();
    selection.init();
    aliases.init();
    await owner.initialStateReady;
    await vi.waitFor(() => {
      expect(selection.cache.dataState?.ready).toBe(true);
      expect(aliases.cache.dataState?.ready).toBe(true);
    });
    eventBusFixture.clearEventHistory();
  });

  afterEach(() => {
    aliases?.destroy();
    selection?.destroy();
    owner?.destroy();
    eventBusFixture?.destroy();
    localStorageFixture?.destroy();
    vi.restoreAllMocks();
  });

  it("leaves selection and every owner surface unchanged when alias persistence is rejected", async () => {
    const stateBefore = owner.getCurrentState();
    const profileBefore = structuredClone(
      projectRepository.load().value.profiles[profileId],
    );
    const selectionBefore = selection.getCurrentState();
    const rootBefore = localStorage.getItem("sto_keybind_manager");
    const backupBefore = localStorage.getItem("sto_keybind_manager_backup");
    vi.spyOn(projectRepository, "commit").mockReturnValueOnce({
      status: "write_failed",
      error: "storage_write_failed",
    });
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      request(eventBusFixture.eventBus, "alias:add", {
        name: "RejectedAlias",
        description: "must stay absent",
      }),
    ).resolves.toEqual({
      success: false,
      error: "failed_to_add_alias",
    });

    expect(owner.getCurrentState()).toBe(stateBefore);
    expect(owner.getCurrentState().revision).toBe(stateBefore.revision);
    expect(projectRepository.load().value.profiles[profileId]).toEqual(
      profileBefore,
    );
    expect(selection.getCurrentState()).toEqual(selectionBefore);
    expect(localStorage.getItem("sto_keybind_manager")).toBe(rootBefore);
    expect(localStorage.getItem("sto_keybind_manager_backup")).toBe(
      backupBefore,
    );
    expect(
      eventBusFixture
        .getEventHistory()
        .filter(({ event }) =>
          [
            "data:state-changed",
            "profile:updated",
            "selection:state-changed",
            "alias-selected",
          ].includes(event),
        ),
    ).toEqual([]);
  });

  it("selects the new alias only after its owner commit is acknowledged", async () => {
    const revisionBefore = owner.getCurrentState().revision;

    await expect(
      request(eventBusFixture.eventBus, "alias:add", {
        name: "AcceptedAlias",
        description: "durable first",
      }),
    ).resolves.toEqual({
      success: true,
      message: "alias_created",
      data: { name: "AcceptedAlias" },
    });

    expect(owner.getCurrentState().revision).toBe(revisionBefore + 1);
    expect(
      projectRepository.load().value.profiles[profileId].aliases.AcceptedAlias,
    ).toEqual({
      description: "durable first",
      commands: [],
      type: "alias",
    });
    expect(selection.getCurrentState().selectedAlias).toBe("AcceptedAlias");
    const history = eventBusFixture.getEventHistory();
    const committed = history.findIndex(
      ({ event }) => event === "data:state-changed",
    );
    const selected = history.findIndex(
      ({ event }) => event === "selection:state-changed",
    );
    expect(committed).toBeGreaterThanOrEqual(0);
    expect(selected).toBeGreaterThan(committed);
  });

  it("retains accepted alias success when selection presentation fails", async () => {
    const revisionBefore = owner.getCurrentState().revision;
    const selectionBefore = selection.getCurrentState();
    vi.spyOn(selection, "selectAlias").mockRejectedValueOnce(
      new Error("selection unavailable"),
    );
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(
      request(eventBusFixture.eventBus, "alias:add", {
        name: "DurableAlias",
      }),
    ).resolves.toEqual({
      success: true,
      message: "alias_created",
      data: { name: "DurableAlias" },
    });

    expect(owner.getCurrentState().revision).toBe(revisionBefore + 1);
    expect(
      projectRepository.load().value.profiles[profileId].aliases.DurableAlias,
    ).toMatchObject({
      commands: [],
      type: "alias",
    });
    expect(selection.getCurrentState()).toEqual(selectionBefore);
    expect(warning).toHaveBeenCalledWith(
      "[AliasService] Alias saved but selection presentation failed:",
      expect.any(Error),
    );
  });
});
