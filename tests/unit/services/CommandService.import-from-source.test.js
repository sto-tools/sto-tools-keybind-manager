import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServiceFixture } from "../../fixtures/index.js";
import CommandService from "../../../src/js/components/services/CommandService.js";

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
  };
}

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
    fixture.eventBus.emit("profile:switched", {
      profileId: "profile1",
      profile: createProfile(),
      environment: "space",
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
        if (topic === "data:get-key-commands") {
          return ["SourceOne", "SourceTwo"];
        }
        if (topic === "data:update-profile") return { success: true };
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
      modify: { builds: { space: { keys: { F2: [] } } } },
    });
    expect(addSpy.mock.calls).toEqual([
      ["F2", "SourceOne"],
      ["F2", "SourceTwo"],
    ]);
    expect(timeline).toEqual([
      "data:get-key-commands",
      "data:update-profile",
      "add:SourceOne",
      "add:SourceTwo",
    ]);
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
        if (topic === "alias:get-all") return createProfile().aliases;
        if (topic === "parser:parse-command-string") {
          return { commands: ["AliasOne", "AliasTwo"] };
        }
        if (topic === "data:update-profile") return { success: true };
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
      "alias:get-all",
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
        if (topic === "data:get-key-commands") {
          return ["SourceOne", "SourceTwo"];
        }
        throw new Error(`Unexpected request: ${topic}`);
      });
    const addSpy = vi
      .spyOn(service, "addCommand")
      .mockImplementation(async (_key, command) => {
        timeline.push(`add:${command}`);
        return true;
      });

    await service.importFromSource("space:F1", "F2", false, "space");

    expect(requestSpy.mock.calls.map(([topic]) => topic)).toEqual([
      "data:get-key-commands",
    ]);
    expect(addSpy).toHaveBeenCalledTimes(2);
    expect(timeline).toEqual([
      "data:get-key-commands",
      "add:SourceOne",
      "add:SourceTwo",
    ]);
  });

  it("surfaces a failed clearing update and performs no additions", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(service, "request").mockImplementation(async (topic) => {
      if (topic === "data:get-key-commands") return ["SourceOne"];
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
      if (topic === "data:get-key-commands") {
        return ["SourceOne", "SourceTwo"];
      }
      if (topic === "data:update-profile") return { success: true };
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
        if (topic === "data:get-key-commands") return ["SourceOne"];
        throw new Error(`Unexpected request: ${topic}`);
      });
    const addSpy = vi.spyOn(service, "addCommand");

    await expect(
      service.importFromSource("space:F1", "Missing", true, "space"),
    ).rejects.toThrow("not_found");
    expect(requestSpy).toHaveBeenCalledTimes(1);
    expect(addSpy).not.toHaveBeenCalled();
  });
});
