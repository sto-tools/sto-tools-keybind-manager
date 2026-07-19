import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import DataCoordinator from "../../../src/js/components/services/DataCoordinator.js";
import { createServiceFixture } from "../../fixtures/index.js";

describe("DataCoordinator profile construction facade", () => {
  let coordinator;
  let fixture;
  let durableProfiles;

  beforeEach(async () => {
    localStorage.setItem("sto_keybind_manager_visited", "true");
    fixture = createServiceFixture();
    durableProfiles = {};

    fixture.storage.getAllData.mockReturnValue({
      currentProfile: null,
      profiles: {},
      settings: {},
      version: "1.0.0",
      lastModified: "2026-07-19T02:59:00.000Z",
    });

    fixture.storage.saveProfile.mockImplementation((profileId, profile) => {
      durableProfiles[profileId] = {
        ...structuredClone(profile),
        lastModified: "2026-07-19T03:00:00.000Z",
        storageExtension: { accepted: true },
      };
      return true;
    });
    fixture.storage.getProfile.mockImplementation((profileId) =>
      structuredClone(durableProfiles[profileId] || null),
    );

    coordinator = new DataCoordinator({
      eventBus: fixture.eventBus,
      storage: fixture.storage,
      i18n: { t: (key) => key },
    });
    coordinator.init();
    await vi.waitFor(() => {
      expect(coordinator.getCurrentState().ready).toBe(true);
    });
    fixture.eventBusFixture.clearEventHistory();
  });

  afterEach(() => {
    coordinator.destroy();
    fixture.destroy();
    localStorage.removeItem("sto_keybind_manager_visited");
  });

  function mutationEvents() {
    return fixture
      .getEventHistory()
      .filter(({ event }) =>
        ["data:state-changed", "profile:updated"].includes(event),
      );
  }

  it("adopts and returns the durable profile readback after creating a draft", async () => {
    const result = await coordinator.createProfile(
      "  New Captain  ",
      "  Tactical profile  ",
      "ground",
    );

    const persistedDraft = fixture.storage.saveProfile.mock.calls[0][1];
    expect(result.profileId).toBe("_new_captain_");
    expect(persistedDraft).toEqual({
      name: "New Captain",
      description: "Tactical profile",
      currentEnvironment: "ground",
      builds: {
        space: { keys: {} },
        ground: { keys: {} },
      },
      keybindMetadata: { space: {}, ground: {} },
      aliasMetadata: {},
      bindsetMetadata: {},
      bindsets: {},
      aliases: {},
      created: expect.any(String),
      lastModified: expect.any(String),
    });
    expect(coordinator.state.profiles[result.profileId]).toEqual(
      durableProfiles[result.profileId],
    );
    expect(result.profile).toEqual(durableProfiles[result.profileId]);
    expect(result.profile).not.toBe(
      coordinator.state.profiles[result.profileId],
    );

    result.profile.storageExtension.accepted = false;
    expect(
      coordinator.state.profiles[result.profileId].storageExtension.accepted,
    ).toBe(true);
    expect(mutationEvents()).toEqual([
      expect.objectContaining({
        event: "data:state-changed",
        data: expect.objectContaining({ reason: "profile-created" }),
      }),
    ]);
  });

  it("deep-clones a source profile before persistence and adopts the clone readback", async () => {
    const source = {
      name: "Captain",
      description: "Original",
      currentEnvironment: "space",
      builds: {
        space: { keys: { F1: ["FireAll"] } },
        ground: { keys: {} },
      },
      aliases: {
        engage: {
          commands: ["FireAll"],
          metadata: { origin: "user" },
        },
      },
      bindsets: {},
      keybindMetadata: { space: {}, ground: {} },
      aliasMetadata: {},
      bindsetMetadata: {},
      extension: { nested: ["preserved"] },
      created: "2025-01-01T00:00:00.000Z",
      lastModified: "2025-02-01T00:00:00.000Z",
    };
    const sourceBefore = structuredClone(source);
    coordinator.state.profiles.captain = source;

    const result = await coordinator.cloneProfile(
      "captain",
      "  Captain Copy  ",
    );

    const persistedDraft = fixture.storage.saveProfile.mock.calls[0][1];
    expect(result.profileId).toBe("_captain_copy_");
    expect(persistedDraft).toMatchObject({
      name: "Captain Copy",
      description: "Copy of Captain",
      aliases: sourceBefore.aliases,
      extension: sourceBefore.extension,
      created: expect.any(String),
      lastModified: expect.any(String),
    });
    expect(persistedDraft.aliases).not.toBe(source.aliases);
    expect(persistedDraft.aliases.engage).not.toBe(source.aliases.engage);
    expect(source).toEqual(sourceBefore);
    expect(coordinator.state.profiles[result.profileId]).toEqual(
      durableProfiles[result.profileId],
    );
    expect(result.profile).toEqual(durableProfiles[result.profileId]);

    persistedDraft.aliases.engage.metadata.origin = "storage mutation";
    result.profile.extension.nested.push("result mutation");
    expect(source).toEqual(sourceBefore);
    expect(
      coordinator.state.profiles[result.profileId].extension.nested,
    ).toEqual(["preserved"]);
    expect(mutationEvents()).toEqual([
      expect.objectContaining({
        event: "data:state-changed",
        data: expect.objectContaining({ reason: "profile-cloned" }),
      }),
    ]);
  });
});
