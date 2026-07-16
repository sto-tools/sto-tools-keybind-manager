import { afterEach, describe, expect, it, vi } from "vitest";

import KeyBrowserUI from "../../../src/js/components/ui/KeyBrowserUI.js";
import { createDataCoordinatorState } from "../../fixtures/core/componentState.js";
import { createEventBusFixture } from "../../fixtures/core/eventBus.js";

const keyBrowserState = ({
  authorityEpoch,
  revision,
  command = [],
  keyType = [],
  bindsets = [],
}) => ({
  authorityEpoch,
  revision,
  collapsedCategories: { command, keyType },
  collapsedBindsets: bindsets,
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

  it("reconciles every rendered collapse class only for accepted snapshots", async () => {
    document.body.innerHTML = `
      <div class="key-selector-container">
        <button id="toggleKeyViewBtn"><i></i></button>
        <div id="keyGrid"></div>
      </div>
    `;
    fixture = createEventBusFixture();
    ui = new KeyBrowserUI({
      eventBus: fixture.eventBus,
      document,
      i18n: { t: (key) => key },
    });
    ui.request = vi.fn(async (topic) => {
      throw new Error(`Unexpected request: ${topic}`);
    });
    ui.cache.currentProfile = "captain";
    ui.cache.currentEnvironment = "space";
    ui.cache.keys = {};
    const render = vi.spyOn(ui, "render").mockResolvedValue(undefined);
    ui.init();

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
    const system = await ui.createKeyCategoryElement(
      "system",
      categoryData,
      "command",
    );
    const keyType = await ui.createKeyCategoryElement(
      "function",
      categoryData,
      "key-type",
    );
    const tactical = await ui.createBindsetSectionElement("Tactical", {
      name: "Tactical",
      keys: [],
      keyCount: 0,
      isCollapsed: true,
    });
    const primary = await ui.createBindsetSectionElement("Primary Bindset", {
      name: "Primary Bindset",
      keys: [],
      keyCount: 0,
      isCollapsed: false,
    });
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
    document.body.innerHTML = `
      <div class="key-selector-container">
        <button id="toggleKeyViewBtn"><i></i></button>
        <div id="keyGrid"></div>
      </div>
    `;
    fixture = createEventBusFixture();
    ui = new KeyBrowserUI({
      eventBus: fixture.eventBus,
      document,
      i18n: { t: (key) => key },
    });
    ui.init();

    const profile = {
      id: "captain",
      name: "Captain",
      builds: { space: { keys: {} }, ground: { keys: {} } },
      bindsets: {},
      aliases: {},
    };
    ui._cacheDataState(
      createDataCoordinatorState({
        authorityEpoch: 30,
        ready: true,
        revision: 1,
        currentProfile: profile.id,
        currentEnvironment: "space",
        currentProfileData: profile,
        profiles: { [profile.id]: profile },
      }),
    );
    ui.cache.keyBrowserViewState = keyBrowserState({
      authorityEpoch: 40,
      revision: 0,
    });
    ui.cache.preferences = {
      bindsetsEnabled: true,
      bindToAliasMode: true,
    };
    ui.pendingInitialRender = false;
    vi.spyOn(ui, "getCurrentViewMode").mockReturnValue("categorized");

    let releaseFragment;
    const fragmentReleased = new Promise((resolve) => {
      releaseFragment = resolve;
    });
    let markFragmentReady;
    const fragmentReady = new Promise((resolve) => {
      markFragmentReady = resolve;
    });
    vi.spyOn(ui, "renderBindsetSectionsView").mockImplementation(
      async (fragment) => {
        const category = await ui.createKeyCategoryElement(
          "system",
          { name: "System", icon: "fas fa-folder", keys: [] },
          "command",
        );
        const bindset = await ui.createBindsetSectionElement("Tactical", {
          name: "Tactical",
          keys: [],
          keyCount: 0,
          isCollapsed: false,
        });
        fragment.append(category, bindset);
        markFragmentReady();
        await fragmentReleased;
      },
    );

    const render = ui.render();
    await fragmentReady;

    const latest = keyBrowserState({
      authorityEpoch: 40,
      revision: 1,
      command: ["system"],
      bindsets: ["Tactical"],
    });
    fixture.eventBus.emit("key-browser:state-changed", latest);
    expect(ui.cache.keyBrowserViewState).toEqual(latest);

    releaseFragment();
    await render;

    const category = document.querySelector(
      '.category[data-category="system"]',
    );
    const bindset = document.querySelector(
      '.bindset-section[data-bindset="Tactical"]',
    );
    expect(category).toBeInstanceOf(HTMLElement);
    expect(bindset).toBeInstanceOf(HTMLElement);
    expectCategoryCollapsed(category, true);
    expectBindsetCollapsed(bindset, true);
  });
});
