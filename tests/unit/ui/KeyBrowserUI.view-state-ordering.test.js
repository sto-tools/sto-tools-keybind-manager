import { afterEach, describe, expect, it, vi } from "vitest";

import KeyBrowserUI from "../../../src/js/components/ui/KeyBrowserUI.js";
import {
  createKeyBrowserBindsetSection,
  createKeyBrowserCategoryElement,
} from "../../../src/js/components/ui/keyBrowserGridDom.js";
import { createDataCoordinatorState } from "../../fixtures/core/componentState.js";
import { createEventBusFixture } from "../../fixtures/core/eventBus.js";

const keyBrowserState = ({
  authorityEpoch,
  revision,
  mode = "grid",
  command = [],
  keyType = [],
  bindsets = [],
}) => ({
  authorityEpoch,
  revision,
  mode,
  collapsedCategories: { command, keyType },
  collapsedBindsets: bindsets,
});

const mountKeyGrid = () => {
  document.body.innerHTML = `
    <div class="key-selector-container">
      <button id="toggleKeyViewBtn"><i></i></button>
      <div id="keyGrid"></div>
    </div>
  `;
};

const createProfile = ({ spaceKeys = {}, bindsets = {} } = {}) => ({
  id: "captain",
  name: "Captain",
  currentEnvironment: "space",
  builds: { space: { keys: spaceKeys }, ground: { keys: {} } },
  bindsets,
  aliases: {},
});

const coordinatorState = (profile) =>
  createDataCoordinatorState({
    authorityEpoch: 30,
    ready: true,
    revision: 1,
    currentProfile: profile.id,
    currentEnvironment: "space",
    currentProfileData: profile,
    profiles: { [profile.id]: profile },
  });

const inertGridInput = (viewState) => ({
  document,
  i18n: { t: (key) => key },
  mode: viewState.mode,
  profile: createProfile(),
  environment: "space",
  primaryKeyMap: {},
  viewState,
  showBindsetSections: false,
  selectedKey: null,
  activeBindset: "Primary Bindset",
  sortKeys: vi.fn(async (keys) => keys),
  categorizeByCommand: vi.fn(async () => ({})),
  categorizeByType: vi.fn(async () => ({})),
});

const commandCategories = (allKeys) => ({
  system: {
    name: "System",
    icon: "fas fa-folder",
    keys: allKeys,
    priority: 1,
  },
});

const expectCategoryCollapsed = (element, isCollapsed) => {
  expect(element.querySelector("h4")?.classList.contains("collapsed")).toBe(
    isCollapsed,
  );
  expect(
    element
      .querySelector(".category-commands")
      ?.classList.contains("collapsed"),
  ).toBe(isCollapsed);
};

const expectBindsetCollapsed = (element, isCollapsed) => {
  expect(
    element.querySelector(".bindset-header")?.classList.contains("collapsed"),
  ).toBe(isCollapsed);
  expect(
    element.querySelector(".bindset-content")?.classList.contains("collapsed"),
  ).toBe(isCollapsed);
  expect(
    element.querySelector(".twisty")?.classList.contains("collapsed"),
  ).toBe(isCollapsed);
};

describe("KeyBrowserUI ordered view-state adoption", () => {
  let fixture;
  let ui;

  afterEach(() => {
    if (ui && !ui.destroyed) ui.destroy();
    fixture?.destroy();
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it("fully renders accepted mode changes once and reconciles same-mode revisions", async () => {
    mountKeyGrid();
    fixture = createEventBusFixture();
    const translate = vi.fn((key) => key);
    const profile = createProfile();
    ui = new KeyBrowserUI({
      eventBus: fixture.eventBus,
      document,
      i18n: { t: translate },
    });
    ui.request = vi.fn(async (topic, payload) => {
      if (topic === "key:sort") return payload.keys;
      if (topic === "key:categorize-by-command") return {};
      throw new Error(`Unexpected request: ${topic}`);
    });
    const renderedStates = [];
    const render = vi.spyOn(ui, "render").mockImplementation(async function () {
      renderedStates.push(structuredClone(ui.cache.keyBrowserViewState));
      return await Reflect.apply(Object.getPrototypeOf(ui).render, this, []);
    });
    const reconcile = vi.spyOn(ui, "reconcileKeyBrowserViewState");
    ui.init();
    fixture.eventBus.emit("data:state-changed", {
      reason: "initial-load",
      state: coordinatorState(profile),
    });

    const initial = keyBrowserState({
      authorityEpoch: 50,
      revision: 0,
      mode: "grid",
    });
    fixture.eventBus.emit("key-browser:state-changed", initial);
    await vi.waitFor(() => expect(render).toHaveBeenCalledOnce());
    expect(renderedStates).toEqual([initial]);
    expect(document.querySelector("#toggleKeyViewBtn i")?.className).toBe(
      "fas fa-list",
    );
    expect(document.getElementById("toggleKeyViewBtn")?.title).toBe(
      "switch_to_categorized_view",
    );

    render.mockClear();
    reconcile.mockClear();
    translate.mockClear();
    renderedStates.length = 0;
    const categorized = keyBrowserState({
      authorityEpoch: 50,
      revision: 1,
      mode: "categorized",
    });
    fixture.eventBus.emit("key-browser:state-changed", categorized);

    expect(render).toHaveBeenCalledOnce();
    expect(renderedStates).toEqual([categorized]);
    expect(reconcile).not.toHaveBeenCalled();
    expect(translate).toHaveBeenCalledOnce();
    expect(translate).toHaveBeenCalledWith("switch_to_key_type_view");
    expect(document.querySelector("#toggleKeyViewBtn i")?.className).toBe(
      "fas fa-sitemap",
    );

    render.mockClear();
    translate.mockClear();
    const staleMode = keyBrowserState({
      authorityEpoch: 50,
      revision: 1,
      mode: "key-types",
    });
    fixture.eventBus.emit("key-browser:state-changed", staleMode);

    expect(ui.cache.keyBrowserViewState).toEqual(categorized);
    expect(render).not.toHaveBeenCalled();
    expect(reconcile).not.toHaveBeenCalled();
    expect(translate).not.toHaveBeenCalled();
    expect(document.querySelector("#toggleKeyViewBtn i")?.className).toBe(
      "fas fa-sitemap",
    );

    const collapseOnly = keyBrowserState({
      authorityEpoch: 50,
      revision: 2,
      mode: "categorized",
      command: ["system"],
    });
    fixture.eventBus.emit("key-browser:state-changed", collapseOnly);

    expect(ui.cache.keyBrowserViewState).toEqual(collapseOnly);
    expect(render).not.toHaveBeenCalled();
    expect(reconcile).toHaveBeenCalledOnce();
    expect(translate).not.toHaveBeenCalled();
  });

  it("reconciles every rendered collapse class only for accepted snapshots", async () => {
    mountKeyGrid();
    fixture = createEventBusFixture();
    const profile = createProfile();
    ui = new KeyBrowserUI({
      eventBus: fixture.eventBus,
      document,
      i18n: { t: (key) => key },
    });
    ui.request = vi.fn(async (topic) => {
      throw new Error(`Unexpected request: ${topic}`);
    });
    const render = vi.spyOn(ui, "render").mockResolvedValue(undefined);
    ui.init();
    fixture.eventBus.emit("data:state-changed", {
      reason: "initial-load",
      state: coordinatorState(profile),
    });

    const initial = keyBrowserState({
      authorityEpoch: 20,
      revision: 4,
      command: ["system"],
      bindsets: ["Tactical"],
    });
    fixture.eventBus.emit("key-browser:state-changed", initial);
    await vi.waitFor(() => expect(render).toHaveBeenCalledOnce());
    expect(ui.pendingInitialRender).toBe(false);

    const categoryData = {
      name: "Probe",
      icon: "fas fa-folder",
      keys: [],
    };
    const input = inertGridInput(initial);
    const system = createKeyBrowserCategoryElement(
      input,
      "system",
      categoryData,
      "command",
      {},
      null,
    );
    const keyType = createKeyBrowserCategoryElement(
      input,
      "function",
      categoryData,
      "key-type",
      {},
      null,
    );
    const tactical = await createKeyBrowserBindsetSection(
      input,
      "Tactical",
      {
        keys: [],
        keyCount: 0,
        isCollapsed: true,
      },
      {},
    );
    const primary = await createKeyBrowserBindsetSection(
      input,
      "Primary Bindset",
      {
        keys: [],
        keyCount: 0,
        isCollapsed: false,
      },
      {},
    );
    document
      .getElementById("keyGrid")
      ?.append(system, keyType, tactical, primary);

    expectCategoryCollapsed(system, true);
    expectCategoryCollapsed(keyType, false);
    expect(
      tactical
        .querySelector(".bindset-content")
        ?.classList.contains("collapsed"),
    ).toBe(true);
    expect(
      tactical.querySelector(".twisty")?.classList.contains("collapsed"),
    ).toBe(true);
    expectBindsetCollapsed(primary, false);

    const higherRevision = keyBrowserState({
      authorityEpoch: 20,
      revision: 5,
      keyType: ["function"],
      bindsets: ["Primary Bindset"],
    });
    fixture.eventBus.emit("key-browser:state-changed", higherRevision);

    expect(ui.cache.keyBrowserViewState).toEqual(higherRevision);
    expectCategoryCollapsed(system, false);
    expectCategoryCollapsed(keyType, true);
    expectBindsetCollapsed(tactical, false);
    expectBindsetCollapsed(primary, true);

    for (const rejected of [
      keyBrowserState({
        authorityEpoch: 20,
        revision: 5,
        command: ["system"],
        bindsets: ["Tactical"],
      }),
      keyBrowserState({
        authorityEpoch: 20,
        revision: 3,
        command: ["system"],
        bindsets: ["Tactical"],
      }),
      keyBrowserState({
        authorityEpoch: 19,
        revision: 999,
        command: ["system"],
        bindsets: ["Tactical"],
      }),
    ]) {
      fixture.eventBus.emit("key-browser:state-changed", rejected);
      expect(ui.cache.keyBrowserViewState).toEqual(higherRevision);
      expectCategoryCollapsed(system, false);
      expectCategoryCollapsed(keyType, true);
      expectBindsetCollapsed(tactical, false);
      expectBindsetCollapsed(primary, true);
    }

    const replacement = keyBrowserState({
      authorityEpoch: 21,
      revision: 0,
      command: ["system"],
      bindsets: ["Tactical"],
    });
    fixture.eventBus.emit("key-browser:state-changed", replacement);

    expect(ui.cache.keyBrowserViewState).toEqual(replacement);
    expectCategoryCollapsed(system, true);
    expectCategoryCollapsed(keyType, false);
    expectBindsetCollapsed(tactical, true);
    expectBindsetCollapsed(primary, false);

    const delayedPredecessor = keyBrowserState({
      authorityEpoch: 20,
      revision: 999,
      keyType: ["function"],
      bindsets: ["Primary Bindset"],
    });
    fixture.eventBus.emit("key-browser:state-changed", delayedPredecessor);

    expect(ui.cache.keyBrowserViewState).toEqual(replacement);
    expectCategoryCollapsed(system, true);
    expectCategoryCollapsed(keyType, false);
    expectBindsetCollapsed(tactical, true);
    expectBindsetCollapsed(primary, false);
    expect(ui.request).not.toHaveBeenCalled();
  });

  it("reconciles the latest snapshot after a delayed fragment is installed", async () => {
    mountKeyGrid();
    fixture = createEventBusFixture();
    ui = new KeyBrowserUI({
      eventBus: fixture.eventBus,
      document,
      i18n: { t: (key) => key },
    });
    ui.init();

    const profile = createProfile({
      spaceKeys: { F1: ["FireAll"] },
      bindsets: {
        Tactical: { space: { keys: { F2: ["FireAll"] } } },
      },
    });
    ui._cacheDataState(coordinatorState(profile));
    ui.cache.keyBrowserViewState = keyBrowserState({
      authorityEpoch: 40,
      revision: 0,
      mode: "categorized",
    });
    ui.cache.preferences = {
      bindsetsEnabled: true,
      bindToAliasMode: true,
    };
    ui.pendingInitialRender = false;

    let releaseCategorization;
    const categorizationReleased = new Promise((resolve) => {
      releaseCategorization = resolve;
    });
    let markCategorizationReady;
    const categorizationReady = new Promise((resolve) => {
      markCategorizationReady = resolve;
    });
    let categorizationCalls = 0;
    ui.request = vi.fn(async (topic, payload) => {
      if (topic !== "key:categorize-by-command")
        throw new Error(`Unexpected request: ${topic}`);
      categorizationCalls += 1;
      if (categorizationCalls === 1) {
        markCategorizationReady();
        await categorizationReleased;
      }
      return commandCategories(payload.allKeys);
    });

    const render = ui.render();
    await categorizationReady;

    const latest = keyBrowserState({
      authorityEpoch: 40,
      revision: 1,
      mode: "categorized",
      command: ["system"],
      bindsets: ["Tactical"],
    });
    fixture.eventBus.emit("key-browser:state-changed", latest);
    expect(ui.cache.keyBrowserViewState).toEqual(latest);

    releaseCategorization();
    await render;

    const categories = document.querySelectorAll(
      '.category[data-category="system"]',
    );
    const bindset = document.querySelector(
      '.bindset-section[data-bindset="Tactical"]',
    );
    expect(categories).toHaveLength(2);
    expect(bindset).toBeInstanceOf(HTMLElement);
    for (const category of categories) expectCategoryCollapsed(category, true);
    expectBindsetCollapsed(bindset, true);
  });

  it("prevents an older mode render from replacing a newer accepted mode", async () => {
    mountKeyGrid();
    fixture = createEventBusFixture();
    ui = new KeyBrowserUI({
      eventBus: fixture.eventBus,
      document,
      i18n: { t: (key) => key },
    });
    ui.init();

    const profile = createProfile({
      spaceKeys: { F1: ["FireAll"] },
    });
    ui._cacheDataState(coordinatorState(profile));
    ui.cache.keyBrowserViewState = keyBrowserState({
      authorityEpoch: 40,
      revision: 0,
      mode: "grid",
    });
    ui.pendingInitialRender = false;

    let releaseGrid;
    const gridReleased = new Promise((resolve) => {
      releaseGrid = resolve;
    });
    let markGridReady;
    const gridReady = new Promise((resolve) => {
      markGridReady = resolve;
    });
    let sortCalls = 0;
    ui.request = vi.fn(async (topic, payload) => {
      if (topic === "key:sort") {
        sortCalls += 1;
        if (sortCalls === 1) {
          markGridReady();
          await gridReleased;
        }
        return payload.keys;
      }
      if (topic === "key:categorize-by-command")
        return commandCategories(payload.allKeys);
      throw new Error(`Unexpected request: ${topic}`);
    });

    const delayedGridRender = ui.render();
    await gridReady;

    const categorized = keyBrowserState({
      authorityEpoch: 40,
      revision: 1,
      mode: "categorized",
    });
    fixture.eventBus.emit("key-browser:state-changed", categorized);

    await vi.waitFor(() => {
      expect(
        document.querySelector('.category[data-category="system"]'),
      ).toBeInstanceOf(HTMLElement);
    });
    expect(document.getElementById("keyGrid")?.classList).toContain(
      "categorized",
    );

    releaseGrid();
    await delayedGridRender;

    expect(ui.cache.keyBrowserViewState).toEqual(categorized);
    expect(
      document.querySelector('.category[data-category="system"]'),
    ).toBeInstanceOf(HTMLElement);
    expect(document.querySelector("#keyGrid > .key-item")).toBeNull();
    expect(document.getElementById("keyGrid")?.classList).toContain(
      "categorized",
    );
  });
});
