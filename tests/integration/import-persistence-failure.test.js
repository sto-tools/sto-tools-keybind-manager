import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import DataCoordinator from "../../src/js/components/services/DataCoordinator.js";
import ImportService from "../../src/js/components/services/ImportService.js";
import StorageService from "../../src/js/components/services/StorageService.js";
import { respond } from "../../src/js/core/requestResponse.js";
import {
  createEventBusFixture,
  createLocalStorageFixture,
} from "../fixtures/core/index.js";

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
  let storage;
  let coordinator;
  let service;

  beforeEach(async () => {
    eventBusFixture = createEventBusFixture();
    localStorageFixture = createLocalStorageFixture({
      initialData: { sto_keybind_manager: root },
      quotaError: true,
    });
    storage = new StorageService({
      eventBus: eventBusFixture.eventBus,
      version: "1.0.0",
    });
    coordinator = new DataCoordinator({
      eventBus: eventBusFixture.eventBus,
      storage,
      i18n: { t: (key) => key },
    });
    service = new ImportService({
      eventBus: eventBusFixture.eventBus,
      storage,
    });

    storage.init();
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
    storage?.destroy();
    eventBusFixture?.destroy();
    localStorageFixture?.destroy();
    vi.restoreAllMocks();
  });

  it("keeps cached and durable profile state silent after quota exhaustion", async () => {
    const profileUpdated = vi.fn();
    const stateChanged = vi.fn();
    eventBusFixture.eventBus.on("profile:updated", profileUpdated);
    eventBusFixture.eventBus.on("data:state-changed", stateChanged);
    const beforeMemory = structuredClone(storage.getProfile("captain"));
    const beforeState = structuredClone(coordinator.getCurrentState());
    const beforeDisk = localStorage.getItem("sto_keybind_manager");

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
    expect(storage.getProfile("captain")).toEqual(beforeMemory);
    expect(coordinator.getCurrentState()).toEqual(beforeState);
    expect(localStorage.getItem("sto_keybind_manager")).toBe(beforeDisk);
    expect(profileUpdated).not.toHaveBeenCalled();
    expect(stateChanged).not.toHaveBeenCalled();
  });
});
