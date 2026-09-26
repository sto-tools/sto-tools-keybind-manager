import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

import DataCoordinator from "../../../src/js/components/services/DataCoordinator.js";
import StorageService from "../../../src/js/components/services/StorageService.js";
import { createServiceFixture } from "../../fixtures/index.js";

const SERVICES_DIRECTORY = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../src/js/components/services",
);

const RETIRED_QUERY_TOPICS = [
  "rpc:data:get-settings",
  "rpc:data:get-current-state",
  "rpc:data:get-all-profiles",
  "rpc:data:get-keys",
  "rpc:data:get-key-commands",
];

const RETIRED_STORAGE_METHODS = [
  "getAllData",
  "saveAllData",
  "getProfile",
  "saveProfile",
  "deleteProfile",
  "invalidateCache",
];

describe("DataCoordinator ProjectRepository cutover", () => {
  let fixture;
  let coordinator;

  afterEach(() => {
    if (coordinator && !coordinator.destroyed) coordinator.destroy();
    fixture?.destroy();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  async function startCoordinator() {
    localStorage.setItem("sto_keybind_manager_visited", "true");
    fixture = createServiceFixture();
    coordinator = new DataCoordinator({
      eventBus: fixture.eventBus,
      projectRepository: fixture.projectRepository,
      i18n: { t: (key) => key },
    });
    coordinator.init();
    await coordinator.initialStateReady;
    fixture.projectRepository.load.mockClear();
    fixture.projectRepository.commit.mockClear();
    fixture.eventBusFixture.clearEventHistory();
  }

  it("has no storage injection or storageWrites dependency", () => {
    fixture = createServiceFixture();
    const legacyStorage = new Proxy(
      {},
      {
        get() {
          throw new Error("legacy storage must not be inspected");
        },
      },
    );
    coordinator = new DataCoordinator({
      eventBus: fixture.eventBus,
      projectRepository: fixture.projectRepository,
      storage: legacyStorage,
      i18n: { t: (key) => key },
    });

    expect(coordinator).not.toHaveProperty("storage");
    expect(coordinator.projectRepository).toBe(fixture.projectRepository);
    const coordinatorSource = readFileSync(
      join(SERVICES_DIRECTORY, "DataCoordinator.js"),
      "utf8",
    );
    expect(coordinatorSource).not.toMatch(/storageWrites/);
    expect(() =>
      readFileSync(join(SERVICES_DIRECTORY, "storageWrites.js"), "utf8"),
    ).toThrow();
  });

  it("requires the repository to load and uses it as the only project writer", async () => {
    localStorage.setItem("sto_keybind_manager_visited", "true");
    fixture = createServiceFixture();
    const legacyWriter = { saveAllData: vi.fn(), saveProfile: vi.fn() };
    coordinator = new DataCoordinator({
      eventBus: fixture.eventBus,
      projectRepository: fixture.projectRepository,
      storage: legacyWriter,
      i18n: { t: (key) => key },
    });
    coordinator.init();
    await coordinator.initialStateReady;
    fixture.projectRepository.commit.mockClear();

    await expect(
      coordinator.createProfile("Repository Owner"),
    ).resolves.toMatchObject({
      success: true,
    });
    expect(fixture.projectRepository.commit).toHaveBeenCalledOnce();
    expect(legacyWriter.saveAllData).not.toHaveBeenCalled();
    expect(legacyWriter.saveProfile).not.toHaveBeenCalled();

    const missingRepository = new DataCoordinator({
      eventBus: fixture.eventBus,
      i18n: { t: (key) => key },
    });
    missingRepository.init();
    await expect(missingRepository.initialStateReady).rejects.toThrow(
      "failed_to_load_profile_data",
    );
    missingRepository.destroy();
  });

  it("leaves StorageService inert and installs no retired state-query RPC", async () => {
    localStorage.setItem("sto_keybind_manager_visited", "true");
    fixture = createServiceFixture();
    const storage = new StorageService({ eventBus: fixture.eventBus });
    storage.init();
    for (const method of RETIRED_STORAGE_METHODS) {
      expect(storage[method], method).toBeUndefined();
    }

    coordinator = new DataCoordinator({
      eventBus: fixture.eventBus,
      projectRepository: fixture.projectRepository,
      i18n: { t: (key) => key },
    });
    coordinator.init();
    await coordinator.initialStateReady;

    for (const topic of RETIRED_QUERY_TOPICS) {
      expect(fixture.eventBus.getListenerCount(topic), topic).toBe(0);
    }
    storage.destroy();
  });

  it.each([
    [
      "an accessor",
      (accessed) =>
        Object.defineProperty({}, "persistImportedSettings", {
          enumerable: true,
          get() {
            accessed();
            return vi.fn();
          },
        }),
    ],
    [
      "a hostile proxy",
      () =>
        new Proxy(
          {},
          {
            ownKeys() {
              throw new Error("hostile options reflection");
            },
          },
        ),
    ],
  ])(
    "rejects %s import options before owner capture or persistence",
    async (_case, createOptions) => {
      await startCoordinator();
      const accessed = vi.fn();
      const capture = vi.spyOn(coordinator, "_captureOperationGeneration");
      const stateBefore = coordinator.getCurrentState();

      await expect(
        coordinator.replaceProjectFromImport(
          { profiles: {} },
          createOptions(accessed),
        ),
      ).rejects.toThrow("invalid_mutation_request");

      expect(accessed).not.toHaveBeenCalled();
      expect(capture).not.toHaveBeenCalled();
      expect(fixture.projectRepository.load).not.toHaveBeenCalled();
      expect(fixture.projectRepository.commit).not.toHaveBeenCalled();
      expect(coordinator.getCurrentState()).toBe(stateBefore);
      expect(fixture.getEventHistory()).toEqual([]);
    },
  );

  it.each([
    [
      "an accessor",
      (accessed) =>
        Object.defineProperty({}, "fingerprint", {
          enumerable: true,
          get() {
            accessed();
            return "fnv1a32:00000000:0";
          },
        }),
    ],
    [
      "a hostile proxy",
      () =>
        new Proxy(
          {},
          {
            ownKeys() {
              throw new Error("hostile options reflection");
            },
          },
        ),
    ],
  ])(
    "rejects %s activation options before owner capture or repository load",
    async (_case, createOptions) => {
      await startCoordinator();
      const accessed = vi.fn();
      const capture = vi.spyOn(coordinator, "_captureOperationGeneration");
      const stateBefore = coordinator.getCurrentState();

      await expect(
        coordinator.activateProjectFromImport(
          { profiles: {}, currentProfile: null },
          createOptions(accessed),
        ),
      ).resolves.toMatchObject({
        success: false,
        error: "invalid_project_activation",
      });

      expect(accessed).not.toHaveBeenCalled();
      expect(capture).not.toHaveBeenCalled();
      expect(fixture.projectRepository.load).not.toHaveBeenCalled();
      expect(fixture.projectRepository.commit).not.toHaveBeenCalled();
      expect(coordinator.getCurrentState()).toBe(stateBefore);
      expect(fixture.getEventHistory()).toEqual([]);
    },
  );
});
