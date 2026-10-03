// Exact internal assertions preserved from tests/browser/profile-construction-boundary.test.js.
import { beforeEach, afterEach } from "vitest";
import {
  initializeSourceApplication,
  destroySourceApplication,
} from "../../fixtures/ui/sourceApplicationRuntime.js";
beforeEach(initializeSourceApplication);
afterEach(destroySourceApplication);

import { runtime } from "../../fixtures/ui/sourceApplicationRuntime.js";
import { describe, expect, it, vi } from "vitest";

import { request } from "../../../src/js/core/requestResponse.js";
import {
  PROJECT_ROOT_KEY,
  readProjectProfile,
  readProjectRoot,
} from "../../fixtures/ui/projectStorage.js";

const createdProfileId = "browser_profile_construction_probe";
const clonedProfileId = "browser_profile_construction_copy";

describe("Profile construction source-composition equivalent boundary", () => {
  it("creates and clones through the owner while adopting durable readbacks", async () => {
    const bus = runtime().eventBus;
    const coordinator = runtime().dataCoordinator;

    expect(bus).toBeTruthy();
    expect(coordinator?.getCurrentState?.().ready).toBe(true);
    if (!bus || !coordinator) return;

    const stateChanged = vi.fn();
    const detach = bus.on("data:state-changed", stateChanged);

    try {
      const created = await request(bus, "data:create-profile", {
        name: "Browser Profile Construction Probe",
        description: "Checked bundle profile",
        mode: "ground",
      });

      expect(created).toMatchObject({
        success: true,
        profileId: createdProfileId,
        profile: {
          name: "Browser Profile Construction Probe",
          description: "Checked bundle profile",
          currentEnvironment: "ground",
          builds: {
            space: { keys: {} },
            ground: { keys: {} },
          },
          aliases: {},
          bindsets: {},
          keybindMetadata: { space: {}, ground: {} },
          aliasMetadata: {},
          bindsetMetadata: {},
        },
      });
      expect(created.profile).toEqual(readProjectProfile(createdProfileId));
      expect(created.profile).toEqual(
        coordinator.getCurrentState().profiles[createdProfileId],
      );
      expect(stateChanged).toHaveBeenCalledTimes(1);
      expect(stateChanged).toHaveBeenLastCalledWith(
        expect.objectContaining({ reason: "profile-created" }),
      );

      created.profile.builds.ground.keys.F12 = ["result mutation"];
      expect(
        coordinator.getCurrentState().profiles[createdProfileId].builds.ground
          .keys,
      ).toEqual({});

      stateChanged.mockClear();
      const cloned = await request(bus, "data:clone-profile", {
        sourceId: createdProfileId,
        newName: "Browser Profile Construction Copy",
      });

      expect(cloned).toMatchObject({
        success: true,
        profileId: clonedProfileId,
        profile: {
          name: "Browser Profile Construction Copy",
          description: "Copy of Browser Profile Construction Probe",
          currentEnvironment: "ground",
        },
      });
      expect(cloned.profile).toEqual(readProjectProfile(clonedProfileId));
      expect(cloned.profile).toEqual(
        coordinator.getCurrentState().profiles[clonedProfileId],
      );
      expect(stateChanged).toHaveBeenCalledTimes(1);
      expect(stateChanged).toHaveBeenLastCalledWith(
        expect.objectContaining({ reason: "profile-cloned" }),
      );
    } finally {
      detach();
      for (const profileId of [clonedProfileId, createdProfileId]) {
        if (Object.hasOwn(coordinator.getCurrentState().profiles, profileId)) {
          await request(bus, "data:delete-profile", { profileId });
        }
      }
    }

    expect(coordinator.getCurrentState().profiles).not.toHaveProperty(
      createdProfileId,
    );
    expect(coordinator.getCurrentState().profiles).not.toHaveProperty(
      clonedProfileId,
    );
  });

  it("constructs exact normalized static defaults and fallback profiles", async () => {
    const bus = runtime().eventBus;
    const coordinator = runtime().dataCoordinator;

    expect(bus).toBeTruthy();
    expect(coordinator?.getCurrentState?.().ready).toBe(true);
    if (!bus || !coordinator) return;

    const beforeRoot = localStorage.getItem(PROJECT_ROOT_KEY);
    const staticSource = {
      id: "source-id-must-not-survive",
      name: "Browser Static Default",
      description: "Checked bundle static profile",
      currentEnvironment: "ground",
      builds: {
        space: { keys: { F1: ["space command"] } },
        ground: { keys: { G: ["ground command"] } },
      },
      bindsets: { Tactical: { ground: { keys: { H: ["bindset"] } } } },
      aliases: { engage: { commands: ["alias command"] } },
      selections: { ground: "G" },
      keybindMetadata: {
        ground: { G: { stabilizeExecutionOrder: false } },
      },
      aliasMetadata: { engage: { stabilizeExecutionOrder: true } },
      bindsetMetadata: {
        Tactical: { ground: { H: { stabilizeExecutionOrder: false } } },
      },
      migrationVersion: "source-version-must-not-survive",
      created: "2000-01-01T00:00:00.000Z",
      lastModified: "2000-01-02T00:00:00.000Z",
      vertigoSettings: { space: { enabled: true } },
      extension: { dropped: true },
    };
    const sourceBefore = structuredClone(staticSource);

    /** Reset the owner to a valid empty root before each activation probe. */
    const resetToEmptyRoot = async () => {
      const transition = await coordinator.runApplicationResetTransition(
        async ({ resetProjectPersistence, adoptEmptyProject }) => {
          const persistence = await resetProjectPersistence();
          if (!persistence.success) return persistence;
          return adoptEmptyProject();
        },
      );
      expect(transition.result.success).toBe(true);
      await transition.settlement;
      expect(coordinator.getCurrentState()).toMatchObject({
        currentProfile: null,
        currentEnvironment: "space",
        profiles: {},
      });
    };

    try {
      await resetToEmptyRoot();
      await coordinator.createDefaultProfilesFromData({
        browser_static_default: staticSource,
      });

      await vi.waitFor(() => {
        expect(readProjectRoot().profiles.browser_static_default).toEqual(
          coordinator.getCurrentState().profiles.browser_static_default,
        );
      });
      const normalizedDefault =
        coordinator.getCurrentState().profiles.browser_static_default;
      expect(normalizedDefault).toEqual({
        name: "Browser Static Default",
        description: "Checked bundle static profile",
        currentEnvironment: "ground",
        builds: {
          space: { keys: { F1: ["space command"] } },
          ground: { keys: { G: ["ground command"] } },
        },
        bindsets: {
          Tactical: { ground: { keys: { H: ["bindset"] } } },
        },
        aliases: { engage: { commands: ["alias command"] } },
        selections: { ground: "G" },
        keybindMetadata: {
          ground: { G: { stabilizeExecutionOrder: false } },
        },
        aliasMetadata: { engage: { stabilizeExecutionOrder: true } },
        bindsetMetadata: {
          Tactical: { ground: { H: { stabilizeExecutionOrder: false } } },
        },
        created: expect.any(String),
        lastModified: expect.any(String),
        migrationVersion: "2.1.1",
      });
      expect(staticSource).toEqual(sourceBefore);
      expect(coordinator.getCurrentState()).toMatchObject({
        currentProfile: "browser_static_default",
        currentEnvironment: "ground",
      });

      await resetToEmptyRoot();
      await coordinator.createDefaultProfilesFromData({});

      await vi.waitFor(() => {
        expect(readProjectRoot().profiles.default).toEqual(
          coordinator.getCurrentState().profiles.default,
        );
      });
      const fallback = coordinator.getCurrentState().profiles.default;
      expect(fallback).toEqual({
        name: "Default",
        description: "Basic space build profile",
        currentEnvironment: "space",
        builds: {
          space: { keys: {} },
          ground: { keys: {} },
        },
        bindsets: {},
        aliases: {},
        created: expect.any(String),
        lastModified: expect.any(String),
        migrationVersion: "2.1.1",
      });
      expect(coordinator.getCurrentState()).toMatchObject({
        currentProfile: "default",
        currentEnvironment: "space",
      });
    } finally {
      await resetToEmptyRoot();
      if (beforeRoot !== null) {
        await coordinator.replaceProjectFromImport(JSON.parse(beforeRoot));
      }
    }
  });
});
