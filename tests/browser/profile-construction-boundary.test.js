import { describe, expect, it, vi } from "vitest";

import { request } from "../../src/js/core/requestResponse.js";

const createdProfileId = "browser_profile_construction_probe";
const clonedProfileId = "browser_profile_construction_copy";

describe("Profile construction checked-bundle boundary", () => {
  it("creates and clones through the owner while adopting durable readbacks", async () => {
    const bus = window.eventBus;
    const coordinator = window.dataCoordinator;
    const storage = window.storageService;

    expect(bus).toBeTruthy();
    expect(coordinator?.getCurrentState?.().ready).toBe(true);
    expect(storage).toBeTruthy();
    if (!bus || !coordinator || !storage) return;

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
      expect(created.profile).toEqual(storage.getProfile(createdProfileId));
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
      expect(cloned.profile).toEqual(storage.getProfile(clonedProfileId));
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
});
