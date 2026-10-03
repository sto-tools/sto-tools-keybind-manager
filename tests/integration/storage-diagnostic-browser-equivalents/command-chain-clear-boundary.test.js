// Exact internal assertions preserved from tests/browser/command-chain-clear-boundary.test.js.
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
import {
  PROJECT_ROOT_KEY,
  readProjectProfile,
} from "../../fixtures/ui/projectStorage.js";

const probeKey = "__command_chain_clear_atomicity_probe__";

describe("Command-chain clear source-composition equivalent boundary", () => {
  it("does not publish a failed clear and converges owner, cache, and storage after success", async () => {
    const bus = runtime().eventBus;
    const coordinator = runtime().dataCoordinator;
    const chainUi = runtime().commandChainUI;

    expect(bus).toBeTruthy();
    expect(coordinator?.getCurrentState?.().ready).toBe(true);
    expect(chainUi?.isInitialized?.()).toBe(true);
    if (!bus || !coordinator || !chainUi) return;

    const startingState = coordinator.getCurrentState();
    const profileId = startingState.currentProfile;
    const environment = ["space", "ground"].includes(
      startingState.currentEnvironment,
    )
      ? startingState.currentEnvironment
      : "space";
    expect(profileId).toBeTruthy();
    if (!profileId) return;

    const originalEnvironment = startingState.currentEnvironment;
    const originalBindset = chainUi.cache.activeBindset;
    const originalBindsetsEnabled = chainUi.cache.preferences.bindsetsEnabled;
    const chainChanged = vi.fn();
    const profileUpdated = vi.fn();
    const detachChain = bus.on("chain-data-changed", chainChanged);
    const detachProfile = bus.on("profile:updated", profileUpdated);
    let setItemSpy;

    try {
      if (originalEnvironment !== environment) {
        await request(bus, "environment:switch", { mode: environment });
      }
      if (originalBindsetsEnabled === true) {
        await bus.emit(
          "bindset-selector:active-changed",
          { bindset: "Primary Bindset" },
          { synchronous: true },
        );
      }

      await request(bus, "data:update-profile", {
        profileId,
        add: {
          builds: {
            [environment]: {
              keys: { [probeKey]: [{ command: "FireAll" }] },
            },
          },
        },
      });
      await vi.waitFor(() => {
        expect(
          chainUi.cache.dataState.profiles[profileId].builds[environment].keys[
            probeKey
          ],
        ).toEqual([{ command: "FireAll" }]);
      });
      const beforeFailure = coordinator.getCurrentState();
      const durableBeforeFailure = structuredClone(
        readProjectProfile(profileId),
      );
      chainChanged.mockClear();
      profileUpdated.mockClear();

      const originalSetItem = Storage.prototype.setItem;
      setItemSpy = vi
        .spyOn(Storage.prototype, "setItem")
        .mockImplementation((key, value) => {
          if (key === PROJECT_ROOT_KEY) throw new Error("quota exceeded");
          return originalSetItem.call(localStorage, key, value);
        });
      await bus.emit(
        "command-chain:clear",
        { key: probeKey },
        { synchronous: true },
      );

      expect(setItemSpy).toHaveBeenCalledWith(
        PROJECT_ROOT_KEY,
        expect.any(String),
      );
      expect(coordinator.getCurrentState()).toEqual(beforeFailure);
      expect(chainUi.cache.dataState).toEqual(beforeFailure);
      expect(readProjectProfile(profileId)).toEqual(durableBeforeFailure);
      expect(profileUpdated).not.toHaveBeenCalled();
      expect(chainChanged).not.toHaveBeenCalled();

      setItemSpy.mockRestore();
      setItemSpy = undefined;
      await bus.emit(
        "command-chain:clear",
        { key: probeKey },
        { synchronous: true },
      );

      await vi.waitFor(() => {
        expect(
          coordinator.getCurrentState().profiles[profileId].builds[environment]
            .keys[probeKey],
        ).toEqual([]);
        expect(
          chainUi.cache.dataState.profiles[profileId].builds[environment].keys[
            probeKey
          ],
        ).toEqual([]);
        expect(
          readProjectProfile(profileId).builds[environment].keys[probeKey],
        ).toEqual([]);
      });
      expect(profileUpdated).toHaveBeenCalledTimes(1);
      expect(chainChanged).toHaveBeenCalledTimes(1);
      expect(chainChanged).toHaveBeenLastCalledWith({ commands: [] });
    } finally {
      setItemSpy?.mockRestore();
      await request(bus, "data:update-profile", {
        profileId,
        delete: { builds: { [environment]: { keys: [probeKey] } } },
      });
      if (originalBindsetsEnabled === true && originalBindset) {
        await bus.emit(
          "bindset-selector:active-changed",
          { bindset: originalBindset },
          { synchronous: true },
        );
      }
      if (originalEnvironment !== environment) {
        await request(bus, "environment:switch", {
          mode: originalEnvironment,
        });
      }
      detachChain();
      detachProfile();
    }

    expect(
      Object.hasOwn(
        coordinator.getCurrentState().profiles[profileId].builds[environment]
          .keys,
        probeKey,
      ),
    ).toBe(false);
  });
});
