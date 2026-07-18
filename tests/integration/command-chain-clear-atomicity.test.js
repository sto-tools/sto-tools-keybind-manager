import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import CommandChainService from "../../src/js/components/services/CommandChainService.js";
import DataCoordinator from "../../src/js/components/services/DataCoordinator.js";
import { createServiceFixture } from "../fixtures/index.js";

const profile = {
  name: "Captain",
  description: "Failure-atomic command-chain fixture",
  currentEnvironment: "space",
  builds: {
    space: { keys: { F1: [{ command: "FireAll" }] } },
    ground: { keys: {} },
  },
  aliases: {
    engage: {
      commands: ["FireAll", "Target_Enemy_Near"],
      description: "Preserve this metadata",
    },
  },
  bindsets: {
    Weapons: {
      space: { keys: { F1: ["FirePhasers", "FireTorpedoes"] } },
      ground: { keys: {} },
    },
  },
  keybindMetadata: {
    space: { F1: { stabilizeExecutionOrder: true } },
  },
  aliasMetadata: {
    engage: { stabilizeExecutionOrder: true },
  },
  bindsetMetadata: {
    Weapons: {
      space: { F1: { stabilizeExecutionOrder: true } },
    },
  },
  migrationVersion: "2.1.1",
};

const root = {
  version: "1.0.0",
  created: "2026-01-01T00:00:00.000Z",
  lastModified: "2026-01-01T00:00:00.000Z",
  currentProfile: "captain",
  profiles: { captain: profile },
  globalAliases: {},
  settings: { theme: "default", autoSave: true },
};

const clearTargets = [
  {
    label: "a primary-build key",
    environment: "space",
    key: "F1",
    bindset: null,
    commandsBefore: [{ command: "FireAll" }],
  },
  {
    label: "an alias",
    environment: "alias",
    key: "engage",
    bindset: null,
    commandsBefore: ["FireAll", "Target_Enemy_Near"],
  },
  {
    label: "an existing named-bindset key",
    environment: "space",
    key: "F1",
    bindset: "Weapons",
    commandsBefore: ["FirePhasers", "FireTorpedoes"],
  },
  {
    label: "a missing named-bindset key",
    environment: "ground",
    key: "F2",
    bindset: "Engineering",
    commandsBefore: undefined,
  },
];

function configureTarget(component, target) {
  component.cache.currentEnvironment = target.environment;
  component.cache.activeBindset = target.bindset || "Primary Bindset";
  component.cache.preferences.bindsetsEnabled = Boolean(target.bindset);
  component.cache.selectedKey =
    target.environment === "alias" ? null : target.key;
  component.cache.selectedAlias =
    target.environment === "alias" ? target.key : null;
}

function getTargetCommands(currentProfile, target) {
  if (target.environment === "alias") {
    return currentProfile.aliases?.[target.key]?.commands;
  }
  if (target.bindset) {
    return currentProfile.bindsets?.[target.bindset]?.[target.environment]
      ?.keys?.[target.key];
  }
  return currentProfile.builds?.[target.environment]?.keys?.[target.key];
}

describe("CommandChainService clear-chain owner atomicity", () => {
  let fixture;
  let coordinator;
  let service;
  const lateJoiners = [];

  beforeEach(async () => {
    lateJoiners.length = 0;
    fixture = createServiceFixture({
      initialStorageData: { sto_keybind_manager: root },
    });
    coordinator = new DataCoordinator({
      eventBus: fixture.eventBus,
      storage: fixture.storage,
      i18n: { t: (key) => key },
    });
    service = new CommandChainService({
      eventBus: fixture.eventBus,
      i18n: { t: (key) => key },
    });

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
  });

  afterEach(() => {
    for (const lateJoiner of lateJoiners) {
      if (!lateJoiner.destroyed) lateJoiner.destroy();
    }
    if (!service.destroyed) service.destroy();
    if (!coordinator.destroyed) coordinator.destroy();
    fixture.destroy();
    vi.restoreAllMocks();
  });

  it.each(clearTargets)(
    "keeps $label owner, caches, storage, and broadcasts unchanged when persistence fails",
    async (target) => {
      configureTarget(service, target);
      const ownerBefore = coordinator.getCurrentState();
      const cacheBefore = structuredClone(service.cache.dataState);
      const compatibilityCacheBefore = structuredClone({
        profile: service.cache.profile,
        builds: service.cache.builds,
        keys: service.cache.keys,
        aliases: service.cache.aliases,
      });
      const durableBefore = structuredClone(
        fixture.storage.getProfile("captain"),
      );
      const revisionBefore = ownerBefore.revision;
      fixture.storage.saveProfile.mockReturnValue(false);

      await expect(
        service.clearCommandChain(target.key, target.bindset),
      ).resolves.toBe(false);

      expect(fixture.storage.saveProfile).toHaveBeenCalledTimes(1);
      expect(coordinator.getCurrentState()).toEqual(ownerBefore);
      expect(coordinator.getCurrentState().revision).toBe(revisionBefore);
      expect(service.cache.dataState).toEqual(cacheBefore);
      expect({
        profile: service.cache.profile,
        builds: service.cache.builds,
        keys: service.cache.keys,
        aliases: service.cache.aliases,
      }).toEqual(compatibilityCacheBefore);
      expect(fixture.storage.getProfile("captain")).toEqual(durableBefore);
      expect(
        fixture
          .getEventHistory()
          .filter(({ event }) =>
            [
              "data:state-changed",
              "profile:updated",
              "chain-data-changed",
            ].includes(event),
          ),
      ).toEqual([]);

      expect(getTargetCommands(ownerBefore.profiles.captain, target)).toEqual(
        target.commandsBefore,
      );

      const lateJoiner = new CommandChainService({
        eventBus: fixture.eventBus,
        i18n: { t: (key) => key },
      });
      lateJoiners.push(lateJoiner);
      lateJoiner.init();
      await vi.waitFor(() => {
        expect(lateJoiner.cache.dataState?.ready).toBe(true);
      });
      configureTarget(lateJoiner, target);

      await expect(lateJoiner.getCommandsForSelectedKey()).resolves.toEqual(
        target.commandsBefore || [],
      );
    },
  );

  it.each(clearTargets)(
    "publishes one ordered $label owner update only after the successful write",
    async (target) => {
      configureTarget(service, target);
      const order = [];
      const detachState = fixture.eventBus.on("data:state-changed", () =>
        order.push("data:state-changed"),
      );
      const detachProfile = fixture.eventBus.on("profile:updated", () =>
        order.push("profile:updated"),
      );
      const detachChain = fixture.eventBus.on("chain-data-changed", () =>
        order.push("chain-data-changed"),
      );
      const ownerBefore = coordinator.getCurrentState();
      const revisionBefore = ownerBefore.revision;
      const metadataBefore = structuredClone({
        keybindMetadata: ownerBefore.profiles.captain.keybindMetadata,
        aliasMetadata: ownerBefore.profiles.captain.aliasMetadata,
        bindsetMetadata: ownerBefore.profiles.captain.bindsetMetadata,
      });

      try {
        await expect(
          service.clearCommandChain(target.key, target.bindset),
        ).resolves.toBe(true);
      } finally {
        detachState();
        detachProfile();
        detachChain();
      }

      const ownerAfter = coordinator.getCurrentState();
      const durableAfter = fixture.storage.getProfile("captain");
      expect(fixture.storage.saveProfile).toHaveBeenCalledTimes(1);
      expect(ownerAfter.revision).toBe(revisionBefore + 1);
      expect(getTargetCommands(ownerAfter.profiles.captain, target)).toEqual(
        [],
      );
      expect(getTargetCommands(durableAfter, target)).toEqual([]);
      expect(service.cache.dataState).toEqual(ownerAfter);
      expect({
        keybindMetadata: ownerAfter.profiles.captain.keybindMetadata,
        aliasMetadata: ownerAfter.profiles.captain.aliasMetadata,
        bindsetMetadata: ownerAfter.profiles.captain.bindsetMetadata,
      }).toEqual(metadataBefore);
      expect({
        keybindMetadata: durableAfter.keybindMetadata,
        aliasMetadata: durableAfter.aliasMetadata,
        bindsetMetadata: durableAfter.bindsetMetadata,
      }).toEqual(metadataBefore);
      if (target.environment === "alias") {
        expect(ownerAfter.profiles.captain.aliases.engage.description).toBe(
          "Preserve this metadata",
        );
        expect(durableAfter.aliases.engage.description).toBe(
          "Preserve this metadata",
        );
      }
      expect(order).toEqual([
        "data:state-changed",
        "profile:updated",
        "chain-data-changed",
      ]);

      const lateJoiner = new CommandChainService({
        eventBus: fixture.eventBus,
        i18n: { t: (key) => key },
      });
      lateJoiners.push(lateJoiner);
      lateJoiner.init();
      await vi.waitFor(() => {
        expect(lateJoiner.cache.dataState?.revision).toBe(ownerAfter.revision);
      });
      configureTarget(lateJoiner, target);

      await expect(lateJoiner.getCommandsForSelectedKey()).resolves.toEqual([]);
    },
  );
});
