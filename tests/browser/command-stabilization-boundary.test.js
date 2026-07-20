import { describe, expect, it, vi } from "vitest";

import { request } from "../../src/js/core/requestResponse.js";

const probeKey = "__command_stabilization_probe__";
const toolbarProbeKey = "__command_stabilization_toolbar_probe__";

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
      expect(order).toEqual(["data:state-changed", "profile:updated"]);
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
      expect(order).toEqual(["data:state-changed", "profile:updated"]);
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

  it("toggles metadata through the real toolbar without rewriting a mixed canonical chain", async () => {
    const bus = window.eventBus;
    const coordinator = window.dataCoordinator;
    const storage = window.storageService;
    const chainUi = window.commandChainUI;
    const stabilizeButton = document.getElementById(
      "stabilizeExecutionOrderBtn",
    );

    expect(bus).toBeTruthy();
    expect(coordinator?.getCurrentState?.().ready).toBe(true);
    expect(storage).toBeTruthy();
    expect(chainUi?.isInitialized?.()).toBe(true);
    expect(stabilizeButton).toBeInstanceOf(HTMLButtonElement);
    if (
      !bus ||
      !coordinator ||
      !storage ||
      !chainUi ||
      !(stabilizeButton instanceof HTMLButtonElement)
    ) {
      return;
    }

    const startingState = coordinator.getCurrentState();
    const profileId = startingState.currentProfile;
    const environment = startingState.currentEnvironment;
    expect(profileId).toBeTruthy();
    expect(["space", "ground"]).toContain(environment);
    if (!profileId || !["space", "ground"].includes(environment)) return;

    const startingProfile = startingState.profiles[profileId];
    const originalCommands = structuredClone(
      startingProfile.builds?.[environment]?.keys?.[toolbarProbeKey],
    );
    const hadOriginalKey = Object.hasOwn(
      startingProfile.builds?.[environment]?.keys || {},
      toolbarProbeKey,
    );
    const originalMetadata = structuredClone(
      startingProfile.keybindMetadata?.[environment]?.[toolbarProbeKey],
    );
    const hadOriginalMetadata = Object.hasOwn(
      startingProfile.keybindMetadata?.[environment] || {},
      toolbarProbeKey,
    );
    const originalSelection = chainUi.cache.selectedKey;
    const originalBindset = chainUi.cache.activeBindset || "Primary Bindset";
    const mixedCommands = [
      "TrayExecByTray 0 0",
      "FireAll",
      "TrayExecByTray 1 0",
    ];
    const siblingMetadata = { note: { nested: "preserve" } };
    let saveProfileSpy;

    try {
      await request(bus, "data:update-profile", {
        profileId,
        add: {
          builds: {
            [environment]: { keys: { [toolbarProbeKey]: mixedCommands } },
          },
        },
        modify: {
          keybindMetadata: {
            [environment]: {
              [toolbarProbeKey]: {
                stabilizeExecutionOrder: true,
                ...siblingMetadata,
              },
            },
          },
        },
      });
      await request(bus, "bindset-selector:set-active-bindset", {
        bindset: "Primary Bindset",
      });
      await request(bus, "selection:select-key", {
        keyName: toolbarProbeKey,
        environment,
        bindset: "Primary Bindset",
        skipPersistence: true,
        forceEmit: true,
      });

      await vi.waitFor(() => {
        expect(chainUi.cache.selectedKey).toBe(toolbarProbeKey);
        expect(stabilizeButton.disabled).toBe(false);
        expect(stabilizeButton.classList.contains("active")).toBe(true);
      });

      const revisionBefore = coordinator.getCurrentState().revision;
      saveProfileSpy = vi.spyOn(storage, "saveProfile");
      stabilizeButton.click();

      await vi.waitFor(() => {
        const owner = coordinator.getCurrentState();
        expect(owner.revision).toBe(revisionBefore + 1);
        expect(
          owner.profiles[profileId].keybindMetadata[environment][
            toolbarProbeKey
          ],
        ).toEqual({
          stabilizeExecutionOrder: false,
          ...siblingMetadata,
        });
        expect(stabilizeButton.classList.contains("active")).toBe(false);
      });

      const ownerAfter = coordinator.getCurrentState();
      const consumerAfter = chainUi.cache.dataState;
      const durableAfter = storage.getProfile(profileId);
      expect(saveProfileSpy).toHaveBeenCalledOnce();
      expect(
        ownerAfter.profiles[profileId].builds[environment].keys[
          toolbarProbeKey
        ],
      ).toEqual(mixedCommands);
      expect(
        consumerAfter.profiles[profileId].builds[environment].keys[
          toolbarProbeKey
        ],
      ).toEqual(mixedCommands);
      expect(durableAfter.builds[environment].keys[toolbarProbeKey]).toEqual(
        mixedCommands,
      );
      expect(
        consumerAfter.profiles[profileId].keybindMetadata[environment][
          toolbarProbeKey
        ],
      ).toEqual({ stabilizeExecutionOrder: false, ...siblingMetadata });
      expect(
        durableAfter.keybindMetadata[environment][toolbarProbeKey],
      ).toEqual({ stabilizeExecutionOrder: false, ...siblingMetadata });
    } finally {
      saveProfileSpy?.mockRestore();
      await request(bus, "bindset-selector:set-active-bindset", {
        bindset: originalBindset,
      });
      await request(bus, "selection:select-key", {
        keyName: originalSelection,
        environment,
        bindset: originalBindset,
        skipPersistence: true,
        forceEmit: true,
      });
      await request(bus, "data:update-profile", {
        profileId,
        ...(hadOriginalKey
          ? {
              modify: {
                builds: {
                  [environment]: {
                    keys: { [toolbarProbeKey]: originalCommands },
                  },
                },
              },
            }
          : {
              delete: {
                builds: {
                  [environment]: { keys: [toolbarProbeKey] },
                },
              },
            }),
      });
      await request(bus, "data:update-profile", {
        profileId,
        modify: {
          keybindMetadata: {
            [environment]: {
              [toolbarProbeKey]: hadOriginalMetadata ? originalMetadata : {},
            },
          },
        },
      });
    }

    const finalProfile = coordinator.getCurrentState().profiles[profileId];
    if (hadOriginalKey) {
      expect(finalProfile.builds[environment].keys[toolbarProbeKey]).toEqual(
        originalCommands,
      );
    } else {
      expect(finalProfile.builds[environment].keys).not.toHaveProperty(
        toolbarProbeKey,
      );
    }
    if (hadOriginalMetadata) {
      expect(
        finalProfile.keybindMetadata[environment][toolbarProbeKey],
      ).toEqual(originalMetadata);
    } else {
      expect(finalProfile.keybindMetadata[environment]).not.toHaveProperty(
        toolbarProbeKey,
      );
    }
  });
});
