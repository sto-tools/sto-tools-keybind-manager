import { describe, expect, it, vi } from "vitest";

import { request } from "../../src/js/core/requestResponse.js";

const probeKey = "__command_mutation_boundary_probe__";
const probeBindset = "__command_mutation_bindset_probe__";

describe("Command mutation checked-bundle boundary", () => {
  it("keeps failure silent and serializes non-destructive owner mutations", async () => {
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
    const environment = ["space", "ground"].includes(
      startingState.currentEnvironment,
    )
      ? startingState.currentEnvironment
      : "space";
    expect(profileId).toBeTruthy();
    if (!profileId) return;

    const originalEnvironment = startingState.currentEnvironment;
    const hadOriginalKey = Object.hasOwn(
      startingState.profiles[profileId].builds?.[environment]?.keys || {},
      probeKey,
    );
    const originalCommands = hadOriginalKey
      ? structuredClone(
          startingState.profiles[profileId].builds[environment].keys[probeKey],
        )
      : null;
    const hadOriginalBindset = Object.hasOwn(
      startingState.profiles[profileId].bindsets || {},
      probeBindset,
    );
    const originalBindset = hadOriginalBindset
      ? structuredClone(
          startingState.profiles[profileId].bindsets[probeBindset],
        )
      : null;

    /** @type {string[]} */
    const order = [];
    const commandAdded = vi.fn(() => order.push("command-added"));
    const commandEdited = vi.fn(() => order.push("command-edited"));
    const commandMoved = vi.fn(() => order.push("command-moved"));
    const commandDeleted = vi.fn(() => order.push("command-deleted"));
    const detachState = bus.on("data:state-changed", () =>
      order.push("data:state-changed"),
    );
    const detachProfile = bus.on("profile:updated", () =>
      order.push("profile:updated"),
    );
    const detachAdded = bus.on("command-added", commandAdded);
    const detachEdited = bus.on("command-edited", commandEdited);
    const detachMoved = bus.on("command-moved", commandMoved);
    const detachDeleted = bus.on("command-deleted", commandDeleted);
    let saveProfileSpy;

    const expectConvergence = async (expectedCommands) => {
      await vi.waitFor(() => {
        expect(
          coordinator.getCurrentState().profiles[profileId].builds[environment]
            .keys[probeKey],
        ).toEqual(expectedCommands);
        expect(
          chainUi.cache.dataState.profiles[profileId].builds[environment].keys[
            probeKey
          ],
        ).toEqual(expectedCommands);
        expect(
          storage.getProfile(profileId).builds[environment].keys[probeKey],
        ).toEqual(expectedCommands);
      });
    };

    const expectAcceptedPublicationOrder = (commandEvent) => {
      expect(order.indexOf("data:state-changed")).toBeLessThan(
        order.indexOf("profile:updated"),
      );
      expect(order.indexOf("profile:updated")).toBeLessThan(
        order.indexOf(commandEvent),
      );
    };

    try {
      if (originalEnvironment !== environment) {
        await request(bus, "environment:switch", { mode: environment });
      }

      await request(bus, "data:update-profile", {
        profileId,
        add: {
          builds: {
            [environment]: {
              keys: { [probeKey]: ["FireAll"] },
            },
          },
        },
      });
      await expectConvergence(["FireAll"]);
      order.length = 0;

      const ownerBeforeFailure = coordinator.getCurrentState();
      const cacheBeforeFailure = chainUi.cache.dataState;
      const durableBeforeFailure = structuredClone(
        storage.getProfile(profileId),
      );
      saveProfileSpy = vi.spyOn(storage, "saveProfile").mockReturnValue(false);

      await bus.emit(
        "command:add",
        { key: probeKey, command: { command: "FirePhasers" } },
        { synchronous: true },
      );

      expect(saveProfileSpy).toHaveBeenCalledTimes(1);
      expect(coordinator.getCurrentState()).toBe(ownerBeforeFailure);
      expect(chainUi.cache.dataState).toBe(cacheBeforeFailure);
      expect(storage.getProfile(profileId)).toEqual(durableBeforeFailure);
      expect(order).toEqual([]);
      expect(commandAdded).not.toHaveBeenCalled();

      saveProfileSpy.mockRestore();
      saveProfileSpy = vi.spyOn(storage, "saveProfile");

      await bus.emit(
        "command:add",
        { key: probeKey, command: { command: "FirePhasers" } },
        { synchronous: true },
      );
      await expectConvergence(["FireAll", "FirePhasers"]);
      expect(commandAdded).toHaveBeenCalledWith({
        key: probeKey,
        command: { command: "FirePhasers" },
      });
      expectAcceptedPublicationOrder("command-added");

      order.length = 0;
      await bus.emit(
        "command:edit",
        {
          key: probeKey,
          index: 1,
          updatedCommand: { command: "FireTorpedoes" },
        },
        { synchronous: true },
      );
      await expectConvergence(["FireAll", "FireTorpedoes"]);
      expect(commandEdited).toHaveBeenCalledWith({
        key: probeKey,
        index: 1,
        updatedCommand: { command: "FireTorpedoes" },
        commands: ["FireAll", "FireTorpedoes"],
      });
      expectAcceptedPublicationOrder("command-edited");

      order.length = 0;
      await expect(
        request(bus, "command:move", {
          key: probeKey,
          fromIndex: 1,
          toIndex: 0,
          bindset: null,
        }),
      ).resolves.toBe(true);
      await expectConvergence(["FireTorpedoes", "FireAll"]);
      expect(commandMoved).toHaveBeenCalledWith({
        key: probeKey,
        fromIndex: 1,
        toIndex: 0,
        commands: ["FireTorpedoes", "FireAll"],
      });
      expectAcceptedPublicationOrder("command-moved");

      order.length = 0;
      await expect(
        request(bus, "command:delete", {
          key: probeKey,
          index: 1,
          bindset: null,
        }),
      ).resolves.toBe(true);
      await expectConvergence(["FireTorpedoes"]);
      expect(commandDeleted).toHaveBeenCalledWith({
        key: probeKey,
        index: 1,
        commands: ["FireTorpedoes"],
      });
      expectAcceptedPublicationOrder("command-deleted");

      saveProfileSpy.mockRestore();
      const originalSaveProfile = storage.saveProfile.bind(storage);
      let saveCallCount = 0;
      /** @type {(() => void) | null} */
      let releaseFirstSave = null;
      saveProfileSpy = vi
        .spyOn(storage, "saveProfile")
        .mockImplementation((id, profile) => {
          saveCallCount += 1;
          if (saveCallCount !== 1) {
            return originalSaveProfile(id, profile);
          }
          return new Promise((resolve) => {
            releaseFirstSave = () => resolve(originalSaveProfile(id, profile));
          });
        });
      commandAdded.mockClear();
      order.length = 0;

      const firstAdd = bus.emit(
        "command:add",
        { key: probeKey, command: "Target_Enemy_Near" },
        { synchronous: true },
      );
      await vi.waitFor(() => expect(saveCallCount).toBe(1));
      const secondAdd = bus.emit(
        "command:add",
        { key: probeKey, command: "Target_Enemy_Next" },
        { synchronous: true },
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
      const callsBeforeFirstWriteCompleted = saveCallCount;

      releaseFirstSave?.();
      await Promise.all([firstAdd, secondAdd]);

      expect(callsBeforeFirstWriteCompleted).toBe(1);
      expect(saveProfileSpy).toHaveBeenCalledTimes(2);
      await expectConvergence([
        "FireTorpedoes",
        "Target_Enemy_Near",
        "Target_Enemy_Next",
      ]);
      expect(commandAdded).toHaveBeenCalledTimes(2);

      saveProfileSpy.mockRestore();
      saveProfileSpy = undefined;
      if (hadOriginalBindset) {
        await request(bus, "data:update-profile", {
          profileId,
          delete: { bindsets: [probeBindset] },
        });
      }
      const siblingEnvironment = environment === "space" ? "ground" : "space";
      await request(bus, "data:update-profile", {
        profileId,
        add: {
          bindsets: {
            [probeBindset]: {
              [siblingEnvironment]: {
                keys: { [probeKey]: ["SiblingCommand"] },
              },
            },
          },
        },
      });

      commandAdded.mockClear();
      await bus.emit(
        "command:add",
        { key: probeKey, command: "FireAll", bindset: probeBindset },
        { synchronous: true },
      );

      await vi.waitFor(() => {
        const expectedBindset = {
          [siblingEnvironment]: {
            keys: { [probeKey]: ["SiblingCommand"] },
          },
          [environment]: { keys: { [probeKey]: ["FireAll"] } },
        };
        expect(
          coordinator.getCurrentState().profiles[profileId].bindsets[
            probeBindset
          ],
        ).toEqual(expectedBindset);
        expect(
          chainUi.cache.dataState.profiles[profileId].bindsets[probeBindset],
        ).toEqual(expectedBindset);
        expect(storage.getProfile(profileId).bindsets[probeBindset]).toEqual(
          expectedBindset,
        );
      });
      expect(commandAdded).toHaveBeenCalledWith({
        key: probeKey,
        command: "FireAll",
      });
    } finally {
      saveProfileSpy?.mockRestore();
      detachState();
      detachProfile();
      detachAdded();
      detachEdited();
      detachMoved();
      detachDeleted();

      if (hadOriginalKey) {
        await request(bus, "data:update-profile", {
          profileId,
          modify: {
            builds: {
              [environment]: {
                keys: { [probeKey]: originalCommands },
              },
            },
          },
        });
      } else {
        await request(bus, "data:update-profile", {
          profileId,
          delete: { builds: { [environment]: { keys: [probeKey] } } },
        });
      }
      await request(bus, "data:update-profile", {
        profileId,
        delete: { bindsets: [probeBindset] },
      });
      if (hadOriginalBindset) {
        await request(bus, "data:update-profile", {
          profileId,
          add: { bindsets: { [probeBindset]: originalBindset } },
        });
      }
      if (originalEnvironment !== environment) {
        await request(bus, "environment:switch", {
          mode: originalEnvironment,
        });
      }
    }

    const finalKeys =
      coordinator.getCurrentState().profiles[profileId].builds?.[environment]
        ?.keys || {};
    if (hadOriginalKey) {
      expect(finalKeys[probeKey]).toEqual(originalCommands);
    } else {
      expect(finalKeys).not.toHaveProperty(probeKey);
    }
  });
});
