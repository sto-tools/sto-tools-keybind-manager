import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import DataCoordinator from "../../../src/js/components/services/DataCoordinator.js";
import { createServiceFixture } from "../../fixtures/index.js";

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

describe("DataCoordinator durable state ownership", () => {
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

  it("publishes metadata from the normalized durable reload root", async () => {
    await initialize();
    clearEvents();

    let durableRoot = {
      currentProfile: "legacy",
      profiles: { legacy: profile("Legacy", "ground") },
      settings: { theme: "restored" },
      version: "2.0.0",
      lastModified: "2026-07-16T05:00:00.000Z",
    };
    delete durableRoot.profiles.legacy.migrationVersion;
    fixture.storage.getAllData.mockImplementation(() =>
      structuredClone(durableRoot),
    );
    fixture.storage.saveAllData.mockImplementation((nextRoot) => {
      durableRoot = {
        ...structuredClone(nextRoot),
        version: "3.0.0",
        lastModified: "2026-07-16T05:30:00.000Z",
      };
      return true;
    });
    fixture.storage.saveAllData.mockClear();

    await expect(coordinator.reloadState()).resolves.toMatchObject({
      success: true,
      currentProfile: "legacy",
      environment: "ground",
    });

    expect(fixture.storage.saveAllData).toHaveBeenCalledTimes(1);
    expect(durableRoot.profiles.legacy.migrationVersion).toBe("2.1.1");
    expect(coordinator.state.metadata).toEqual({
      version: "3.0.0",
      lastModified: "2026-07-16T05:30:00.000Z",
    });
    expect(stateEvents()).toHaveLength(1);
    expect(stateEvents()[0].data.state.metadata).toEqual(
      coordinator.state.metadata,
    );
  });

  it("durably selects the replacement before publishing current-profile deletion", async () => {
    await initialize();
    clearEvents();

    let durableRoot = structuredClone(fixture.storage.getAllData());
    fixture.storage.getAllData.mockImplementation(() =>
      structuredClone(durableRoot),
    );
    fixture.storage.saveAllData.mockImplementation((nextRoot) => {
      durableRoot = {
        ...structuredClone(nextRoot),
        version: "1.0.0",
        lastModified: "2026-07-16T06:00:00.000Z",
      };
      return true;
    });
    fixture.storage.saveAllData.mockClear();
    fixture.storage.deleteProfile.mockClear();

    const durableWhenPublished = [];
    fixture.eventBus.on("data:state-changed", () => {
      durableWhenPublished.push(fixture.storage.getAllData());
    });

    await coordinator.deleteProfile("alpha");

    expect(fixture.storage.saveAllData).toHaveBeenCalledTimes(1);
    expect(fixture.storage.deleteProfile).not.toHaveBeenCalled();
    expect(fixture.storage.saveAllData.mock.calls[0][0]).toMatchObject({
      currentProfile: "beta",
      profiles: { beta: { name: "Beta" } },
    });
    expect(
      fixture.storage.saveAllData.mock.calls[0][0].profiles,
    ).not.toHaveProperty("alpha");
    expect(durableWhenPublished).toEqual([
      expect.objectContaining({
        currentProfile: "beta",
        profiles: expect.not.objectContaining({ alpha: expect.anything() }),
      }),
    ]);

    const events = fixture.getEventHistory();
    const stateIndex = events.findIndex(
      ({ event }) => event === "data:state-changed",
    );
    const switchedIndex = events.findIndex(
      ({ event }) => event === "profile:switched",
    );
    const deletedIndex = events.findIndex(
      ({ event }) => event === "profile:deleted",
    );
    expect(stateIndex).toBeGreaterThanOrEqual(0);
    expect(stateIndex).toBeLessThan(switchedIndex);
    expect(switchedIndex).toBeLessThan(deletedIndex);
    expect(stateEvents()[0].data).toMatchObject({
      reason: "profile-deleted",
      state: {
        revision: 2,
        currentProfile: "beta",
        currentEnvironment: "ground",
        profiles: { beta: { name: "Beta" } },
      },
    });
    expect(stateEvents()[0].data.state.profiles).not.toHaveProperty("alpha");
    expect(durableRoot.currentProfile).toBe("beta");
    expect(coordinator.state.currentProfile).toBe("beta");
  });

  it("detaches nested update and settings inputs from owner state", async () => {
    await initialize();
    clearEvents();

    const updates = {
      add: {
        builds: { space: { keys: { F9: ["initial-command"] } } },
      },
      properties: { selections: { space: "F9" } },
    };
    await coordinator.updateProfile("alpha", updates);
    const profileRevision = coordinator.getCurrentState().revision;
    const profileEvent = fixture
      .getEventHistory()
      .find(({ event }) => event === "profile:updated");

    updates.add.builds.space.keys.F9.push("caller-command");
    updates.properties.selections.space = "F10";
    profileEvent.data.updates.add.builds.space.keys.F9.push("listener-command");

    expect(coordinator.state.profiles.alpha.builds.space.keys.F9).toEqual([
      "initial-command",
    ]);
    expect(coordinator.state.profiles.alpha.selections).toEqual({
      space: "F9",
    });
    expect(coordinator.getCurrentState().revision).toBe(profileRevision);

    const settings = {
      ui: { density: "compact" },
      columns: ["command"],
    };
    await coordinator.updateSettings(settings);
    const settingsRevision = coordinator.getCurrentState().revision;
    const settingsEvent = fixture
      .getEventHistory()
      .findLast(({ event }) => event === "settings:changed");

    settings.ui.density = "comfortable";
    settings.columns.push("description");
    settingsEvent.data.updates.ui.density = "listener mutation";

    expect(coordinator.state.settings).toMatchObject({
      ui: { density: "compact" },
      columns: ["command"],
    });
    expect(coordinator.getCurrentState().revision).toBe(settingsRevision);
  });
});
