import { afterEach, describe, expect, it, vi } from "vitest";

import ComponentBase from "../../../src/js/components/ComponentBase.js";
import KeyBrowserUI from "../../../src/js/components/ui/KeyBrowserUI.js";
import {
  createKeyBrowserBindsetSection,
  createKeyBrowserCategoryElement,
} from "../../../src/js/components/ui/keyBrowserGridDom.js";
import { respond } from "../../../src/js/core/requestResponse.js";
import { createDataCoordinatorState } from "../../fixtures/core/componentState.js";
import {
  createEventBusFixture,
  createRealEventBusFixture,
} from "../../fixtures/core/eventBus.js";

const createProfile = ({ spaceKeys = {}, groundKeys = {} } = {}) => ({
  id: "captain",
  name: "Captain",
  currentEnvironment: "space",
  builds: {
    space: { keys: spaceKeys },
    ground: { keys: groundKeys },
  },
  bindsets: {},
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
  { authorityEpoch = 1, revision = 1, environment = "space" } = {},
) =>
  createDataCoordinatorState({
    authorityEpoch,
    ready: true,
    revision,
    currentProfile: profile.id,
    currentEnvironment: environment,
    currentProfileData: profile,
    profiles: { [profile.id]: profile },
  });

const inertGridInput = ({
  viewState,
  mode = viewState.mode,
  profile = createProfile(),
  primaryKeyMap = {},
  categorizeByType = vi.fn(async () => ({})),
} = {}) => ({
  document,
  i18n: { t: (key) => key },
  mode,
  profile,
  environment: "space",
  primaryKeyMap,
  viewState,
  showBindsetSections: false,
  selectedKey: null,
  activeBindset: "Primary Bindset",
  sortKeys: vi.fn(async (keys) => keys),
  categorizeByCommand: vi.fn(async () => ({})),
  categorizeByType,
});

describe("KeyBrowserUI view-state lifecycle", () => {
  let fixture;
  let ui;
  let owners;

  afterEach(() => {
    if (ui && !ui.destroyed) ui.destroy();
    for (const owner of (owners || []).reverse()) {
      if (!owner.destroyed) owner.destroy();
    }
    fixture?.destroy();
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it("renders persisted command and key-type category collapse without a query", async () => {
    mountKeyGrid();
    fixture = createEventBusFixture();
    const viewState = keyBrowserState({
      command: ["system"],
      keyType: ["function"],
    });
    const input = inertGridInput({ viewState });
    const category = {
      name: "System",
      icon: "fas fa-cogs",
      keys: ["F1"],
    };

    const commandElement = createKeyBrowserCategoryElement(
      input,
      "system",
      category,
      "command",
      { F1: ["FireAll"] },
      null,
    );
    const keyTypeElement = createKeyBrowserCategoryElement(
      input,
      "function",
      category,
      "key-type",
      { F1: ["FireAll"] },
      null,
    );
    const expandedElement = createKeyBrowserCategoryElement(
      input,
      "navigation",
      category,
      "command",
      { F1: ["FireAll"] },
      null,
    );

    expect(commandElement.querySelector("h4")?.classList).toContain(
      "collapsed",
    );
    expect(keyTypeElement.querySelector("h4")?.classList).toContain(
      "collapsed",
    );
    expect(expandedElement.querySelector("h4")?.classList).not.toContain(
      "collapsed",
    );
    expect(input.sortKeys).not.toHaveBeenCalled();
    expect(input.categorizeByCommand).not.toHaveBeenCalled();
    expect(input.categorizeByType).not.toHaveBeenCalled();
  });

  it("preserves the legacy command namespace for named bindset type mode", async () => {
    mountKeyGrid();
    fixture = createEventBusFixture();
    const viewState = keyBrowserState({
      mode: "key-types",
      command: ["function"],
      keyType: ["navigation"],
    });
    const categorizeByType = vi.fn(async () => ({
      function: {
        name: "Function Keys",
        icon: "fas fa-keyboard",
        keys: ["F1"],
        priority: 1,
      },
    }));
    const input = inertGridInput({
      viewState,
      mode: "key-types",
      primaryKeyMap: { F1: ["FireAll"] },
      categorizeByType,
    });

    const section = await createKeyBrowserBindsetSection(
      input,
      "Tactical",
      { keys: ["F1"], keyCount: 1, isCollapsed: false },
      { F1: ["FireAll"] },
    );
    const content = section.querySelector(".bindset-content");

    expect(content.querySelector("h4")?.dataset.mode).toBe("type");
    expect(content.querySelector("h4")?.classList).toContain("collapsed");
    expect(categorizeByType).toHaveBeenCalledOnce();
    expect(input.sortKeys).not.toHaveBeenCalled();
    expect(input.categorizeByCommand).not.toHaveBeenCalled();
  });

  it("reattaches one state listener per owner after same-instance destroy and re-init", async () => {
    mountKeyGrid();
    fixture = createEventBusFixture();
    ui = new KeyBrowserUI({
      eventBus: fixture.eventBus,
      document,
      i18n: { t: (key) => key },
    });
    const render = vi.spyOn(ui, "render").mockResolvedValue(undefined);
    const cacheViewState = vi.spyOn(ui, "cacheKeyBrowserViewState");

    ui.init();

    expect(fixture.eventBus.getListenerCount("data:state-changed")).toBe(2);
    expect(fixture.eventBus.getListenerCount("key-browser:state-changed")).toBe(
      1,
    );

    ui.destroy();

    expect(fixture.eventBus.getListenerCount("data:state-changed")).toBe(0);
    expect(fixture.eventBus.getListenerCount("key-browser:state-changed")).toBe(
      0,
    );

    ui.init();

    expect(ui.pendingInitialRender).toBe(true);
    expect(fixture.eventBus.getListenerCount("data:state-changed")).toBe(2);
    expect(fixture.eventBus.getListenerCount("key-browser:state-changed")).toBe(
      1,
    );

    const profile = createProfile({
      spaceKeys: { F4: ["ReinitializedCommand"] },
    });
    fixture.eventBus.emit("data:state-changed", {
      reason: "initial-load",
      state: coordinatorState(profile, {
        authorityEpoch: 72,
        revision: 1,
      }),
    });

    expect(render).not.toHaveBeenCalled();

    const viewState = keyBrowserState({ command: ["system"] });
    fixture.eventBus.emit("key-browser:state-changed", viewState);

    await vi.waitFor(() => expect(render).toHaveBeenCalledOnce());
    expect(cacheViewState).toHaveBeenCalledOnce();
    expect(cacheViewState).toHaveBeenCalledWith(viewState);
    expect(ui.cache.keys).toEqual({ F4: ["ReinitializedCommand"] });
    expect(ui.cache.keyBrowserViewState).toEqual(viewState);
    expect(ui.pendingInitialRender).toBe(false);
  });

  it("renders from owners that started first without a state query", async () => {
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

    class KeyBrowserService extends ComponentBase {
      getCurrentState() {
        return keyBrowserState({
          command: ["system"],
          bindsets: ["Primary Bindset"],
        });
      }
    }

    owners = [
      new DataCoordinator(fixture.eventBus),
      new KeyBrowserService(fixture.eventBus),
    ];
    for (const owner of owners) owner.init();
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
        viewState: structuredClone(ui.cache.keyBrowserViewState),
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
        viewState: keyBrowserState({
          command: ["system"],
          bindsets: ["Primary Bindset"],
        }),
      },
    ]);
    expect(ui.request).not.toHaveBeenCalled();
  });

  it.each(["data-first", "key-browser-first"])(
    "fulfills one pending render when %s owners start after the UI",
    async (order) => {
      mountKeyGrid();
      fixture = createEventBusFixture();
      ui = new KeyBrowserUI({
        eventBus: fixture.eventBus,
        document,
        i18n: { t: (key) => key },
      });
      ui.init();
      await new Promise((resolve) => setTimeout(resolve, 0));

      const observedStates = [];
      const render = vi.spyOn(ui, "render").mockImplementation(async () => {
        observedStates.push({
          authorityEpoch: ui.cache.dataState?.authorityEpoch,
          revision: ui.cache.dataState?.revision,
          keys: structuredClone(ui.cache.keys),
          viewState: structuredClone(ui.cache.keyBrowserViewState),
        });
      });
      ui.request = vi.fn(async (topic) => {
        throw new Error(`Unexpected request: ${topic}`);
      });
      const profile = createProfile({
        groundKeys: { G8: ["StartupCommand"] },
      });

      const dataEnvelope = {
        reason: "initial-load",
        state: coordinatorState(profile, {
          authorityEpoch: 71,
          revision: 1,
          environment: "ground",
        }),
      };
      const viewState = keyBrowserState({
        keyType: ["function"],
        bindsets: ["Tactical"],
      });

      if (order === "data-first") {
        fixture.eventBus.emit("data:state-changed", dataEnvelope);
        expect(render).not.toHaveBeenCalled();
        expect(ui.pendingInitialRender).toBe(true);
        fixture.eventBus.emit("key-browser:state-changed", viewState);
      } else {
        fixture.eventBus.emit("key-browser:state-changed", viewState);
        expect(render).not.toHaveBeenCalled();
        expect(ui.pendingInitialRender).toBe(true);
        fixture.eventBus.emit("data:state-changed", dataEnvelope);
      }

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
          viewState,
        },
      ]);
      expect(ui.request).not.toHaveBeenCalled();
    },
  );

  it("owns one delegated grid listener and one outside-click listener across renders and reinitialization", async () => {
    mountKeyGrid();
    const mountedGrid = document.getElementById("keyGrid");
    fixture = await createRealEventBusFixture();
    const onDom = vi.spyOn(fixture.eventBus, "onDom");
    const selectKey = vi.fn(() => ({ success: true }));
    respond(fixture.eventBus, "key:sort", ({ keys }) => keys);
    respond(fixture.eventBus, "key:select", selectKey);
    const profile = createProfile({
      spaceKeys: { F1: ["FireAll"] },
    });
    ui = new KeyBrowserUI({
      eventBus: fixture.eventBus,
      document,
      i18n: { t: (key) => key },
      bindsetDeleteConfirm: {
        confirm: vi.fn(async () => false),
        cancelActiveConfirmation: vi.fn(),
      },
    });

    const gridRegistrations = () =>
      onDom.mock.calls.filter(
        ([target, eventName]) =>
          target === mountedGrid && eventName === "click",
      );
    const outsideRegistrations = () =>
      onDom.mock.calls.filter(
        ([target, eventName]) => target === document && eventName === "click",
      );

    ui.init();
    await fixture.eventBus.emit("data:state-changed", {
      reason: "initial-load",
      state: coordinatorState(profile),
    });
    await fixture.eventBus.emit("key-browser:state-changed", keyBrowserState());

    await vi.waitFor(() => {
      expect(document.querySelector('.key-item[data-key="F1"]')).toBeInstanceOf(
        HTMLElement,
      );
    });
    expect(gridRegistrations()).toHaveLength(1);
    expect(outsideRegistrations()).toHaveLength(1);

    await ui.render();
    await ui.render();
    await ui.render();

    expect(gridRegistrations()).toHaveLength(1);
    expect(outsideRegistrations()).toHaveLength(1);

    const key = document.querySelector('.key-item[data-key="F1"]');
    expect(key).toBeInstanceOf(HTMLElement);
    key.click();
    await vi.waitFor(() => expect(selectKey).toHaveBeenCalledOnce());
    expect(selectKey).toHaveBeenCalledWith({
      keyName: "F1",
      environment: "space",
      bindset: null,
    });

    const menu = document.createElement("div");
    menu.className = "bindset-menu-dropdown open";
    document.body.appendChild(menu);
    document.body.click();
    expect(menu.classList).not.toContain("open");

    ui.destroy();
    selectKey.mockClear();
    menu.classList.add("open");
    key.click();
    document.body.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(selectKey).not.toHaveBeenCalled();
    expect(menu.classList).toContain("open");

    ui.init();
    expect(gridRegistrations()).toHaveLength(2);
    expect(outsideRegistrations()).toHaveLength(2);

    await fixture.eventBus.emit(
      "key-browser:state-changed",
      keyBrowserState({ authorityEpoch: 2 }),
    );
    await vi.waitFor(() => {
      const renderedKey = document.querySelector('.key-item[data-key="F1"]');
      expect(renderedKey).toBeInstanceOf(HTMLElement);
      expect(renderedKey).not.toBe(key);
    });
    const reinitializedKey = document.querySelector('.key-item[data-key="F1"]');
    reinitializedKey.click();
    await vi.waitFor(() => expect(selectKey).toHaveBeenCalledOnce());
    menu.classList.add("open");
    document.body.click();
    expect(menu.classList).not.toContain("open");
  });
});
