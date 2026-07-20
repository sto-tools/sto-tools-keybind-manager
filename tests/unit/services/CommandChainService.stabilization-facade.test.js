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
      reason: "initial-load",
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

  it("delegates persistence without adopting reply data or publishing compatibility", async () => {
    const order = [];
    const acceptedBefore = service.cache.dataState;
    const profileBefore = structuredClone(service.cache.profile);
    const persisted = structuredClone(profile);
    persisted.keybindMetadata.space.F1.stabilizeExecutionOrder = false;
    service.request = vi.fn(async () => {
      order.push("request");
      return { success: true, profile: persisted };
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
    expect(service.cache.dataState).toBe(acceptedBefore);
    expect(service.cache.profile).toEqual(profileBefore);
    expect(service.emit).not.toHaveBeenCalled();
    expect(order).toEqual(["request"]);
  });

  it("still persists a valid historical no-op without publishing reply data", async () => {
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
    expect(service.emit).not.toHaveBeenCalled();
  });

  it("keeps successor authority compatibility intact when an older write resolves", async () => {
    let resolveWrite;
    service.request = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveWrite = resolve;
        }),
    );
    service.emit = vi.fn();

    const pending = service.setStabilize("F1", false);
    const successor = structuredClone(profile);
    successor.description = "successor-authority";
    successor.builds.space.keys.F1 = ["SuccessorCommand"];
    fixture.eventBus.emit("data:state-changed", {
      reason: "initial-load",
      state: createDataCoordinatorState({
        authorityEpoch: 21,
        revision: 0,
        currentProfile: "captain",
        currentEnvironment: "space",
        currentProfileData: successor,
        profiles: { captain: successor },
      }),
    });

    expect(service.cache.dataState?.authorityEpoch).toBe(21);
    expect(service.cache.profile?.description).toBe("successor-authority");
    expect(service.cache.keys.F1).toEqual(["SuccessorCommand"]);

    const staleResultProfile = structuredClone(profile);
    staleResultProfile.keybindMetadata.space.F1.stabilizeExecutionOrder = false;
    if (!resolveWrite) throw new Error("Expected deferred persistence request");
    resolveWrite({ success: true, profile: staleResultProfile });

    await expect(pending).resolves.toEqual({ success: true });
    expect(service.cache.dataState?.authorityEpoch).toBe(21);
    expect(service.cache.profile?.description).toBe("successor-authority");
    expect(service.cache.keys.F1).toEqual(["SuccessorCommand"]);
    expect(service.emit).not.toHaveBeenCalled();
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
      vi.spyOn(console, "error").mockImplementation(() => {});

      await expect(service.setStabilize("F1", false)).resolves.toEqual(
        expected,
      );

      expect(service.request).toHaveBeenCalledOnce();
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

      const pending = service.setStabilize("F1", false);
      service.destroy();
      if (reinitialize) service.init();
      resolveWrite({ success: true, profile });

      await expect(pending).resolves.toEqual({ success: false });
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
