import { afterEach, describe, expect, it, vi } from "vitest";

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

const keyBrowserState = ({
  authorityEpoch = 1,
  revision = 0,
  mode = "grid",
  command = [],
  keyType = [],
  bindsets = [],
} = {}) => ({
  authorityEpoch,
  revision,
  mode,
  collapsedCategories: { command, keyType },
  collapsedBindsets: bindsets,
});

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

  afterEach(() => {
    if (ui && !ui.destroyed) ui.destroy();
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
    ui.request = vi.fn(async (topic) => {
      throw new Error(`Unexpected request: ${topic}`);
    });

    await ui.render();

    const grid = document.getElementById("keyGrid");
    expect(grid?.querySelector(".empty-state h4")?.textContent).toBe(
      "no_profile_selected",
    );
    expect(grid?.querySelector('[data-key="STALE"]')).toBeNull();
    expect(grid?.classList).not.toContain("categorized");
    expect(ui.request).not.toHaveBeenCalled();
  });

  it("skips a ready-profile render until an owner view snapshot is accepted", async () => {
    mountKeyGrid();
    fixture = createEventBusFixture();
    ui = new KeyBrowserUI({
      eventBus: fixture.eventBus,
      document,
      i18n: { t: (key) => key },
    });
    const profile = createProfile({ spaceKeys: { F1: ["FireAll"] } });
    ui._cacheDataState(coordinatorState(profile));
    const grid = document.getElementById("keyGrid");
    grid.textContent = "predecessor";
    ui.request = vi.fn(async (topic) => {
      throw new Error(`Unexpected request: ${topic}`);
    });

    await expect(ui.render()).resolves.toBeUndefined();

    expect(ui.getCurrentViewMode()).toBeNull();
    expect(grid.textContent).toBe("predecessor");
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
    ui.request = vi.fn(async (topic, payload) => {
      if (topic === "key:sort") return [...payload.keys].sort();
      throw new Error(`Unexpected request: ${topic}`);
    });
    ui.init();

    fixture.eventBus.emit(
      "key-browser:state-changed",
      keyBrowserState({ authorityEpoch: 20, revision: 0 }),
    );

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
    await vi.waitFor(() => {
      expect(document.querySelector('[data-key="F1"]')).not.toBeNull();
    });
    expect(ui.cache.dataState?.profiles.captain).not.toBe(original);
    expect(
      ui.cache.dataState?.profiles.captain.builds.space.keys.F1[1],
    ).toEqual({
      command: "Target_Enemy_Near",
      placement: "before-pre-pivot",
    });
    original.builds.space.keys.F1[1].placement = "source-change";
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
    expect(document.querySelector('[data-key="F1"]')).toBeNull();
    expect(document.querySelector(".empty-state")?.textContent).toContain(
      "no_profile_selected",
    );

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

    expect(document.querySelector('[data-key="F9"]')).not.toBeNull();
    expect(document.querySelector('[data-key="F1"]')).toBeNull();
    expect(
      ui.cache.dataState?.profiles.captain.builds.space.keys.F9[0],
    ).toEqual({
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
    expect(document.querySelector('[data-key="F9"]')).not.toBeNull();
    expect(document.querySelector('[data-key="F1"]')).toBeNull();
    expect(ui.request.mock.calls.every(([topic]) => topic === "key:sort")).toBe(
      true,
    );
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
    expect(ui.cacheKeyBrowserViewState(keyBrowserState())).toBe(true);
    /** @type {(keys: string[]) => void} */
    let resolveSort = () => {};
    const pendingSort = new Promise((resolve) => {
      resolveSort = resolve;
    });
    ui.request = vi.fn((topic) => {
      if (topic === "key:sort") return pendingSort;
      throw new Error(`Unexpected request: ${topic}`);
    });

    const rendering = ui.render();
    await vi.waitFor(() => {
      expect(ui.request).toHaveBeenCalledWith("key:sort", { keys: ["F1"] });
    });
    ui._cacheDataState(
      coordinatorState(profile, { revision: 2, environment: "ground" }),
    );
    ui.cache.currentEnvironment = "ground";
    resolveSort(["F1"]);
    await rendering;

    expect(ui.cache.dataState?.currentEnvironment).toBe("ground");
    expect(ui.cache.currentEnvironment).toBe("ground");
    expect(document.querySelector('[data-key="F1"]')).not.toBeNull();
    expect(document.querySelector('[data-key="G1"]')).toBeNull();
    expect(ui.request).toHaveBeenCalledOnce();
  });

  it("projects primary and named sections without sectional or category queries", async () => {
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
    expect(
      ui.cacheKeyBrowserViewState(
        keyBrowserState({ bindsets: ["Primary Bindset"] }),
      ),
    ).toBe(true);
    ui.request = vi.fn(async (topic) => {
      throw new Error(`Unexpected request: ${topic}`);
    });

    await ui.render();

    const grid = document.getElementById("keyGrid");
    expect(grid?.classList).toContain("categorized");
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
      primarySection?.querySelector(".bindset-content")?.classList,
    ).toContain("collapsed");
    const tacticalSection = document.querySelector(
      '.bindset-section[data-bindset="Tactical"]',
    );
    expect(tacticalSection?.querySelector('[data-key="F2"]')).not.toBeNull();
    expect(
      tacticalSection?.querySelector(".bindset-content")?.classList,
    ).not.toContain("collapsed");
    expect(ui.request).not.toHaveBeenCalled();
  });

  it("renders a projected named section from the captured profile and environment", async () => {
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
    ui.cache.preferences = {
      bindsetsEnabled: true,
      bindToAliasMode: true,
    };
    expect(ui.cacheKeyBrowserViewState(keyBrowserState())).toBe(true);
    ui.cache.profile = createProfile({
      bindsets: {
        Tactical: {
          space: { keys: { STALE_NAMED: ["CompatibilityCache"] } },
          ground: { keys: {} },
        },
      },
    });
    ui.cache.currentEnvironment = "space";
    ui.request = vi.fn(async (topic) => {
      throw new Error(`Unexpected request: ${topic}`);
    });

    await ui.render();

    const section = document.querySelector(
      '.bindset-section[data-bindset="Tactical"]',
    );

    expect(ui.cache.currentEnvironment).toBe("space");
    expect(section?.querySelector(".bindset-count")?.textContent).toBe("(1)");
    expect(section?.querySelector('[data-key="G1"]')).not.toBeNull();
    expect(section?.querySelector('[data-key="F2"]')).toBeNull();
    expect(section?.querySelector('[data-key="STALE_NAMED"]')).toBeNull();
    expect(ui.request).not.toHaveBeenCalled();
  });
});
