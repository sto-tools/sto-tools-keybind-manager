import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import KeyService from "../../../src/js/components/services/KeyService.js";
import { createDataCoordinatorState } from "../../fixtures/core/componentState.js";
import { createServiceFixture } from "../../fixtures/index.js";

const profile = {
  name: "Captain",
  builds: { space: { keys: { F1: ["FireAll"] } }, ground: { keys: {} } },
  aliases: {},
};
describe("KeyService owner acknowledgement boundary", () => {
  let fixture, service;
  beforeEach(() => {
    fixture = createServiceFixture();
    service = new KeyService({ eventBus: fixture.eventBus });
    service.init();
    service._cacheDataState(
      createDataCoordinatorState({
        authorityEpoch: 71,
        revision: 4,
        currentProfile: "captain",
        currentProfileData: profile,
      }),
    );
  });
  afterEach(() => {
    service.destroy();
    fixture.destroy();
    vi.restoreAllMocks();
  });

  it.each([
    false,
    undefined,
    { success: true },
    { success: false },
    { success: true, profile: {} },
  ])(
    "does not adopt/publish a malformed owner acknowledgement %#",
    async (receipt) => {
      const before = structuredClone(service.cache);
      service.request = vi.fn().mockResolvedValue(receipt);
      const emit = vi.spyOn(service, "emit");
      await expect(service.addKey("F2")).resolves.toEqual({
        success: false,
        error: "failed_to_add_key",
      });
      expect(service.cache).toEqual(before);
      expect(service.request).toHaveBeenCalledOnce();
      expect(service.request.mock.calls[0][1].precondition).toEqual({
        authorityEpoch: 71,
        revision: 4,
      });
      expect(emit).not.toHaveBeenCalled();
    },
  );

  it("does not read an accessor receipt or pretend it acknowledged a write", async () => {
    const getter = vi.fn(() => true);
    service.request = vi.fn().mockResolvedValue(
      Object.defineProperty({ profile }, "success", {
        enumerable: true,
        get: getter,
      }),
    );
    await expect(service.deleteKey("F1")).resolves.toEqual({
      success: false,
      error: "failed_to_delete_key",
    });
    expect(getter).not.toHaveBeenCalled();
  });

  it("retains acknowledged add success if selection presentation fails", async () => {
    service.request = vi.fn(async (topic) => {
      if (topic === "data:update-profile") return { success: true, profile };
      throw new Error("selection unavailable");
    });
    await expect(service.addKey("F2")).resolves.toMatchObject({
      success: true,
      key: "F2",
    });
    expect(service.request).toHaveBeenNthCalledWith(2, "selection:select-key", {
      keyName: "F2",
      environment: "space",
      skipPersistence: true,
    });
    // Only canonical owner broadcasts may change the profile/key projection.
    expect(service.cache.keys).not.toHaveProperty("F2");
  });

  it("suppresses selection after disposal without denying the acknowledged key write", async () => {
    let acknowledge;
    service.request = vi.fn(
      () =>
        new Promise((resolve) => {
          acknowledge = resolve;
        }),
    );
    const pending = service.addKey("F2");
    await vi.waitFor(() => expect(service.request).toHaveBeenCalledOnce());
    service.destroy();
    acknowledge({ success: true, profile });
    await expect(pending).resolves.toMatchObject({ success: true, key: "F2" });
    expect(service.request).toHaveBeenCalledOnce();
  });

  it("validates a duplicate destination completely before any owner-cache read", async () => {
    const original = service.cache;
    const read = vi.fn(() => {
      throw new Error("premature cache read");
    });
    Object.defineProperty(service, "cache", { configurable: true, get: read });
    try {
      await expect(
        service.duplicateKeyWithName("F1", "not a supported key"),
      ).resolves.toMatchObject({ success: false, error: "invalid_key_name" });
      expect(read).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(service, "cache", {
        configurable: true,
        writable: true,
        value: original,
      });
    }
  });
});
