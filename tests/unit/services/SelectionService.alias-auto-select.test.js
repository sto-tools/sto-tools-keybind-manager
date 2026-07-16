import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import SelectionService from "../../../src/js/components/services/SelectionService.js";
import { createServiceFixture } from "../../fixtures/services/harness.js";

describe("SelectionService alias auto-selection state access", () => {
  let fixture;
  let service;

  beforeEach(async () => {
    fixture = createServiceFixture();
    service = new SelectionService({ eventBus: fixture.eventBus });
    service.request = vi.fn();
    await service.init();
    service.extendCache({
      currentProfile: "test-profile",
      currentEnvironment: "alias",
      profile: {
        id: "test-profile",
        builds: { space: { keys: {} }, ground: { keys: {} } },
        aliases: {},
      },
      aliases: {},
    });
    service.selectionEnvironment = "alias";
  });

  afterEach(() => {
    service.destroy();
    fixture.destroy();
  });

  it("uses the hydrated profile snapshot when the alias cache is empty", async () => {
    service.cache.profile.aliases = {
      SystemAlias: { type: "vfx-alias" },
      UserAlias: { type: "alias" },
    };

    const result = await service.autoSelectFirst("alias");

    expect(result).toBe("UserAlias");
    expect(service.cache.selectedAlias).toBe("UserAlias");
    expect(service.request).not.toHaveBeenCalledWith("data:get-aliases");
  });

  it("does not request aliases when the hydrated snapshot is empty", async () => {
    const result = await service.autoSelectFirst("alias");

    expect(result).toBe(null);
    expect(service.cache.selectedAlias).toBe(null);
    expect(service.request).not.toHaveBeenCalledWith("data:get-aliases");
  });
});
