import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import SelectionService from "../../../src/js/components/services/SelectionService.js";
import { createDataCoordinatorState } from "../../fixtures/core/componentState.js";
import { createServiceFixture } from "../../fixtures/services/harness.js";

describe("SelectionService data-state projections", () => {
  let harness;
  let service;

  beforeEach(() => {
    harness = createServiceFixture();
    service = new SelectionService({ eventBus: harness.eventBus });
    service.request = vi.fn().mockResolvedValue({ success: true });
    service.init();
    service.extendCache({
      currentProfile: "test-profile",
      currentEnvironment: "space",
      profile: {
        id: "test-profile",
        builds: { space: { keys: {} }, ground: { keys: {} } },
        aliases: {},
      },
      selectedKey: null,
      selectedAlias: null,
      aliases: {},
    });
    service.selectionEnvironment = "space";
  });

  afterEach(() => {
    service.destroy();
    harness.destroy();
  });

  function hydrateProfileKeys(
    spaceKeys,
    groundKeys = {},
    { ready = true } = {},
  ) {
    const profile = {
      id: "test-profile",
      builds: {
        space: { keys: spaceKeys },
        ground: { keys: groundKeys },
      },
      aliases: service.cache.aliases,
    };
    service._cacheDataState(
      createDataCoordinatorState({
        ready,
        revision: ready ? 1 : 0,
        currentProfile: ready ? "test-profile" : null,
        currentProfileData: ready ? profile : null,
        profiles: ready ? { "test-profile": profile } : {},
      }),
    );
  }

  it("auto-selects the first key without a state-query request", async () => {
    hydrateProfileKeys({ F1: [], F2: [] });

    await expect(service.autoSelectFirst("space")).resolves.toBe("F1");
    expect(service.cache.selectedKey).toBe("F1");
    expect(service.request).not.toHaveBeenCalledWith(
      "data:get-keys",
      expect.anything(),
    );
  });

  it("keeps alias auto-selection on the accepted compatibility projection", async () => {
    service.cache.aliases = { Alias1: {}, Alias2: {} };

    await expect(service.autoSelectFirst("alias")).resolves.toBe("Alias1");
    expect(service.cache.selectedAlias).toBe("Alias1");
  });

  it("returns null when the accepted profile has no keys", async () => {
    hydrateProfileKeys({});

    await expect(service.autoSelectFirst("space")).resolves.toBeNull();
    expect(service.cache.selectedKey).toBeNull();
  });

  it("preserves the empty fallback before a ready snapshot", async () => {
    hydrateProfileKeys({}, {}, { ready: false });

    await expect(service.autoSelectFirst("space")).resolves.toBeNull();
    expect(service.request).not.toHaveBeenCalledWith(
      "data:get-keys",
      expect.anything(),
    );
  });

  it("does not select after its generation becomes stale", async () => {
    hydrateProfileKeys({ F1: [] });
    const selectKey = vi.spyOn(service, "selectKey");

    await expect(
      service.autoSelectFirst("space", { isCurrent: () => false }),
    ).resolves.toBeNull();
    expect(selectKey).not.toHaveBeenCalled();
  });
});
