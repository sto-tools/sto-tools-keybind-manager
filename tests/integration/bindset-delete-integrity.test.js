import { afterEach, describe, expect, it, vi } from "vitest";

import BindsetService from "../../src/js/components/services/BindsetService.js";
import DataCoordinator from "../../src/js/components/services/DataCoordinator.js";
import { request } from "../../src/js/core/requestResponse.js";
import { createServiceFixture } from "../fixtures/index.js";

function createProfile({ populated = false } = {}) {
  return {
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
      Preserved: {
        space: { keys: {} },
        ground: { keys: {} },
      },
    },
    keybindMetadata: {},
    aliasMetadata: {},
    bindsetMetadata: {
      Weapons: {
        space: { F1: { stabilizeExecutionOrder: true } },
      },
      Preserved: {
        ground: { F2: { stabilizeExecutionOrder: false } },
      },
    },
    migrationVersion: "2.1.1",
  };
}

function createRoot(profile) {
  return {
    version: "1.0.0",
    created: "2026-01-01T00:00:00.000Z",
    lastModified: "2026-01-01T00:00:00.000Z",
    currentProfile: "captain",
    profiles: { captain: profile },
    globalAliases: {},
    settings: { theme: "default", autoSave: true },
  };
}

describe("Bindset deletion owner and persistence integrity", () => {
  let fixture;
  let coordinator;
  let service;

  async function start(populated) {
    fixture = createServiceFixture({
      initialStorageData: {
        sto_keybind_manager: createRoot(createProfile({ populated })),
      },
    });
    coordinator = new DataCoordinator({
      eventBus: fixture.eventBus,
      storage: fixture.storage,
      i18n: { t: (key) => key },
    });
    service = new BindsetService({ eventBus: fixture.eventBus });

    coordinator.init();
    await vi.waitFor(() => {
      expect(coordinator.getCurrentState().ready).toBe(true);
    });
    service.init();
    await vi.waitFor(() => {
      expect(service.cache.dataState?.ready).toBe(true);
    });

    fixture.eventBusFixture.clearEventHistory();
    fixture.storage.saveProfile.mockClear();
  }

  afterEach(() => {
    if (service && !service.destroyed) service.destroy();
    if (coordinator && !coordinator.destroyed) coordinator.destroy();
    fixture?.destroy();
    vi.restoreAllMocks();
  });

  it.each([
    { label: "empty bindset", topic: "bindset:delete", populated: false },
    {
      label: "populated bindset",
      topic: "bindset:delete-with-keys",
      populated: true,
    },
  ])(
    "atomically removes an $label and its metadata from owner and durable state",
    async ({ topic, populated }) => {
      await start(populated);
      const revisionBefore = coordinator.getCurrentState().revision;

      await expect(
        request(fixture.eventBus, topic, { name: "Weapons" }),
      ).resolves.toMatchObject({ success: true });

      const ownerAfter = coordinator.getCurrentState();
      const ownerProfile = ownerAfter.profiles.captain;
      const durableProfile = fixture.storage.getProfile("captain");
      expect(fixture.storage.saveProfile).toHaveBeenCalledOnce();
      expect(ownerAfter.revision).toBe(revisionBefore + 1);
      expect(service.cache.dataState).toBe(ownerAfter);
      expect(Object.hasOwn(ownerProfile.bindsets, "Weapons")).toBe(false);
      expect(Object.hasOwn(ownerProfile.bindsetMetadata, "Weapons")).toBe(
        false,
      );
      expect(Object.hasOwn(durableProfile.bindsets, "Weapons")).toBe(false);
      expect(Object.hasOwn(durableProfile.bindsetMetadata, "Weapons")).toBe(
        false,
      );
      expect(ownerProfile.bindsets).toHaveProperty("Preserved");
      expect(ownerProfile.bindsetMetadata).toHaveProperty("Preserved");
      expect(durableProfile.bindsets).toHaveProperty("Preserved");
      expect(durableProfile.bindsetMetadata).toHaveProperty("Preserved");
    },
  );

  it("keeps owner and durable bindset data unchanged when the atomic write fails", async () => {
    await start(true);
    const ownerBefore = coordinator.getCurrentState();
    const durableBefore = structuredClone(
      fixture.storage.getProfile("captain"),
    );
    fixture.storage.saveProfile.mockReturnValueOnce(false);

    await expect(
      request(fixture.eventBus, "bindset:delete-with-keys", {
        name: "Weapons",
      }),
    ).rejects.toThrow("failed_to_save_profile");

    expect(fixture.storage.saveProfile).toHaveBeenCalledOnce();
    expect(coordinator.getCurrentState()).toBe(ownerBefore);
    expect(service.cache.dataState).toBe(ownerBefore);
    expect(fixture.storage.getProfile("captain")).toEqual(durableBefore);
    expect(ownerBefore.profiles.captain.bindsets).toHaveProperty("Weapons");
    expect(ownerBefore.profiles.captain.bindsetMetadata).toHaveProperty(
      "Weapons",
    );
    expect(
      fixture
        .getEventHistory()
        .filter(({ event }) =>
          ["data:state-changed", "profile:updated"].includes(event),
        ),
    ).toEqual([]);
  });
});
