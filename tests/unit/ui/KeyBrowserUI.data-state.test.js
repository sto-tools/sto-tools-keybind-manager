import { afterEach, describe, expect, it, vi } from "vitest";

import ComponentBase from "../../../src/js/components/ComponentBase.js";
import { getSnapshotProfile } from "../../../src/js/components/services/dataState.js";
import KeyBrowserUI from "../../../src/js/components/ui/KeyBrowserUI.js";
import { createDataCoordinatorState } from "../../fixtures/core/componentState.js";
import { createEventBusFixture } from "../../fixtures/core/eventBus.js";

const createProfile = ({
  id = "captain",
  spaceKeys = {},
  groundKeys = {},
  bindsets = {},
} = {}) => ({
  id,
  name: "Captain",
  currentEnvironment: "space",
  builds: {
    space: { keys: spaceKeys },
    ground: { keys: groundKeys },
  },
  bindsets,
  aliases: {},
});

const mountKeyGrid = () => {
  document.body.innerHTML = `
    <div class="key-selector-container">
      <button id="toggleKeyViewBtn"><i></i></button>
      <div id="keyGrid"></div>
    </div>
  `;
};

const coordinatorState = (
  profile,
  {
    authorityEpoch = 1,
    ready = true,
    revision = 1,
    environment = "space",
  } = {},
) =>
  createDataCoordinatorState({
    authorityEpoch,
    ready,
    revision,
    currentProfile: ready ? profile.id : null,
    currentEnvironment: environment,
    currentProfileData: ready ? profile : null,
    profiles: ready ? { [profile.id]: profile } : {},
  });

describe("KeyBrowserUI accepted data state", () => {
  let fixture;
  let ui;
  let owner;

  afterEach(() => {
    if (ui && !ui.destroyed) ui.destroy();
    if (owner && !owner.destroyed) owner.destroy();
    fixture?.destroy();
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it("projects the pre-ready empty map without a key-state query", async () => {
    mountKeyGrid();
    fixture = createEventBusFixture();
    ui = new KeyBrowserUI({
      eventBus: fixture.eventBus,
      document,
      i18n: { t: (key) => key },
    });
    ui.cache.profile = createProfile({
      spaceKeys: { STALE: ["CompatibilityCache"] },
    });
    ui.cache.keys = { STALE: ["CompatibilityCache"] };
    ui.cache.dataState = null;
    ui.cache.currentEnvironment = "space";
    const renderGrid = vi
      .spyOn(ui, "renderSimpleGridView")
      .mockResolvedValue(undefined);
    ui.request = vi.fn(async (topic) => {
      throw new Error(`Unexpected request: ${topic}`);
    });

    await ui.render();

    expect(ui._currentKeyMap).toEqual({});
    expect(renderGrid).not.toHaveBeenCalled();
    expect(document.getElementById("keyGrid")?.textContent).toContain(
      "no_profile_selected",
    );
    expect(ui.request).not.toHaveBeenCalled();
  });

  it("clears a predecessor at replacement revision zero and adopts the ready revision", async () => {
    mountKeyGrid();
    fixture = createEventBusFixture();
    ui = new KeyBrowserUI({
      eventBus: fixture.eventBus,
      document,
      i18n: { t: (key) => key },
    });
    vi.spyOn(ui, "renderSimpleGridView").mockResolvedValue(undefined);
    ui.request = vi.fn(async (topic) => {
      throw new Error(`Unexpected request: ${topic}`);
    });
    ui.init();

    const original = createProfile({
      spaceKeys: {
        F1: [
          "FireAll",
          {
            command: "Target_Enemy_Near",
            placement: "before-pre-pivot",
          },
        ],
      },
    });
    fixture.eventBus.emit("data:state-changed", {
      reason: "initial-load",
      state: coordinatorState(original, {
        authorityEpoch: 40,
        revision: 8,
      }),
    });

    await ui.render();

    expect(ui._currentKeyMap).toEqual(original.builds.space.keys);
    expect(ui._currentKeyMap).not.toBe(
      ui.cache.dataState?.profiles.captain.builds.space.keys,
    );
    expect(ui._currentKeyMap.F1[1]).not.toBe(
      ui.cache.dataState?.profiles.captain.builds.space.keys.F1[1],
    );
    ui._currentKeyMap.F1[1].placement = "local-change";
    expect(
      ui.cache.dataState?.profiles.captain.builds.space.keys.F1[1].placement,
    ).toBe("before-pre-pivot");

    fixture.eventBus.emit("data:state-changed", {
      reason: "initial-load",
      state: coordinatorState(original, {
        authorityEpoch: 41,
        ready: false,
        revision: 0,
      }),
    });
    await ui.render();

    expect(ui.cache.dataState).toMatchObject({
      authorityEpoch: 41,
      ready: false,
      revision: 0,
    });
    expect(ui._currentKeyMap).toEqual({});

    const replacement = createProfile({
      spaceKeys: {
        F9: [
          {
            command: "FirePhasers",
            placement: "in-pivot-group",
            palindromicGeneration: true,
          },
        ],
      },
    });
    fixture.eventBus.emit("data:state-changed", {
      reason: "initial-load",
      state: coordinatorState(replacement, {
        authorityEpoch: 41,
        revision: 1,
      }),
    });
    await ui.render();

    expect(ui._currentKeyMap).toEqual(replacement.builds.space.keys);
    expect(ui._currentKeyMap.F9[0]).toEqual({
      command: "FirePhasers",
      placement: "in-pivot-group",
      palindromicGeneration: true,
    });

    fixture.eventBus.emit("data:state-changed", {
      reason: "profile-updated",
      state: coordinatorState(original, {
        authorityEpoch: 40,
        revision: 999,
      }),
    });
    await ui.render();

    expect(ui.cache.dataState?.authorityEpoch).toBe(41);
    expect(ui._currentKeyMap).toEqual(replacement.builds.space.keys);
    expect(ui.request).not.toHaveBeenCalled();
  });

  it("captures the environment once for a render", async () => {
    mountKeyGrid();
    fixture = createEventBusFixture();
    ui = new KeyBrowserUI({
      eventBus: fixture.eventBus,
      document,
      i18n: { t: (key) => key },
    });
    const profile = createProfile({
      spaceKeys: { F1: ["SpaceCommand"] },
      groundKeys: { G1: ["GroundCommand"] },
    });
    ui._cacheDataState(coordinatorState(profile));
    vi.spyOn(ui, "getCurrentViewMode").mockImplementation(() => {
      ui.cache.currentEnvironment = "ground";
      return "grid";
    });
    vi.spyOn(ui, "renderSimpleGridView").mockResolvedValue(undefined);
    ui.request = vi.fn(async (topic) => {
      throw new Error(`Unexpected request: ${topic}`);
    });

    await ui.render();

    expect(ui.cache.currentEnvironment).toBe("ground");
    expect(ui._currentKeyMap).toEqual({ F1: ["SpaceCommand"] });
    expect(ui._currentKeyMap).not.toHaveProperty("G1");
    expect(ui.request).not.toHaveBeenCalled();
  });

  it("reconciles a stale Primary section from the projected primary map", async () => {
    mountKeyGrid();
    fixture = createEventBusFixture();
    ui = new KeyBrowserUI({
      eventBus: fixture.eventBus,
      document,
      i18n: { t: (key) => key },
    });
    const profile = createProfile({
      spaceKeys: {
        F10: ["TenthCommand"],
        F2: ["SecondCommand"],
        F1: [{ command: "FireAll", placement: "before-pre-pivot" }],
      },
      bindsets: {
        Tactical: {
          space: { keys: { F2: ["Target_Enemy_Near"] } },
          ground: { keys: {} },
        },
      },
    });
    ui._cacheDataState(coordinatorState(profile));
    ui.cache.preferences = {
      bindsetsEnabled: true,
      bindToAliasMode: true,
    };
    ui.request = vi.fn(async (topic) => {
      if (topic === "key:get-all-sectional") {
        return {
          "Primary Bindset": {
            name: "Primary Bindset",
            keys: ["STALE_PRIMARY"],
            isCollapsed: false,
            keyCount: 99,
          },
          Tactical: {
            name: "Tactical",
            keys: ["F2"],
            isCollapsed: false,
            keyCount: 1,
          },
        };
      }
      throw new Error(`Unexpected request: ${topic}`);
    });
    const createSection = vi.spyOn(ui, "createBindsetSectionElement");

    await ui.render();

    const primaryCall = createSection.mock.calls.find(
      ([bindsetName]) => bindsetName === "Primary Bindset",
    );
    expect(primaryCall).toBeDefined();
    const projectedPrimaryMap = primaryCall?.[4];
    expect(projectedPrimaryMap).toEqual({
      F10: ["TenthCommand"],
      F2: ["SecondCommand"],
      F1: [{ command: "FireAll", placement: "before-pre-pivot" }],
    });
    const primarySection = document.querySelector(
      '.bindset-section[data-bindset="Primary Bindset"]',
    );
    expect(primarySection?.querySelector(".bindset-count")?.textContent).toBe(
      "(3)",
    );
    expect(
      [...(primarySection?.querySelectorAll("[data-key]") || [])].map(
        (element) => element.getAttribute("data-key"),
      ),
    ).toEqual(["F1", "F2", "F10"]);
    expect(
      primarySection?.querySelector('[data-key="STALE_PRIMARY"]'),
    ).toBeNull();
    expect(ui.request).toHaveBeenCalledOnce();
    expect(ui.request).toHaveBeenCalledWith("key:get-all-sectional");
  });

  it("reconciles a stale named section from the captured profile and environment", async () => {
    mountKeyGrid();
    fixture = createEventBusFixture();
    ui = new KeyBrowserUI({
      eventBus: fixture.eventBus,
      document,
      i18n: { t: (key) => key },
    });
    const namedGroundKeys = {
      G1: [{ command: "NamedGround", placement: "in-pivot-group" }],
    };
    const capturedProfile = createProfile({
      bindsets: {
        Tactical: {
          space: { keys: { F2: ["NamedSpace"] } },
          ground: { keys: namedGroundKeys },
        },
      },
    });
    ui._cacheDataState(
      coordinatorState(capturedProfile, {
        environment: "ground",
      }),
    );
    const capturedSnapshotProfile = getSnapshotProfile(ui.cache.dataState);
    if (!capturedSnapshotProfile) {
      throw new Error("Expected a detached accepted profile");
    }
    ui.cache.profile = createProfile({
      bindsets: {
        Tactical: {
          space: { keys: { STALE_NAMED: ["CompatibilityCache"] } },
          ground: { keys: {} },
        },
      },
    });
    ui.cache.currentEnvironment = "space";
    const sectionData = {
      name: "Tactical",
      keys: ["STALE_NAMED"],
      isCollapsed: false,
      keyCount: 77,
    };

    const section = await ui.createBindsetSectionElement(
      "Tactical",
      sectionData,
      "grid",
      capturedSnapshotProfile,
      { F9: ["ConflictingPrimary"] },
      {},
      "ground",
    );

    expect(ui.cache.currentEnvironment).toBe("space");
    expect(ui._currentKeyMap).toBe(
      capturedSnapshotProfile.bindsets.Tactical.ground.keys,
    );
    expect(ui._currentKeyMap).toEqual({
      G1: [{ command: "NamedGround", placement: "in-pivot-group" }],
    });
    expect(section.querySelector(".bindset-count")?.textContent).toBe("(1)");
    expect(section.querySelector('[data-key="G1"]')).not.toBeNull();
    expect(section.querySelector('[data-key="STALE_NAMED"]')).toBeNull();
  });

  it("renders from a DataCoordinator owner that started first without a state query", async () => {
    mountKeyGrid();
    fixture = createEventBusFixture();
    const profile = createProfile({
      spaceKeys: { F7: ["LateJoinCommand"] },
    });

    class DataCoordinator extends ComponentBase {
      getCurrentState() {
        return coordinatorState(profile, {
          authorityEpoch: 70,
          revision: 4,
        });
      }
    }

    owner = new DataCoordinator(fixture.eventBus);
    owner.init();
    ui = new KeyBrowserUI({
      eventBus: fixture.eventBus,
      document,
      i18n: { t: (key) => key },
    });
    const observedStates = [];
    const render = vi.spyOn(ui, "render").mockImplementation(async () => {
      observedStates.push({
        authorityEpoch: ui.cache.dataState?.authorityEpoch,
        keys: structuredClone(ui.cache.keys),
      });
    });
    ui.request = vi.fn(async (topic) => {
      throw new Error(`Unexpected request: ${topic}`);
    });

    ui.init();

    await vi.waitFor(() => expect(render).toHaveBeenCalled());

    expect(ui.pendingInitialRender).toBe(false);
    expect(ui.cache.dataState).toMatchObject({
      authorityEpoch: 70,
      revision: 4,
      currentProfile: "captain",
    });
    expect(ui.cache.keys).toEqual({ F7: ["LateJoinCommand"] });
    expect(render).toHaveBeenCalledOnce();
    expect(observedStates).toEqual([
      {
        authorityEpoch: 70,
        keys: { F7: ["LateJoinCommand"] },
      },
    ]);
    expect(ui.request).not.toHaveBeenCalled();
  });

  it("fulfills one pending render when ready state arrives after UI startup", async () => {
    mountKeyGrid();
    fixture = createEventBusFixture();
    ui = new KeyBrowserUI({
      eventBus: fixture.eventBus,
      document,
      i18n: { t: (key) => key },
    });
    ui.init();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(ui.pendingInitialRender).toBe(true);

    const observedStates = [];
    const render = vi.spyOn(ui, "render").mockImplementation(async () => {
      observedStates.push({
        authorityEpoch: ui.cache.dataState?.authorityEpoch,
        revision: ui.cache.dataState?.revision,
        keys: structuredClone(ui.cache.keys),
      });
    });
    ui.request = vi.fn(async (topic) => {
      throw new Error(`Unexpected request: ${topic}`);
    });
    const profile = createProfile({
      groundKeys: { G8: ["StartupCommand"] },
    });

    await fixture.eventBus.emit("data:state-changed", {
      reason: "initial-load",
      state: coordinatorState(profile, {
        authorityEpoch: 71,
        revision: 1,
        environment: "ground",
      }),
    });

    await vi.waitFor(() => expect(render).toHaveBeenCalledOnce());
    expect(ui.pendingInitialRender).toBe(false);
    expect(ui.cache.dataState).toMatchObject({
      authorityEpoch: 71,
      revision: 1,
      currentEnvironment: "ground",
    });
    expect(observedStates).toEqual([
      {
        authorityEpoch: 71,
        revision: 1,
        keys: { G8: ["StartupCommand"] },
      },
    ]);
    expect(ui.request).not.toHaveBeenCalled();
  });
});
