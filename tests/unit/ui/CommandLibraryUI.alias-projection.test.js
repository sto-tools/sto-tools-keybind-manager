import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import CommandLibraryUI from "../../../src/js/components/ui/CommandLibraryUI.js";
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

describe("CommandLibraryUI alias projection", () => {
  let fixture;
  let ui;
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
    ui._getAliasDisplayName = vi.fn(async (name) => name);
  });

  afterEach(() => {
    if (!ui.destroyed) ui.destroy();
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

  it("preserves alias click payloads and persisted category toggles", async () => {
    ui._cacheDataState(stateWithAlias("Engage", "Engage description"));
    await ui.updateCommandLibrary();

    const item = document.querySelector('[data-alias="Engage"]');
    const category = item?.closest(".category");
    const header = category?.querySelector("h4");
    const commands = category?.querySelector(".category-commands");
    const itemHandler = fixture.eventBus.onDom.mock.calls.find(
      (call) => call[2] === "alias-item-click" && call[0] === category,
    )?.[3];
    const headerHandler = fixture.eventBus.onDom.mock.calls.find(
      (call) => call[2] === "alias-category-header" && call[0] === header,
    )?.[3];

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
    expect(localStorage.getItem("commandCategory_aliases_collapsed")).toBe(
      "true",
    );
    expect(header?.classList).toContain("collapsed");
    expect(commands?.classList).toContain("collapsed");
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
      respond(fixture.eventBus, "command:get-categories", () => ({})),
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

  it("prevents a predecessor library rebuild from crossing destroy and reinit", async () => {
    let phase = "old";
    const releases = { old: [], current: [] };
    detachResponders.push(
      respond(
        fixture.eventBus,
        "command:get-categories",
        () =>
          new Promise((resolve) => {
            releases[phase].push(resolve);
          }),
      ),
      respond(fixture.eventBus, "command:filter-library", () => true),
    );
    vi.spyOn(ui, "updateCommandLibrary").mockResolvedValue(undefined);
    vi.spyOn(ui, "createCategoryElement").mockImplementation((categoryId) => {
      const element = document.createElement("div");
      element.dataset.category = categoryId;
      return element;
    });

    ui.init();
    expect(releases.old).toHaveLength(1);
    ui.destroy();
    phase = "current";
    ui.init();
    expect(releases.current).toHaveLength(1);

    releases.old[0]({ old: { commands: {} } });
    await Promise.resolve();
    await Promise.resolve();
    expect(ui._rebuilding).toBe(true);
    expect(document.querySelector('[data-category="old"]')).toBeNull();

    releases.current[0]({ current: { commands: {} } });
    await vi.waitFor(() => {
      expect(document.querySelector('[data-category="current"]')).toBeTruthy();
      expect(ui._rebuilding).toBe(false);
    });
    expect(document.querySelector('[data-category="old"]')).toBeNull();
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

    await vi.waitFor(() => {
      expect(
        document.getElementById("aliasCategoriesList")?.children,
      ).toHaveLength(0);
    });
  });
});
