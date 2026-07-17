import { afterEach, beforeEach, describe, expect, it } from "vitest";

import DataCoordinator from "../../../src/js/components/services/DataCoordinator.js";
import { createServiceFixture } from "../../fixtures/index.js";

const profile = {
  name: "Captain",
  currentEnvironment: "space",
  builds: {
    space: { keys: { F1: ["FireAll"] } },
    ground: { keys: { G: ["Target_Enemy_Near"] } },
  },
  aliases: {},
};

describe("DataCoordinator persistence failure gating", () => {
  let fixture;
  let coordinator;

  beforeEach(() => {
    fixture = createServiceFixture();
    coordinator = new DataCoordinator({
      eventBus: fixture.eventBus,
      storage: fixture.storage,
      i18n: { t: (key) => key },
    });
    coordinator.state.currentProfile = "captain";
    coordinator.state.currentEnvironment = "space";
    coordinator.state.profiles = {
      captain: structuredClone(profile),
      first_officer: { ...structuredClone(profile), name: "First Officer" },
    };
    coordinator.state.settings = { theme: "default", autoSave: true };
    fixture.eventBusFixture.clearEventHistory();
  });

  afterEach(() => {
    coordinator.destroy();
    fixture.destroy();
  });

  it.each([
    ["create", () => coordinator.createProfile("Admiral")],
    ["clone", () => coordinator.cloneProfile("captain", "Admiral")],
    ["rename", () => coordinator.renameProfile("captain", "Admiral")],
    [
      "update",
      () =>
        coordinator.updateProfile("captain", {
          add: { builds: { space: { keys: { F2: ["Jump"] } } } },
        }),
    ],
  ])(
    "does not commit or broadcast a profile %s when saveProfile returns false",
    async (_operation, perform) => {
      const before = structuredClone(coordinator.state);
      fixture.storage.saveProfile.mockReturnValueOnce(false);

      await expect(perform()).rejects.toThrow();

      expect(coordinator.state).toEqual(before);
      expect(
        fixture
          .getEventHistory()
          .filter(({ event }) =>
            ["data:state-changed", "profile:updated"].includes(event),
          ),
      ).toEqual([]);
    },
  );

  it("does not switch profiles when the root write returns false", async () => {
    fixture.storage.saveAllData.mockReturnValueOnce(false);

    await expect(coordinator.switchProfile("first_officer")).rejects.toThrow(
      "storage_write_failed",
    );

    expect(coordinator.state.currentProfile).toBe("captain");
    expect(coordinator.state.currentEnvironment).toBe("space");
    expect(fixture.getEventHistory()).not.toContainEqual(
      expect.objectContaining({ event: "profile:switched" }),
    );
  });

  it("does not delete a profile when storage rejects the deletion", async () => {
    const before = structuredClone(coordinator.state);
    fixture.storage.saveAllData.mockReturnValueOnce(false);

    await expect(coordinator.deleteProfile("captain")).rejects.toThrow(
      "failed_to_delete_profile",
    );

    expect(fixture.storage.saveAllData).toHaveBeenCalledWith(
      expect.objectContaining({
        currentProfile: "first_officer",
        profiles: expect.not.objectContaining({ captain: expect.anything() }),
      }),
    );
    expect(fixture.storage.deleteProfile).not.toHaveBeenCalled();
    expect(coordinator.state).toEqual(before);
    expect(
      fixture
        .getEventHistory()
        .filter(({ event }) =>
          ["data:state-changed", "profile:switched"].includes(event),
        ),
    ).toEqual([]);
  });

  it("does not change environments when profile persistence fails", async () => {
    fixture.storage.saveProfile.mockReturnValueOnce(false);

    await expect(coordinator.setEnvironment("ground")).rejects.toThrow(
      "failed_to_save_profile",
    );

    expect(coordinator.state.currentEnvironment).toBe("space");
    expect(coordinator.state.profiles.captain.currentEnvironment).toBe("space");
    expect(fixture.getEventHistory()).not.toContainEqual(
      expect.objectContaining({ event: "environment:changed" }),
    );
  });

  it("does not commit or broadcast settings when persistence fails", async () => {
    fixture.storage.saveSettings.mockReturnValueOnce(false);

    await expect(coordinator.updateSettings({ theme: "dark" })).rejects.toThrow(
      "storage_write_failed",
    );

    expect(coordinator.state.settings).toEqual({
      theme: "default",
      autoSave: true,
    });
    expect(fixture.getEventHistory()).not.toContainEqual(
      expect.objectContaining({ event: "data:state-changed" }),
    );
  });
});
