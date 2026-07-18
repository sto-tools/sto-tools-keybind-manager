import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import BindsetService from "../../../src/js/components/services/BindsetService.js";
import { createDataCoordinatorState } from "../../fixtures/core/componentState.js";
import { createServiceFixture } from "../../fixtures/index.js";

function createProfile({ populated = false } = {}) {
  return {
    id: "captain",
    name: "Captain",
    currentEnvironment: "space",
    builds: {
      space: { keys: {} },
      ground: { keys: {} },
    },
    aliases: {},
    bindsets: {
      Weapons: {
        space: {
          keys: populated ? { F1: ["FireAll"] } : {},
        },
        ground: { keys: {} },
      },
    },
    keybindMetadata: {},
    aliasMetadata: {},
    bindsetMetadata: {
      Weapons: {
        space: { F1: { stabilizeExecutionOrder: true } },
      },
    },
    migrationVersion: "2.1.1",
  };
}

describe("BindsetService deletion integrity", () => {
  let fixture;
  let service;

  beforeEach(() => {
    fixture = createServiceFixture();
    service = new BindsetService({ eventBus: fixture.eventBus });
    service.init();
  });

  afterEach(() => {
    if (!service.destroyed) service.destroy();
    fixture.destroy();
    vi.restoreAllMocks();
  });

  it.each([
    { label: "empty bindset deletion", force: false, populated: false },
    {
      label: "forced populated-bindset deletion",
      force: true,
      populated: true,
    },
  ])(
    "submits one atomic profile update for $label",
    async ({ force, populated }) => {
      const profile = createProfile({ populated });
      fixture.eventBus.emit(
        "data:state-changed",
        {
          reason: "initial-load",
          state: createDataCoordinatorState({
            currentProfile: "captain",
            currentProfileData: profile,
            profiles: { captain: profile },
          }),
        },
        { synchronous: true },
      );
      const updateProfile = vi
        .spyOn(service, "request")
        .mockResolvedValue({ success: true, profile });

      await expect(
        service.deleteBindset("Weapons", force),
      ).resolves.toMatchObject({ success: true });

      expect(updateProfile).toHaveBeenCalledOnce();
      expect(updateProfile).toHaveBeenCalledWith("data:update-profile", {
        profileId: "captain",
        updates: {
          delete: {
            bindsets: ["Weapons"],
            bindsetMetadata: ["Weapons"],
          },
        },
      });
    },
  );

  it("leaves the accepted snapshot untouched when ordinary deletion rejects a populated bindset", async () => {
    const profile = createProfile({ populated: true });
    fixture.eventBus.emit(
      "data:state-changed",
      {
        reason: "initial-load",
        state: createDataCoordinatorState({
          currentProfile: "captain",
          currentProfileData: profile,
          profiles: { captain: profile },
        }),
      },
      { synchronous: true },
    );
    const accepted = service.cache.dataState;
    const updateProfile = vi.spyOn(service, "request");

    await expect(service.deleteBindset("Weapons")).resolves.toEqual({
      success: false,
      error: "not_empty",
    });

    expect(updateProfile).not.toHaveBeenCalled();
    expect(service.cache.dataState).toBe(accepted);
    expect(accepted.profiles.captain.bindsets).toHaveProperty("Weapons");
    expect(accepted.profiles.captain.bindsetMetadata).toHaveProperty("Weapons");
  });
});
