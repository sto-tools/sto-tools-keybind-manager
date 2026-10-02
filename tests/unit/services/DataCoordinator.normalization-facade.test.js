import LocalStorageVisitedStatePersistence from "../../../src/js/components/storage/LocalStorageVisitedStatePersistence.js";
import { afterEach, describe, expect, it, vi } from "vitest";

import DataCoordinator from "../../../src/js/components/services/DataCoordinator.js";
import { createServiceFixture } from "../../fixtures/index.js";

describe("DataCoordinator normalization facade", () => {
  const fixtures = [];

  afterEach(() => {
    for (const { coordinator, fixture } of fixtures.splice(0)) {
      if (!coordinator.destroyed) coordinator.destroy();
      fixture.destroy();
    }
    vi.restoreAllMocks();
  });

  function createCoordinator() {
    const fixture = createServiceFixture();
    const coordinator = new DataCoordinator({
      visitedState: new LocalStorageVisitedStatePersistence({
        storage: localStorage,
      }),
      eventBus: fixture.eventBus,
      projectRepository: fixture.projectRepository,
      i18n: { t: (key) => key },
    });
    fixtures.push({ coordinator, fixture });
    return { coordinator, fixture };
  }

  it("preserves per-profile diagnostics, clock, persistence, and adoption order", async () => {
    const { coordinator, fixture } = createCoordinator();
    const sequence = [];
    const normalizedAt = "2099-07-19T00:00:00.000Z";
    const profiles = {
      legacy: {
        name: "Legacy",
        builds: { space: { keys: { F1: [{ command: "FireAll" }] } } },
        aliases: {
          dynFxSetFXExclusionList_Space: {
            type: "vfx-alias",
            commands: ["dynFxSetFXExclusionList FX_Test"],
          },
        },
      },
    };
    const rootData = {
      version: "1.0.0",
      currentProfile: "legacy",
      profiles,
      settings: { theme: "dark" },
      globalAliases: {},
      lastModified: "2099-07-18T00:00:00.000Z",
      extension: { retained: true },
    };
    vi.spyOn(console, "log").mockImplementation((message) => {
      sequence.push(message);
    });
    vi.spyOn(Date.prototype, "toISOString").mockImplementation(() => {
      sequence.push("clock:normalization");
      return normalizedAt;
    });
    fixture.projectRepository.commit.mockImplementation((nextRoot, options) => {
      sequence.push("storage:save-all");
      expect(options).toEqual({ verification: "not_requested" });
      expect(profiles.legacy).not.toHaveProperty("migrationVersion");
      expect(nextRoot).toMatchObject({
        currentProfile: "legacy",
        settings: { theme: "dark" },
        extension: { retained: true },
        profiles: {
          legacy: {
            migrationVersion: "2.1.1",
            lastModified: normalizedAt,
            builds: { space: { keys: { F1: ["FireAll"] } } },
          },
        },
      });
      return { status: "committed", value: structuredClone(nextRoot) };
    });

    coordinator._projectRoot = structuredClone(rootData);
    await expect(coordinator.normalizeAllProfiles(profiles)).resolves.toBe(1);

    expect(sequence).toEqual([
      "[DataCoordinator] Migrating profile: legacy",
      "[ProfileNormalizer] Migrating from 2.0.0 to 2.1.0",
      "[ProfileNormalizer] Removing old VFX alias: dynFxSetFXExclusionList_Space",
      "[ProfileNormalizer] Migrating from 2.1.0 to 2.1.1",
      "clock:normalization",
      "[DataCoordinator] Profile legacy migrated from 2.0.0 to 2.1.1",
      "storage:save-all",
      '[DataCoordinator] emit → storage:data-changed (options: {"synchronous":true})',
      "[DataCoordinator] Migrated 1 profiles",
    ]);
    // Public normalization now detaches its request before queue/owner access.
    // The durable draft, not the caller-owned input, receives normalization.
    const persisted =
      fixture.projectRepository.commit.mock.calls[0][0].profiles;
    expect(persisted.legacy).toMatchObject({
      migrationVersion: "2.1.1",
      lastModified: normalizedAt,
      builds: { space: { keys: { F1: ["FireAll"] } } },
    });
    expect(persisted.legacy.aliases).not.toHaveProperty(
      "dynFxSetFXExclusionList_Space",
    );
    expect(profiles.legacy).not.toHaveProperty("migrationVersion");
    expect(profiles.legacy.builds.space.keys.F1).toEqual([
      { command: "FireAll" },
    ]);
  });

  it("returns before any storage or normalization effect for a current version", async () => {
    const { coordinator, fixture } = createCoordinator();
    const profiles = {
      current: {
        name: "Current",
        migrationVersion: "2.1.1",
        builds: {
          space: { keys: { F1: [{ command: "MustRemainRich" }] } },
        },
        aliases: {},
      },
    };
    const sourceBefore = structuredClone(profiles);
    const isoSpy = vi.spyOn(Date.prototype, "toISOString");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await expect(coordinator.normalizeAllProfiles(profiles)).resolves.toBe(0);

    expect(fixture.projectRepository.load).not.toHaveBeenCalled();
    expect(fixture.projectRepository.commit).not.toHaveBeenCalled();
    expect(isoSpy).not.toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalled();
    expect(profiles).toEqual(sourceBefore);
  });

  it("keeps the repository-returned root authoritative after implicit normalization", async () => {
    const { coordinator, fixture } = createCoordinator();
    const legacyProfile = {
      name: "Legacy",
      builds: { space: { keys: { F1: [{ command: "FireAll" }] } } },
      aliases: {},
    };
    const rootData = {
      version: "1.0.0",
      currentProfile: "legacy",
      profiles: { legacy: legacyProfile },
      settings: {},
      globalAliases: {},
      lastModified: "2099-07-18T00:00:00.000Z",
    };
    coordinator._projectRoot = structuredClone(rootData);
    coordinator.state.profiles = structuredClone(rootData.profiles);
    vi.spyOn(console, "log").mockImplementation(() => {});
    fixture.projectRepository.commit.mockImplementation((candidate) => {
      const accepted = structuredClone(candidate);
      accepted.profiles.legacy.repositoryCanonical = true;
      return { status: "committed", value: accepted };
    });

    await expect(coordinator.normalizeAllProfiles()).resolves.toBe(1);

    expect(coordinator.state.profiles).toEqual(
      coordinator._projectRoot.profiles,
    );
    expect(coordinator.state.profiles.legacy).toMatchObject({
      migrationVersion: "2.1.1",
      repositoryCanonical: true,
    });
  });

  it("uses the accepted owner root for a null override and stamps down a future version", async () => {
    const { coordinator, fixture } = createCoordinator();
    const sequence = [];
    const normalizedAt = "2099-07-20T00:00:00.000Z";
    const profiles = {
      future: {
        name: "Future",
        migrationVersion: "9.0.0",
        builds: { space: { keys: { F9: ["FutureCommand"] } } },
        aliases: {},
      },
    };
    const sourceProfile = profiles.future;
    const storedRoot = {
      currentProfile: "future",
      profiles: { ignored: { name: "Root profile" } },
      settings: { language: "fr" },
      globalAliases: {},
      version: "1.0.0",
      lastModified: "2099-07-19T00:00:00.000Z",
      extension: { retained: true },
    };
    coordinator._projectRoot = structuredClone(storedRoot);
    const logSpy = vi.spyOn(console, "log").mockImplementation((message) => {
      sequence.push(message);
    });
    const isoSpy = vi
      .spyOn(Date.prototype, "toISOString")
      .mockImplementation(() => {
        sequence.push("clock:normalization");
        return normalizedAt;
      });
    fixture.projectRepository.commit.mockImplementation((candidate) => {
      sequence.push("storage:save-all");
      return { status: "committed", value: structuredClone(candidate) };
    });

    await expect(coordinator.normalizeAllProfiles(profiles)).resolves.toBe(1);

    expect(fixture.projectRepository.load).not.toHaveBeenCalled();
    expect(fixture.projectRepository.commit).toHaveBeenCalledWith(
      expect.objectContaining({
        currentProfile: "future",
        settings: { language: "fr" },
        extension: { retained: true },
        profiles: {
          future: expect.objectContaining({ migrationVersion: "2.1.1" }),
        },
      }),
      { verification: "not_requested" },
    );
    expect(
      fixture.projectRepository.commit.mock.calls[0][0].profiles,
    ).not.toHaveProperty("ignored");
    expect(
      fixture.projectRepository.commit.mock.calls[0][0].profiles.future,
    ).toEqual({
      name: "Future",
      migrationVersion: "2.1.1",
      lastModified: normalizedAt,
      builds: { space: { keys: { F9: ["FutureCommand"] } } },
      aliases: {},
    });
    expect(sequence).toEqual([
      "[DataCoordinator] Migrating profile: future",
      "clock:normalization",
      "[DataCoordinator] Profile future migrated from 9.0.0 to 2.1.1",
      "storage:save-all",
      '[DataCoordinator] emit → storage:data-changed (options: {"synchronous":true})',
      "[DataCoordinator] Migrated 1 profiles",
    ]);
    expect(logSpy).toHaveBeenCalledTimes(4);
    expect(isoSpy).toHaveBeenCalledTimes(1);
    expect(profiles.future).toBe(sourceProfile);
    expect(
      fixture.projectRepository.commit.mock.calls[0][0].profiles.future,
    ).not.toBe(sourceProfile);
    expect(sourceProfile.migrationVersion).toBe("9.0.0");
    expect(sourceProfile).not.toHaveProperty("lastModified");
  });

  it("does not access storage after a partial normalizer failure", async () => {
    const { coordinator, fixture } = createCoordinator();
    /** @type {any} */
    const cyclicCommand = { command: "SecondCommand" };
    cyclicCommand.self = cyclicCommand;
    const profiles = {
      first: {
        name: "First",
        builds: { space: { keys: { F1: [{ command: "FirstCommand" }] } } },
        aliases: {},
      },
      second: {
        name: "Second",
        builds: { space: { keys: { F2: [cyclicCommand] } } },
        aliases: {},
      },
    };
    const firstSource = profiles.first;
    const secondSource = profiles.second;
    vi.spyOn(console, "log").mockImplementation(() => {});

    await expect(coordinator.normalizeAllProfiles(profiles)).rejects.toThrow();

    expect(fixture.projectRepository.load).not.toHaveBeenCalled();
    expect(fixture.projectRepository.commit).not.toHaveBeenCalled();
    expect(profiles.first).toBe(firstSource);
    expect(profiles.first).not.toHaveProperty("migrationVersion");
    expect(profiles.first.builds.space.keys.F1).toEqual([
      { command: "FirstCommand" },
    ]);
    expect(profiles.second).toBe(secondSource);
    expect(profiles.second).not.toHaveProperty("migrationVersion");
    expect(profiles.second.builds.space.keys.F2[0]).toBe(cyclicCommand);
  });
});
