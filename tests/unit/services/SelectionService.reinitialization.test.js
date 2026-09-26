import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SelectionService from "../../../src/js/components/services/SelectionService.js";
import DataCoordinator from "../../../src/js/components/services/DataCoordinator.js";
import StorageService from "../../../src/js/components/services/StorageService.js";
import { createRealServiceFixture } from "../../fixtures/index.js";
import { request } from "../../../src/js/core/requestResponse.js";

const profile = {
  name: "Captain",
  currentEnvironment: "space",
  builds: {
    space: { keys: { S0: [], S1: [], Imported: [] } },
    ground: { keys: {} },
  },
  aliases: {},
  bindsets: {},
  selections: { space: "S0" },
  migrationVersion: "2.1.1",
};
describe("SelectionService same-instance lifecycle on the real owner protocol", () => {
  let fixture, storage, owner, service, release;
  beforeEach(async () => {
    fixture = await createRealServiceFixture({
      initialStorageData: {
        sto_keybind_manager: {
          currentProfile: "captain",
          profiles: { captain: profile },
          settings: {},
          globalAliases: {},
          version: "1.0.0",
          lastModified: "2026-01-01T00:00:00.000Z",
        },
        sto_keybind_manager_visited: true,
      },
    });
    localStorage.setItem(
      "sto_keybind_manager",
      JSON.stringify(fixture.storage.getAllData()),
    );
    localStorage.setItem("sto_keybind_manager_visited", "true");
    storage = new StorageService({
      eventBus: fixture.eventBus,
      version: "1.0.0",
    });
    storage.init();
    owner = new DataCoordinator({
      eventBus: fixture.eventBus,
      storage,
      i18n: { t: (key) => key },
    });
    owner.init();
    await owner.initialStateReady;
    service = new SelectionService({ eventBus: fixture.eventBus });
    service.init();
    await vi.waitFor(() => expect(service.cache.dataState?.ready).toBe(true));
  });
  afterEach(async () => {
    release?.();
    if (!service.destroyed) service.destroy();
    await service.selectionPersistenceSettled;
    owner.destroy();
    storage.destroy();
    fixture.destroy();
    vi.restoreAllMocks();
  });

  it("durably selects through the reinstalled RPC on the same service instance", async () => {
    const oldController = service.selectionPersistence;
    service.destroy();
    await service.selectionPersistenceSettled;
    service.init();
    await vi.waitFor(() => expect(service.cache.dataState?.ready).toBe(true));
    expect(service.selectionPersistence).not.toBe(oldController);
    await expect(
      request(fixture.eventBus, "selection:select-key", { keyName: "S1" }),
    ).resolves.toBe("S1");
    expect(storage.getProfile("captain").selections).toEqual({
      space: "S1",
    });
    expect(owner.state.profiles.captain.selections).toEqual({ space: "S1" });
    expect(service.cache.selectedKey).toBe("S1");
  });

  it("keeps an old admitted correction on its original authority while the new lifecycle stays usable", async () => {
    const selectionStates = [];
    const keySelections = [];
    fixture.eventBus.on("selection:state-changed", (state) =>
      selectionStates.push(structuredClone(state)),
    );
    fixture.eventBus.on("key-selected", (selection) =>
      keySelections.push(structuredClone(selection)),
    );
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const save = storage.saveProfile.bind(storage);
    const writes = vi
      .spyOn(storage, "saveProfile")
      .mockImplementationOnce(async (...args) => {
        await gate;
        return save(...args);
      });
    const oldController = service.selectionPersistence;
    const oldAuthority = service.selectionPersistenceAuthority;
    const oldPrecondition = vi.spyOn(oldAuthority, "precondition");
    const pending = request(fixture.eventBus, "selection:select-key", {
      keyName: "S1",
    });
    await vi.waitFor(() => expect(writes).toHaveBeenCalledOnce());
    oldController.reset("captain", { space: "Imported" });
    service.destroy();
    const oldSettled = service.selectionPersistenceSettled;
    service.init();
    expect(service.selectionPersistence).not.toBe(oldController);
    expect(service.selectionPersistenceAuthority).not.toBe(oldAuthority);
    const freshPrecondition = vi.spyOn(
      service.selectionPersistenceAuthority,
      "precondition",
    );
    selectionStates.length = 0;
    keySelections.length = 0;
    const fresh = request(fixture.eventBus, "selection:select-key", {
      keyName: "S0",
      forceEmit: true,
    });
    await Promise.resolve();
    expect(writes).toHaveBeenCalledOnce();
    expect(freshPrecondition).not.toHaveBeenCalled();
    release();
    await pending;
    await expect(fresh).resolves.toBe("S0");
    await oldSettled;
    expect(writes.mock.calls.map(([, value]) => value.selections)).toEqual([
      { space: "S1" },
      { space: "Imported" },
      { space: "S0" },
    ]);
    expect(oldPrecondition).toHaveBeenCalledTimes(2);
    expect(freshPrecondition).toHaveBeenCalledOnce();
    await expect(oldController.persist("captain", "space", "S1")).resolves.toBe(
      false,
    );
    expect(storage.getProfile("captain").selections).toEqual({
      space: "S0",
    });
    expect(selectionStates).not.toContainEqual(
      expect.objectContaining({ selectedKey: "S1" }),
    );
    expect(keySelections).toEqual([
      expect.objectContaining({ key: "S0", source: "SelectionService" }),
    ]);
    expect(service.cache.selectedKey).toBe("S0");
    service.destroy();
    await service.selectionPersistenceSettled;
    expect(fixture.eventBus.hasListeners("rpc:selection:select-key")).toBe(
      false,
    );
  });
});
