import { describe, it, beforeEach, afterEach, expect, vi } from "vitest";
import { createDataCoordinatorState } from "../../fixtures/core/componentState.js";
import { createServiceFixture } from "../../fixtures/index.js";
import { respond } from "../../../src/js/core/requestResponse.js";
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
    aliases: {},
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

    // stub request endpoints used internally
    respond(eventBus, "command:get-for-selected-key", () => []);
    respond(eventBus, "command:get-empty-state-info", () => ({
      title: "Empty",
    }));
    respond(eventBus, "command:find-definition", () => null);
    respond(eventBus, "command:get-warning", () => null);

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
});

describe("CommandChainService – bind-to-alias endpoints", () => {
  let fixture, eventBus, service;

  beforeEach(() => {
    fixture = createServiceFixture();
    eventBus = fixture.eventBus;

    // Mock preferences service endpoint
    respond(eventBus, "preferences:get", ({ key }) => {
      if (key === "bindToAliasMode") return false;
      return null;
    });

    service = new CommandChainService({ i18n: mockI18n, eventBus });
    service.init();
  });

  afterEach(() => {
    fixture.destroy();
  });

  describe("command-chain:generate-alias-name", () => {
    it("should generate alias name for key in environment", async () => {
      const result = await service.generateBindToAliasName("space", "F1", null);
      expect(result).toBe("sto_kb_space_f1");
    });

    it("should generate alias name for key with bindset", async () => {
      const result = await service.generateBindToAliasName(
        "space",
        "F1",
        "MyBindset",
      );
      // The actual implementation generates: environment_bindsetname_keyname
      expect(result).toBe("sto_kb_space_mybindset_f1");
    });

    it("should handle ground environment", async () => {
      const result = await service.generateBindToAliasName(
        "ground",
        "F2",
        null,
      );
      expect(result).toBe("sto_kb_ground_f2");
    });

    it("should return null for invalid input", async () => {
      const result = await service.generateBindToAliasName("space", "", null);
      expect(result).toBe(null);
    });
  });

  describe("command-chain:generate-alias-preview", () => {
    it("should generate alias preview for commands", () => {
      const commands = ["FireAll", "FirePhasers"];
      const result = service.generateAliasPreview("MyAlias", commands);
      expect(result).toBe("alias MyAlias <& FireAll $$ FirePhasers &>");
    });

    it("should handle empty commands", () => {
      const result = service.generateAliasPreview("MyAlias", []);
      expect(result).toBe("alias MyAlias <&  &>");
    });

    it("should handle single command", () => {
      const result = service.generateAliasPreview("MyAlias", ["FireAll"]);
      expect(result).toBe("alias MyAlias <& FireAll &>");
    });

    it("should handle rich command objects", () => {
      const commands = [{ command: "FireAll" }, { command: "FirePhasers" }];
      const result = service.generateAliasPreview("MyAlias", commands);
      expect(result).toBe("alias MyAlias <& FireAll $$ FirePhasers &>");
    });

    it("should filter empty commands", () => {
      const commands = ["FireAll", "", "FirePhasers", null];
      const result = service.generateAliasPreview("MyAlias", commands);
      expect(result).toBe("alias MyAlias <& FireAll $$ FirePhasers &>");
    });

    it("should return empty alias for null input", () => {
      const result = service.generateAliasPreview("MyAlias", null);
      expect(result).toBe("alias MyAlias <&  &>");
    });
  });
});
