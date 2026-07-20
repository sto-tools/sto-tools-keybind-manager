import { describe, expect, it, vi } from "vitest";

import { request } from "../../src/js/core/requestResponse.js";

const probeKey = "__command_customization_boundary_probe__";

function getProbeCommands(coordinator, profileId, environment) {
  return coordinator.getCurrentState().profiles[profileId].builds[environment]
    .keys[probeKey];
}

function getStoredProbeCommands(storage, profileId, environment) {
  return storage.getProfile(profileId).builds[environment].keys[probeKey];
}

function getRawProbeCommands(storage, profileId, environment) {
  return JSON.parse(localStorage.getItem(storage.storageKey)).profiles[
    profileId
  ].builds[environment].keys[probeKey];
}

function getToggle(selector) {
  return document.querySelector(
    `.command-item-row[data-index="0"] ${selector}`,
  );
}

describe("Command customization checked-bundle boundary", () => {
  it("keeps a rejected toggle inert and durably converges accepted palindromic and placement clicks", async () => {
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

    const startingProfile = startingState.profiles[profileId];
    const hadOriginalKey = Object.hasOwn(
      startingProfile.builds?.[environment]?.keys || {},
      probeKey,
    );
    const originalCommands = structuredClone(
      startingProfile.builds?.[environment]?.keys?.[probeKey],
    );
    const hadOriginalMetadata = Object.hasOwn(
      startingProfile.keybindMetadata?.[environment] || {},
      probeKey,
    );
    const originalMetadata = structuredClone(
      startingProfile.keybindMetadata?.[environment]?.[probeKey],
    );
    const originalSelection = chainUi.cache.selectedKey;
    const originalBindset = chainUi.cache.activeBindset || "Primary Bindset";
    const trayCommand = "TrayExecByTray 0 0";
    const siblingCommand = {
      command: "FireAll",
      custom: { nested: "preserve" },
    };
    const probeCommands = [trayCommand, siblingCommand];
    const stateChanged = vi.fn();
    const profileUpdated = vi.fn();
    const detachStateChanged = bus.on("data:state-changed", stateChanged);
    const detachProfileUpdated = bus.on("profile:updated", profileUpdated);
    let saveProfileSpy;

    try {
      const commandOperation = hadOriginalKey
        ? {
            modify: {
              builds: {
                [environment]: { keys: { [probeKey]: probeCommands } },
              },
            },
          }
        : {
            add: {
              builds: {
                [environment]: { keys: { [probeKey]: probeCommands } },
              },
            },
          };
      await request(bus, "data:update-profile", {
        profileId,
        ...commandOperation,
        modify: {
          ...(commandOperation.modify || {}),
          keybindMetadata: {
            [environment]: {
              [probeKey]: { stabilizeExecutionOrder: true },
            },
          },
        },
      });
      await request(bus, "bindset-selector:set-active-bindset", {
        bindset: "Primary Bindset",
      });
      await request(bus, "selection:select-key", {
        keyName: probeKey,
        environment,
        bindset: "Primary Bindset",
        skipPersistence: true,
        forceEmit: true,
      });

      let palindromicToggle;
      await vi.waitFor(() => {
        expect(chainUi.cache.selectedKey).toBe(probeKey);
        expect(chainUi.cache.dataState).toBe(coordinator.getCurrentState());
        expect(getProbeCommands(coordinator, profileId, environment)).toEqual(
          probeCommands,
        );
        palindromicToggle = getToggle(".btn-palindromic-toggle");
        expect(palindromicToggle).toBeInstanceOf(HTMLButtonElement);
        expect(palindromicToggle?.classList).toContain("active");
        expect(getToggle(".btn-placement-toggle")).toBeNull();
      });

      const ownerBeforeFailure = coordinator.getCurrentState();
      const cacheBeforeFailure = chainUi.cache.dataState;
      const durableBeforeFailure = structuredClone(
        storage.getProfile(profileId),
      );
      const rawBeforeFailure = localStorage.getItem(storage.storageKey);
      stateChanged.mockClear();
      profileUpdated.mockClear();
      saveProfileSpy = vi.spyOn(storage, "saveProfile").mockReturnValue(false);

      palindromicToggle.click();

      await vi.waitFor(() => {
        expect(saveProfileSpy).toHaveBeenCalledOnce();
      });
      await new Promise((resolve) => window.setTimeout(resolve, 0));
      expect(coordinator.getCurrentState()).toBe(ownerBeforeFailure);
      expect(chainUi.cache.dataState).toBe(cacheBeforeFailure);
      expect(storage.getProfile(profileId)).toEqual(durableBeforeFailure);
      expect(localStorage.getItem(storage.storageKey)).toBe(rawBeforeFailure);
      expect(stateChanged).not.toHaveBeenCalled();
      expect(profileUpdated).not.toHaveBeenCalled();
      expect(palindromicToggle.isConnected).toBe(true);
      expect(palindromicToggle.classList).toContain("active");
      expect(getToggle(".btn-placement-toggle")).toBeNull();

      saveProfileSpy.mockRestore();
      saveProfileSpy = vi.spyOn(storage, "saveProfile");
      stateChanged.mockClear();
      profileUpdated.mockClear();
      const revisionBeforePalindromic = coordinator.getCurrentState().revision;
      const expectedPalindromicCommands = [
        { command: trayCommand, palindromicGeneration: false },
        siblingCommand,
      ];

      palindromicToggle.click();

      await vi.waitFor(() => {
        expect(coordinator.getCurrentState().revision).toBe(
          revisionBeforePalindromic + 1,
        );
        expect(getProbeCommands(coordinator, profileId, environment)).toEqual(
          expectedPalindromicCommands,
        );
        expect(chainUi.cache.dataState).toBe(coordinator.getCurrentState());
        expect(
          chainUi.cache.dataState.profiles[profileId].builds[environment].keys[
            probeKey
          ],
        ).toEqual(expectedPalindromicCommands);
        expect(getStoredProbeCommands(storage, profileId, environment)).toEqual(
          expectedPalindromicCommands,
        );
        expect(getRawProbeCommands(storage, profileId, environment)).toEqual(
          expectedPalindromicCommands,
        );
        const currentPalindromic = getToggle(".btn-palindromic-toggle");
        expect(currentPalindromic).toBeInstanceOf(HTMLButtonElement);
        expect(currentPalindromic?.classList).not.toContain("active");
        const placement = getToggle(".btn-placement-toggle");
        expect(placement).toBeInstanceOf(HTMLButtonElement);
        expect(placement?.classList).not.toContain("active");
      });
      expect(saveProfileSpy).toHaveBeenCalledOnce();
      expect(stateChanged).toHaveBeenCalledOnce();
      expect(profileUpdated).toHaveBeenCalledOnce();
      expect(palindromicToggle.isConnected).toBe(false);

      const placementToggle = getToggle(".btn-placement-toggle");
      expect(placementToggle).toBeInstanceOf(HTMLButtonElement);
      saveProfileSpy.mockClear();
      stateChanged.mockClear();
      profileUpdated.mockClear();
      const revisionBeforePlacement = coordinator.getCurrentState().revision;
      const expectedPlacementCommands = [
        {
          command: trayCommand,
          palindromicGeneration: false,
          placement: "in-pivot-group",
        },
        siblingCommand,
      ];

      placementToggle.click();

      await vi.waitFor(() => {
        expect(coordinator.getCurrentState().revision).toBe(
          revisionBeforePlacement + 1,
        );
        expect(getProbeCommands(coordinator, profileId, environment)).toEqual(
          expectedPlacementCommands,
        );
        expect(chainUi.cache.dataState).toBe(coordinator.getCurrentState());
        expect(
          chainUi.cache.dataState.profiles[profileId].builds[environment].keys[
            probeKey
          ],
        ).toEqual(expectedPlacementCommands);
        expect(getStoredProbeCommands(storage, profileId, environment)).toEqual(
          expectedPlacementCommands,
        );
        expect(getRawProbeCommands(storage, profileId, environment)).toEqual(
          expectedPlacementCommands,
        );
        const currentPlacement = getToggle(".btn-placement-toggle");
        expect(currentPlacement).toBeInstanceOf(HTMLButtonElement);
        expect(currentPlacement?.classList).toContain("active");
      });
      expect(saveProfileSpy).toHaveBeenCalledOnce();
      expect(stateChanged).toHaveBeenCalledOnce();
      expect(profileUpdated).toHaveBeenCalledOnce();
      expect(placementToggle.isConnected).toBe(false);
    } finally {
      saveProfileSpy?.mockRestore();
      detachStateChanged();
      detachProfileUpdated();
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
                    keys: { [probeKey]: originalCommands },
                  },
                },
              },
            }
          : {
              delete: {
                builds: {
                  [environment]: { keys: [probeKey] },
                },
              },
            }),
      });
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

    const finalProfile = coordinator.getCurrentState().profiles[profileId];
    if (hadOriginalKey) {
      expect(finalProfile.builds[environment].keys[probeKey]).toEqual(
        originalCommands,
      );
    } else {
      expect(finalProfile.builds[environment].keys).not.toHaveProperty(
        probeKey,
      );
    }
    if (hadOriginalMetadata) {
      expect(finalProfile.keybindMetadata[environment][probeKey]).toEqual(
        originalMetadata,
      );
    } else {
      expect(finalProfile.keybindMetadata[environment]).not.toHaveProperty(
        probeKey,
      );
    }
  });
});
