import LocalStorageVisitedStatePersistence from "../../src/js/components/storage/LocalStorageVisitedStatePersistence.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import DataCoordinator from "../../src/js/components/services/DataCoordinator.js";
import ImportService from "../../src/js/components/services/ImportService.js";
import { respond } from "../../src/js/core/requestResponse.js";
import {
  createEventBusFixture,
  createLocalStorageFixture,
} from "../fixtures/core/index.js";
import { createProjectRepository } from "./helpers/projectRepository.js";

const root = {
  version: "1.0.0",
  created: "2026-01-01T00:00:00.000Z",
  lastModified: "2026-01-01T00:00:00.000Z",
  currentProfile: "captain",
  profiles: {
    captain: {
      name: "Captain",
      currentEnvironment: "space",
      migrationVersion: "2.1.1",
      builds: {
        space: { keys: {} },
        ground: { keys: {} },
      },
      aliases: {},
    },
  },
  globalAliases: {},
  settings: { theme: "default", autoSave: true },
};

describe("ImportService quota failure integration", () => {
  let eventBusFixture;
  let localStorageFixture;
  let projectRepository;
  let coordinator;
  let service;

  beforeEach(async () => {
    eventBusFixture = createEventBusFixture();
    localStorageFixture = createLocalStorageFixture({
      initialData: { sto_keybind_manager: root },
      quotaError: true,
    });
    projectRepository = createProjectRepository();
    coordinator = new DataCoordinator({
      visitedState: new LocalStorageVisitedStatePersistence({
        storage: localStorage,
      }),
      eventBus: eventBusFixture.eventBus,
      projectRepository,
      i18n: { t: (key) => key },
    });
    service = new ImportService({
      eventBus: eventBusFixture.eventBus,
    });

    coordinator.init();
    await vi.waitFor(() => {
      expect(coordinator.getCurrentState().ready).toBe(true);
    });
    service.init();
    respond(
      eventBusFixture.eventBus,
      "parser:parse-command-string",
      ({ commandString }) => ({
        commands: [{ command: commandString }],
        isMirrored: false,
      }),
    );
  });

  afterEach(() => {
    service?.destroy();
    coordinator?.destroy();
    eventBusFixture?.destroy();
    localStorageFixture?.destroy();
    vi.restoreAllMocks();
  });

  it("keeps cached and durable profile state silent after quota exhaustion", async () => {
    const profileUpdated = vi.fn();
    const stateChanged = vi.fn();
    eventBusFixture.eventBus.on("profile:updated", profileUpdated);
    eventBusFixture.eventBus.on("data:state-changed", stateChanged);
    const beforeState = structuredClone(coordinator.getCurrentState());
    const beforeDisk = projectRepository.load().value;

    const result = await service.importKeybindFile(
      'F1 "FireAll"',
      "captain",
      "space",
    );

    expect(result).toEqual({
      success: false,
      error: "import_failed",
      params: { reason: "storage_write_failed" },
    });
    expect(coordinator.getCurrentState()).toEqual(beforeState);
    expect(projectRepository.load().value).toEqual(beforeDisk);
    expect(profileUpdated).not.toHaveBeenCalled();
    expect(stateChanged).not.toHaveBeenCalled();
  });
});
