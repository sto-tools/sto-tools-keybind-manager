// Exact internal assertions preserved from tests/browser/command-customization-boundary.test.js.
import { beforeEach, afterEach } from "vitest";
import {
  initializeSourceApplication,
  destroySourceApplication,
} from "../../fixtures/ui/sourceApplicationRuntime.js";
beforeEach(initializeSourceApplication);
afterEach(destroySourceApplication);

import { runtime } from "../../fixtures/ui/sourceApplicationRuntime.js";
import { describe, expect, it, vi } from "vitest";

import { request } from "../../../src/js/core/requestResponse.js";
import { observeCommandChainProjection } from "../../fixtures/ui/commandChainProjection.js";
import {
  PROJECT_ROOT_KEY,
  readProjectProfile,
} from "../../fixtures/ui/projectStorage.js";

const probeKey = "__command_customization_boundary_probe__";

function getProbeCommands(coordinator, profileId, environment) {
  return coordinator.getCurrentState().profiles[profileId].builds[environment]
    .keys[probeKey];
}

function getStoredProbeCommands(profileId, environment) {
  return readProjectProfile(profileId).builds[environment].keys[probeKey];
}

function getRawProbeCommands(profileId, environment) {
  return JSON.parse(localStorage.getItem(PROJECT_ROOT_KEY)).profiles[profileId]
    .builds[environment].keys[probeKey];
}

function getToggle(selector) {
  return document.querySelector(
    `.command-item-row[data-index="0"] ${selector}`,
  );
}

describe("Command customization source-composition equivalent boundary", () => {
  it("keeps a rejected toggle inert and durably converges accepted palindromic and placement clicks", async () => {
    const bus = runtime().eventBus;
    const coordinator = runtime().dataCoordinator;
    const chainUi = runtime().commandChainUI;

    expect(bus).toBeTruthy();
    expect(coordinator?.getCurrentState?.().ready).toBe(true);
    expect(chainUi?.isInitialized?.()).toBe(true);
    if (!bus || !coordinator || !chainUi) return;

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
      extension: { nested: "preserve" },
    };
    const probeCommands = [trayCommand, siblingCommand];
    const probeProjection = observeCommandChainProjection(bus, probeCommands);
    const stateChanged = vi.fn();
    const profileUpdated = vi.fn();
    const detachStateChanged = bus.on("data:state-changed", stateChanged);
    const detachProfileUpdated = bus.on("profile:updated", profileUpdated);
    let setItemSpy;

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
        expect(probeProjection.wasPublished()).toBe(true);
        expect(document.getElementById("chainTitle")?.textContent).toContain(
          probeKey,
        );
        expect(getProbeCommands(coordinator, profileId, environment)).toEqual(
          probeCommands,
        );
        expect(
          document.querySelector('.command-item-row[data-index="0"]'),
        ).not.toBe(probeProjection.predecessor());
        palindromicToggle = getToggle(".btn-palindromic-toggle");
        expect(palindromicToggle).toBeInstanceOf(HTMLButtonElement);
        expect(palindromicToggle?.classList).toContain("active");
        expect(getToggle(".btn-placement-toggle")).toBeNull();
      });

      const ownerBeforeFailure = coordinator.getCurrentState();
      const cacheBeforeFailure = chainUi.cache.dataState;
      const durableBeforeFailure = structuredClone(
        readProjectProfile(profileId),
      );
      const rawBeforeFailure = localStorage.getItem(PROJECT_ROOT_KEY);
      stateChanged.mockClear();
      profileUpdated.mockClear();
      const originalSetItem = Storage.prototype.setItem;
      setItemSpy = vi
        .spyOn(Storage.prototype, "setItem")
        .mockImplementation((key, value) => {
          if (key === PROJECT_ROOT_KEY) throw new Error("quota exceeded");
          return originalSetItem.call(localStorage, key, value);
        });

      expect(palindromicToggle.isConnected).toBe(true);
      expect(palindromicToggle.disabled).toBe(false);
      palindromicToggle.click();

      await vi.waitFor(() => {
        expect(setItemSpy).toHaveBeenCalledWith(
          PROJECT_ROOT_KEY,
          expect.any(String),
        );
      });
      await new Promise((resolve) => window.setTimeout(resolve, 0));
      expect(coordinator.getCurrentState()).toBe(ownerBeforeFailure);
      expect(chainUi.cache.dataState).toBe(cacheBeforeFailure);
      expect(readProjectProfile(profileId)).toEqual(durableBeforeFailure);
      expect(localStorage.getItem(PROJECT_ROOT_KEY)).toBe(rawBeforeFailure);
      expect(stateChanged).not.toHaveBeenCalled();
      expect(profileUpdated).not.toHaveBeenCalled();
      expect(palindromicToggle.isConnected).toBe(true);
      expect(palindromicToggle.classList).toContain("active");
      expect(getToggle(".btn-placement-toggle")).toBeNull();

      setItemSpy.mockRestore();
      setItemSpy = vi.spyOn(Storage.prototype, "setItem");
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
        expect(getStoredProbeCommands(profileId, environment)).toEqual(
          expectedPalindromicCommands,
        );
        expect(getRawProbeCommands(profileId, environment)).toEqual(
          expectedPalindromicCommands,
        );
        const currentPalindromic = getToggle(".btn-palindromic-toggle");
        expect(currentPalindromic).toBeInstanceOf(HTMLButtonElement);
        expect(currentPalindromic?.classList).not.toContain("active");
        const placement = getToggle(".btn-placement-toggle");
        expect(placement).toBeInstanceOf(HTMLButtonElement);
        expect(placement?.classList).not.toContain("active");
      });
      expect(
        setItemSpy.mock.calls.filter(([key]) => key === PROJECT_ROOT_KEY),
      ).toHaveLength(1);
      expect(stateChanged).toHaveBeenCalledOnce();
      expect(profileUpdated).toHaveBeenCalledOnce();
      expect(palindromicToggle.isConnected).toBe(false);

      const placementToggle = getToggle(".btn-placement-toggle");
      expect(placementToggle).toBeInstanceOf(HTMLButtonElement);
      setItemSpy.mockClear();
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
        expect(getStoredProbeCommands(profileId, environment)).toEqual(
          expectedPlacementCommands,
        );
        expect(getRawProbeCommands(profileId, environment)).toEqual(
          expectedPlacementCommands,
        );
        const currentPlacement = getToggle(".btn-placement-toggle");
        expect(currentPlacement).toBeInstanceOf(HTMLButtonElement);
        expect(currentPlacement?.classList).toContain("active");
      });
      expect(
        setItemSpy.mock.calls.filter(([key]) => key === PROJECT_ROOT_KEY),
      ).toHaveLength(1);
      expect(stateChanged).toHaveBeenCalledOnce();
      expect(profileUpdated).toHaveBeenCalledOnce();
      expect(placementToggle.isConnected).toBe(false);
    } finally {
      setItemSpy?.mockRestore();
      probeProjection.detach();
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
