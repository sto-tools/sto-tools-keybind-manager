import { afterEach, beforeEach, describe, expect, it } from "vitest";
import DataService from "../../src/js/components/services/DataService.js";
import { createRealEventBusFixture } from "../fixtures/core/eventBus.js";

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
  "data:get-default-profiles",
  "data:get-key-name-pattern",
  "data:get-tray-category",
  "data:get-validation-patterns",
  "data:find-command-by-name",
  "data:get-commands",
  "data:has-commands",
];

describe("Integration: DataService compatibility state", () => {
  /** @type {Awaited<ReturnType<typeof createRealEventBusFixture>>} */
  let eventBusFixture;
  /** @type {DataService} */
  let dataService;

  beforeEach(async () => {
    eventBusFixture = await createRealEventBusFixture();
    eventBusFixture.reset();

    dataService = new DataService({
      eventBus: eventBusFixture.eventBus,
      data: { defaultProfiles },
    });
    await dataService.init();
  });

  afterEach(() => {
    dataService.destroy();
    eventBusFixture.destroy();
  });

  it("retains the validated compatibility snapshot", () => {
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

    const state = dataService.getCurrentState();

    expect(state).toMatchObject({
      defaultProfiles: { valid: validProfile },
      hasCommands: false,
      dataAvailable: true,
    });
    expect(state.defaultProfiles.valid).toBe(validProfile);
  });

  it("does not register any retired static-data responder", () => {
    for (const topic of retiredStaticTopics) {
      expect(eventBusFixture.eventBus.hasListeners(`rpc:${topic}`), topic).toBe(
        false,
      );
    }
  });

  it("preserves the empty compatibility snapshot when profiles are absent", () => {
    dataService.data = {};

    expect(dataService.getCurrentState()).toEqual({
      defaultProfiles: {},
      hasCommands: false,
      dataAvailable: false,
    });
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
    expect(dataService.getCurrentState().defaultProfiles).toEqual(
      defaultProfiles,
    );
  });
});
