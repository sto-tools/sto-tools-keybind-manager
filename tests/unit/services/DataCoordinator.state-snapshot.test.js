import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DataCoordinator from "../../../src/js/components/services/DataCoordinator.js";
import { createServiceFixture } from "../../fixtures/index.js";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

const profile = (name, currentEnvironment = "space") => ({
  name,
  currentEnvironment,
  builds: {
    space: { keys: { F1: ["space-command"] } },
    ground: { keys: { F2: ["ground-command"] } },
  },
  aliases: {},
  keybindMetadata: {},
  aliasMetadata: {},
  bindsetMetadata: {},
  bindsets: {},
  migrationVersion: "2.1.1",
});

describe("DataCoordinator complete state snapshots", () => {
  let fixture;
  let coordinator;

  beforeEach(() => {
    localStorage.setItem("sto_keybind_manager_visited", "true");
    fixture = createServiceFixture();
    fixture.storage.getAllData.mockReturnValue({
      currentProfile: "alpha",
      profiles: {
        alpha: profile("Alpha"),
        beta: profile("Beta", "ground"),
      },
      settings: { theme: "dark" },
      version: "1.0.0",
      lastModified: "2026-07-16T00:00:00.000Z",
    });
    coordinator = new DataCoordinator({
      eventBus: fixture.eventBus,
      storage: fixture.storage,
      i18n: { t: (key) => key },
    });
  });

  afterEach(() => {
    if (!coordinator.destroyed) coordinator.destroy();
    fixture.destroy();
    localStorage.removeItem("sto_keybind_manager_visited");
    vi.restoreAllMocks();
  });

  async function initialize() {
    coordinator.init();
    await vi.waitFor(() => {
      expect(coordinator.getCurrentState().ready).toBe(true);
    });
  }

  function stateEvents() {
    return fixture
      .getEventHistory()
      .filter(({ event }) => event === "data:state-changed");
  }

  function clearEvents() {
    fixture.eventBusFixture.clearEventHistory();
  }

  it("distinguishes the pre-load state and publishes one ready initial snapshot", async () => {
    expect(coordinator.getCurrentState()).toMatchObject({
      ready: false,
      revision: 0,
      currentProfile: null,
      profiles: {},
    });

    await initialize();

    const events = stateEvents();
    expect(events).toHaveLength(1);
    expect(events[0].data).toMatchObject({
      reason: "initial-load",
      state: {
        ready: true,
        revision: 1,
        currentProfile: "alpha",
        currentEnvironment: "space",
        currentProfileData: {
          id: "alpha",
          environment: "space",
          keys: { F1: ["space-command"] },
        },
      },
    });
  });

  it("publishes detached snapshots without mutating canonical profiles", async () => {
    const canonicalProfile = fixture.storage.getAllData().profiles.alpha;
    await initialize();

    const published = stateEvents()[0].data.state;
    expect(published.profiles).not.toBe(coordinator.state.profiles);
    expect(published.profiles.alpha).not.toBe(coordinator.state.profiles.alpha);
    expect(published.currentProfileData).not.toBe(
      coordinator.state.profiles.alpha,
    );
    expect(coordinator.state.profiles.alpha).not.toBe(canonicalProfile);

    expect(Object.isFrozen(published)).toBe(true);
    expect(Object.isFrozen(published.profiles.alpha)).toBe(true);
    expect(
      Object.isFrozen(published.currentProfileData.builds.space.keys.F1),
    ).toBe(true);
    expect(() => {
      published.profiles.alpha.name = "consumer mutation";
    }).toThrow(TypeError);
    expect(() => {
      published.currentProfileData.builds.space.keys.F1.push(
        "consumer command",
      );
    }).toThrow(TypeError);

    expect(coordinator.state.profiles.alpha.name).toBe("Alpha");
    expect(coordinator.state.profiles.alpha.builds.space.keys.F1).toEqual([
      "space-command",
    ]);
    expect(coordinator.getCurrentState()).toBe(published);
  });

  it("batches an environment change into one coherent revision", async () => {
    await initialize();
    clearEvents();

    await coordinator.setEnvironment("ground");

    const events = stateEvents();
    expect(events).toHaveLength(1);
    expect(events[0].data).toMatchObject({
      reason: "environment-changed",
      state: {
        revision: 2,
        currentEnvironment: "ground",
        currentProfileData: {
          id: "alpha",
          currentEnvironment: "ground",
          environment: "ground",
          keys: { F2: ["ground-command"] },
        },
      },
    });
  });

  it("publishes property-only profile commits", async () => {
    await initialize();
    clearEvents();

    await coordinator.updateProfile("alpha", {
      properties: { description: "Updated without collection changes" },
    });

    expect(stateEvents()).toHaveLength(1);
    expect(stateEvents()[0].data).toMatchObject({
      reason: "profile-updated",
      state: {
        revision: 2,
        profiles: {
          alpha: { description: "Updated without collection changes" },
        },
      },
    });
  });

  it("identifies the exact profile replaced by a complete profile commit", async () => {
    await initialize();
    clearEvents();

    await coordinator.updateProfile("alpha", {
      replacement: profile("Replacement", "ground"),
    });

    expect(stateEvents()).toHaveLength(1);
    expect(stateEvents()[0].data).toMatchObject({
      reason: "profile-replaced",
      profileId: "alpha",
      state: {
        revision: 2,
        currentProfile: "alpha",
        currentEnvironment: "ground",
        currentProfileData: {
          name: "Replacement",
          currentEnvironment: "ground",
        },
      },
    });
  });

  it("does not advance or publish when persistence rejects a mutation", async () => {
    await initialize();
    clearEvents();
    fixture.storage.saveProfile.mockReturnValueOnce(false);

    await expect(
      coordinator.updateProfile("alpha", {
        properties: { description: "must not commit" },
      }),
    ).rejects.toThrow("failed_to_save_profile");

    expect(stateEvents()).toHaveLength(0);
    expect(coordinator.getCurrentState().revision).toBe(1);
    expect(coordinator.state.profiles.alpha.description).toBeUndefined();
  });

  it("publishes each profile logical commit exactly once", async () => {
    await initialize();

    const expectOneReason = async (reason, action) => {
      clearEvents();
      const previousRevision = coordinator.getCurrentState().revision;
      await action();
      expect(stateEvents()).toHaveLength(1);
      expect(stateEvents()[0].data.reason).toBe(reason);
      expect(stateEvents()[0].data.state.revision).toBe(previousRevision + 1);
    };

    await expectOneReason("profile-created", () =>
      coordinator.createProfile("Gamma"),
    );
    await expectOneReason("profile-cloned", () =>
      coordinator.cloneProfile("alpha", "Alpha Copy"),
    );
    await expectOneReason("profile-renamed", () =>
      coordinator.renameProfile("beta", "Beta Renamed"),
    );
    await expectOneReason("profile-switched", () =>
      coordinator.switchProfile("beta"),
    );
    await expectOneReason("profile-deleted", () =>
      coordinator.deleteProfile("gamma"),
    );
  });

  it("publishes complete reset and reload snapshots before legacy refreshes", async () => {
    await initialize();
    clearEvents();

    const resetData = {
      currentProfile: null,
      profiles: {},
      settings: { language: "fr" },
      version: "2.0.0",
      lastModified: "2026-07-16T01:00:00.000Z",
    };
    fixture.eventBus.emit("storage:data-reset", { data: resetData });

    let events = fixture.getEventHistory();
    expect(
      events.filter(({ event }) => event === "data:state-changed"),
    ).toHaveLength(1);
    expect(
      events.findIndex(({ event }) => event === "data:state-changed"),
    ).toBeLessThan(
      events.findIndex(({ event }) => event === "profile:updated"),
    );
    expect(stateEvents()[0].data).toMatchObject({
      reason: "storage-reset",
      state: {
        currentProfile: null,
        currentEnvironment: "space",
        profiles: {},
        metadata: {
          version: "2.0.0",
          lastModified: "2026-07-16T01:00:00.000Z",
        },
      },
    });
    resetData.settings.language = "caller mutation";
    expect(coordinator.state).not.toHaveProperty("settings");

    clearEvents();
    fixture.storage.getAllData.mockReturnValueOnce({
      currentProfile: "restored",
      profiles: { restored: profile("Restored", "ground") },
      settings: { language: "de" },
      version: "2.1.0",
      lastModified: "2026-07-16T02:00:00.000Z",
    });

    await coordinator.reloadState();

    events = fixture.getEventHistory();
    expect(stateEvents()).toHaveLength(1);
    expect(stateEvents()[0].data).toMatchObject({
      reason: "state-reloaded",
      state: {
        currentProfile: "restored",
        currentEnvironment: "ground",
        profiles: { restored: { name: "Restored" } },
        metadata: {
          version: "2.1.0",
          lastModified: "2026-07-16T02:00:00.000Z",
        },
      },
    });
    expect(
      events.findIndex(({ event }) => event === "data:state-changed"),
    ).toBeLessThan(
      events.findIndex(({ event }) => event === "profile:switched"),
    );
  });

  it("publishes one final snapshot for each default-profile construction path", async () => {
    await initialize();

    clearEvents();
    fixture.storage.saveAllData.mockClear();
    fixture.storage.saveProfile.mockClear();
    await coordinator.createDefaultProfilesFromData({
      imported_default: profile("Imported Default"),
    });
    expect(stateEvents()).toHaveLength(1);
    expect(stateEvents()[0].data.reason).toBe("default-profiles-created");
    expect(fixture.storage.saveAllData).toHaveBeenCalledTimes(1);
    expect(fixture.storage.saveProfile).not.toHaveBeenCalled();

    clearEvents();
    fixture.storage.saveAllData.mockClear();
    fixture.storage.saveProfile.mockClear();
    await coordinator.createFallbackProfiles();
    expect(stateEvents()).toHaveLength(1);
    expect(stateEvents()[0].data.reason).toBe("fallback-profiles-created");
    expect(fixture.storage.saveAllData).toHaveBeenCalledTimes(1);
    expect(fixture.storage.saveProfile).not.toHaveBeenCalled();
  });

  it.each([
    [
      "default profile batch",
      () =>
        coordinator.createDefaultProfilesFromData({
          first: profile("First"),
          second: profile("Second", "ground"),
        }),
      "first",
      ["first", "second"],
    ],
    [
      "fallback profile and activation",
      () => coordinator.createFallbackProfiles(),
      "default",
      ["default"],
    ],
  ])(
    "keeps durable and owner state unchanged when the atomic %s write fails",
    async (_label, perform, expectedCurrentProfile, expectedProfileIds) => {
      const durableBefore = {
        currentProfile: null,
        profiles: {},
        settings: { theme: "dark" },
        version: "1.0.0",
        lastModified: "2026-07-16T03:00:00.000Z",
      };
      fixture.storage.getAllData.mockReturnValue(durableBefore);
      await initialize();
      clearEvents();
      fixture.storage.saveAllData.mockClear();
      fixture.storage.saveProfile.mockClear();

      const ownerBefore = structuredClone(coordinator.state);
      const revisionBefore = coordinator.getCurrentState().revision;
      fixture.storage.saveAllData.mockReturnValueOnce(false);

      await expect(perform()).rejects.toThrow("failed_to_save_profile");

      expect(fixture.storage.saveAllData).toHaveBeenCalledTimes(1);
      expect(fixture.storage.saveAllData).toHaveBeenCalledWith(
        expect.objectContaining({
          currentProfile: expectedCurrentProfile,
          profiles: expect.objectContaining(
            Object.fromEntries(
              expectedProfileIds.map((id) => [id, expect.any(Object)]),
            ),
          ),
          settings: { theme: "dark" },
          version: "1.0.0",
        }),
      );
      expect(fixture.storage.saveProfile).not.toHaveBeenCalled();
      expect(fixture.storage.getAllData()).toEqual(durableBefore);
      expect(coordinator.state).toEqual(ownerBefore);
      expect(coordinator.getCurrentState().revision).toBe(revisionBefore);
      expect(stateEvents()).toHaveLength(0);
      expect(
        fixture
          .getEventHistory()
          .filter(({ event }) => event === "profile:switched"),
      ).toEqual([]);
    },
  );

  it("detaches default-profile source data before persistence and ownership", async () => {
    await initialize();
    clearEvents();
    const source = profile("Detached Default");
    source.selections = { space: "F1" };
    source.keybindMetadata = {
      space: { F1: { stabilizeExecutionOrder: true } },
    };

    await coordinator.createDefaultProfilesFromData({ detached: source });
    const committedRevision = coordinator.getCurrentState().revision;

    source.builds.space.keys.F1.push("caller command");
    source.selections.space = "F9";
    source.keybindMetadata.space.F1.stabilizeExecutionOrder = false;

    expect(coordinator.state.profiles.detached.builds.space.keys.F1).toEqual([
      "space-command",
    ]);
    expect(coordinator.state.profiles.detached.selections).toEqual({
      space: "F1",
    });
    expect(coordinator.state.profiles.detached.keybindMetadata).toEqual({
      space: { F1: { stabilizeExecutionOrder: true } },
    });
    expect(coordinator.getCurrentState().revision).toBe(committedRevision);
  });

  it("keeps owner state and revision unchanged when reload normalization cannot persist", async () => {
    await initialize();
    clearEvents();
    fixture.storage.saveAllData.mockClear();
    fixture.storage.saveProfile.mockClear();

    const importedRoot = {
      currentProfile: "legacy",
      profiles: { legacy: profile("Legacy") },
      settings: { theme: "imported" },
      version: "2.0.0",
      lastModified: "2026-07-16T04:00:00.000Z",
    };
    delete importedRoot.profiles.legacy.migrationVersion;
    fixture.storage.getAllData.mockReturnValue(importedRoot);
    fixture.storage.saveAllData.mockReturnValueOnce(false);
    const ownerBefore = structuredClone(coordinator.state);
    const revisionBefore = coordinator.getCurrentState().revision;

    await expect(coordinator.reloadState()).resolves.toMatchObject({
      success: false,
      error: "failed_to_save_profile",
    });

    expect(fixture.storage.saveAllData).toHaveBeenCalledTimes(1);
    expect(fixture.storage.saveAllData.mock.calls[0][1]).toEqual({
      preserveBackup: true,
    });
    expect(fixture.storage.saveAllData.mock.calls[0][0]).toMatchObject({
      currentProfile: "legacy",
      profiles: { legacy: { migrationVersion: "2.1.1" } },
      settings: { theme: "imported" },
      version: "2.0.0",
      lastModified: "2026-07-16T04:00:00.000Z",
    });
    expect(fixture.storage.saveProfile).not.toHaveBeenCalled();
    expect(fixture.storage.getAllData()).toEqual(importedRoot);
    expect(coordinator.state).toEqual(ownerBefore);
    expect(coordinator.getCurrentState().revision).toBe(revisionBefore);
    expect(stateEvents()).toHaveLength(0);
  });

  it("does not publish after teardown", async () => {
    await initialize();
    clearEvents();
    coordinator.destroy();

    coordinator._publishState("profile-updated");
    await tick();

    expect(stateEvents()).toHaveLength(0);
    expect(coordinator.getCurrentState().revision).toBe(1);
  });
});
