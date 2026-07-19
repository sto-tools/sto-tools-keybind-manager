import { describe, expect, it, vi } from "vitest";

import { request } from "../../src/js/core/requestResponse.js";

const probeKey = "__command_stabilization_probe__";

describe("Command stabilization checked-bundle boundary", () => {
  it("keeps failed writes silent and preserves ordered compatibility publication after success", async () => {
    const bus = window.eventBus;
    const coordinator = window.dataCoordinator;
    const storage = window.storageService;
    const chainUi = window.commandChainUI;

    expect(bus).toBeTruthy();
    expect(coordinator?.getCurrentState?.().ready).toBe(true);
    expect(storage).toBeTruthy();
    expect(chainUi?.isInitialized?.()).toBe(true);
    if (!bus || !coordinator || !storage || !chainUi) return;

    const startingState = coordinator.getCurrentState();
    const profileId = startingState.currentProfile;
    const environment = startingState.currentEnvironment;
    expect(profileId).toBeTruthy();
    expect(["space", "ground"]).toContain(environment);
    if (!profileId || !["space", "ground"].includes(environment)) return;

    const originalMetadata = structuredClone(
      startingState.profiles[profileId].keybindMetadata?.[environment]?.[
        probeKey
      ],
    );
    const hadOriginalMetadata = Object.hasOwn(
      startingState.profiles[profileId].keybindMetadata?.[environment] || {},
      probeKey,
    );
    const siblingMetadata = { note: { nested: "preserve" } };
    await request(bus, "data:update-profile", {
      profileId,
      modify: {
        keybindMetadata: {
          [environment]: {
            [probeKey]: {
              stabilizeExecutionOrder: true,
              ...siblingMetadata,
            },
          },
        },
      },
    });
    await vi.waitFor(() => {
      expect(
        chainUi.cache.dataState.profiles[profileId].keybindMetadata[
          environment
        ][probeKey],
      ).toEqual({ stabilizeExecutionOrder: true, ...siblingMetadata });
    });

    const order = [];
    const detachState = bus.on("data:state-changed", () =>
      order.push("data:state-changed"),
    );
    const detachProfile = bus.on("profile:updated", () =>
      order.push("profile:updated"),
    );
    const detachChain = bus.on("chain-data-changed", () =>
      order.push("chain-data-changed"),
    );
    const emitSpy = vi.spyOn(bus, "emit");
    let saveProfileSpy;

    try {
      const ownerBeforeFailure = coordinator.getCurrentState();
      const consumerBeforeFailure = chainUi.cache.dataState;
      const durableBeforeFailure = structuredClone(
        storage.getProfile(profileId),
      );
      saveProfileSpy = vi.spyOn(storage, "saveProfile").mockReturnValue(false);

      await expect(
        request(bus, "command:set-stabilize", {
          name: probeKey,
          stabilize: false,
          bindset: null,
        }),
      ).resolves.toMatchObject({ success: false });

      expect(saveProfileSpy).toHaveBeenCalledTimes(1);
      expect(coordinator.getCurrentState()).toBe(ownerBeforeFailure);
      expect(chainUi.cache.dataState).toBe(consumerBeforeFailure);
      expect(storage.getProfile(profileId)).toEqual(durableBeforeFailure);
      expect(order).toEqual([]);
      expect(
        emitSpy.mock.calls.filter(([event]) => event === "stabilize-changed"),
      ).toEqual([]);

      saveProfileSpy.mockRestore();
      saveProfileSpy = vi.spyOn(storage, "saveProfile");
      emitSpy.mockClear();

      await expect(
        request(bus, "command:set-stabilize", {
          name: probeKey,
          stabilize: false,
          bindset: null,
        }),
      ).resolves.toEqual({ success: true });

      await vi.waitFor(() => {
        expect(
          coordinator.getCurrentState().profiles[profileId].keybindMetadata[
            environment
          ][probeKey].stabilizeExecutionOrder,
        ).toBe(false);
        expect(
          chainUi.cache.dataState.profiles[profileId].keybindMetadata[
            environment
          ][probeKey].stabilizeExecutionOrder,
        ).toBe(false);
      });
      expect(
        storage.getProfile(profileId).keybindMetadata[environment][probeKey],
      ).toEqual({ stabilizeExecutionOrder: false, ...siblingMetadata });
      expect(saveProfileSpy).toHaveBeenCalledTimes(1);
      expect(order).toEqual([
        "data:state-changed",
        "profile:updated",
        "profile:updated",
      ]);
      expect(
        emitSpy.mock.calls.filter(([event]) => event === "stabilize-changed"),
      ).toEqual([]);
      expect(
        emitSpy.mock.calls.filter(([event]) => event === "chain-data-changed"),
      ).toEqual([]);

      const revisionBeforeNoOp = coordinator.getCurrentState().revision;
      order.length = 0;
      emitSpy.mockClear();
      await expect(
        request(bus, "command:set-stabilize", {
          name: probeKey,
          stabilize: false,
          bindset: null,
        }),
      ).resolves.toEqual({ success: true });

      expect(saveProfileSpy).toHaveBeenCalledTimes(2);
      expect(coordinator.getCurrentState().revision).toBe(
        revisionBeforeNoOp + 1,
      );
      expect(
        coordinator.getCurrentState().profiles[profileId].keybindMetadata[
          environment
        ][probeKey],
      ).toEqual({ stabilizeExecutionOrder: false, ...siblingMetadata });
      expect(order).toEqual([
        "data:state-changed",
        "profile:updated",
        "profile:updated",
      ]);
      expect(
        emitSpy.mock.calls.filter(([event]) => event === "stabilize-changed"),
      ).toEqual([]);
      expect(
        emitSpy.mock.calls.filter(([event]) => event === "chain-data-changed"),
      ).toEqual([]);

      order.length = 0;
      emitSpy.mockClear();
      await expect(
        request(bus, "command:set-stabilize", {
          name: "constructor",
          stabilize: true,
          bindset: null,
        }),
      ).resolves.toMatchObject({ success: false });

      expect(saveProfileSpy).toHaveBeenCalledTimes(2);
      expect(order).toEqual([]);
      expect(
        emitSpy.mock.calls.filter(([event]) => event === "stabilize-changed"),
      ).toEqual([]);
      expect(
        emitSpy.mock.calls.filter(([event]) => event === "chain-data-changed"),
      ).toEqual([]);
    } finally {
      saveProfileSpy?.mockRestore();
      detachState();
      detachProfile();
      detachChain();
      emitSpy.mockRestore();

      await request(bus, "data:update-profile", {
        profileId,
        modify: {
          keybindMetadata: {
            [environment]: {
              [probeKey]: hadOriginalMetadata ? originalMetadata : {},
            },
          },
        },
      });
    }

    const finalMetadata =
      coordinator.getCurrentState().profiles[profileId].keybindMetadata?.[
        environment
      ] || {};
    if (hadOriginalMetadata) {
      expect(finalMetadata[probeKey]).toEqual(originalMetadata);
    } else {
      expect(finalMetadata).not.toHaveProperty(probeKey);
    }
  });
});
