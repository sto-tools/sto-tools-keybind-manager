import LocalStorageVisitedStatePersistence from "../../src/js/components/storage/LocalStorageVisitedStatePersistence.js";
import { afterEach, describe, expect, it, vi } from "vitest";

import DataCoordinator from "../../src/js/components/services/DataCoordinator.js";
import LocalStorageProjectRepository from "../../src/js/components/storage/LocalStorageProjectRepository.js";
import { request } from "../../src/js/core/requestResponse.js";
import { createEventBusFixture } from "../fixtures/core/eventBus.js";

const rootKey = "sto_keybind_manager";
const backupKey = "sto_keybind_manager_backup";
const resetKey = "sto_app_reset";

function profile(name = "Captain") {
  return {
    name,
    currentEnvironment: "space",
    builds: { space: { keys: {} }, ground: { keys: {} } },
    aliases: {},
    bindsets: {},
    keybindMetadata: {},
    aliasMetadata: {},
    bindsetMetadata: {},
    migrationVersion: "2.1.1",
  };
}

function root() {
  return {
    version: "1.0.0",
    currentProfile: "captain",
    profiles: { captain: profile() },
    globalAliases: {},
    lastModified: "2026-09-26T00:00:00.000Z",
  };
}

function memoryStorage(initial = root()) {
  const values = new Map([[rootKey, JSON.stringify(initial)]]);
  return {
    values,
    failBackup: false,
    failSentinelRemoval: false,
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      if (key === backupKey && this.failBackup) throw new Error("quota");
      values.set(key, String(value));
    },
    removeItem(key) {
      if (key === resetKey && this.failSentinelRemoval) {
        throw new Error("sentinel unavailable");
      }
      values.delete(key);
    },
  };
}

function repository(storage) {
  return new LocalStorageProjectRepository({
    storage,
    version: "1.0.0",
    now: () => "2026-09-26T12:00:00.000Z",
  });
}

async function start(eventBus, projectRepository) {
  const owner = new DataCoordinator({
    visitedState: new LocalStorageVisitedStatePersistence({
      storage: localStorage,
    }),
    eventBus,
    projectRepository,
    i18n: { t: (key) => key },
    defaultProfiles: {},
  });
  owner.init();
  await owner.initialStateReady;
  return owner;
}

describe("real project repository owner chain", () => {
  const owners = [];
  const buses = [];

  afterEach(() => {
    for (const owner of owners.splice(0).reverse()) owner.destroy();
    for (const bus of buses.splice(0).reverse()) bus.destroy();
    vi.restoreAllMocks();
  });

  it("persists owner operations before publishing their adopted root", async () => {
    const storage = memoryStorage();
    const projectRepository = repository(storage);
    const bus = createEventBusFixture();
    buses.push(bus);
    const owner = await start(bus.eventBus, projectRepository);
    owners.push(owner);
    const publications = [];
    bus.eventBus.on("storage:data-changed", ({ data }) => {
      publications.push({
        event: "storage",
        data,
        durable: JSON.parse(storage.getItem(rootKey)),
      });
    });
    bus.eventBus.on("data:state-changed", ({ state }) => {
      publications.push({ event: "state", state });
    });

    const created = await request(bus.eventBus, "data:create-profile", {
      name: "Away Team",
      mode: "ground",
    });
    await request(bus.eventBus, "data:switch-profile", {
      profileId: created.profileId,
    });
    await request(bus.eventBus, "data:update-profile", {
      profileId: created.profileId,
      add: { aliases: { Engage: { commands: ["FireAll"] } } },
    });
    await request(bus.eventBus, "data:rename-profile", {
      profileId: created.profileId,
      newName: "Away Team Prime",
    });
    const cloned = await request(bus.eventBus, "data:clone-profile", {
      sourceId: created.profileId,
      newName: "Away Team Copy",
    });
    await owner.setEnvironment("space");
    await request(bus.eventBus, "data:delete-profile", {
      profileId: cloned.profileId,
    });

    expect(publications.length).toBeGreaterThan(0);
    for (const publication of publications.filter(
      ({ event }) => event === "storage",
    )) {
      expect(publication.data).toEqual(publication.durable);
    }
    expect(
      projectRepository.load().value.profiles[created.profileId],
    ).toMatchObject({
      name: "Away Team Prime",
      aliases: { Engage: { commands: ["FireAll"] } },
    });
  });

  it("rejects stale revisions without a write or publication", async () => {
    const storage = memoryStorage();
    const projectRepository = repository(storage);
    const commit = vi.spyOn(projectRepository, "commit");
    const bus = createEventBusFixture();
    buses.push(bus);
    const owner = await start(bus.eventBus, projectRepository);
    owners.push(owner);
    commit.mockClear();
    bus.clearEventHistory();
    const state = owner.getCurrentState();

    await expect(
      request(bus.eventBus, "data:update-profile", {
        profileId: "captain",
        updates: { properties: { description: "stale" } },
        precondition: {
          authorityEpoch: state.authorityEpoch,
          revision: state.revision - 1,
        },
      }),
    ).rejects.toThrow("operation_cancelled");

    expect(commit).not.toHaveBeenCalled();
    expect(
      bus
        .getEventHistory()
        .filter(({ event }) =>
          ["storage:data-changed", "data:state-changed"].includes(event),
        ),
    ).toEqual([]);
  });

  it.each([
    ["false result", () => false],
    [
      "throw",
      () => {
        throw new Error("offline");
      },
    ],
  ])("keeps accepted state unchanged on repository %s", async (_, failure) => {
    const storage = memoryStorage();
    const real = repository(storage);
    const projectRepository = {
      load: () => real.load(),
      commit: vi.fn(failure),
      reset: () => real.reset(),
    };
    const bus = createEventBusFixture();
    buses.push(bus);
    const owner = await start(bus.eventBus, projectRepository);
    owners.push(owner);
    const before = owner.getCurrentState();
    bus.clearEventHistory();

    await expect(
      request(bus.eventBus, "data:update-profile", {
        profileId: "captain",
        updates: { properties: { description: "must not publish" } },
      }),
    ).rejects.toThrow("failed_to_save_profile");
    expect(owner.getCurrentState()).toBe(before);
    expect(real.load().value.profiles.captain.description).toBeUndefined();
    expect(
      bus
        .getEventHistory()
        .filter(({ event }) =>
          ["storage:data-changed", "data:state-changed"].includes(event),
        ),
    ).toEqual([]);
  });

  it("classifies backup failure as advisory when the root commit succeeds", async () => {
    const storage = memoryStorage();
    storage.failBackup = true;
    const projectRepository = repository(storage);
    const commit = vi.spyOn(projectRepository, "commit");
    const bus = createEventBusFixture();
    buses.push(bus);
    const owner = await start(bus.eventBus, projectRepository);
    owners.push(owner);

    await expect(
      request(bus.eventBus, "data:update-profile", {
        profileId: "captain",
        updates: {
          properties: { description: "durable despite backup failure" },
        },
      }),
    ).resolves.toMatchObject({ success: true });
    expect(commit.mock.results.at(-1).value).toMatchObject({
      status: "committed",
      backup: { status: "indeterminate", error: "backup_write_failed" },
    });
    expect(projectRepository.load().value.profiles.captain.description).toBe(
      "durable despite backup failure",
    );
  });

  it("fresh-loads reloads and replacement owners from the repository", async () => {
    const storage = memoryStorage();
    const projectRepository = repository(storage);
    const bus = createEventBusFixture();
    buses.push(bus);
    const first = await start(bus.eventBus, projectRepository);
    owners.push(first);
    const externallyChanged = root();
    externallyChanged.profiles.captain.description = "fresh load";
    storage.setItem(rootKey, JSON.stringify(externallyChanged));

    await request(bus.eventBus, "data:reload-state");
    expect(first.getCurrentState().profiles.captain.description).toBe(
      "fresh load",
    );

    first.destroy();
    const replacement = await start(bus.eventBus, projectRepository);
    owners.push(replacement);
    expect(replacement.getCurrentState().profiles.captain.description).toBe(
      "fresh load",
    );
    expect(bus.eventBus.hasListeners("rpc:data:update-profile")).toBe(true);
  });

  it("retries a verified reset-sentinel failure after owner restart", async () => {
    const storage = memoryStorage();
    storage.values.set(resetKey, "true");
    storage.failSentinelRemoval = true;
    const projectRepository = repository(storage);
    const commit = vi.spyOn(projectRepository, "commit");
    const bus = createEventBusFixture();
    buses.push(bus);
    const failedOwner = new DataCoordinator({
      visitedState: new LocalStorageVisitedStatePersistence({
        storage: localStorage,
      }),
      eventBus: bus.eventBus,
      projectRepository,
      i18n: { t: (key) => key },
      defaultProfiles: {},
    });
    owners.push(failedOwner);
    failedOwner.init();

    await expect(failedOwner.initialStateReady).rejects.toThrow(
      "failed_to_load_profile_data",
    );
    expect(failedOwner._stateReady).toBe(false);
    expect(storage.getItem(resetKey)).toBe("true");
    expect(commit.mock.results.at(-1).value).toMatchObject({
      status: "sentinel_failed",
      rootWrite: { status: "skipped", reason: "already_current" },
      verification: { status: "verified" },
    });

    failedOwner.destroy();
    storage.failSentinelRemoval = false;
    const replacement = await start(bus.eventBus, projectRepository);
    owners.push(replacement);

    expect(replacement._stateReady).toBe(true);
    expect(replacement.getCurrentState().currentProfile).toBe("captain");
    expect(storage.getItem(resetKey)).toBeNull();
    expect(projectRepository.load().status).toBe("current");
    expect(commit.mock.results.at(-1).value).toMatchObject({
      status: "committed",
      resetSentinel: { status: "acknowledged" },
    });
  });

  it("keeps a durable commit while suppressing the replaced owner's later publications", async () => {
    const storage = memoryStorage();
    const projectRepository = repository(storage);
    const bus = createEventBusFixture();
    buses.push(bus);
    const first = await start(bus.eventBus, projectRepository);
    owners.push(first);
    const stateChanged = vi.fn();
    bus.eventBus.on("data:state-changed", stateChanged);
    let replacement;
    bus.eventBus.on("storage:data-changed", () => {
      first.destroy();
      replacement = new DataCoordinator({
        visitedState: new LocalStorageVisitedStatePersistence({
          storage: localStorage,
        }),
        eventBus: bus.eventBus,
        projectRepository,
        i18n: { t: (key) => key },
        defaultProfiles: {},
      });
      owners.push(replacement);
      replacement.init();
    });

    await expect(
      first.updateProfile("captain", {
        properties: { description: "committed before replacement" },
      }),
    ).resolves.toMatchObject({ success: true });
    await replacement.initialStateReady;

    expect(projectRepository.load().value.profiles.captain.description).toBe(
      "committed before replacement",
    );
    expect(replacement.getCurrentState().profiles.captain.description).toBe(
      "committed before replacement",
    );
    expect(stateChanged).toHaveBeenCalledOnce();
    expect(stateChanged).toHaveBeenLastCalledWith(
      expect.objectContaining({ reason: "initial-load" }),
    );
  });
});
