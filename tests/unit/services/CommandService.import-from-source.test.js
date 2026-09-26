import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDataCoordinatorState } from "../../fixtures/core/componentState.js";
import { createServiceFixture } from "../../fixtures/index.js";
import CommandService from "../../../src/js/components/services/CommandService.js";
import { applyProfileOperations } from "../../../src/js/components/services/profileOperations.js";

function createProfile() {
  return {
    name: "Import profile",
    currentEnvironment: "space",
    builds: {
      space: {
        keys: {
          F1: ["SourceOne", "SourceTwo"],
          F2: ["OldCommand"],
        },
      },
      ground: { keys: {} },
    },
    aliases: {
      sourceAlias: {
        commands: ["AliasOne", "AliasTwo"],
        description: "Source",
        type: "alias",
      },
      targetAlias: {
        commands: ["OldAliasCommand"],
        description: "Target",
        type: "custom",
      },
    },
    bindsets: {
      Weapons: {
        space: { keys: { F1: ["NamedSource"] } },
        ground: { keys: {} },
      },
    },
  };
}

const retiredProjectionTopics = new Set([
  "data:get-keys",
  "data:get-key-commands",
  "bindset:get-key-commands",
  "alias:get-all",
  "command:get-for-selected-key",
  "command:get-import-sources",
]);

describe("CommandService importFromSource clear destination", () => {
  let fixture;
  let service;

  beforeEach(() => {
    fixture = createServiceFixture();
    service = new CommandService({
      eventBus: fixture.eventBus,
      i18n: { t: (key) => key },
    });
    service.init();
    const profile = createProfile();
    fixture.eventBus.emit("profile:switched", {
      profileId: "profile1",
      profile,
      environment: "space",
    });
    fixture.eventBus.emit("data:state-changed", {
      reason: "initial-load",
      state: createDataCoordinatorState({
        currentProfile: "profile1",
        currentEnvironment: "space",
        currentProfileData: profile,
        profiles: { profile1: profile },
      }),
    });
  });

  afterEach(() => {
    service.destroy();
    fixture.destroy();
    vi.restoreAllMocks();
  });

  it("persists an empty primary-key command array before sequential additions", async () => {
    const timeline = [];
    const requestSpy = vi
      .spyOn(service, "request")
      .mockImplementation(async (topic) => {
        timeline.push(topic);
        if (topic === "data:update-profile")
          return { success: true, profile: structuredClone(createProfile()) };
        throw new Error(`Unexpected request: ${topic}`);
      });
    const addSpy = vi
      .spyOn(service, "addCommand")
      .mockImplementation(async (_key, command) => {
        timeline.push(`add:${command}`);
        return true;
      });

    const result = await service.importFromSource(
      "space:F1",
      "F2",
      true,
      "space",
    );

    expect(requestSpy).toHaveBeenCalledWith("data:update-profile", {
      profileId: "profile1",
      precondition: {
        authorityEpoch: expect.any(Number),
        revision: expect.any(Number),
      },
      modify: { builds: { space: { keys: { F2: [] } } } },
    });
    expect(addSpy.mock.calls).toEqual([
      ["F2", "SourceOne"],
      ["F2", "SourceTwo"],
    ]);
    expect(timeline).toEqual([
      "data:update-profile",
      "add:SourceOne",
      "add:SourceTwo",
    ]);
    expect(
      requestSpy.mock.calls.some(([topic]) =>
        retiredProjectionTopics.has(topic),
      ),
    ).toBe(false);
    expect(result).toEqual({
      success: true,
      importedCount: 2,
      droppedCount: 0,
      sourceType: "space",
      sourceName: "F1",
    });
  });

  it("preserves alias metadata while clearing before sequential additions", async () => {
    fixture.eventBus.emit("environment:changed", { environment: "alias" });
    const timeline = [];
    const requestSpy = vi
      .spyOn(service, "request")
      .mockImplementation(async (topic) => {
        timeline.push(topic);
        if (topic === "parser:parse-command-string") {
          return { commands: ["AliasOne", "AliasTwo"] };
        }
        if (topic === "data:update-profile")
          return { success: true, profile: structuredClone(createProfile()) };
        throw new Error(`Unexpected request: ${topic}`);
      });
    const addSpy = vi
      .spyOn(service, "addCommand")
      .mockImplementation(async (_key, command) => {
        timeline.push(`add:${command}`);
        return true;
      });

    await service.importFromSource(
      "alias:sourceAlias",
      "targetAlias",
      true,
      "alias",
    );

    expect(requestSpy).toHaveBeenCalledWith("data:update-profile", {
      profileId: "profile1",
      precondition: {
        authorityEpoch: expect.any(Number),
        revision: expect.any(Number),
      },
      modify: {
        aliases: {
          targetAlias: { commands: [] },
        },
      },
    });
    expect(addSpy.mock.calls).toEqual([
      ["targetAlias", "AliasOne"],
      ["targetAlias", "AliasTwo"],
    ]);
    expect(timeline).toEqual([
      "parser:parse-command-string",
      "data:update-profile",
      "add:AliasOne",
      "add:AliasTwo",
    ]);
  });

  it("does not issue a clearing update when clearDestination is false", async () => {
    const timeline = [];
    const requestSpy = vi
      .spyOn(service, "request")
      .mockImplementation(async (topic) => {
        timeline.push(topic);
        throw new Error(`Unexpected request: ${topic}`);
      });
    const addSpy = vi
      .spyOn(service, "addCommand")
      .mockImplementation(async (_key, command) => {
        timeline.push(`add:${command}`);
        return true;
      });

    await service.importFromSource("space:F1", "F2", false, "space");

    expect(requestSpy).not.toHaveBeenCalled();
    expect(addSpy).toHaveBeenCalledTimes(2);
    expect(timeline).toEqual(["add:SourceOne", "add:SourceTwo"]);
  });

  it("surfaces a failed clearing update and performs no additions", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(service, "request").mockImplementation(async (topic) => {
      if (topic === "data:update-profile") return { success: false };
      throw new Error(`Unexpected request: ${topic}`);
    });
    const addSpy = vi.spyOn(service, "addCommand");

    await expect(
      service.importFromSource("space:F1", "F2", true, "space"),
    ).rejects.toThrow("storage_write_failed");
    expect(addSpy).not.toHaveBeenCalled();
  });

  it("rejects when a sequential addition fails after clearing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(service, "request").mockImplementation(async (topic) => {
      if (topic === "data:update-profile")
        return { success: true, profile: structuredClone(createProfile()) };
      throw new Error(`Unexpected request: ${topic}`);
    });
    const addSpy = vi
      .spyOn(service, "addCommand")
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    await expect(
      service.importFromSource("space:F1", "F2", true, "space"),
    ).rejects.toThrow("storage_write_failed");
    expect(addSpy.mock.calls).toEqual([
      ["F2", "SourceOne"],
      ["F2", "SourceTwo"],
    ]);
  });

  it("rejects clearing a target record that does not exist", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const requestSpy = vi
      .spyOn(service, "request")
      .mockImplementation(async (topic) => {
        throw new Error(`Unexpected request: ${topic}`);
      });
    const addSpy = vi.spyOn(service, "addCommand");

    await expect(
      service.importFromSource("space:F1", "Missing", true, "space"),
    ).rejects.toThrow("not_found");
    expect(requestSpy).not.toHaveBeenCalled();
    expect(addSpy).not.toHaveBeenCalled();
  });

  it.each(["revision", "authority", "environment", "disposal"])(
    "cancels before clear when alias parsing crosses a changed %s",
    async (change) => {
      let finishParsing;
      const parsed = new Promise((resolve) => {
        finishParsing = resolve;
      });
      const write = vi
        .spyOn(service, "request")
        .mockImplementation(async (topic) => {
          if (topic === "parser:parse-command-string") return parsed;
          throw new Error("unexpected owner write");
        });
      const pending = service.importFromSource(
        "alias:sourceAlias",
        "F2",
        true,
        "space",
      );
      await vi.waitFor(() => expect(write).toHaveBeenCalledOnce());
      if (change === "disposal") service.destroy();
      else {
        const state = structuredClone(service.cache.dataState);
        if (change === "authority") {
          state.authorityEpoch += 1;
          state.revision = 0;
        } else state.revision += 1;
        if (change === "environment") state.currentEnvironment = "ground";
        service._cacheDataState(state);
      }
      finishParsing({ commands: ["AliasOne"] });
      await expect(pending).rejects.toThrow("operation_cancelled");
      expect(write).toHaveBeenCalledOnce();
    },
  );

  it("retains clear and first-add durability but stops later additions after the profile changes", async () => {
    let durable = createProfile();
    let revision = 1;
    const writes = [];
    vi.spyOn(service, "request").mockImplementation(async (topic, payload) => {
      expect(topic).toBe("data:update-profile");
      expect(payload.precondition).toEqual({ authorityEpoch: 1, revision });
      writes.push(structuredClone(payload));
      durable = applyProfileOperations(durable, payload.updates || payload);
      revision += 1;
      service._cacheDataState(
        createDataCoordinatorState({
          authorityEpoch: 1,
          revision,
          currentProfile: writes.length === 2 ? "other" : "profile1",
          currentProfileData: durable,
          profiles: { profile1: durable, other: createProfile() },
        }),
      );
      return { success: true, profile: durable };
    });
    await expect(
      service.importFromSource("space:F1", "F2", true, "space"),
    ).rejects.toThrow("operation_cancelled");
    expect(writes).toHaveLength(2);
    expect(writes[0].modify.builds.space.keys.F2).toEqual([]);
    expect(durable.builds.space.keys.F2).toEqual(["SourceOne"]);
  });

  it("projects primary and named-bindset commands without retired queries", async () => {
    const requestSpy = vi.spyOn(service, "request");

    const primary = await service.getCommandsForSelectedKey({
      environment: "space",
      key: "F1",
    });
    const named = await service.getCommandsForSelectedKey({
      environment: "space",
      key: "F1",
      bindset: "Weapons",
    });

    expect(primary).toEqual(["SourceOne", "SourceTwo"]);
    expect(named).toEqual(["NamedSource"]);
    primary.push("consumer mutation");
    named.push("consumer mutation");
    expect(service.cache.dataState.profiles.profile1).toMatchObject({
      builds: { space: { keys: { F1: ["SourceOne", "SourceTwo"] } } },
      bindsets: {
        Weapons: { space: { keys: { F1: ["NamedSource"] } } },
      },
    });
    expect(
      requestSpy.mock.calls.some(([topic]) =>
        retiredProjectionTopics.has(topic),
      ),
    ).toBe(false);
  });

  it("builds import sources from the accepted profile snapshot", async () => {
    const requestSpy = vi.spyOn(service, "request");

    const sources = await service.getImportSources("space", "F1");

    expect(sources).toEqual(
      expect.arrayContaining([
        { value: "space:F2", label: "Space: F2", type: "key" },
        {
          value: "alias:sourceAlias",
          label: "Alias: sourceAlias",
          type: "alias",
        },
      ]),
    );
    expect(requestSpy).not.toHaveBeenCalled();
    expect(
      fixture.eventBus.hasListeners("rpc:command:get-import-sources"),
    ).toBe(false);
  });
});
