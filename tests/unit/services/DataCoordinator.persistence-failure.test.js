import LocalStorageVisitedStatePersistence from "../../../src/js/components/storage/LocalStorageVisitedStatePersistence.js";
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
      visitedState: new LocalStorageVisitedStatePersistence({
        storage: localStorage,
      }),
      eventBus: fixture.eventBus,
      projectRepository: fixture.projectRepository,
      i18n: { t: (key) => key },
    });
    coordinator.state.currentProfile = "captain";
    coordinator.state.currentEnvironment = "space";
    coordinator.state.profiles = {
      captain: structuredClone(profile),
      first_officer: { ...structuredClone(profile), name: "First Officer" },
    };
    coordinator._projectRoot = {
      currentProfile: "captain",
      profiles: structuredClone(coordinator.state.profiles),
      version: "1.0.0",
      lastModified: "2026-07-19T00:00:00.000Z",
    };
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
      fixture.projectRepository.commit.mockReturnValueOnce({
        status: "write_failed",
        error: "storage_write_failed",
      });

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
    fixture.projectRepository.commit.mockReturnValueOnce({
      status: "write_failed",
      error: "storage_write_failed",
    });

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
    fixture.projectRepository.commit.mockReturnValueOnce({
      status: "write_failed",
      error: "storage_write_failed",
    });

    await expect(coordinator.deleteProfile("captain")).rejects.toThrow(
      "failed_to_delete_profile",
    );

    expect(fixture.projectRepository.commit).toHaveBeenCalledWith(
      expect.objectContaining({
        currentProfile: "first_officer",
        profiles: expect.not.objectContaining({ captain: expect.anything() }),
      }),
      { verification: "not_requested" },
    );
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
    fixture.projectRepository.commit.mockReturnValueOnce({
      status: "write_failed",
      error: "storage_write_failed",
    });

    await expect(coordinator.setEnvironment("ground")).rejects.toThrow(
      "failed_to_save_profile",
    );

    expect(coordinator.state.currentEnvironment).toBe("space");
    expect(coordinator.state.profiles.captain.currentEnvironment).toBe("space");
    expect(fixture.getEventHistory()).not.toContainEqual(
      expect.objectContaining({ event: "environment:changed" }),
    );
  });
});
