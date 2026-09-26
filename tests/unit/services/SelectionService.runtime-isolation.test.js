import { describe, it, expect, vi } from "vitest";
import { seedSelectionMutationOwner } from "../../fixtures/services/selectionMutationOwner.js";
import { createServiceFixture } from "../../fixtures/services/harness.js";
import SelectionService from "../../../src/js/components/services/SelectionService.js";

describe("SelectionService runtime isolation", () => {
  it("should operate without a Vitest global", async () => {
    const isolatedHarness = createServiceFixture();
    let isolatedService;
    const selectedEvents = [];

    vi.stubGlobal("vi", undefined);

    try {
      isolatedService = new SelectionService({
        eventBus: isolatedHarness.eventBus,
      });
      isolatedHarness.eventBus.on("key-selected", (data) =>
        selectedEvents.push(data),
      );

      expect(globalThis.vi).toBeUndefined();
      expect(vi.isMockFunction(isolatedService.emit)).toBe(false);

      seedSelectionMutationOwner(isolatedService);
      await isolatedService.init();
      await isolatedService.selectKey("F1", "space", {
        skipPersistence: true,
      });

      expect(isolatedService.cache.selectedKey).toBe("F1");
      expect(selectedEvents).toContainEqual({
        key: "F1",
        environment: "space",
        bindset: null,
        source: "SelectionService",
      });
    } finally {
      isolatedService?.destroy();
      isolatedHarness.destroy();
      vi.unstubAllGlobals();
    }
  });
});
