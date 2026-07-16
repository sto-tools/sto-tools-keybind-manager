import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SelectionService from "../../../src/js/components/services/SelectionService.js";
import { createServiceFixture } from "../../fixtures/services/harness.js";

describe("SelectionService persistence failures", () => {
  let harness;
  let service;
  let capturedEvents;

  beforeEach(async () => {
    harness = createServiceFixture();
    service = new SelectionService({ eventBus: harness.eventBus });
    capturedEvents = [];

    const originalEmit = service.emit.bind(service);
    vi.spyOn(service, "emit").mockImplementation((event, data) => {
      capturedEvents.push({ event, data });
      return originalEmit(event, data);
    });
    service.request = vi.fn();

    await service.init();
    service.extendCache({
      selectedKey: null,
      selectedAlias: null,
      currentEnvironment: "space",
      currentProfile: "test-profile",
      cachedSelections: { space: null, ground: null, alias: null },
    });
    service.selectionEnvironment = "space";
  });

  afterEach(() => {
    service.destroy();
    harness.destroy();
  });

  it("does not commit or broadcast a key when persistence fails", async () => {
    service.cache.profile = { selections: { space: "F1" } };
    service.cache.selectedKey = "F1";
    service.cachedSelections.space = "F1";
    service.cache.cachedSelections.space = "F1";
    service.request.mockRejectedValueOnce(new Error("write failed"));
    capturedEvents.length = 0;

    const result = await service.selectKey("F2", "space");

    expect(result).toBe("F1");
    expect(service.cache.selectedKey).toBe("F1");
    expect(service.cachedSelections.space).toBe("F1");
    expect(capturedEvents).not.toContainEqual(
      expect.objectContaining({ event: "selection:state-changed" }),
    );
    expect(capturedEvents).not.toContainEqual({
      event: "key-selected",
      data: expect.objectContaining({ key: "F2" }),
    });
  });

  it("does not commit or broadcast an alias when persistence fails", async () => {
    service.cache.profile = { selections: { alias: "Alpha" } };
    service.cache.currentEnvironment = "alias";
    service.selectionEnvironment = "alias";
    service.cache.selectedAlias = "Alpha";
    service.cachedSelections.alias = "Alpha";
    service.cache.cachedSelections.alias = "Alpha";
    service.request.mockRejectedValueOnce(new Error("write failed"));
    capturedEvents.length = 0;

    const result = await service.selectAlias("Beta");

    expect(result).toBe("Alpha");
    expect(service.cache.selectedAlias).toBe("Alpha");
    expect(service.cachedSelections.alias).toBe("Alpha");
    expect(capturedEvents).not.toContainEqual(
      expect.objectContaining({ event: "selection:state-changed" }),
    );
    expect(capturedEvents).not.toContainEqual({
      event: "alias-selected",
      data: expect.objectContaining({ name: "Beta" }),
    });
  });
});
