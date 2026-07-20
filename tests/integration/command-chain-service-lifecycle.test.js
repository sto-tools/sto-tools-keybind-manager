import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ComponentBase from "../../src/js/components/ComponentBase.js";
import CommandChainService from "../../src/js/components/services/CommandChainService.js";
import {
  createDataCoordinatorState,
  createPreferencesState,
  createSelectionState,
} from "../fixtures/core/componentState.js";
import { createServiceFixture } from "../fixtures/index.js";

class MutableStateOwner extends ComponentBase {
  constructor(eventBus, componentName, state) {
    super(eventBus);
    this.componentName = componentName;
    this.state = state;
  }

  setState(state) {
    this.state = state;
  }

  getCurrentState() {
    return this.state;
  }
}

function deferred() {
  let resolve;
  const promise = new Promise((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

function profile(environment, keys) {
  return {
    id: "captain",
    name: "Captain",
    currentEnvironment: environment,
    builds: {
      space: { keys: environment === "space" ? keys : {} },
      ground: { keys: environment === "ground" ? keys : {} },
    },
    aliases: {},
  };
}

function bindsetState(activeBindset) {
  return {
    selectedKey: null,
    activeBindset,
    bindsetNames: ["Primary Bindset", "Tactical"],
    keyBindsetMembership: new Map([["Tactical", true]]),
    shouldDisplay: true,
    preferences: { bindsetsEnabled: true },
  };
}

describe("CommandChainService lifecycle facade", () => {
  let fixture;
  let service;
  let owners;

  beforeEach(() => {
    fixture = createServiceFixture();
    const initialProfile = profile("space", { F1: ["FireAll"] });
    owners = {
      data: new MutableStateOwner(
        fixture.eventBus,
        "DataCoordinator",
        createDataCoordinatorState({
          authorityEpoch: 10,
          revision: 1,
          currentProfile: "captain",
          currentEnvironment: "space",
          currentProfileData: initialProfile,
          profiles: { captain: initialProfile },
        }),
      ),
      selection: new MutableStateOwner(
        fixture.eventBus,
        "SelectionService",
        createSelectionState({
          selectedKey: "F1",
          cachedSelections: { space: "F1", ground: null, alias: null },
        }),
      ),
      preferences: new MutableStateOwner(
        fixture.eventBus,
        "PreferencesService",
        createPreferencesState({ bindsetsEnabled: true }),
      ),
      bindset: new MutableStateOwner(
        fixture.eventBus,
        "BindsetSelectorService",
        bindsetState("Primary Bindset"),
      ),
    };
    for (const owner of Object.values(owners)) owner.init();

    service = new CommandChainService({
      eventBus: fixture.eventBus,
      i18n: { t: (key) => key },
    });
  });

  afterEach(() => {
    if (!service.destroyed) service.destroy();
    for (const owner of Object.values(owners)) {
      if (!owner.destroyed) owner.destroy();
    }
    fixture.destroy();
    vi.restoreAllMocks();
  });

  it("rehydrates inherited owner caches and suppresses predecessor publication", async () => {
    const changed = vi.fn();
    fixture.eventBus.on("chain-data-changed", changed);
    const listenerBaseline = {
      profileUpdated: fixture.eventBus.getListenerCount("profile:updated"),
      profileSwitched: fixture.eventBus.getListenerCount("profile:switched"),
      keySelected: fixture.eventBus.getListenerCount("key-selected"),
    };
    service.init();

    expect(service.getCurrentState()).toBeNull();
    expect(service.cache).toMatchObject({
      currentProfile: "captain",
      currentEnvironment: "space",
      selectedKey: "F1",
      activeBindset: "Primary Bindset",
      preferences: { bindsetsEnabled: true },
    });
    expect(service.cache.dataState).toMatchObject({
      authorityEpoch: 10,
      revision: 1,
    });
    expect(fixture.eventBus.getListenerCount("profile:updated")).toBe(
      listenerBaseline.profileUpdated + 1,
    );
    expect(fixture.eventBus.getListenerCount("profile:switched")).toBe(
      listenerBaseline.profileSwitched + 1,
    );
    expect(fixture.eventBus.getListenerCount("key-selected")).toBe(
      listenerBaseline.keySelected + 2,
    );
    expect(fixture.eventBus.getListenerCount("rpc:command:set-stabilize")).toBe(
      1,
    );

    const predecessor = deferred();
    const commands = vi
      .spyOn(service, "getCommandsForSelectedKey")
      .mockReturnValueOnce(predecessor.promise)
      .mockResolvedValue(["Target_Enemy_Near"]);
    fixture.eventBus.emit("key-selected", { key: "F1" });
    await vi.waitFor(() => expect(commands).toHaveBeenCalledOnce());

    service.destroy();
    expect(fixture.eventBus.getListenerCount("profile:updated")).toBe(
      listenerBaseline.profileUpdated,
    );
    expect(fixture.eventBus.getListenerCount("profile:switched")).toBe(
      listenerBaseline.profileSwitched,
    );
    expect(fixture.eventBus.getListenerCount("key-selected")).toBe(
      listenerBaseline.keySelected,
    );
    expect(fixture.eventBus.getListenerCount("rpc:command:set-stabilize")).toBe(
      0,
    );

    const successorProfile = profile("ground", {
      G: ["Target_Enemy_Near"],
    });
    owners.data.setState(
      createDataCoordinatorState({
        authorityEpoch: 11,
        revision: 0,
        currentProfile: "captain",
        currentEnvironment: "ground",
        currentProfileData: successorProfile,
        profiles: { captain: successorProfile },
      }),
    );
    owners.selection.setState(
      createSelectionState({
        selectedKey: "G",
        currentEnvironment: "ground",
        cachedSelections: { space: "F1", ground: "G", alias: null },
      }),
    );
    owners.preferences.setState(
      createPreferencesState({ bindsetsEnabled: true, bindToAliasMode: true }),
    );
    owners.bindset.setState(bindsetState("Tactical"));

    predecessor.resolve(["FireAll"]);
    await Promise.resolve();
    await Promise.resolve();
    expect(changed).not.toHaveBeenCalled();

    service.init();
    expect(service.cache).toMatchObject({
      currentProfile: "captain",
      currentEnvironment: "ground",
      selectedKey: "G",
      activeBindset: "Tactical",
      preferences: { bindsetsEnabled: true, bindToAliasMode: true },
    });
    expect(service.cache.dataState).toMatchObject({
      authorityEpoch: 11,
      revision: 0,
    });
    expect(fixture.eventBus.getListenerCount("profile:updated")).toBe(
      listenerBaseline.profileUpdated + 1,
    );
    expect(fixture.eventBus.getListenerCount("profile:switched")).toBe(
      listenerBaseline.profileSwitched + 1,
    );
    expect(fixture.eventBus.getListenerCount("key-selected")).toBe(
      listenerBaseline.keySelected + 2,
    );
    expect(fixture.eventBus.getListenerCount("rpc:command:set-stabilize")).toBe(
      1,
    );

    fixture.eventBus.emit("key-selected", { key: "G" });
    await vi.waitFor(() => {
      expect(changed).toHaveBeenCalledOnce();
    });
    expect(changed).toHaveBeenLastCalledWith({
      commands: ["Target_Enemy_Near"],
    });
  });
});
