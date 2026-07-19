import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import CommandService from "../../../src/js/components/services/CommandService.js";
import { createDataCoordinatorState } from "../../fixtures/core/componentState.js";
import { createServiceFixture } from "../../fixtures/index.js";

function createProfile() {
  return {
    id: "captain",
    name: "Captain",
    currentEnvironment: "space",
    builds: {
      space: { keys: { F1: ["One", "Two"] } },
      ground: { keys: { G1: ["GroundOne", "GroundTwo"] } },
    },
    aliases: {
      Alpha: {
        commands: ["AliasOne", "AliasTwo"],
        description: "Preserve alias metadata",
        type: "custom",
      },
    },
    bindsets: {
      Weapons: {
        space: { keys: { F1: ["NamedOne", "NamedTwo"] } },
        ground: { keys: {} },
      },
    },
  };
}

const commandTopics = new Set([
  "command-added",
  "command-deleted",
  "command-moved",
  "command-edited",
]);

describe("CommandService mutation planner facade", () => {
  let fixture;
  let service;
  let profile;
  let i18n;
  let ui;
  let revision;

  const publishProfile = (overrides = {}) => {
    revision += 1;
    fixture.eventBus.emit("data:state-changed", {
      reason: "test-profile",
      state: createDataCoordinatorState({
        authorityEpoch: 40,
        revision,
        currentProfile: "captain",
        currentEnvironment: "space",
        currentProfileData: profile,
        profiles: { captain: profile },
        ...overrides,
      }),
    });
  };

  beforeEach(() => {
    fixture = createServiceFixture();
    profile = createProfile();
    revision = 0;
    i18n = { t: vi.fn((key) => `translated:${key}`) };
    ui = { showToast: vi.fn() };
    service = new CommandService({
      eventBus: fixture.eventBus,
      i18n,
      ui,
    });
    service.init();
    publishProfile();
    fixture.eventBusFixture.clearEventHistory();
  });

  afterEach(() => {
    if (!service.destroyed) service.destroy();
    fixture.destroy();
    vi.restoreAllMocks();
  });

  it("persists normalized add data and publishes detached compatibility data", async () => {
    const input = {
      command: "Three",
      displayName: "Rich event input",
      metadata: { source: "test" },
    };
    service.request = vi.fn().mockResolvedValue({ success: true });
    const added = vi.fn();
    fixture.eventBus.on("command-added", added);

    await expect(service.addCommand("F1", input)).resolves.toBe(true);

    expect(service.request).toHaveBeenCalledOnce();
    expect(service.request).toHaveBeenCalledWith("data:update-profile", {
      profileId: "captain",
      modify: {
        builds: { space: { keys: { F1: ["One", "Two", "Three"] } } },
      },
    });
    expect(added).toHaveBeenCalledWith({ key: "F1", command: input });
    expect(added.mock.calls[0][0].command).not.toBe(input);
  });

  it("persists normalized edit data and publishes the captured planned chain", async () => {
    const updatedCommand = {
      command: "Changed",
      displayName: "Rich edit input",
      metadata: { source: "test" },
    };
    service.request = vi.fn().mockResolvedValue({ success: true });
    const edited = vi.fn();
    fixture.eventBus.on("command-edited", edited);

    await expect(service.editCommand("F1", 0, updatedCommand)).resolves.toBe(
      true,
    );

    expect(service.request).toHaveBeenCalledWith("data:update-profile", {
      profileId: "captain",
      modify: {
        builds: { space: { keys: { F1: ["Changed", "Two"] } } },
      },
    });
    expect(edited).toHaveBeenCalledWith({
      key: "F1",
      index: 0,
      updatedCommand,
      commands: ["Changed", "Two"],
    });
    expect(edited.mock.calls[0][0].updatedCommand).not.toBe(updatedCommand);
  });

  it.each([
    {
      label: "delete",
      invoke: (current) => current.deleteCommand("F1", 0),
      expectedRequest: {
        profileId: "captain",
        modify: { builds: { space: { keys: { F1: ["Two"] } } } },
      },
      topic: "command-deleted",
      event: { key: "F1", index: 0, commands: ["Two"] },
    },
    {
      label: "move",
      invoke: (current) => current.moveCommand("F1", 0, 1),
      expectedRequest: {
        profileId: "captain",
        modify: {
          builds: { space: { keys: { F1: ["Two", "One"] } } },
        },
      },
      topic: "command-moved",
      event: {
        key: "F1",
        fromIndex: 0,
        toIndex: 1,
        commands: ["Two", "One"],
      },
    },
  ])(
    "persists and publishes the exact planned $label result",
    async ({ invoke, expectedRequest, topic, event }) => {
      service.request = vi.fn().mockResolvedValue({ success: true });
      const listener = vi.fn();
      fixture.eventBus.on(topic, listener);

      await expect(invoke(service)).resolves.toBe(true);

      expect(service.request).toHaveBeenCalledWith(
        "data:update-profile",
        expectedRequest,
      );
      expect(listener).toHaveBeenCalledWith(event);
    },
  );

  it("plans exclusively from one accepted ready data snapshot", async () => {
    fixture.eventBus.emit("profile:switched", {
      profileId: "compatibility-only",
      environment: "ground",
      profile: {
        id: "compatibility-only",
        builds: { ground: { keys: { F1: ["Wrong"] } } },
        aliases: {},
      },
    });
    service.request = vi.fn().mockResolvedValue({ success: true });

    await expect(service.addCommand("F1", "Three")).resolves.toBe(true);

    expect(service.request).toHaveBeenCalledWith("data:update-profile", {
      profileId: "captain",
      modify: {
        builds: { space: { keys: { F1: ["One", "Two", "Three"] } } },
      },
    });
  });

  it.each([
    ["add", (current) => current.addCommand("F1", "Three"), true],
    ["delete", (current) => current.deleteCommand("F1", 0), true],
    ["move", (current) => current.moveCommand("F1", 0, 1), false],
    ["edit", (current) => current.editCommand("F1", 0, "Changed"), true],
  ])(
    "treats a resolved unsuccessful $s write as failure without publication",
    async (_operation, invoke, expectsToast) => {
      service.request = vi.fn().mockResolvedValue({ success: false });
      vi.spyOn(console, "error").mockImplementation(() => {});

      await expect(invoke(service)).resolves.toBe(false);

      expect(service.request).toHaveBeenCalledOnce();
      expect(
        fixture
          .getEventHistory()
          .filter(({ event }) => commandTopics.has(event)),
      ).toEqual([]);
      if (expectsToast) {
        expect(i18n.t).toHaveBeenCalledWith("storage_write_failed");
        expect(ui.showToast).toHaveBeenCalledWith(
          "translated:storage_write_failed",
          "error",
        );
      } else {
        expect(ui.showToast).not.toHaveBeenCalled();
      }
    },
  );

  it.each([
    ["add", (current) => current.addCommand("F1", "Three")],
    ["edit", (current) => current.editCommand("F1", 0, "Changed")],
  ])(
    "uses the translated missing-profile diagnostic for $s",
    async (_operation, invoke) => {
      publishProfile({
        currentProfile: null,
        currentProfileData: null,
        profiles: {},
      });
      service.request = vi.fn();

      await expect(invoke(service)).resolves.toBe(false);

      expect(service.request).not.toHaveBeenCalled();
      expect(i18n.t).toHaveBeenCalledWith("no_valid_profile");
      expect(ui.showToast).toHaveBeenCalledWith(
        "translated:no_valid_profile",
        "error",
      );
    },
  );

  it.each([
    ["add", (current) => current.addCommand("", "Three")],
    ["delete", (current) => current.deleteCommand("", 0)],
    ["move", (current) => current.moveCommand("", 0, 1)],
    ["edit", (current) => current.editCommand("", 0, "Changed")],
  ])(
    "rejects an empty $s key before persistence",
    async (_operation, invoke) => {
      service.request = vi.fn();
      vi.spyOn(console, "warn").mockImplementation(() => {});

      await expect(invoke(service)).resolves.toBe(false);

      expect(service.request).not.toHaveBeenCalled();
      expect(
        fixture
          .getEventHistory()
          .filter(({ event }) => commandTopics.has(event)),
      ).toEqual([]);
    },
  );
});
