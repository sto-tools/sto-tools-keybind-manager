import { afterEach, describe, expect, it, vi } from "vitest";
import ComponentBase from "../../src/js/components/ComponentBase.js";
import DataCoordinator from "../../src/js/components/services/DataCoordinator.js";
import { createServiceFixture } from "../fixtures/index.js";

class DataStateConsumer extends ComponentBase {
  constructor(eventBus, name) {
    super(eventBus);
    this.componentName = name;
  }
}

const createProfile = (name, currentEnvironment = "space") => ({
  name,
  currentEnvironment,
  builds: {
    space: { keys: { F1: [`${name}-space`] } },
    ground: { keys: { F2: [`${name}-ground`] } },
  },
  aliases: { [`${name}-alias`]: { commands: [`${name}-command`] } },
  keybindMetadata: {},
  aliasMetadata: {},
  bindsetMetadata: {},
  bindsets: {},
  migrationVersion: "2.1.1",
});

describe("DataCoordinator state cache lifecycle", () => {
  let fixture;
  const components = [];

  afterEach(() => {
    for (const component of components.reverse()) {
      if (!component.destroyed) component.destroy();
    }
    fixture?.destroy();
    localStorage.removeItem("sto_keybind_manager_visited");
    vi.restoreAllMocks();
  });

  function createHarness() {
    localStorage.setItem("sto_keybind_manager_visited", "true");
    fixture = createServiceFixture();
    fixture.storage.getAllData.mockReturnValue({
      currentProfile: "alpha",
      profiles: {
        alpha: createProfile("alpha"),
        beta: createProfile("beta", "ground"),
      },
      settings: { theme: "dark" },
      version: "1.0.0",
      lastModified: "2026-07-16T00:00:00.000Z",
    });

    const coordinator = new DataCoordinator({
      eventBus: fixture.eventBus,
      storage: fixture.storage,
      i18n: { t: (key) => key },
    });
    components.push(coordinator);
    return coordinator;
  }

  async function waitForReady(coordinator) {
    await vi.waitFor(() => {
      expect(coordinator.getCurrentState().ready).toBe(true);
    });
  }

  it("hydrates a consumer initialized before the state owner publishes", async () => {
    const coordinator = createHarness();
    const consumer = new DataStateConsumer(
      fixture.eventBus,
      "ConsumerBeforeOwner",
    );
    components.push(consumer);

    consumer.init();
    expect(consumer.cache.dataState).toBeNull();

    coordinator.init();
    await waitForReady(coordinator);

    expect(consumer.cache.dataState).toMatchObject({
      ready: true,
      revision: 1,
      currentProfile: "alpha",
      profiles: {
        alpha: { name: "alpha" },
        beta: { name: "beta" },
      },
    });
    expect(consumer.cache).toMatchObject({
      currentProfile: "alpha",
      currentEnvironment: "space",
      keys: { F1: ["alpha-space"] },
    });
  });

  it("hydrates a late consumer through the owner snapshot handshake", async () => {
    const coordinator = createHarness();
    coordinator.init();
    await waitForReady(coordinator);

    const consumer = new DataStateConsumer(
      fixture.eventBus,
      "OwnerBeforeConsumer",
    );
    components.push(consumer);
    consumer.init();

    expect(consumer.cache.dataState).toMatchObject({
      ready: true,
      revision: 1,
      currentProfile: "alpha",
    });
    expect(consumer.cache.dataState).toBe(coordinator.getCurrentState());
    expect(Object.isFrozen(consumer.cache.dataState)).toBe(true);
    expect(Object.isFrozen(consumer.cache.dataState.profiles.alpha)).toBe(true);
  });

  it("replaces the complete map and keeps cross-environment builds coherent", async () => {
    const coordinator = createHarness();
    const consumer = new DataStateConsumer(fixture.eventBus, "LiveConsumer");
    components.push(consumer);
    consumer.init();
    coordinator.init();
    await waitForReady(coordinator);

    await coordinator.switchProfile("beta");

    expect(consumer.cache.dataState).toMatchObject({
      revision: 2,
      currentProfile: "beta",
      currentEnvironment: "ground",
    });
    expect(consumer.cache.builds).toEqual(
      coordinator.state.profiles.beta.builds,
    );
    expect(consumer.cache.keys).toEqual({ F2: ["beta-ground"] });

    await coordinator.deleteProfile("alpha");

    expect(consumer.cache.dataState.revision).toBe(3);
    expect(consumer.cache.dataState.profiles).not.toHaveProperty("alpha");
    expect(consumer.cache.dataState.profiles).toHaveProperty("beta");
  });

  it("shares immutable snapshots while keeping compatibility caches detached", async () => {
    const coordinator = createHarness();
    const first = new DataStateConsumer(fixture.eventBus, "FirstConsumer");
    const second = new DataStateConsumer(fixture.eventBus, "SecondConsumer");
    components.push(first, second);
    first.init();
    second.init();
    coordinator.init();
    await waitForReady(coordinator);

    expect(first.cache.dataState).toBe(second.cache.dataState);
    expect(first.cache.dataState).toBe(coordinator.getCurrentState());
    expect(() => {
      first.cache.dataState.profiles.alpha.name = "local mutation";
    }).toThrow(TypeError);
    expect(second.cache.dataState.profiles.alpha.name).toBe("alpha");
    expect(coordinator.state.profiles.alpha.name).toBe("alpha");

    expect(first.cache.profile).not.toBe(second.cache.profile);
    first.cache.profile.name = "local compatibility mutation";
    first.cache.keys.F1.push("local command");
    expect(second.cache.profile.name).toBe("alpha");
    expect(second.cache.keys.F1).toEqual(["alpha-space"]);
    expect(coordinator.state.profiles.alpha.name).toBe("alpha");

    first.destroy();
    await coordinator.updateProfile("alpha", {
      properties: { description: "Accepted update" },
    });

    expect(first.cache.dataState.revision).toBe(1);
    expect(second.cache.dataState).toMatchObject({
      revision: 2,
      profiles: { alpha: { description: "Accepted update" } },
    });
  });
});
