import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import DataCoordinator from "../../src/js/components/services/DataCoordinator.js";
import InterfaceModeService from "../../src/js/components/services/InterfaceModeService.js";
import SelectionService from "../../src/js/components/services/SelectionService.js";
import StorageService from "../../src/js/components/services/StorageService.js";
import eventBus from "../../src/js/core/eventBus.js";

const profileId = "environment-switch-persistence";

function createProfile() {
  return {
    name: "Environment switch persistence",
    description: "Real owner-chain environment switch fixture",
    currentEnvironment: "space",
    builds: {
      space: { keys: { F1: [], F2: [] } },
      ground: { keys: { G1: [], G2: [] } },
    },
    aliases: { TestAlias: { type: "user" } },
    selections: {
      space: "F1",
      ground: "G1",
      alias: "TestAlias",
    },
  };
}

describe("Environment switch persistence boundary", () => {
  let storageService;
  let dataCoordinator;
  let interfaceModeService;
  let selectionService;

  beforeEach(async () => {
    localStorage.clear();
    const i18n = { t: (key) => key };

    storageService = new StorageService({ eventBus, i18n });
    storageService.init();
    expect(storageService.saveProfile(profileId, createProfile())).toBe(true);
    const root = storageService.getAllData();
    root.currentProfile = profileId;
    expect(storageService.saveAllData(root)).toBe(true);

    dataCoordinator = new DataCoordinator({
      eventBus,
      storage: storageService,
      i18n,
    });
    dataCoordinator.init();

    interfaceModeService = new InterfaceModeService({
      eventBus,
      storage: storageService,
    });
    interfaceModeService.init();

    selectionService = new SelectionService({ eventBus });
    selectionService.init();

    await vi.waitFor(() => {
      expect(dataCoordinator.getCurrentState()).toMatchObject({
        ready: true,
        currentProfile: profileId,
        currentEnvironment: "space",
      });
      expect(interfaceModeService.currentMode).toBe("space");
      expect(selectionService.getCurrentState()).toMatchObject({
        currentEnvironment: "space",
        selectedKey: "F1",
      });
    });
  });

  afterEach(() => {
    selectionService?.destroy?.();
    interfaceModeService?.destroy?.();
    dataCoordinator?.destroy?.();
    storageService?.destroy?.();
    localStorage.clear();
  });

  it("persists a changed selection and restores it after switching away and back", async () => {
    await expect(
      selectionService.request("selection:select-key", {
        keyName: "F2",
        environment: "space",
      }),
    ).resolves.toBe("F2");

    await vi.waitFor(() => {
      expect(
        dataCoordinator.getCurrentState().profiles[profileId].selections.space,
      ).toBe("F2");
      expect(storageService.getProfile(profileId).selections.space).toBe("F2");
    });

    await expect(
      interfaceModeService.request("environment:switch", { mode: "ground" }),
    ).resolves.toEqual({ success: true, mode: "ground" });

    await vi.waitFor(() => {
      expect(interfaceModeService.currentMode).toBe("ground");
      expect(selectionService.getCurrentState()).toMatchObject({
        currentEnvironment: "ground",
        selectedKey: "G1",
      });
      expect(storageService.getProfile(profileId)).toMatchObject({
        currentEnvironment: "ground",
        selections: { space: "F2", ground: "G1" },
      });
    });

    await expect(
      interfaceModeService.request("environment:switch", { mode: "space" }),
    ).resolves.toEqual({ success: true, mode: "space" });

    await vi.waitFor(() => {
      expect(interfaceModeService.currentMode).toBe("space");
      expect(selectionService.getCurrentState()).toMatchObject({
        currentEnvironment: "space",
        selectedKey: "F2",
      });
      expect(dataCoordinator.getCurrentState()).toMatchObject({
        currentEnvironment: "space",
        currentProfileData: {
          currentEnvironment: "space",
          selections: { space: "F2", ground: "G1" },
        },
      });
      expect(storageService.getProfile(profileId)).toMatchObject({
        currentEnvironment: "space",
        selections: { space: "F2", ground: "G1" },
      });
    });
  });

  it.each(["resolved false", "rejection"])(
    "keeps every owner and consumer unchanged after a %s, then converges after retry",
    async (failureKind) => {
      const ownerBefore = dataCoordinator.getCurrentState();
      const persistedBefore = structuredClone(
        storageService.getProfile(profileId),
      );
      const interfaceBefore = interfaceModeService.getCurrentState();
      const selectionBefore = selectionService.getCurrentState();
      const publications = {
        data: [],
        environment: [],
        selection: [],
        profile: [],
      };
      const detachers = [
        eventBus.on("data:state-changed", (payload) =>
          publications.data.push(payload),
        ),
        eventBus.on("environment:changed", (payload) =>
          publications.environment.push(payload),
        ),
        eventBus.on("selection:state-changed", (payload) =>
          publications.selection.push(payload),
        ),
        eventBus.on("profile:updated", (payload) =>
          publications.profile.push(payload),
        ),
      ];
      const saveProfile = vi.spyOn(storageService, "saveProfile");
      if (failureKind === "resolved false") {
        saveProfile.mockReturnValueOnce(false);
      } else {
        saveProfile.mockRejectedValueOnce(new Error("storage unavailable"));
      }
      const error = vi.spyOn(console, "error").mockImplementation(() => {});

      try {
        await expect(
          interfaceModeService.request("environment:switch", {
            mode: "ground",
          }),
        ).resolves.toEqual({
          success: false,
          error: "failed_to_save_profile",
        });

        expect(dataCoordinator.getCurrentState()).toBe(ownerBefore);
        expect(dataCoordinator.getCurrentState().revision).toBe(
          ownerBefore.revision,
        );
        expect(storageService.getProfile(profileId)).toEqual(persistedBefore);
        expect(interfaceModeService.getCurrentState()).toEqual(interfaceBefore);
        expect(selectionService.getCurrentState()).toEqual(selectionBefore);
        expect(publications).toEqual({
          data: [],
          environment: [],
          selection: [],
          profile: [],
        });

        await expect(
          interfaceModeService.request("environment:switch", {
            mode: "ground",
          }),
        ).resolves.toEqual({ success: true, mode: "ground" });

        await vi.waitFor(() => {
          expect(dataCoordinator.getCurrentState().revision).toBeGreaterThan(
            ownerBefore.revision,
          );
          expect(dataCoordinator.getCurrentState()).toMatchObject({
            currentEnvironment: "ground",
            currentProfileData: { currentEnvironment: "ground" },
          });
          expect(storageService.getProfile(profileId).currentEnvironment).toBe(
            "ground",
          );
          expect(interfaceModeService.currentMode).toBe("ground");
          expect(selectionService.getCurrentState()).toMatchObject({
            currentEnvironment: "ground",
            selectedKey: "G1",
          });
        });
        expect(publications.data.length).toBeGreaterThan(0);
        expect(publications.environment).toHaveLength(1);
        expect(publications.environment[0]).toMatchObject({
          fromEnvironment: "space",
          toEnvironment: "ground",
          environment: "ground",
        });
        expect(publications.selection.length).toBeGreaterThan(0);
        expect(publications.profile).toEqual([]);
      } finally {
        error.mockRestore();
        saveProfile.mockRestore();
        for (const detach of detachers) detach();
      }
    },
  );
});
