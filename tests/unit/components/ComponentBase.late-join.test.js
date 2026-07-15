import { afterEach, describe, expect, it } from "vitest";

import ComponentBase from "../../../src/js/components/ComponentBase.js";
import eventBus from "../../../src/js/core/eventBus.js";

class DataCoordinator extends ComponentBase {
  getCurrentState() {
    return {
      currentProfile: "captain",
      currentEnvironment: "ground",
      currentProfileData: {
        id: "captain",
        environment: "ground",
        builds: {
          space: { keys: { F1: ["FireAll"] } },
          ground: { keys: { G: ["Target_Enemy_Near"] } },
        },
        aliases: { engage: { commands: ["FireAll"] } },
      },
    };
  }
}

class LateJoinConsumer extends ComponentBase {
  constructor(bus) {
    super(bus);
    this.receivedStates = [];
  }

  handleInitialState(sender, state) {
    this.receivedStates.push({ sender, state });
  }
}

describe("ComponentBase late-join state synchronization", () => {
  const components = [];

  afterEach(() => {
    for (const component of components.reverse()) {
      if (!component.destroyed) component.destroy();
    }
    components.length = 0;
    eventBus.clear();
  });

  it("hydrates a newly initialized consumer from an existing state owner", () => {
    const coordinator = new DataCoordinator(eventBus);
    const consumer = new LateJoinConsumer(eventBus);
    components.push(coordinator, consumer);

    coordinator.init();
    consumer.init();

    expect(consumer.cache).toMatchObject({
      currentProfile: "captain",
      currentEnvironment: "ground",
      keys: { G: ["Target_Enemy_Near"] },
      aliases: { engage: { commands: ["FireAll"] } },
    });
    expect(consumer.receivedStates).toContainEqual({
      sender: "DataCoordinator",
      state: coordinator.getCurrentState(),
    });
  });

  it("keeps the hydrated cache current through subsequent broadcasts", () => {
    const coordinator = new DataCoordinator(eventBus);
    const consumer = new LateJoinConsumer(eventBus);
    components.push(coordinator, consumer);

    coordinator.init();
    consumer.init();

    eventBus.emit("profile:switched", {
      profileId: "admiral",
      environment: "space",
      profile: {
        id: "admiral",
        keys: { F2: ["TrayExecByTray 0 0"] },
        aliases: {},
      },
    });

    expect(consumer.cache).toMatchObject({
      currentProfile: "admiral",
      currentEnvironment: "space",
      keys: { F2: ["TrayExecByTray 0 0"] },
      aliases: {},
    });
  });

  it("stops updating the cache after component teardown", () => {
    const coordinator = new DataCoordinator(eventBus);
    const consumer = new LateJoinConsumer(eventBus);
    components.push(coordinator, consumer);

    coordinator.init();
    consumer.init();
    consumer.destroy();

    eventBus.emit("environment:changed", { environment: "space" });

    expect(consumer.cache.currentEnvironment).toBe("ground");
  });
});
