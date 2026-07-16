import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SelectionService from "../../../src/js/components/services/SelectionService.js";
import { createServiceFixture } from "../../fixtures/services/harness.js";

describe("SelectionService profile replacement", () => {
  let harness;
  let service;

  beforeEach(async () => {
    harness = createServiceFixture();
    service = new SelectionService({ eventBus: harness.eventBus });
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

  it("replaces selections completely when switching profiles", () => {
    harness.eventBus.emit("profile:switched", {
      fromProfile: null,
      toProfile: "profile-a",
      profileId: "profile-a",
      profile: {
        id: "profile-a",
        environment: "space",
        builds: { space: { keys: { F1: [] } }, ground: { keys: {} } },
        selections: { space: "F1", ground: "G", alias: "Alpha" },
      },
      environment: "space",
      timestamp: 1,
    });

    expect(service.cache.selectedKey).toBe("F1");
    expect(service.cachedSelections).toEqual({
      space: "F1",
      ground: "G",
      alias: "Alpha",
    });

    harness.eventBus.emit("profile:switched", {
      fromProfile: "profile-a",
      toProfile: "profile-b",
      profileId: "profile-b",
      profile: {
        id: "profile-b",
        environment: "space",
        builds: { space: { keys: {} }, ground: { keys: {} } },
        selections: { space: null },
      },
      environment: "space",
      timestamp: 2,
    });

    expect(service.cache.selectedKey).toBe(null);
    expect(service.cache.selectedAlias).toBe(null);
    expect(service.cachedSelections).toEqual({
      space: null,
      ground: null,
      alias: null,
    });
    expect(service.cache.cachedSelections).toEqual(service.cachedSelections);
  });
});
