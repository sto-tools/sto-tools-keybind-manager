import { describe, expect, it, vi } from "vitest";

import { MAX_STO_TEXT_IMPORT_BYTES } from "../../src/js/components/services/textImportBoundary.js";
import { request } from "../../src/js/core/requestResponse.js";

describe("STO text import browser boundary", () => {
  it("commits a valid keybind through the checked-bundle owner chain", async () => {
    const bus = window.eventBus;
    const storage = window.storageService;
    const coordinator = window.dataCoordinator;
    const consumer = window.commandChainUI;
    const beforeState = coordinator?.getCurrentState?.();
    expect(bus).toBeTruthy();
    expect(storage).toBeTruthy();
    expect(beforeState?.ready).toBe(true);
    expect(consumer?.cache.dataState).toBe(beforeState);
    if (!bus || !storage || !coordinator || !beforeState?.ready || !consumer)
      return;

    const profileId = beforeState.currentProfile;
    const environment = ["space", "ground"].includes(
      beforeState.currentEnvironment,
    )
      ? beforeState.currentEnvironment
      : "space";
    const probeKey = "CTRL+SHIFT+F24";
    const beforeRoot = localStorage.getItem(storage.storageKey);
    const beforeProfile = structuredClone(beforeState.profiles[profileId]);
    const ownershipEvents = [];
    let detachState = () => {};
    let detachLegacy = () => {};

    try {
      await request(bus, "data:update-profile", {
        profileId,
        add: {
          builds: {
            [environment]: { keys: { [probeKey]: ["ExistingCommand"] } },
          },
        },
      });
      const mergeBaseline = coordinator.getCurrentState();
      await vi.waitFor(() => {
        expect(consumer.cache.dataState).toBe(mergeBaseline);
      });
      expect(
        mergeBaseline.profiles[profileId].builds[environment].keys[probeKey],
      ).toEqual(["ExistingCommand"]);

      detachState = bus.on("data:state-changed", ({ state }) => {
        ownershipEvents.push({ event: "data:state-changed", state });
      });
      detachLegacy = bus.on("profile:updated", (payload) => {
        ownershipEvents.push({ event: "profile:updated", payload });
      });

      await expect(
        request(bus, "import:keybind-file", {
          content: `${probeKey} "FireAll"\n0x2 "encoded first"\n1 "display last"`,
          profileId,
          environment,
          strategy: "merge_overwrite",
        }),
      ).resolves.toMatchObject({
        success: true,
        imported: { keys: 2 },
        skipped: 0,
        overwritten: 1,
        cleared: 0,
      });

      const committedState = coordinator.getCurrentState();
      expect(committedState.revision).toBe(mergeBaseline.revision + 1);
      expect(committedState).not.toBe(mergeBaseline);
      expect(
        committedState.profiles[profileId].builds[environment].keys[probeKey],
      ).toEqual(["FireAll"]);
      expect(
        committedState.profiles[profileId].builds[environment].keys["1"],
      ).toEqual(["display last"]);
      expect(ownershipEvents.map(({ event }) => event)).toEqual([
        "data:state-changed",
        "profile:updated",
      ]);
      expect(ownershipEvents[0].state).toBe(committedState);
      expect(ownershipEvents[1].payload).toMatchObject({
        profileId,
        environment,
        profile: committedState.profiles[profileId],
      });

      await vi.waitFor(() => {
        expect(consumer.cache.dataState).toBe(committedState);
      });
      expect(storage.getProfile(profileId)).toEqual(
        committedState.profiles[profileId],
      );
      expect(
        JSON.parse(localStorage.getItem(storage.storageKey)).profiles[
          profileId
        ],
      ).toEqual(committedState.profiles[profileId]);
    } finally {
      detachState();
      detachLegacy();
      if (beforeRoot === null) {
        localStorage.removeItem(storage.storageKey);
      } else {
        localStorage.setItem(storage.storageKey, beforeRoot);
      }
      storage.getAllData(true);
      await request(bus, "data:reload-state");
      await vi.waitFor(() => {
        expect(coordinator.getCurrentState().profiles[profileId]).toEqual(
          beforeProfile,
        );
      });
    }
  });

  it("merges aliases with exact accounting through the checked-bundle owner chain", async () => {
    const bus = window.eventBus;
    const storage = window.storageService;
    const coordinator = window.dataCoordinator;
    const consumer = window.commandChainUI;
    const beforeState = coordinator?.getCurrentState?.();
    expect(bus).toBeTruthy();
    expect(storage).toBeTruthy();
    expect(beforeState?.ready).toBe(true);
    expect(consumer?.cache.dataState).toBe(beforeState);
    if (!bus || !storage || !coordinator || !beforeState?.ready || !consumer)
      return;

    const profileId = beforeState.currentProfile;
    const existingAlias = "CodexTextImportExisting";
    const importedAlias = "CodexTextImportNew";
    const originalAlias = {
      commands: ["Target_Enemy_Near"],
      description: "seeded",
    };
    const beforeRoot = localStorage.getItem(storage.storageKey);
    const beforeProfile = structuredClone(beforeState.profiles[profileId]);
    const ownershipEvents = [];
    let durableAtStorageEvent;
    let detachStorage = () => {};
    let detachState = () => {};
    let detachLegacy = () => {};

    try {
      await request(bus, "data:update-profile", {
        profileId,
        add: { aliases: { [existingAlias]: originalAlias } },
      });
      const mergeBaseline = coordinator.getCurrentState();
      await vi.waitFor(() => {
        expect(consumer.cache.dataState).toBe(mergeBaseline);
      });
      expect(mergeBaseline.profiles[profileId].aliases[existingAlias]).toEqual(
        originalAlias,
      );

      detachStorage = bus.on("storage:data-changed", () => {
        durableAtStorageEvent = JSON.parse(
          localStorage.getItem(storage.storageKey),
        );
        ownershipEvents.push({ event: "storage:data-changed" });
      });
      detachState = bus.on("data:state-changed", ({ state }) => {
        ownershipEvents.push({ event: "data:state-changed", state });
      });
      detachLegacy = bus.on("profile:updated", (payload) => {
        ownershipEvents.push({ event: "profile:updated", payload });
      });

      await expect(
        request(bus, "import:alias-file", {
          content:
            `alias ${existingAlias} "FireAll"\n` +
            `alias ${importedAlias} "Target_Enemy_Near"`,
          profileId,
          strategy: "merge_keep",
        }),
      ).resolves.toEqual({
        success: true,
        imported: { aliases: 1 },
        skipped: 1,
        overwritten: 0,
        cleared: 0,
        errors: [],
        message: "import_completed_aliases",
      });

      const committedState = coordinator.getCurrentState();
      const committedProfile = committedState.profiles[profileId];
      expect(committedState.revision).toBe(mergeBaseline.revision + 1);
      expect(committedProfile.aliases[existingAlias]).toEqual(originalAlias);
      expect(committedProfile.aliases[importedAlias]).toEqual({
        commands: ["Target_Enemy_Near"],
        description: "",
      });
      expect(ownershipEvents.map(({ event }) => event)).toEqual([
        "storage:data-changed",
        "data:state-changed",
        "profile:updated",
      ]);
      expect(
        durableAtStorageEvent.profiles[profileId].aliases[importedAlias],
      ).toEqual(committedProfile.aliases[importedAlias]);
      expect(ownershipEvents[1].state).toBe(committedState);
      expect(ownershipEvents[2].payload).toEqual({
        profileId,
        profile: committedProfile,
      });
      expect(ownershipEvents[2].payload).not.toHaveProperty("environment");

      await vi.waitFor(() => {
        expect(consumer.cache.dataState).toBe(committedState);
      });
      expect(storage.getProfile(profileId)).toEqual(committedProfile);
      expect(
        JSON.parse(localStorage.getItem(storage.storageKey)).profiles[
          profileId
        ],
      ).toEqual(committedProfile);
    } finally {
      detachStorage();
      detachState();
      detachLegacy();
      if (beforeRoot === null) {
        localStorage.removeItem(storage.storageKey);
      } else {
        localStorage.setItem(storage.storageKey, beforeRoot);
      }
      storage.getAllData(true);
      await request(bus, "data:reload-state");
      await vi.waitFor(() => {
        expect(coordinator.getCurrentState().profiles[profileId]).toEqual(
          beforeProfile,
        );
      });
    }
  });

  it.each([
    ["import:keybind-file", "keybind_file_too_large", true],
    ["import:alias-file", "alias_file_too_large", false],
  ])(
    "rejects oversized content through checked-bundle RPC %s before persistence",
    async (topic, error, needsEnvironment) => {
      const bus = window.eventBus;
      const storage = window.storageService;
      const coordinator = window.dataCoordinator;
      const consumer = window.commandChainUI;
      const state = coordinator?.getCurrentState?.();
      expect(bus).toBeTruthy();
      expect(storage).toBeTruthy();
      expect(state?.ready).toBe(true);
      expect(consumer?.cache.dataState).toBe(state);
      if (!bus || !storage || !coordinator || !consumer || !state?.ready)
        return;

      const beforeRoot = localStorage.getItem(storage.storageKey);
      const beforeCacheState = consumer.cache.dataState;
      const content = "x".repeat(MAX_STO_TEXT_IMPORT_BYTES + 1);
      const payload = {
        content,
        profileId: state.currentProfile,
        ...(needsEnvironment ? { environment: state.currentEnvironment } : {}),
      };

      await expect(request(bus, topic, payload)).resolves.toEqual({
        success: false,
        error,
        params: {
          size: MAX_STO_TEXT_IMPORT_BYTES + 1,
          limit: MAX_STO_TEXT_IMPORT_BYTES,
        },
      });
      expect(localStorage.getItem(storage.storageKey)).toBe(beforeRoot);
      expect(coordinator.getCurrentState()).toBe(state);
      expect(consumer.cache.dataState).toBe(beforeCacheState);
    },
  );

  it("rejects an unterminated bracket alias in bounded time without owner effects", async () => {
    const bus = window.eventBus;
    const storage = window.storageService;
    const coordinator = window.dataCoordinator;
    const consumer = window.commandChainUI;
    const state = coordinator?.getCurrentState?.();
    expect(bus).toBeTruthy();
    expect(storage).toBeTruthy();
    expect(state?.ready).toBe(true);
    expect(consumer?.cache.dataState).toBe(state);
    if (!bus || !storage || !coordinator || !consumer || !state?.ready) return;

    const beforeRoot = localStorage.getItem(storage.storageKey);
    const content = `alias Slow <& ${" ".repeat(10_000)}X`;

    await expect(
      request(bus, "import:alias-file", {
        content,
        profileId: state.currentProfile,
      }),
    ).resolves.toEqual({
      success: false,
      error: "no_aliases_found_in_file",
    });
    expect(localStorage.getItem(storage.storageKey)).toBe(beforeRoot);
    expect(coordinator.getCurrentState()).toBe(state);
    expect(consumer.cache.dataState).toBe(state);
  });
});
