import { describe, it, beforeEach, afterEach, expect, vi } from "vitest";
import { createDataCoordinatorState } from "../../fixtures/core/componentState.js";
import { createServiceFixture } from "../../fixtures/index.js";
import CommandChainService from "../../../src/js/components/services/CommandChainService.js";

const mockI18n = { t: (k) => k };

function baseProfile() {
  return {
    id: "profile1",
    builds: {
      space: {
        keys: {
          F1: [{ command: "FireAll" }],
        },
      },
      ground: { keys: {} },
    },
    aliases: { engage: { commands: ["FireAll", "Target_Enemy_Near"] } },
    bindsets: {
      Weapons: {
        space: { keys: { F1: ["FirePhasers", "FireTorpedoes"] } },
        ground: { keys: {} },
      },
    },
  };
}

describe("CommandChainService", () => {
  let fixture, eventBus, service;

  beforeEach(() => {
    fixture = createServiceFixture();
    eventBus = fixture.eventBus;

    service = new CommandChainService({ i18n: mockI18n, eventBus });
    service.init();

    const profile = baseProfile();
    // seed cache via profile:switched broadcast
    eventBus.emit("profile:switched", {
      profileId: profile.id,
      profile,
      environment: "space",
    });
    eventBus.emit("data:state-changed", {
      reason: "initial-load",
      state: createDataCoordinatorState({
        currentProfile: profile.id,
        currentEnvironment: "space",
        currentProfileData: profile,
        profiles: { [profile.id]: profile },
      }),
    });
  });

  afterEach(() => {
    fixture.destroy();
  });

  it("should emit chain-data-changed when key-selected", async () => {
    const handler = vi.fn();
    eventBus.on("chain-data-changed", handler);

    eventBus.emit("key-selected", { key: "F1" });

    await new Promise((r) => setTimeout(r, 0));

    expect(handler).toHaveBeenCalled();
  });

  it("should emit chain-data-changed after command-added event", async () => {
    const spy = vi.fn();
    eventBus.on("chain-data-changed", spy);

    // select key
    eventBus.emit("key-selected", { key: "F1" });
    await new Promise((r) => setTimeout(r, 0));
    spy.mockReset();

    // simulate command-added from CommandService
    eventBus.emit("command-added", {
      key: "F1",
      command: { command: "FireAll" },
    });
    await new Promise((r) => setTimeout(r, 0));

    expect(spy).toHaveBeenCalled();
  });

  it("reads named-bindset commands from the accepted snapshot", async () => {
    service.cache.selectedKey = "F1";
    service.cache.activeBindset = "Weapons";
    service.cache.preferences.bindsetsEnabled = true;
    const requestSpy = vi.spyOn(service, "request");

    const commands = await service.getCommandsForSelectedKey();

    expect(commands).toEqual(["FirePhasers", "FireTorpedoes"]);
    commands.push("consumer mutation");
    expect(
      service.cache.dataState.profiles.profile1.bindsets.Weapons.space.keys.F1,
    ).toEqual(["FirePhasers", "FireTorpedoes"]);
    expect(requestSpy).not.toHaveBeenCalledWith(
      "bindset:get-key-commands",
      expect.anything(),
    );
  });

  it("broadcasts primary commands when a disabled named bindset remains cached", async () => {
    service.cache.activeBindset = "Weapons";
    service.cache.preferences.bindsetsEnabled = false;
    const handler = vi.fn();
    eventBus.on("chain-data-changed", handler);

    eventBus.emit("key-selected", { key: "F1" });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(handler).toHaveBeenLastCalledWith({
      commands: [{ command: "FireAll" }],
    });
  });

  it("reads primary and alias commands without the retired query", async () => {
    service.cache.selectedKey = "F1";
    service.cache.activeBindset = "Primary Bindset";
    await expect(service.getCommandsForSelectedKey()).resolves.toEqual([
      { command: "FireAll" },
    ]);

    service.cache.currentEnvironment = "alias";
    service.cache.selectedAlias = "engage";
    const aliases = await service.getCommandsForSelectedKey();
    expect(aliases).toEqual(["FireAll", "Target_Enemy_Near"]);
    aliases.push("Local change");
    expect(
      service.cache.dataState.profiles.profile1.aliases.engage.commands,
    ).toEqual(["FireAll", "Target_Enemy_Near"]);
    expect(eventBus.hasListeners("rpc:command:get-for-selected-key")).toBe(
      false,
    );
  });

  it("keeps the empty fallback before a ready data snapshot", async () => {
    service.cache.dataState = createDataCoordinatorState({
      authorityEpoch: 2,
      ready: false,
      revision: 0,
    });
    service.cache.selectedKey = "F1";
    service.cache.activeBindset = "Weapons";
    const requestSpy = vi.spyOn(service, "request");

    await expect(service.getCommandsForSelectedKey()).resolves.toEqual([]);
    expect(requestSpy).not.toHaveBeenCalledWith(
      "bindset:get-key-commands",
      expect.anything(),
    );
  });

  it.each([
    [
      "returns an unsuccessful result",
      () => Promise.resolve({ success: false }),
    ],
    ["rejects", () => Promise.reject(new Error("write failed"))],
  ])(
    "does not mutate accepted compatibility state or publish when persistence %s",
    async (_label, persist) => {
      const compatibilityBefore = structuredClone({
        profile: service.cache.profile,
        builds: service.cache.builds,
        keys: service.cache.keys,
        aliases: service.cache.aliases,
        dataState: service.cache.dataState,
      });
      const requestSpy = vi
        .spyOn(service, "request")
        .mockImplementation(() => persist());
      const changed = vi.fn();
      eventBus.on("chain-data-changed", changed);

      await expect(service.clearCommandChain("F1")).resolves.toBe(false);

      expect(requestSpy).toHaveBeenCalledTimes(1);
      expect(requestSpy).toHaveBeenCalledWith("data:update-profile", {
        profileId: "profile1",
        modify: {
          builds: { space: { keys: { F1: [] } } },
        },
      });
      expect({
        profile: service.cache.profile,
        builds: service.cache.builds,
        keys: service.cache.keys,
        aliases: service.cache.aliases,
        dataState: service.cache.dataState,
      }).toEqual(compatibilityBefore);
      expect(changed).not.toHaveBeenCalled();
    },
  );

  it.each([
    [
      "an alias",
      "alias",
      "engage",
      null,
      {
        profileId: "profile1",
        modify: {
          aliases: { engage: { commands: [] } },
        },
      },
    ],
    [
      "an existing named bindset",
      "space",
      "F1",
      "Weapons",
      {
        profileId: "profile1",
        modify: {
          bindsets: { Weapons: { space: { keys: { F1: [] } } } },
        },
      },
    ],
    [
      "a missing named bindset",
      "ground",
      "F2",
      "Engineering",
      {
        profileId: "profile1",
        modify: {
          bindsets: { Engineering: { ground: { keys: { F2: [] } } } },
        },
      },
    ],
  ])(
    "persists the exact detached clear plan for %s before publishing",
    async (_label, environment, key, bindset, expectedRequest) => {
      service.cache.currentEnvironment = environment;
      const compatibilityBefore = structuredClone({
        profile: service.cache.profile,
        builds: service.cache.builds,
        keys: service.cache.keys,
        aliases: service.cache.aliases,
        dataState: service.cache.dataState,
      });
      const requestSpy = vi
        .spyOn(service, "request")
        .mockResolvedValue({ success: true });
      const changed = vi.fn();
      eventBus.on("chain-data-changed", changed);

      await expect(service.clearCommandChain(key, bindset)).resolves.toBe(true);

      expect(requestSpy).toHaveBeenCalledTimes(1);
      expect(requestSpy).toHaveBeenCalledWith(
        "data:update-profile",
        expectedRequest,
      );
      expect({
        profile: service.cache.profile,
        builds: service.cache.builds,
        keys: service.cache.keys,
        aliases: service.cache.aliases,
        dataState: service.cache.dataState,
      }).toEqual(compatibilityBefore);
      expect(changed).toHaveBeenCalledTimes(1);
      expect(changed).toHaveBeenCalledWith({ commands: [] });
    },
  );

  it("does not request or publish when the accepted alias is absent", async () => {
    service.cache.currentEnvironment = "alias";
    const requestSpy = vi.spyOn(service, "request");
    const changed = vi.fn();
    eventBus.on("chain-data-changed", changed);

    await expect(service.clearCommandChain("missing")).resolves.toBe(false);

    expect(requestSpy).not.toHaveBeenCalled();
    expect(changed).not.toHaveBeenCalled();
  });
});
