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

const validation = {
  keyNamePattern: "USE_STO_KEY_NAMES",
  aliasNamePattern: /^[A-Za-z][A-Za-z0-9_]*$/,
};

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
      data: { commands, defaultProfiles, validation },
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

  it("characterizes compatibility static lookup hits and misses", async () => {
    await expect(
      request(eventBusFixture.eventBus, "data:get-command-category", {
        categoryId: "tray",
      }),
    ).resolves.toEqual(commands.tray);
    await expect(
      request(eventBusFixture.eventBus, "data:get-command-category", {
        categoryId: "missing",
      }),
    ).resolves.toBeNull();

    await expect(
      request(eventBusFixture.eventBus, "data:get-command-definition", {
        categoryId: "tray",
        commandId: "execute_tray_slot",
      }),
    ).resolves.toEqual(trayCommand);
    await expect(
      request(eventBusFixture.eventBus, "data:get-command-definition", {
        categoryId: "tray",
        commandId: "missing",
      }),
    ).resolves.toBeNull();

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

    await expect(
      request(eventBusFixture.eventBus, "data:get-default-profile", {
        profileId: "starter",
      }),
    ).resolves.toEqual(defaultProfiles.starter);
    await expect(
      request(eventBusFixture.eventBus, "data:get-default-profile", {
        profileId: "missing",
      }),
    ).resolves.toBeNull();
  });

  it("characterizes compatibility validation and category responder shapes", async () => {
    await expect(
      request(eventBusFixture.eventBus, "data:get-validation-patterns", {}),
    ).resolves.toEqual(validation);
    await expect(
      request(eventBusFixture.eventBus, "data:get-key-name-pattern", {}),
    ).resolves.toBe("USE_STO_KEY_NAMES");
    await expect(
      request(eventBusFixture.eventBus, "data:get-alias-name-pattern", {}),
    ).resolves.toEqual(validation.aliasNamePattern);

    await expect(
      request(eventBusFixture.eventBus, "data:get-tray-category", {}),
    ).resolves.toEqual(commands.tray);
    await expect(
      request(eventBusFixture.eventBus, "data:get-communication-category", {}),
    ).resolves.toEqual(commands.communication);
    await expect(
      request(eventBusFixture.eventBus, "data:get-combat-category", {}),
    ).resolves.toEqual(commands.combat);
  });

  it("feeds the primitive key-pattern response into a real KeyService", async () => {
    keyService = new KeyService({ eventBus: eventBusFixture.eventBus });

    await expect(keyService.isValidKeyName("F1")).resolves.toBe(true);
    await expect(keyService.isValidKeyName("Not A Real STO Key")).resolves.toBe(
      false,
    );
  });
});
