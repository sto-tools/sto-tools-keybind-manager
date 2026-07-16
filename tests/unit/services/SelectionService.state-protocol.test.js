import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ComponentBase from "../../../src/js/components/ComponentBase.js";
import SelectionService from "../../../src/js/components/services/SelectionService.js";
import { createDataCoordinatorState } from "../../fixtures/core/componentState.js";
import { createServiceFixture } from "../../fixtures/services/harness.js";

class SelectionStateConsumer extends ComponentBase {}

describe("SelectionService state access protocol", () => {
  let harness;
  let service;
  let consumer;

  beforeEach(async () => {
    harness = createServiceFixture();
    service = new SelectionService({ eventBus: harness.eventBus });
    service.request = vi.fn();

    await service.init();
    service.extendCache({
      selectedKey: null,
      selectedAlias: null,
      editingContext: null,
      currentEnvironment: "space",
      currentProfile: "test-profile",
      cachedSelections: { space: null, ground: null, alias: null },
    });
    service.selectionEnvironment = "space";
  });

  afterEach(() => {
    if (consumer && !consumer.destroyed) consumer.destroy();
    service.destroy();
    harness.destroy();
  });

  function deliverInitialDataState(state) {
    const reply = { sender: "DataCoordinator", state };
    service._handleInitialState(reply);
    service.handleInitialState(reply);
  }

  it("does not register retired selection snapshot RPCs", () => {
    for (const topic of [
      "key:get-selected",
      "selection:get-cached",
      "selection:get-editing-context",
      "selection:get-selected",
      "selection:get-state",
    ]) {
      expect(harness.eventBus.hasListeners(`rpc:${topic}`)).toBe(false);
    }
  });

  it("adopts the complete profile when a loading owner becomes ready", () => {
    const profile = {
      id: "captain",
      currentEnvironment: "ground",
      builds: {
        space: { keys: { F1: ["FireAll"] } },
        ground: { keys: { F2: ["Jump"] } },
      },
      aliases: { TestAlias: { commands: ["FireAll"] } },
      selections: { space: "F1", ground: "F2", alias: "TestAlias" },
    };
    service.setCachedSelection("space", "LocalBeforeReady");

    deliverInitialDataState(
      createDataCoordinatorState({
        authorityEpoch: 7,
        ready: false,
        revision: 0,
      }),
    );
    expect(service.cachedSelections.space).toBe("LocalBeforeReady");

    harness.eventBus.emit("data:state-changed", {
      reason: "initial-load",
      state: createDataCoordinatorState({
        authorityEpoch: 7,
        ready: true,
        revision: 1,
        currentProfile: "captain",
        currentEnvironment: "ground",
        currentProfileData: profile,
      }),
    });

    expect(service.cachedSelections).toEqual({
      space: "F1",
      ground: "F2",
      alias: "TestAlias",
    });
    expect(service.selectionPersistence.snapshot("captain")).toEqual({
      space: "F1",
      ground: "F2",
      alias: "TestAlias",
    });
    expect(service.cache).toMatchObject({
      currentProfile: "captain",
      currentEnvironment: "ground",
      selectedKey: "F2",
      selectedAlias: null,
    });
  });

  it("ignores a delayed predecessor after accepting a replacement authority", () => {
    const replacementProfile = {
      id: "replacement",
      currentEnvironment: "alias",
      builds: { space: { keys: {} }, ground: { keys: {} } },
      aliases: { NewAlias: { commands: ["FireAll"] } },
      selections: { space: null, ground: null, alias: "NewAlias" },
    };
    const predecessorProfile = {
      id: "predecessor",
      currentEnvironment: "ground",
      builds: { space: { keys: {} }, ground: { keys: { F9: ["Jump"] } } },
      aliases: {},
      selections: { space: "F1", ground: "F9", alias: null },
    };
    const replacement = createDataCoordinatorState({
      authorityEpoch: 12,
      ready: true,
      revision: 1,
      currentProfile: "replacement",
      currentEnvironment: "alias",
      currentProfileData: replacementProfile,
    });
    const delayedPredecessor = createDataCoordinatorState({
      authorityEpoch: 11,
      ready: true,
      revision: 40,
      currentProfile: "predecessor",
      currentEnvironment: "ground",
      currentProfileData: predecessorProfile,
    });

    deliverInitialDataState(replacement);
    deliverInitialDataState(delayedPredecessor);

    expect(service.cache.dataState).toMatchObject({
      authorityEpoch: 12,
      revision: 1,
      currentProfile: "replacement",
    });
    expect(service._selectionAuthorityEpoch).toBe(12);
    expect(service.cachedSelections).toEqual({
      space: null,
      ground: null,
      alias: "NewAlias",
    });
    expect(service.selectionPersistence.snapshot("replacement")).toEqual({
      space: null,
      ground: null,
      alias: "NewAlias",
    });
    expect(service.cache).toMatchObject({
      currentProfile: "replacement",
      currentEnvironment: "alias",
      selectedKey: null,
      selectedAlias: "NewAlias",
    });
  });

  it("keeps a late-joined consumer cache current through broadcasts", async () => {
    consumer = new SelectionStateConsumer(harness.eventBus);
    service.cache.selectedKey = "F1";
    service.cachedSelections.space = "F1";
    service.setEditingContext({ isEditing: true, editIndex: 1 });

    consumer.init();

    expect(consumer.cache).toMatchObject({
      selectedKey: "F1",
      editingContext: { isEditing: true, editIndex: 1 },
      cachedSelections: { space: "F1" },
    });

    await service.selectKey("G", "ground", { skipPersistence: true });
    expect(consumer.cache).toMatchObject({
      selectedKey: "G",
      cachedSelections: { space: "F1", ground: "G" },
    });

    await service.selectAlias("EmergencyPower", { skipPersistence: true });
    expect(consumer.cache).toMatchObject({
      selectedKey: null,
      selectedAlias: "EmergencyPower",
      cachedSelections: {
        space: "F1",
        ground: "G",
        alias: "EmergencyPower",
      },
    });

    service.clearSelection("editing");
    expect(consumer.cache.editingContext).toBe(null);

    const cacheAtDestroy = structuredClone(consumer.cache);
    consumer.destroy();

    await service.selectKey("F12", "space", { skipPersistence: true });
    await service.selectAlias("AfterDestroy", { skipPersistence: true });
    service.setEditingContext({ isEditing: true, editIndex: 4 });

    expect(consumer.cache).toEqual(cacheAtDestroy);
  });
});
