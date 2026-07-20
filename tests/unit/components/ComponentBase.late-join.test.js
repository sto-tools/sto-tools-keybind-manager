import { afterEach, describe, expect, it, vi } from "vitest";

import ComponentBase from "../../../src/js/components/ComponentBase.js";
import eventBus from "../../../src/js/core/eventBus.js";
import {
  createDataCoordinatorState,
  createPreferencesState,
} from "../../fixtures/core/componentState.js";

class DataCoordinator extends ComponentBase {
  getCurrentState() {
    return createDataCoordinatorState({
      currentProfileData: {
        id: "captain",
        environment: "ground",
        builds: {
          space: { keys: { F1: ["FireAll"] } },
          ground: { keys: { G: ["Target_Enemy_Near"] } },
        },
        aliases: { engage: { commands: ["FireAll"] } },
      },
    });
  }
}

class LateJoinConsumer extends ComponentBase {
  constructor(bus) {
    super(bus);
    this.receivedStates = [];
  }

  handleInitialState(reply) {
    this.receivedStates.push(reply);
  }
}

class SelectionService extends ComponentBase {
  getCurrentState() {
    return {
      selectedKey: "F8",
      selectedAlias: null,
      editingContext: { isEditing: true, editIndex: 2 },
      cachedSelections: { space: "F8", ground: "G", alias: null },
      currentEnvironment: "space",
    };
  }
}

class PreferencesService extends ComponentBase {
  getCurrentState() {
    return createPreferencesState({
      theme: "dark",
      bindToAliasMode: true,
      bindsetsEnabled: true,
    });
  }
}

class BindsetSelectorService extends ComponentBase {
  getCurrentState() {
    return {
      selectedKey: "F8",
      activeBindset: "Tactical",
      bindsetNames: ["Primary Bindset", "Tactical"],
      keyBindsetMembership: new Map([["Tactical", true]]),
      shouldDisplay: true,
      preferences: { bindsetsEnabled: true },
    };
  }
}

class StatelessComponent extends ComponentBase {}

class RogueStateOwner extends ComponentBase {
  getCurrentState() {
    return { rogue: true };
  }
}

function repliesFrom(consumer, sender) {
  return consumer.receivedStates.filter((reply) => reply.sender === sender);
}

describe("ComponentBase late-join state synchronization", () => {
  const components = [];

  afterEach(() => {
    for (const component of components.reverse()) {
      if (!component.destroyed) component.destroy();
    }
    components.length = 0;
    vi.restoreAllMocks();
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

  it("hydrates preferences from an existing state owner", () => {
    const preferencesService = new PreferencesService(eventBus);
    const consumer = new LateJoinConsumer(eventBus);
    components.push(preferencesService, consumer);

    preferencesService.init();
    consumer.cache.preferences = { "plugin:stale": true };
    consumer.init();

    expect(consumer.cache.preferences).toEqual(
      preferencesService.getCurrentState().settings,
    );
    expect(consumer.cache.preferences).not.toHaveProperty("plugin:stale");
    expect(consumer.receivedStates).toContainEqual({
      sender: "PreferencesService",
      state: preferencesService.getCurrentState(),
    });
  });

  it("hydrates the active bindset from its late-join owner", () => {
    const bindsetSelector = new BindsetSelectorService(eventBus);
    const consumer = new LateJoinConsumer(eventBus);
    components.push(bindsetSelector, consumer);

    bindsetSelector.init();
    consumer.init();

    expect(consumer.cache.activeBindset).toBe("Tactical");
    expect(consumer.receivedStates).toContainEqual({
      sender: "BindsetSelectorService",
      state: bindsetSelector.getCurrentState(),
    });
  });

  it("replaces preference caches from complete lifecycle broadcasts", () => {
    const consumer = new LateJoinConsumer(eventBus);
    components.push(consumer);
    consumer.init();

    const loaded = createPreferencesState({
      theme: "dark",
      "plugin:loaded": true,
    }).settings;
    consumer.cache.preferences = { "plugin:stale": true };
    eventBus.emit("preferences:loaded", { settings: loaded });

    expect(consumer.cache.preferences).toEqual(loaded);
    expect(consumer.cache.preferences).not.toBe(loaded);
    expect(consumer.cache.preferences).not.toHaveProperty("plugin:stale");

    loaded.theme = "mutated-after-publication";
    expect(consumer.cache.preferences.theme).toBe("dark");

    const saved = createPreferencesState({ language: "de" }).settings;
    eventBus.emit("preferences:saved", { settings: saved });

    expect(consumer.cache.preferences).toEqual(saved);
    expect(consumer.cache.preferences).not.toHaveProperty("plugin:loaded");

    const changed = createPreferencesState({
      bindsetsEnabled: true,
      "plugin:current": "yes",
    }).settings;
    eventBus.emit("preferences:changed", {
      key: "bindsetsEnabled",
      value: true,
      settings: changed,
    });

    expect(consumer.cache.preferences).toEqual(changed);
    expect(consumer.cache.preferences).not.toHaveProperty("plugin:loaded");
  });

  it("keeps a narrow runtime fallback for legacy preference patches", () => {
    const consumer = new LateJoinConsumer(eventBus);
    components.push(consumer);
    consumer.init();

    const singleValue = {
      panels: [{ id: "commands", visible: true }],
    };
    const changedValue = {
      panels: [{ id: "aliases", visible: true }],
    };

    eventBus.emit("preferences:changed", {
      key: "plugin:single-patch",
      value: singleValue,
    });
    eventBus.emit("preferences:changed", {
      changes: { "plugin:bulk-patch": changedValue },
    });

    singleValue.panels[0].visible = false;
    changedValue.panels[0].visible = false;

    expect(consumer.cache.preferences).toEqual({
      "plugin:single-patch": {
        panels: [{ id: "commands", visible: true }],
      },
      "plugin:bulk-patch": {
        panels: [{ id: "aliases", visible: true }],
      },
    });
    expect(consumer.cache.preferences["plugin:single-patch"]).not.toBe(
      singleValue,
    );
    expect(consumer.cache.preferences["plugin:bulk-patch"]).not.toBe(
      changedValue,
    );
  });

  it("isolates same-class reply topics created in the same millisecond", () => {
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);

    const coordinator = new DataCoordinator(eventBus);
    const firstConsumer = new LateJoinConsumer(eventBus);
    const secondConsumer = new LateJoinConsumer(eventBus);
    components.push(coordinator, firstConsumer, secondConsumer);

    coordinator.init();
    firstConsumer.init();
    secondConsumer.init();

    expect(firstConsumer._myReplyTopic).not.toBe(secondConsumer._myReplyTopic);
    expect(repliesFrom(firstConsumer, "DataCoordinator")).toHaveLength(1);
    expect(repliesFrom(secondConsumer, "DataCoordinator")).toHaveLength(1);
  });

  it("does not send the default null state over a reply topic", () => {
    const stateless = new StatelessComponent(eventBus);
    const consumer = new LateJoinConsumer(eventBus);
    components.push(stateless, consumer);

    stateless.init();
    const emit = vi.spyOn(stateless, "emit");
    consumer.init();

    expect(stateless.getCurrentState()).toBeNull();
    expect(repliesFrom(consumer, "StatelessComponent")).toHaveLength(0);
    expect(
      emit.mock.calls.filter(([topic]) => topic === consumer._myReplyTopic),
    ).toHaveLength(0);
  });

  it("does not send non-null state from an unregistered owner", () => {
    const rogue = new RogueStateOwner(eventBus);
    const consumer = new LateJoinConsumer(eventBus);
    components.push(rogue, consumer);

    rogue.init();
    const getCurrentState = vi.spyOn(rogue, "getCurrentState");
    const emit = vi.spyOn(rogue, "emit");
    consumer.init();

    expect(getCurrentState).toHaveBeenCalledOnce();
    expect(
      emit.mock.calls.filter(([topic]) => topic === consumer._myReplyTopic),
    ).toHaveLength(0);
    expect(repliesFrom(consumer, "RogueStateOwner")).toHaveLength(0);
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

  it("hydrates selection state without a state-query RPC", () => {
    const selectionService = new SelectionService(eventBus);
    const consumer = new LateJoinConsumer(eventBus);
    components.push(selectionService, consumer);

    selectionService.init();
    consumer.init();

    expect(consumer.cache).toMatchObject({
      selectedKey: "F8",
      selectedAlias: null,
      editingContext: { isEditing: true, editIndex: 2 },
      cachedSelections: { space: "F8", ground: "G", alias: null },
      currentEnvironment: "space",
    });
    expect(eventBus.hasListeners("rpc:key:get-selected")).toBe(false);

    eventBus.emit("alias-selected", {
      name: "EmergencyPower",
      source: "SelectionService",
    });

    expect(consumer.cache.selectedKey).toBe(null);
    expect(consumer.cache.selectedAlias).toBe("EmergencyPower");
    expect(consumer.cache.cachedSelections.alias).toBe(null);

    eventBus.emit("key-selected", {
      key: "G",
      environment: "ground",
      source: "SelectionService",
    });
    eventBus.emit("editing-context-changed", { context: null });

    expect(consumer.cache.cachedSelections.ground).toBe("G");
    expect(consumer.cache.editingContext).toBe(null);

    eventBus.emit("selection:state-changed", {
      selectedKey: "G",
      selectedAlias: null,
      editingContext: null,
      cachedSelections: {
        space: "F8",
        ground: "G",
        alias: "EmergencyPower",
      },
      currentEnvironment: "ground",
    });

    expect(consumer.cache.cachedSelections.alias).toBe("EmergencyPower");
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

  it("detaches the dynamic reply listener during consumer teardown", () => {
    const coordinator = new DataCoordinator(eventBus);
    const consumer = new LateJoinConsumer(eventBus);
    components.push(coordinator, consumer);

    coordinator.init();
    consumer.init();

    const replyTopic = consumer._myReplyTopic;
    const cacheAtDestroy = structuredClone(consumer.cache);
    const repliesAtDestroy = consumer.receivedStates.length;
    consumer.destroy();

    expect(eventBus.hasListeners(replyTopic)).toBe(false);

    eventBus.emit(replyTopic, {
      sender: "DataCoordinator",
      state: createDataCoordinatorState({
        currentProfile: "post-destroy",
        currentEnvironment: "space",
        currentProfileData: null,
      }),
    });

    expect(consumer.cache).toEqual(cacheAtDestroy);
    expect(consumer.receivedStates).toHaveLength(repliesAtDestroy);
  });

  it("does not reply after a state owner is destroyed", () => {
    const coordinator = new DataCoordinator(eventBus);
    components.push(coordinator);
    coordinator.init();
    coordinator.destroy();

    const getCurrentState = vi.spyOn(coordinator, "getCurrentState");
    const consumer = new LateJoinConsumer(eventBus);
    components.push(consumer);
    consumer.init();

    expect(getCurrentState).not.toHaveBeenCalled();
    expect(repliesFrom(consumer, "DataCoordinator")).toHaveLength(0);
  });
});
