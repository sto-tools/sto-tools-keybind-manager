import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ComponentBase from "../../../src/js/components/ComponentBase.js";
import SelectionService from "../../../src/js/components/services/SelectionService.js";
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
