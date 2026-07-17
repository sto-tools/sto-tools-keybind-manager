import { afterEach, beforeEach, describe, expect, it } from "vitest";
import DataService from "../../src/js/components/services/DataService.js";
import KeyService from "../../src/js/components/services/KeyService.js";
import { request } from "../../src/js/core/requestResponse.js";
import { createRealEventBusFixture } from "../fixtures/core/eventBus.js";

const trayCommand = {
  name: "Execute Tray Slot",
  command: "TrayExecByTray 0 1",
  environment: "space",
};

const commands = {
  tray: {
    name: "Tray",
    commands: { execute_tray_slot: trayCommand },
  },
  communication: {
    name: "Communication",
    commands: {
      say: { name: "Say", command: "say" },
    },
  },
  combat: {
    name: "Combat",
    commands: {
      fire_all: { name: "Fire All", command: "FireAll" },
    },
  },
};

const defaultProfiles = {
  starter: {
    name: "Starter",
    currentEnvironment: "space",
    builds: {
      space: { keys: {} },
      ground: { keys: {} },
    },
  },
};

const retiredStaticTopics = [
  "data:get-alias-name-pattern",
  "data:get-combat-category",
  "data:get-command-category",
  "data:get-command-definition",
  "data:get-communication-category",
  "data:get-default-profile",
  "data:get-key-name-pattern",
  "data:get-tray-category",
  "data:get-validation-patterns",
];

describe("Integration: DataService static-data RPC contracts", () => {
  /** @type {Awaited<ReturnType<typeof createRealEventBusFixture>>} */
  let eventBusFixture;
  /** @type {DataService} */
  let dataService;
  /** @type {KeyService | null} */
  let keyService;

  beforeEach(async () => {
    eventBusFixture = await createRealEventBusFixture();
    eventBusFixture.reset();
    keyService = null;

    dataService = new DataService({
      eventBus: eventBusFixture.eventBus,
      data: { commands, defaultProfiles },
    });
    await dataService.init();
  });

  afterEach(() => {
    keyService?.destroy();
    dataService.destroy();
    eventBusFixture.destroy();
  });

  it("characterizes the live catalog and default-profile response shapes", async () => {
    await expect(
      request(eventBusFixture.eventBus, "data:get-commands", {}),
    ).resolves.toEqual(commands);
    await expect(
      request(eventBusFixture.eventBus, "data:has-commands", {}),
    ).resolves.toBe(true);
    await expect(
      request(eventBusFixture.eventBus, "data:get-default-profiles", {}),
    ).resolves.toEqual(defaultProfiles);
  });

  it("characterizes paired command lookup hits and misses", async () => {
    await expect(
      request(eventBusFixture.eventBus, "data:find-command-by-name", {
        command: "TrayExecByTray 0 1",
      }),
    ).resolves.toEqual({
      ...trayCommand,
      categoryId: "tray",
      commandId: "execute_tray_slot",
    });
    await expect(
      request(eventBusFixture.eventBus, "data:find-command-by-name", {
        command: "UnknownCommand",
      }),
    ).resolves.toBeNull();
  });

  it("filters malformed external default profiles before publishing them", async () => {
    const validProfile = {
      name: "Validated",
      description: "A structurally valid default profile",
      currentEnvironment: "space",
      builds: { space: { keys: {} }, ground: { keys: {} } },
    };
    dataService.data.defaultProfiles = {
      valid: validProfile,
      array: [],
      missingName: { builds: {} },
      blankName: { name: "   " },
      invalidDescription: { name: "Bad description", description: 42 },
      invalidEnvironment: { name: "Bad environment", currentEnvironment: 42 },
      invalidBuilds: { name: "Bad builds", builds: [] },
      primitive: "not a profile",
      absent: null,
    };

    await expect(
      request(eventBusFixture.eventBus, "data:get-default-profiles", {}),
    ).resolves.toEqual({ valid: validProfile });
    expect(dataService.getCurrentState().defaultProfiles).toEqual({
      valid: validProfile,
    });
  });

  it("does not register retired static routes", () => {
    for (const topic of retiredStaticTopics) {
      expect(eventBusFixture.eventBus.hasListeners(`rpc:${topic}`), topic).toBe(
        false,
      );
    }
  });

  it("never restores retired static routes across same-instance reinitialization", async () => {
    dataService.destroy();

    for (const topic of retiredStaticTopics) {
      expect(eventBusFixture.eventBus.hasListeners(`rpc:${topic}`), topic).toBe(
        false,
      );
    }

    await dataService.init();

    for (const topic of retiredStaticTopics) {
      expect(eventBusFixture.eventBus.hasListeners(`rpc:${topic}`), topic).toBe(
        false,
      );
    }
    await expect(
      request(eventBusFixture.eventBus, "data:get-commands", {}),
    ).resolves.toEqual(commands);
  });

  it("lets a real KeyService validate the canonical list without a data query", async () => {
    keyService = new KeyService({ eventBus: eventBusFixture.eventBus });

    await expect(keyService.isValidKeyName("F1")).resolves.toBe(true);
    await expect(keyService.isValidKeyName("control+space")).resolves.toBe(
      true,
    );
    await expect(keyService.isValidKeyName("Not A Real STO Key")).resolves.toBe(
      false,
    );
  });
});
