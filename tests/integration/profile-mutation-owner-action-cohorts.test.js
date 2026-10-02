import LocalStorageVisitedStatePersistence from "../../src/js/components/storage/LocalStorageVisitedStatePersistence.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DataCoordinator from "../../src/js/components/services/DataCoordinator.js";
import CommandService from "../../src/js/components/services/CommandService.js";
import InterfaceModeService from "../../src/js/components/services/InterfaceModeService.js";
import VFXManagerService from "../../src/js/components/services/VFXManagerService.js";
import { request } from "../../src/js/core/requestResponse.js";
import { createServiceFixture } from "../fixtures/index.js";

const profile = {
  name: "Captain",
  description: "before",
  currentEnvironment: "space",
  builds: { space: { keys: { F1: ["FireAll"] } }, ground: { keys: {} } },
  aliases: {},
  bindsets: {},
  keybindMetadata: {},
  aliasMetadata: {},
  bindsetMetadata: {},
  migrationVersion: "2.1.1",
};
const root = {
  currentProfile: "captain",
  profiles: { captain: profile },
  globalAliases: {},
  version: "1.0.0",
  created: "2026-01-01T00:00:00.000Z",
  lastModified: "2026-01-01T00:00:00.000Z",
};

function deferred() {
  let resolve;
  const promise = new Promise((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

describe("profile mutation owner-action cohorts", () => {
  let fixture, projectRepository, owner, services;
  const i18n = { t: (key) => key };
  const durable = () =>
    fixture.storageFixture.getRawData("sto_keybind_manager");
  const backup = () =>
    fixture.storageFixture.getRawData("sto_keybind_manager_backup");
  const addAlias = (name) => ({
    add: { aliases: { [name]: { commands: ["FireAll"] } } },
  });

  beforeEach(async () => {
    fixture = createServiceFixture({
      initialStorageData: { sto_keybind_manager: root },
    });
    localStorage.setItem("sto_keybind_manager_visited", "true");
    projectRepository = fixture.projectRepository;
    owner = new DataCoordinator({
      visitedState: new LocalStorageVisitedStatePersistence({
        storage: localStorage,
      }),
      eventBus: fixture.eventBus,
      projectRepository,
      i18n,
    });
    owner.init();
    await owner.initialStateReady;
    services = [];
    fixture.eventBusFixture.clearEventHistory();
  });

  afterEach(() => {
    for (const service of services) if (!service.destroyed) service.destroy();
    if (!owner.destroyed) owner.destroy();
    fixture.destroy();
    localStorage.removeItem("sto_keybind_manager_visited");
    vi.restoreAllMocks();
  });

  it("keeps the VFX modal open and preserves owner and storage state on rejected persistence", async () => {
    const service = new VFXManagerService(fixture.eventBus, i18n);
    services.push(service);
    service.init();
    await vi.waitFor(() => expect(service.cache.dataState?.ready).toBe(true));
    service.toggleEffect("space", "Bloom");
    const before = owner.getCurrentState();
    const raw = durable();
    const backupRaw = backup();
    fixture.eventBusFixture.clearEventHistory();
    vi.spyOn(projectRepository, "commit").mockReturnValueOnce({
      status: "write_failed",
      error: "storage_write_failed",
    });
    await service.saveEffects();
    expect(owner.getCurrentState()).toBe(before);
    expect(service.cache.dataState).toEqual(before);
    expect(durable()).toBe(raw);
    expect(backup()).toBe(backupRaw);
    for (const topic of ["modal:hide", "data:state-changed", "profile:updated"])
      expect(fixture.eventBusFixture.getEventsOfType(topic)).toHaveLength(0);
  });

  it("serializes concurrent profile operations without losing an acknowledged change", async () => {
    const before = owner.getCurrentState();
    const results = await Promise.all([
      owner.updateProfile("captain", addAlias("First")),
      owner.updateProfile("captain", addAlias("Second")),
    ]);
    expect(results.map(({ success }) => success)).toEqual([true, true]);
    expect(
      Object.keys(owner.getCurrentState().profiles.captain.aliases),
    ).toEqual(["First", "Second"]);
    expect(fixture.readProjectRoot().profiles.captain.aliases).toEqual(
      owner.getCurrentState().profiles.captain.aliases,
    );
    expect(owner.getCurrentState().revision).toBe(before.revision + 2);
  });

  it("checks a queued precondition against the committed predecessor, not enqueue-time state", async () => {
    const state = owner.getCurrentState();
    const first = owner.updateProfile("captain", addAlias("First"));
    const second = request(fixture.eventBus, "data:update-profile", {
      profileId: "captain",
      updates: addAlias("Second"),
      precondition: {
        authorityEpoch: state.authorityEpoch,
        revision: state.revision,
      },
    });
    const rejected = expect(second).rejects.toThrow("operation_cancelled");
    await first;
    const raw = durable();
    const preservedBackup = backup();
    await rejected;
    expect(durable()).toBe(raw);
    expect(backup()).toBe(preservedBackup);
    expect(
      Object.keys(owner.getCurrentState().profiles.captain.aliases),
    ).toEqual(["First"]);
    expect(owner.getCurrentState().revision).toBe(state.revision + 1);
  });

  it("rejects stale full replacements without changing owner, root, backup or publications", async () => {
    const baseline = owner.getCurrentState();
    const replacement = structuredClone(baseline.profiles.captain);
    await owner.updateProfile("captain", {
      properties: { description: "newer edit" },
    });
    const state = owner.getCurrentState();
    const raw = durable();
    const preservedBackup = backup();
    fixture.eventBusFixture.clearEventHistory();
    await expect(
      request(fixture.eventBus, "data:update-profile", {
        profileId: "captain",
        updates: { replacement },
        precondition: {
          authorityEpoch: baseline.authorityEpoch,
          revision: baseline.revision,
        },
      }),
    ).rejects.toThrow("operation_cancelled");
    expect(owner.getCurrentState()).toBe(state);
    expect(durable()).toBe(raw);
    expect(backup()).toBe(preservedBackup);
    expect(
      fixture.eventBusFixture.getEventsOfType("data:state-changed"),
    ).toEqual([]);
  });

  it("rejects hostile ingress before accepted-state or lifecycle capture", async () => {
    const getter = vi.fn(() => ({ description: "hostile" }));
    const updates = Object.defineProperty({}, "properties", {
      enumerable: true,
      get: getter,
    });
    const capture = vi.spyOn(owner, "_captureOperationGeneration");
    const accepted = owner.state;
    const readState = vi.fn(() => accepted);
    Object.defineProperty(owner, "state", {
      configurable: true,
      get: readState,
    });
    await expect(
      request(fixture.eventBus, "data:update-profile", {
        profileId: "captain",
        updates,
      }),
    ).rejects.toThrow();
    expect(getter).not.toHaveBeenCalled();
    expect(capture).not.toHaveBeenCalled();
    expect(readState).not.toHaveBeenCalled();
    Object.defineProperty(owner, "state", {
      configurable: true,
      writable: true,
      value: accepted,
    });
  });

  // The retired public rootData override cases are now enforced at the
  // repository boundary by LocalStorageProjectRepository's
  // "rejects invalid roots before backup or primary mutation" test.
  it.each([
    (owner) => owner.createProfile("Constructor"),
    (owner) => owner.createProfile("!!!"),
    (owner) => owner.createProfile("Valid", "", "constructor"),
    (owner) => owner.cloneProfile("captain", "!!!"),
    (owner) => owner.createDefaultProfilesFromData({ unsafe: { name: 7 } }),
    (owner) => owner.normalizeAllProfiles({ unsafe: { name: 7 } }),
  ])(
    "rejects invalid profile action intent before queue capture %#",
    async (perform) => {
      const state = owner.getCurrentState();
      const raw = durable();
      const preservedBackup = backup();
      const capture = vi.spyOn(owner, "_captureOperationGeneration");
      await expect(perform(owner)).rejects.toThrow();
      expect(capture).not.toHaveBeenCalled();
      expect(owner.getCurrentState()).toBe(state);
      expect(durable()).toBe(raw);
      expect(backup()).toBe(preservedBackup);
    },
  );

  it("rejects an individually valid patch whose merged durable profile exceeds the restart budget", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const replacement = { ...profile, extension: "x".repeat(8 * 1024 * 1024) };
    await owner.updateProfile("captain", { replacement });
    const state = owner.getCurrentState();
    const raw = durable();
    const preservedBackup = backup();
    fixture.eventBusFixture.clearEventHistory();
    await expect(
      owner.updateProfile("captain", {
        properties: { description: "y".repeat(8 * 1024 * 1024) },
      }),
    ).rejects.toThrow();
    expect(owner.getCurrentState()).toBe(state);
    expect(durable()).toBe(raw);
    expect(backup()).toBe(preservedBackup);
    expect(
      fixture.eventBusFixture.getEventsOfType("data:state-changed"),
    ).toEqual([]);
  });

  it("detaches queued requests before their producer can mutate them", async () => {
    const first = owner.updateProfile("captain", addAlias("First"));
    const updates = addAlias("Second");
    const queued = owner.updateProfile("captain", updates);
    updates.add.aliases.Second.commands.push("CallerChanged");
    await Promise.all([first, queued]);
    expect(
      owner.getCurrentState().profiles.captain.aliases.Second.commands,
    ).toEqual(["FireAll"]);
  });

  it("orders a replacement owner load behind an admitted predecessor write", async () => {
    const previous = owner;
    const commit = projectRepository.commit.getMockImplementation();
    if (!commit) throw new Error("Expected repository fixture writer");
    vi.spyOn(projectRepository, "commit").mockImplementationOnce((...args) => {
      previous.destroy();
      owner = new DataCoordinator({
        visitedState: new LocalStorageVisitedStatePersistence({
          storage: localStorage,
        }),
        eventBus: fixture.eventBus,
        projectRepository,
        i18n,
      });
      owner.init();
      return commit(...args);
    });
    const stale = previous.updateProfile("captain", {
      properties: { description: "durable old write" },
    });
    const rejection = expect(stale).rejects.toThrow();
    await vi.waitFor(() => expect(owner).not.toBe(previous));
    await rejection;
    await owner.initialStateReady;
    expect(previous.state.profiles.captain.description).toBe("before");
    expect(owner.getCurrentState().profiles.captain.description).toBe(
      "durable old write",
    );
    expect(owner.getCurrentState().authorityEpoch).not.toBe(
      previous._stateAuthorityEpoch,
    );
  });

  it("releases the writer tail before awaiting mutation-requesting listeners", async () => {
    const emit = owner.emit.bind(owner);
    vi.spyOn(owner, "emit").mockImplementation((topic, payload, options) => {
      const settled = emit(topic, payload, options);
      if (
        topic === "data:state-changed" &&
        payload.state.profiles.captain.description === "listener trigger"
      ) {
        return Promise.all([
          settled,
          owner.updateProfile("captain", {
            properties: { description: "listener accepted" },
          }),
        ]);
      }
      return settled;
    });
    await owner.updateProfile("captain", {
      properties: { description: "listener trigger" },
    });
    expect(owner.getCurrentState().profiles.captain.description).toBe(
      "listener accepted",
    );
  });

  it("keeps command and environment cohorts on acknowledged owner actions", async () => {
    const command = new CommandService({ eventBus: fixture.eventBus, i18n });
    const environment = new InterfaceModeService({
      eventBus: fixture.eventBus,
    });
    services.push(command, environment);
    command.init();
    environment.init();
    await vi.waitFor(() => expect(command.cache.dataState?.ready).toBe(true));
    const start = owner.getCurrentState().revision;
    await expect(command.addCommand("F1", "Jump")).resolves.toBe(true);
    await expect(environment.switchMode("ground")).resolves.toEqual({
      success: true,
      mode: "ground",
    });
    expect(owner.getCurrentState().revision).toBe(start + 2);
    expect(
      fixture.readProjectRoot().profiles.captain.builds.space.keys.F1,
    ).toEqual(["FireAll", "Jump"]);
    expect(command.cache.dataState).toEqual(owner.getCurrentState());
    expect(owner.getCurrentState().currentEnvironment).toBe("ground");
  });

  it("stops old-owner compatibility publications after a state listener replaces its authority", async () => {
    const previous = owner;
    const emit = previous.emit.bind(previous);
    vi.spyOn(previous, "emit").mockImplementation((topic, payload, options) => {
      const settled = emit(topic, payload, options);
      if (
        topic === "data:state-changed" &&
        payload.reason === "profile-updated"
      ) {
        previous.destroy();
        owner = new DataCoordinator({
          visitedState: new LocalStorageVisitedStatePersistence({
            storage: localStorage,
          }),
          eventBus: fixture.eventBus,
          projectRepository,
          i18n,
        });
        owner.init();
      }
      return settled;
    });
    await expect(
      previous.updateProfile("captain", addAlias("Accepted")),
    ).resolves.toMatchObject({ success: true });
    expect(previous.destroyed).toBe(true);
    expect(fixture.eventBusFixture.getEventsOfType("profile:updated")).toEqual(
      [],
    );
    await owner.initialStateReady;
    expect(
      owner.getCurrentState().profiles.captain.aliases.Accepted.commands,
    ).toEqual(["FireAll"]);
  });

  it("does not report an accepted durable write as cancelled during observer settlement", async () => {
    const gate = deferred();
    const emit = owner.emit.bind(owner);
    vi.spyOn(owner, "emit").mockImplementation((topic, payload, options) => {
      const settled = emit(topic, payload, options);
      return topic === "data:state-changed"
        ? Promise.all([settled, gate.promise])
        : settled;
    });
    const mutation = owner.updateProfile("captain", {
      properties: { description: "accepted" },
    });
    await vi.waitFor(() =>
      expect(owner.getCurrentState().profiles.captain.description).toBe(
        "accepted",
      ),
    );
    const acceptedRoot = durable();
    owner.destroy();
    gate.resolve();
    await expect(mutation).resolves.toMatchObject({
      success: true,
      profile: { description: "accepted" },
    });
    expect(durable()).toBe(acceptedRoot);
  });

  it("retains durability when a publication adapter rejects and logs the observer failure", async () => {
    const emit = owner.emit.bind(owner);
    const failure = new Error("observer adapter failed");
    const diagnostic = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(owner, "emit").mockImplementation((topic, payload, options) => {
      const settled = emit(topic, payload, options);
      return topic === "data:state-changed" ? Promise.reject(failure) : settled;
    });
    await expect(
      owner.updateProfile("captain", {
        properties: { description: "accepted" },
      }),
    ).resolves.toMatchObject({ success: true });
    expect(fixture.readProjectRoot().profiles.captain.description).toBe(
      "accepted",
    );
    expect(diagnostic).toHaveBeenCalledWith(
      "DataCoordinator publication settlement failed:",
      failure,
    );
  });

  it("orders durable publications while each acknowledgement waits only for its own listeners", async () => {
    const gate = deferred();
    const emit = owner.emit.bind(owner);
    const publications = [];
    vi.spyOn(owner, "emit").mockImplementation((topic, payload, options) => {
      const settled = emit(topic, payload, options);
      if (topic !== "data:state-changed") return settled;
      publications.push(payload.state.profiles.captain.description);
      return payload.state.profiles.captain.description === "first"
        ? Promise.all([settled, gate.promise])
        : settled;
    });
    let firstSettled = false;
    const first = owner
      .updateProfile("captain", { properties: { description: "first" } })
      .then((result) => {
        firstSettled = true;
        return result;
      });
    const second = owner.updateProfile("captain", {
      properties: { description: "second" },
    });
    await expect(second).resolves.toMatchObject({ success: true });
    expect(firstSettled).toBe(false);
    expect(publications).toEqual(["first", "second"]);
    gate.resolve();
    await expect(first).resolves.toMatchObject({ success: true });
    expect(fixture.readProjectRoot().profiles.captain.description).toBe(
      "second",
    );
    expect(publications).toEqual(["first", "second"]);
  });
});
