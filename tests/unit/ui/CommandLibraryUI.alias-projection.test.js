import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import CommandLibraryUI from "../../../src/js/components/ui/CommandLibraryUI.js";
import CommandPresentationService from "../../../src/js/components/services/CommandPresentationService.js";
import { respond } from "../../../src/js/core/requestResponse.js";
import { createServiceFixture } from "../../fixtures/index.js";
import { createDataCoordinatorState } from "../../fixtures/core/componentState.js";

const i18n = {
  t: (key, options = {}) =>
    options.environment ? `${key}:${options.environment}` : key,
};

function stateWithAlias(aliasName, description = "User alias") {
  const profile = {
    id: "profile-one",
    name: "Profile One",
    builds: { space: { keys: {} }, ground: { keys: {} } },
    aliases: {
      [aliasName]: { commands: ["FireAll"], description },
    },
    vertigoSettings: {
      selectedEffects: { space: ["Bloom"], ground: [] },
      showPlayerSay: false,
    },
  };
  return createDataCoordinatorState({
    authorityEpoch: 10,
    revision: 1,
    currentProfileData: profile,
    profiles: { "profile-one": profile },
  });
}

function presentationState({
  authorityEpoch = 20,
  revision = 1,
  collapsedCategories = [],
} = {}) {
  return {
    authorityEpoch,
    revision,
    collapsedCategories,
    collapsedGroups: [],
  };
}

describe("CommandLibraryUI alias projection", () => {
  let fixture;
  let ui;
  let presentationService;
  let detachResponders;

  beforeEach(() => {
    document.body.innerHTML = `
      <input id="commandSearch" value="">
      <div id="commandCategoriesList"></div>
      <div id="aliasCategoriesList"></div>
    `;
    localStorage.clear();
    fixture = createServiceFixture();
    detachResponders = [];
    ui = new CommandLibraryUI({
      eventBus: fixture.eventBus,
      document,
      i18n,
    });
    ui.cache.commandPresentationState = presentationState();
    ui._getAliasDisplayName = vi.fn(async (name) => name);
  });

  afterEach(() => {
    if (!ui.destroyed) ui.destroy();
    if (presentationService && !presentationService.destroyed) {
      presentationService.destroy();
    }
    detachResponders.splice(0).forEach((detach) => detach());
    fixture.destroy();
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it("renders a frozen accepted snapshot without either retired state query", async () => {
    const aliasName = 'A&B <probe data-owned="true">';
    const description = '"><img id="alias-injection-probe">';
    expect(ui._cacheDataState(stateWithAlias(aliasName, description))).toBe(
      true,
    );
    const request = vi.spyOn(ui, "request");

    await ui.updateCommandLibrary();

    const item = Array.from(document.querySelectorAll(".alias-item")).find(
      (candidate) => candidate.dataset.alias === aliasName,
    );
    expect(Object.isFrozen(ui.cache.dataState)).toBe(true);
    expect(item?.dataset.alias).toBe(aliasName);
    expect(item?.textContent).toContain(aliasName);
    expect(item?.title).toBe(description);
    expect(document.querySelector("probe")).toBeNull();
    expect(document.getElementById("alias-injection-probe")).toBeNull();
    const requestedTopics = request.mock.calls.map(([topic]) => topic);
    expect(requestedTopics).not.toContain("command:get-combined-aliases");
    expect(requestedTopics).not.toContain("vfx:get-virtual-aliases");
  });

  it("leaves static and alias containers untouched until the owner publishes", async () => {
    ui.cache.commandPresentationState = null;
    ui._cacheDataState(stateWithAlias("WaitingAlias"));
    ui.init();

    expect(
      document.getElementById("commandCategoriesList")?.children,
    ).toHaveLength(0);
    expect(
      document.getElementById("aliasCategoriesList")?.children,
    ).toHaveLength(0);

    fixture.eventBus.emit(
      "command-presentation:state-changed",
      presentationState(),
    );
    await vi.waitFor(() => {
      expect(
        document.querySelector('[data-alias="WaitingAlias"]'),
      ).toBeTruthy();
    });
    expect(
      document.getElementById("commandCategoriesList")?.children.length,
    ).toBeGreaterThan(0);
  });

  it("contains a synchronous category request failure when the owner is absent", () => {
    const request = vi.spyOn(ui, "request").mockImplementation(() => {
      throw new Error("owner unavailable");
    });

    expect(() => ui.toggleCommandCategory("system")).not.toThrow();
    expect(request).toHaveBeenCalledExactlyOnceWith(
      "command-presentation:toggle-category",
      { categoryId: "system" },
    );
  });

  it("passes translated generated-message preferences into the VFX projection", async () => {
    const state = stateWithAlias("UserAlias");
    state.currentProfileData.vertigoSettings.showPlayerSay = true;
    state.profiles["profile-one"].vertigoSettings.showPlayerSay = true;
    ui.i18n = {
      t: (key, options = {}) =>
        key === "vfx_suppression_loaded"
          ? "Suppression traduite"
          : options.environment
            ? `${key}:${options.environment}`
            : key,
    };
    ui.cache.preferences.translateGeneratedMessages = true;
    ui._cacheDataState(state);
    const category = vi.spyOn(ui, "createAliasCategoryElement");

    await ui.updateCommandLibrary();

    const vfxAliases = category.mock.calls.find(
      (call) => call[1] === "vertigo-aliases",
    )?.[0];
    expect(
      vfxAliases.find(([name]) => name === "dynFxSetFXExclusionList_Space")?.[1]
        .commands,
    ).toEqual([
      "dynFxSetFXExlusionList Bloom",
      "PlayerSay Suppression traduite",
    ]);
  });

  it("preserves alias clicks while owner publications alone project collapse", async () => {
    ui._cacheDataState(stateWithAlias("Engage", "Engage description"));
    ui.setupEventListeners();
    await ui.updateCommandLibrary();

    const item = document.querySelector('[data-alias="Engage"]');
    const category = item?.closest(".category");
    const header = category?.querySelector("h4");
    const commands = category?.querySelector(".category-commands");
    const itemHandler = fixture.eventBus.onDom.mock.calls.find(
      (call) => call[0] === category,
    )?.[2];
    const headerHandler = fixture.eventBus.onDom.mock.calls.find(
      (call) => call[0] === header,
    )?.[2];
    const request = vi
      .spyOn(ui, "request")
      .mockRejectedValue(new Error("persistence unavailable"));

    itemHandler({ target: item });
    expect(
      fixture.eventBusFixture.getEventsOfType("command-add").at(-1).data,
    ).toMatchObject({
      commandDef: {
        command: "Engage",
        type: undefined,
        icon: "🎭",
        text: "Engage",
        description: "Engage description",
        isUserAlias: true,
        isVfxAlias: false,
      },
    });

    headerHandler();
    await Promise.resolve();
    expect(request).toHaveBeenCalledWith(
      "command-presentation:toggle-category",
      { categoryId: "aliases" },
    );
    expect(
      localStorage.getItem("commandCategory_aliases_collapsed"),
    ).toBeNull();
    expect(header?.classList).not.toContain("collapsed");
    expect(commands?.classList).not.toContain("collapsed");

    fixture.eventBus.emit(
      "command-presentation:state-changed",
      presentationState({ revision: 2, collapsedCategories: ["aliases"] }),
    );
    expect(header?.classList).toContain("collapsed");
    expect(commands?.classList).toContain("collapsed");

    fixture.eventBus.emit(
      "command-presentation:state-changed",
      presentationState({ revision: 1, collapsedCategories: [] }),
    );
    expect(header?.classList).toContain("collapsed");

    fixture.eventBus.emit(
      "command-presentation:state-changed",
      presentationState({
        authorityEpoch: 21,
        revision: 0,
        collapsedCategories: [],
      }),
    );
    expect(header?.classList).not.toContain("collapsed");
  });

  it("completes owner-first static and delayed alias rendering from one accepted snapshot", async () => {
    localStorage.setItem("commandCategory_custom_collapsed", "true");
    localStorage.setItem("commandCategory_aliases_collapsed", "true");
    presentationService = new CommandPresentationService({
      eventBus: fixture.eventBus,
      localStorage,
    });
    presentationService.init();
    ui.cache.commandPresentationState = null;
    ui._cacheDataState(stateWithAlias("LateAlias"));
    const releases = [];
    ui._getAliasDisplayName = vi.fn(
      (name) =>
        new Promise((resolve) => {
          releases.push(() => resolve(name));
        }),
    );

    ui.init();
    await vi.waitFor(() => expect(releases.length).toBeGreaterThan(0));
    expect(
      document.querySelector('[data-category="custom"] h4')?.classList,
    ).toContain("collapsed");

    releases.forEach((release) => release());
    await vi.waitFor(() => {
      expect(document.querySelector('[data-alias="LateAlias"]')).toBeTruthy();
    });
    expect(
      document.querySelector('[data-category="aliases"] h4')?.classList,
    ).toContain("collapsed");
    expect(ui.cache.commandPresentationState).toMatchObject({
      revision: 0,
      collapsedCategories: ["aliases", "custom"],
    });
  });

  it("cannot install predecessor collapse state after delayed alias work", async () => {
    ui.cache.commandPresentationState = presentationState({
      collapsedCategories: ["aliases", "custom"],
    });
    ui._cacheDataState(stateWithAlias("PendingAlias"));
    ui.initialized = true;
    ui.setupEventListeners();
    const releases = [];
    ui._getAliasDisplayName = vi.fn(
      (name) =>
        new Promise((resolve) => {
          releases.push(() => resolve(name));
        }),
    );

    const render = ui.setupCommandLibrary();
    await vi.waitFor(() => expect(releases.length).toBeGreaterThan(0));
    fixture.eventBus.emit(
      "command-presentation:state-changed",
      presentationState({ revision: 2, collapsedCategories: [] }),
    );
    releases.forEach((release) => release());
    await render;

    expect(
      document.querySelector('[data-category="custom"] h4')?.classList,
    ).not.toContain("collapsed");
    expect(
      document.querySelector('[data-category="aliases"] h4')?.classList,
    ).not.toContain("collapsed");
  });

  it("clears predecessor DOM when a replacement authority is pre-ready", async () => {
    ui._cacheDataState(stateWithAlias("OldAlias"));
    await ui.updateCommandLibrary();
    expect(document.querySelector('[data-alias="OldAlias"]')).toBeTruthy();

    ui._cacheDataState(
      createDataCoordinatorState({
        authorityEpoch: 11,
        ready: false,
        revision: 0,
      }),
    );
    await ui.updateCommandLibrary();

    expect(
      document.getElementById("aliasCategoriesList")?.children,
    ).toHaveLength(0);
  });

  it("invalidates an async alias render when destroyed", async () => {
    ui._cacheDataState(stateWithAlias("PendingAlias"));
    const container = document.getElementById("aliasCategoriesList");
    const sentinel = document.createElement("div");
    sentinel.id = "sentinel";
    container?.appendChild(sentinel);

    const releases = [];
    ui._getAliasDisplayName = vi.fn(
      (name) =>
        new Promise((resolve) => {
          releases.push(() => resolve(name));
        }),
    );
    const render = ui.updateCommandLibrary();
    expect(releases).toHaveLength(3);

    ui.destroy();
    releases.forEach((release) => release());
    await render;

    expect(document.getElementById("sentinel")).toBe(sentinel);
    expect(document.querySelector('[data-alias="PendingAlias"]')).toBeNull();
  });

  it("reattaches exactly one data-state render listener on same-instance reinit", async () => {
    detachResponders.push(
      respond(fixture.eventBus, "command:filter-library", () => true),
    );
    const update = vi
      .spyOn(ui, "updateCommandLibrary")
      .mockResolvedValue(undefined);

    ui.init();
    await vi.waitFor(() => expect(ui._rebuilding).toBe(false));
    update.mockClear();
    fixture.eventBus.emit("data:state-changed", {
      reason: "initial-load",
      state: stateWithAlias("FirstAlias"),
    });
    expect(update).toHaveBeenCalledOnce();

    ui.destroy();
    ui.init();
    await vi.waitFor(() => expect(ui._rebuilding).toBe(false));
    update.mockClear();
    fixture.eventBus.emit("data:state-changed", {
      reason: "profile-updated",
      state: createDataCoordinatorState({
        ...stateWithAlias("SecondAlias"),
        revision: 2,
      }),
    });
    expect(update).toHaveBeenCalledOnce();
  });

  it("clears alias DOM for a pre-ready DataCoordinator late-join reply", async () => {
    ui._cacheDataState(stateWithAlias("OldAlias"));
    await ui.updateCommandLibrary();
    expect(document.querySelector('[data-alias="OldAlias"]')).toBeTruthy();

    ui._handleInitialState({
      sender: "DataCoordinator",
      state: createDataCoordinatorState({
        authorityEpoch: 12,
        ready: false,
        revision: 0,
      }),
    });
    ui.handleInitialState({
      sender: "DataCoordinator",
      state: ui.cache.dataState,
    });
    ui.init();

    await vi.waitFor(() => {
      expect(
        document.getElementById("aliasCategoriesList")?.children,
      ).toHaveLength(0);
    });
  });
});
