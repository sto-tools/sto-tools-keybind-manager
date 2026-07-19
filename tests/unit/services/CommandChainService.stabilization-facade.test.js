import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import CommandChainService from "../../../src/js/components/services/CommandChainService.js";
import { createDataCoordinatorState } from "../../fixtures/core/componentState.js";
import { createServiceFixture } from "../../fixtures/index.js";

function createProfile() {
  return {
    id: "captain",
    name: "Captain",
    currentEnvironment: "space",
    builds: { space: { keys: {} }, ground: { keys: {} } },
    aliases: {
      Alpha: { commands: ["FireAll"] },
    },
    keybindMetadata: {
      space: {
        F1: { stabilizeExecutionOrder: true, source: "primary" },
      },
    },
    aliasMetadata: {
      Alpha: { stabilizeExecutionOrder: true, source: "alias" },
    },
    bindsetMetadata: {
      Weapons: {
        space: {
          F2: { stabilizeExecutionOrder: true, source: "bindset" },
        },
      },
    },
  };
}

describe("CommandChainService stabilization facade", () => {
  let fixture;
  let service;
  let profile;

  beforeEach(() => {
    fixture = createServiceFixture();
    service = new CommandChainService({
      eventBus: fixture.eventBus,
      i18n: { t: (key) => key },
    });
    service.init();
    profile = createProfile();
    fixture.eventBus.emit("data:state-changed", {
      reason: "test-profile",
      state: createDataCoordinatorState({
        authorityEpoch: 20,
        revision: 1,
        currentProfile: "captain",
        currentEnvironment: "space",
        currentProfileData: profile,
        profiles: { captain: profile },
      }),
    });
  });

  afterEach(() => {
    if (!service.destroyed) service.destroy();
    fixture.destroy();
    vi.restoreAllMocks();
  });

  it("persists before adopting the returned profile and publishing compatibility", async () => {
    const order = [];
    const persisted = structuredClone(profile);
    persisted.keybindMetadata.space.F1.stabilizeExecutionOrder = false;
    service.request = vi.fn(async () => {
      order.push("request");
      return { success: true, profile: persisted };
    });
    vi.spyOn(service, "updateCacheFromProfile").mockImplementation(() => {
      order.push("cache");
    });
    service.emit = vi.fn((topic) => {
      order.push(`emit:${topic}`);
    });

    await expect(service.setStabilize("F1", false)).resolves.toEqual({
      success: true,
    });

    expect(service.request).toHaveBeenCalledWith("data:update-profile", {
      profileId: "captain",
      modify: {
        keybindMetadata: {
          space: {
            F1: {
              stabilizeExecutionOrder: false,
              source: "primary",
            },
          },
        },
      },
    });
    expect(service.updateCacheFromProfile).toHaveBeenCalledWith({
      ...persisted,
      id: "captain",
    });
    expect(service.emit).toHaveBeenCalledWith("profile:updated", {
      profileId: "captain",
      profile: persisted,
    });
    expect(order).toEqual(["request", "cache", "emit:profile:updated"]);
  });

  it("still persists and publishes a valid historical no-op", async () => {
    service.request = vi.fn().mockResolvedValue({
      success: true,
      profile,
    });
    service.emit = vi.fn();

    await expect(service.setStabilize("F1", true)).resolves.toEqual({
      success: true,
    });

    expect(service.request).toHaveBeenCalledOnce();
    expect(service.request).toHaveBeenCalledWith("data:update-profile", {
      profileId: "captain",
      modify: {
        keybindMetadata: {
          space: {
            F1: {
              stabilizeExecutionOrder: true,
              source: "primary",
            },
          },
        },
      },
    });
    expect(service.emit).toHaveBeenCalledOnce();
    expect(service.emit).toHaveBeenCalledWith("profile:updated", {
      profileId: "captain",
      profile,
    });
  });

  it.each([
    {
      label: "returns an unsuccessful result",
      persist: () => Promise.resolve({ success: false }),
      expected: { success: false },
    },
    {
      label: "rejects",
      persist: () => Promise.reject(new Error("write failed")),
      expected: { success: false, error: "write failed" },
    },
  ])(
    "keeps accepted compatibility state silent when persistence $label",
    async ({ persist, expected }) => {
      const before = structuredClone({
        dataState: service.cache.dataState,
        profile: service.cache.profile,
        builds: service.cache.builds,
        keys: service.cache.keys,
        aliases: service.cache.aliases,
      });
      service.request = vi.fn().mockImplementation(persist);
      service.emit = vi.fn();
      vi.spyOn(service, "updateCacheFromProfile");
      vi.spyOn(console, "error").mockImplementation(() => {});

      await expect(service.setStabilize("F1", false)).resolves.toEqual(
        expected,
      );

      expect(service.request).toHaveBeenCalledOnce();
      expect(service.updateCacheFromProfile).not.toHaveBeenCalled();
      expect(service.emit).not.toHaveBeenCalled();
      expect({
        dataState: service.cache.dataState,
        profile: service.cache.profile,
        builds: service.cache.builds,
        keys: service.cache.keys,
        aliases: service.cache.aliases,
      }).toEqual(before);
    },
  );

  it("rejects unsafe dynamic identifiers before persistence", async () => {
    service.request = vi.fn();
    service.emit = vi.fn();

    await expect(service.setStabilize("constructor", true)).resolves.toEqual({
      success: false,
    });

    expect(service.request).not.toHaveBeenCalled();
    expect(service.emit).not.toHaveBeenCalled();
    expect(Object.prototype).not.toHaveProperty("stabilizeExecutionOrder");
  });

  it.each([false, true])(
    "suppresses stale success after destroy%s",
    async (reinitialize) => {
      let resolveWrite;
      service.request = vi.fn(
        () =>
          new Promise((resolve) => {
            resolveWrite = resolve;
          }),
      );
      service.emit = vi.fn();
      vi.spyOn(service, "updateCacheFromProfile");

      const pending = service.setStabilize("F1", false);
      service.destroy();
      if (reinitialize) service.init();
      resolveWrite({ success: true, profile });

      await expect(pending).resolves.toEqual({ success: false });
      expect(service.updateCacheFromProfile).not.toHaveBeenCalled();
      expect(
        service.emit.mock.calls.filter(
          ([topic]) => topic === "profile:updated",
        ),
      ).toEqual([]);
    },
  );

  it("suppresses a stale rejection after replacement lifecycle ownership", async () => {
    let rejectWrite;
    service.request = vi.fn(
      () =>
        new Promise((_resolve, reject) => {
          rejectWrite = reject;
        }),
    );
    service.emit = vi.fn();
    vi.spyOn(console, "error").mockImplementation(() => {});

    const pending = service.setStabilize("F1", false);
    service.destroy();
    service.init();
    rejectWrite(new Error("superseded write"));

    await expect(pending).resolves.toEqual({ success: false });
    expect(
      service.emit.mock.calls.filter(([topic]) => topic === "profile:updated"),
    ).toEqual([]);
    expect(console.error).not.toHaveBeenCalled();
  });
});
