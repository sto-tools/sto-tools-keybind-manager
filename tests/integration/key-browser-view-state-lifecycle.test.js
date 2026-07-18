import { afterEach, describe, expect, it, vi } from "vitest";

import KeyBrowserService from "../../src/js/components/services/KeyBrowserService.js";
import KeyBrowserUI from "../../src/js/components/ui/KeyBrowserUI.js";
import { createDataCoordinatorState } from "../fixtures/core/componentState.js";
import { createRealEventBusFixture } from "../fixtures/core/eventBus.js";

const persistedCategory = "__integration-persisted-category__";
const toggleCategory = "__integration-toggle-category__";
const sharedCategory = "__integration-shared-category__";
const sharedBindset = "__integration-shared-bindset__";
const persistedStorageKey = `keyCategory_${persistedCategory}_collapsed`;
const toggleStorageKey = `keyCategory_${toggleCategory}_collapsed`;
const sharedCategoryStorageKey = `keyCategory_${sharedCategory}_collapsed`;
const sharedBindsetStorageKey = `bindsetSection_${sharedBindset}_collapsed`;
const viewModeStorageKey = "keyViewMode";

const nextViewMode = {
  grid: "categorized",
  categorized: "key-types",
  "key-types": "grid",
};

const createProfile = () => ({
  id: "captain",
  name: "Captain",
  currentEnvironment: "space",
  builds: {
    space: { keys: { F1: ["FireAll"] } },
    ground: { keys: {} },
  },
  bindsets: {},
  aliases: {},
});

const coordinatorState = () => {
  const profile = createProfile();
  return createDataCoordinatorState({
    authorityEpoch: 1,
    ready: true,
    revision: 1,
    currentProfile: profile.id,
    currentEnvironment: "space",
    currentProfileData: profile,
    profiles: { [profile.id]: profile },
  });
};

const mountKeyGrid = () => {
  document.body.innerHTML = `
    <div class="key-selector-container">
      <button id="toggleKeyViewBtn"><i></i></button>
      <div id="keyGrid"></div>
    </div>
  `;
};

describe("Integration: KeyBrowser view-state ownership", () => {
  let eventBusFixture;
  let service;
  let ui;
  let secondUi;

  afterEach(() => {
    if (secondUi && !secondUi.destroyed) secondUi.destroy();
    if (ui && !ui.destroyed) ui.destroy();
    if (service && !service.destroyed) service.destroy();
    eventBusFixture?.destroy();
    localStorage.removeItem(persistedStorageKey);
    localStorage.removeItem(toggleStorageKey);
    localStorage.removeItem(sharedCategoryStorageKey);
    localStorage.removeItem(sharedBindsetStorageKey);
    localStorage.removeItem(viewModeStorageKey);
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it.each([
    ["missing", null],
    ["empty", ""],
    ["legacy bindset sections", "bindset-sections"],
    ["unknown", "future-mode"],
  ])(
    "normalizes %s persisted mode without eagerly rewriting it",
    async (_, stored) => {
      eventBusFixture = await createRealEventBusFixture();
      if (stored === null) localStorage.removeItem(viewModeStorageKey);
      else localStorage.setItem(viewModeStorageKey, stored);

      service = new KeyBrowserService({
        eventBus: eventBusFixture.eventBus,
        localStorage,
      });
      service.init();

      expect(service.getCurrentState()).toMatchObject({
        revision: 0,
        mode: "grid",
      });
      expect(localStorage.getItem(viewModeStorageKey)).toBe(stored);
    },
  );

  it.each(["owner-first", "ui-first"])(
    "delivers persisted state and toggle broadcasts in %s startup order",
    async (startupOrder) => {
      mountKeyGrid();
      eventBusFixture = await createRealEventBusFixture();
      localStorage.setItem(persistedStorageKey, "true");
      localStorage.setItem(viewModeStorageKey, "categorized");
      const publications = [];
      eventBusFixture.eventBus.on("key-browser:state-changed", (state) => {
        publications.push({
          state,
          persistedMode: localStorage.getItem(viewModeStorageKey),
        });
      });

      service = new KeyBrowserService({
        eventBus: eventBusFixture.eventBus,
        localStorage,
      });
      ui = new KeyBrowserUI({
        eventBus: eventBusFixture.eventBus,
        document,
        i18n: { t: (key) => key },
      });
      ui._cacheDataState(coordinatorState());
      const render = vi.spyOn(ui, "render").mockResolvedValue(undefined);
      const request = vi.spyOn(ui, "request");

      if (startupOrder === "owner-first") {
        service.init();
        ui.init();
      } else {
        ui.init();
        service.init();
      }

      await vi.waitFor(() => {
        expect(
          ui.cache.keyBrowserViewState?.collapsedCategories.command,
        ).toContain(persistedCategory);
      });
      await vi.waitFor(() => expect(render).toHaveBeenCalledOnce());

      const authorityEpoch = service.getCurrentState().authorityEpoch;
      expect(service.getCurrentState()).toMatchObject({
        authorityEpoch,
        revision: 0,
        mode: "categorized",
      });
      expect(ui.cache.keyBrowserViewState).toMatchObject({
        authorityEpoch,
        revision: 0,
        mode: "categorized",
      });
      expect(ui.getCurrentViewMode()).toBe("categorized");
      expect(localStorage.getItem(viewModeStorageKey)).toBe("categorized");
      expect(service.getCurrentState().collapsedCategories.command).toContain(
        persistedCategory,
      );
      expect(ui.pendingInitialRender).toBe(false);
      expect(request).not.toHaveBeenCalled();

      const category = await ui.createKeyCategoryElement(
        toggleCategory,
        {
          name: "Integration probe",
          icon: "fas fa-folder",
          keys: ["F1"],
        },
        "command",
      );
      document.getElementById("keyGrid")?.appendChild(category);
      const header = category.querySelector("h4");
      const commands = category.querySelector(".category-commands");

      expect(header?.classList).not.toContain("collapsed");
      expect(commands?.classList).not.toContain("collapsed");

      await ui.toggleKeyCategory(toggleCategory, category, "command");

      expect(localStorage.getItem(toggleStorageKey)).toBe("true");
      expect(service.getCurrentState().collapsedCategories.command).toContain(
        toggleCategory,
      );
      expect(
        ui.cache.keyBrowserViewState?.collapsedCategories.command,
      ).toContain(toggleCategory);
      expect(ui.cache.keyBrowserViewState).toMatchObject({
        authorityEpoch,
        revision: 1,
      });
      expect(header?.classList).toContain("collapsed");
      expect(commands?.classList).toContain("collapsed");

      await ui.toggleKeyCategory(toggleCategory, category, "command");

      expect(localStorage.getItem(toggleStorageKey)).toBe("false");
      expect(
        service.getCurrentState().collapsedCategories.command,
      ).not.toContain(toggleCategory);
      expect(
        ui.cache.keyBrowserViewState?.collapsedCategories.command,
      ).not.toContain(toggleCategory);
      expect(ui.cache.keyBrowserViewState).toMatchObject({
        authorityEpoch,
        revision: 2,
      });
      expect(header?.classList).not.toContain("collapsed");
      expect(commands?.classList).not.toContain("collapsed");

      expect(request.mock.calls.map(([topic]) => topic)).toEqual([
        "key:toggle-category",
        "key:toggle-category",
      ]);
      expect(request).not.toHaveBeenCalledWith("key:get-all-sectional");
      expect(request).not.toHaveBeenCalledWith("key:get-category-state");

      render.mockClear();
      await ui.toggleKeyView();
      await vi.waitFor(() => {
        expect(service.getCurrentState()).toMatchObject({
          authorityEpoch,
          revision: 3,
          mode: "key-types",
        });
        expect(ui.cache.keyBrowserViewState).toMatchObject({
          authorityEpoch,
          revision: 3,
          mode: "key-types",
        });
      });
      expect(localStorage.getItem(viewModeStorageKey)).toBe("key-types");
      expect(publications.at(-1)).toMatchObject({
        state: { revision: 3, mode: "key-types" },
        persistedMode: "key-types",
      });
      expect(render).toHaveBeenCalledOnce();
      expect(request).toHaveBeenLastCalledWith("key:cycle-view-mode");

      localStorage.removeItem(toggleStorageKey);
      expect(localStorage.getItem(toggleStorageKey)).toBeNull();
    },
  );

  it("reconciles category and bindset toggles across two live UIs", async () => {
    document.body.innerHTML = `
      <div id="keyGrid">
        <div id="first-grid"></div>
        <div id="second-grid"></div>
      </div>
    `;
    eventBusFixture = await createRealEventBusFixture();
    localStorage.setItem(viewModeStorageKey, "grid");
    service = new KeyBrowserService({
      eventBus: eventBusFixture.eventBus,
      localStorage,
    });
    ui = new KeyBrowserUI({
      eventBus: eventBusFixture.eventBus,
      document,
      i18n: { t: (key) => key },
    });
    secondUi = new KeyBrowserUI({
      eventBus: eventBusFixture.eventBus,
      document,
      i18n: { t: (key) => key },
    });
    ui._cacheDataState(coordinatorState());
    secondUi._cacheDataState(coordinatorState());
    const firstRender = vi.spyOn(ui, "render").mockResolvedValue(undefined);
    const secondRender = vi
      .spyOn(secondUi, "render")
      .mockResolvedValue(undefined);

    service.init();
    ui.init();
    secondUi.init();

    await vi.waitFor(() => {
      expect(ui.cache.keyBrowserViewState?.revision).toBe(0);
      expect(secondUi.cache.keyBrowserViewState?.revision).toBe(0);
    });

    const categoryData = {
      name: "Shared category",
      icon: "fas fa-folder",
      keys: [],
    };
    const firstCategory = await ui.createKeyCategoryElement(
      sharedCategory,
      categoryData,
      "command",
    );
    const secondCategory = await secondUi.createKeyCategoryElement(
      sharedCategory,
      categoryData,
      "command",
    );
    const sectionData = {
      name: sharedBindset,
      keys: [],
      keyCount: 0,
      isCollapsed: false,
    };
    const firstBindset = await ui.createBindsetSectionElement(
      sharedBindset,
      sectionData,
    );
    const secondBindset = await secondUi.createBindsetSectionElement(
      sharedBindset,
      sectionData,
    );
    document.getElementById("first-grid")?.append(firstCategory, firstBindset);
    document
      .getElementById("second-grid")
      ?.append(secondCategory, secondBindset);

    await ui.toggleKeyCategory(sharedCategory, firstCategory, "command");

    expect(localStorage.getItem(sharedCategoryStorageKey)).toBe("true");
    expect(firstCategory.querySelector("h4")?.classList).toContain("collapsed");
    expect(secondCategory.querySelector("h4")?.classList).toContain(
      "collapsed",
    );
    expect(
      secondCategory.querySelector(".category-commands")?.classList,
    ).toContain("collapsed");
    expect(ui.cache.keyBrowserViewState?.revision).toBe(1);
    expect(secondUi.cache.keyBrowserViewState).toEqual(
      ui.cache.keyBrowserViewState,
    );

    await secondUi.toggleKeyCategory(sharedCategory, secondCategory, "command");

    expect(localStorage.getItem(sharedCategoryStorageKey)).toBe("false");
    expect(firstCategory.querySelector("h4")?.classList).not.toContain(
      "collapsed",
    );
    expect(secondCategory.querySelector("h4")?.classList).not.toContain(
      "collapsed",
    );
    expect(ui.cache.keyBrowserViewState?.revision).toBe(2);

    await ui.toggleBindsetSection(sharedBindset, firstBindset);

    expect(localStorage.getItem(sharedBindsetStorageKey)).toBe("true");
    for (const bindset of [firstBindset, secondBindset]) {
      expect(bindset.querySelector(".bindset-header")?.classList).toContain(
        "collapsed",
      );
      expect(bindset.querySelector(".bindset-content")?.classList).toContain(
        "collapsed",
      );
      expect(bindset.querySelector(".twisty")?.classList).toContain(
        "collapsed",
      );
    }
    expect(ui.cache.keyBrowserViewState?.revision).toBe(3);
    expect(secondUi.cache.keyBrowserViewState).toEqual(
      ui.cache.keyBrowserViewState,
    );

    await secondUi.toggleBindsetSection(sharedBindset, secondBindset);

    expect(localStorage.getItem(sharedBindsetStorageKey)).toBe("false");
    for (const bindset of [firstBindset, secondBindset]) {
      expect(bindset.querySelector(".bindset-header")?.classList).not.toContain(
        "collapsed",
      );
      expect(
        bindset.querySelector(".bindset-content")?.classList,
      ).not.toContain("collapsed");
      expect(bindset.querySelector(".twisty")?.classList).not.toContain(
        "collapsed",
      );
    }
    expect(ui.cache.keyBrowserViewState?.revision).toBe(4);
    expect(secondUi.cache.keyBrowserViewState).toEqual(
      ui.cache.keyBrowserViewState,
    );

    firstRender.mockClear();
    secondRender.mockClear();
    for (const [index, actor] of [ui, secondUi, ui].entries()) {
      const expectedMode = nextViewMode[service.getCurrentState().mode];
      await actor.toggleKeyView();
      await vi.waitFor(() => {
        expect(service.getCurrentState()).toMatchObject({
          revision: 5 + index,
          mode: expectedMode,
        });
        expect(ui.cache.keyBrowserViewState).toEqual(service.getCurrentState());
        expect(secondUi.cache.keyBrowserViewState).toEqual(
          service.getCurrentState(),
        );
      });
      expect(localStorage.getItem(viewModeStorageKey)).toBe(expectedMode);
    }
    expect(service.getCurrentState()).toMatchObject({
      revision: 7,
      mode: "grid",
    });
    expect(firstRender).toHaveBeenCalledTimes(3);
    expect(secondRender).toHaveBeenCalledTimes(3);
  });
});
