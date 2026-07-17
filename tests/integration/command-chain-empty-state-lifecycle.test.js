import { afterEach, describe, expect, it, vi } from "vitest";

import ComponentBase from "../../src/js/components/ComponentBase.js";
import CommandChainUI from "../../src/js/components/ui/CommandChainUI.js";
import { createSelectionState } from "../fixtures/core/componentState.js";
import { createEventBusFixture } from "../fixtures/core/eventBus.js";
import {
  commandChainI18n,
  createCommandChainCoordinatorState as coordinatorState,
  createCommandChainProfile as createProfile,
  mountCommandChain,
  retiredEmptyStateTopic,
} from "../fixtures/ui/commandChain.js";

// This accepted-state suite consolidates the requirements formerly split
// across the mocked empty-state, environment-switching, title-fix, and
// space-to-ground UI suites. Selection clearing itself remains owned and
// covered by SelectionService; this suite verifies the resulting visible UI.

describe("CommandChainUI accepted-state empty-state lifecycle", () => {
  let fixture;
  let ui;
  let owners;

  function createUI() {
    fixture = fixture || createEventBusFixture();
    ui = new CommandChainUI({
      eventBus: fixture.eventBus,
      document,
      i18n: commandChainI18n,
      ui: { initDragAndDrop: vi.fn() },
    });
    return ui;
  }

  function rejectUnexpectedRequests() {
    ui.request = vi.fn(async (topic) => {
      throw new Error(`Unexpected request: ${topic}`);
    });
    return ui.request;
  }

  afterEach(() => {
    if (ui && !ui.destroyed) ui.destroy();
    for (const owner of (owners || []).reverse()) {
      if (!owner.destroyed) owner.destroy();
    }
    fixture?.destroy();
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it.each([
    {
      environment: "space",
      title: "Select a key to edit",
      preview: "Select a key to see the generated command",
      emptyTitle: "No key selected",
      description: "Select a key from the left panel",
      icon: "fa-keyboard",
    },
    {
      environment: "alias",
      title: "Select an alias to edit",
      preview: "Select an alias to see the generated command",
      emptyTitle: "No alias selected",
      description: "Select an alias from the left panel",
      icon: "fa-mask",
    },
  ])(
    "renders accepted $environment state with no selection without a state query",
    async ({ environment, title, preview, emptyTitle, description, icon }) => {
      mountCommandChain();
      createUI();
      const request = rejectUnexpectedRequests();
      const profile = createProfile();
      ui._cacheDataState(coordinatorState(profile, { environment }));
      ui._cacheSelectionState(
        createSelectionState({
          currentEnvironment: environment,
          selectedKey: null,
          selectedAlias: null,
        }),
      );

      await ui.render();

      expect(document.getElementById("chainTitle")?.textContent).toBe(title);
      expect(document.getElementById("commandPreview")?.textContent).toBe(
        preview,
      );
      expect(document.querySelector("#emptyState h4")?.textContent).toBe(
        emptyTitle,
      );
      expect(document.querySelector("#emptyState p")?.textContent).toBe(
        description,
      );
      expect(document.querySelector("#emptyState i")?.classList).toContain(
        icon,
      );
      expect(request).not.toHaveBeenCalled();
    },
  );

  it("renders a valid selected empty chain entirely from accepted state", async () => {
    mountCommandChain();
    createUI();
    const request = rejectUnexpectedRequests();
    const profile = createProfile({ spaceKeys: { F1: [] } });
    ui._cacheDataState(coordinatorState(profile));
    ui._cacheSelectionState(
      createSelectionState({ selectedKey: "F1", currentEnvironment: "space" }),
    );

    await ui.render();

    expect(document.getElementById("chainTitle")?.textContent).toBe(
      "Command chain: F1",
    );
    expect(document.getElementById("commandPreview")?.textContent).toBe(
      'F1 ""',
    );
    expect(document.getElementById("commandCount")?.textContent).toBe("0");
    expect(document.querySelector("#emptyState h4")?.textContent).toBe(
      "No commands",
    );
    expect(document.querySelector("#emptyState p")?.textContent).toBe(
      "Click Add Command to start building your command chain for F1.",
    );
    expect(request).not.toHaveBeenCalled();
  });

  it.each(["space", "alias"])(
    "renders a profile-owned HTML-shaped %s selection as text",
    async (environment) => {
      mountCommandChain();
      createUI();
      const request = rejectUnexpectedRequests();
      const maliciousName = '<img src=x onerror="globalThis.pwned=true">';
      const profile = createProfile(
        environment === "alias"
          ? { aliases: { [maliciousName]: { commands: [] } } }
          : { spaceKeys: { [maliciousName]: [] } },
      );
      ui._cacheDataState(coordinatorState(profile, { environment }));
      ui._cacheSelectionState(
        createSelectionState({
          currentEnvironment: environment,
          selectedKey: environment === "space" ? maliciousName : null,
          selectedAlias: environment === "alias" ? maliciousName : null,
        }),
      );

      await ui.render();

      expect(document.getElementById("chainTitle")?.textContent).toContain(
        maliciousName,
      );
      expect(document.querySelector("#emptyState p")?.textContent).toContain(
        maliciousName,
      );
      expect(document.querySelector("#commandList img")).toBeNull();
      expect(document.querySelector("#chainTitle img")).toBeNull();
      expect(globalThis.pwned).toBeUndefined();
      expect(request).not.toHaveBeenCalled();
    },
  );

  it("reprojects a named-only selection as stale when bindsets are disabled", async () => {
    mountCommandChain();
    createUI();
    const request = rejectUnexpectedRequests();
    const profile = createProfile({
      bindsets: {
        Weapons: {
          space: { keys: { F9: [] } },
        },
      },
    });
    ui._cacheDataState(coordinatorState(profile));
    ui._cacheSelectionState(
      createSelectionState({ selectedKey: "F9", currentEnvironment: "space" }),
    );
    ui.cache.activeBindset = "Weapons";
    ui.cache.preferences.bindsetsEnabled = true;

    await ui.render();

    expect(document.getElementById("chainTitle")?.textContent).toBe(
      "Command chain: F9",
    );
    expect(document.querySelector("#emptyState h4")?.textContent).toBe(
      "No commands",
    );

    ui.cache.preferences.bindsetsEnabled = false;
    await ui.render();

    expect(document.getElementById("chainTitle")?.textContent).toBe(
      "Select a key to edit",
    );
    expect(document.querySelector("#emptyState h4")?.textContent).toBe(
      "No key selected",
    );
    expect(document.getElementById("commandList")?.textContent).not.toContain(
      "F9",
    );
    expect(request).not.toHaveBeenCalled();
  });

  it("renders a selection absent from accepted state as no selection", async () => {
    mountCommandChain();
    createUI();
    const request = rejectUnexpectedRequests();
    const profile = createProfile({ spaceKeys: { Existing: [] } });
    ui._cacheDataState(coordinatorState(profile));
    ui._cacheSelectionState(
      createSelectionState({
        selectedKey: "DeletedKey",
        currentEnvironment: "space",
      }),
    );

    await ui.render();

    expect(document.getElementById("chainTitle")?.textContent).toBe(
      "Select a key to edit",
    );
    expect(document.getElementById("commandPreview")?.textContent).toBe(
      "Select a key to see the generated command",
    );
    expect(document.getElementById("commandList")?.textContent).not.toContain(
      "DeletedKey",
    );
    expect(request).not.toHaveBeenCalledWith(retiredEmptyStateTopic);
  });

  it("follows live environment and selection broadcasts without leaking the previous chain", async () => {
    mountCommandChain();
    createUI();
    const profile = createProfile({
      spaceKeys: { F1: ["SpaceCommand"] },
      groundKeys: { G1: ["GroundCommand"] },
      aliases: { Engage: { commands: ["AliasCommand"] } },
    });
    rejectUnexpectedRequests();
    ui.createCommandElement = vi.fn(async (command) => {
      const element = document.createElement("div");
      element.textContent =
        typeof command === "string" ? command : command.command;
      return element;
    });
    ui.init();

    fixture.eventBus.emit("data:state-changed", {
      reason: "initial-load",
      state: coordinatorState(profile),
    });
    fixture.eventBus.emit(
      "selection:state-changed",
      createSelectionState({
        selectedKey: "F1",
        currentEnvironment: "space",
      }),
    );
    await vi.waitFor(() => {
      expect(document.getElementById("chainTitle")?.textContent).toBe(
        "Command chain: F1",
      );
    });

    fixture.eventBus.emit("environment:changed", { environment: "ground" });
    fixture.eventBus.emit(
      "selection:state-changed",
      createSelectionState({ currentEnvironment: "ground" }),
    );
    await vi.waitFor(() => {
      expect(document.getElementById("chainTitle")?.textContent).toBe(
        "Select a key to edit",
      );
      expect(document.body.textContent).not.toContain("F1");
    });

    fixture.eventBus.emit(
      "selection:state-changed",
      createSelectionState({
        selectedKey: "G1",
        currentEnvironment: "ground",
      }),
    );
    await vi.waitFor(() => {
      expect(document.getElementById("chainTitle")?.textContent).toBe(
        "Command chain: G1",
      );
      expect(document.getElementById("commandList")?.textContent).toBe(
        "GroundCommand",
      );
    });

    fixture.eventBus.emit("environment:changed", { environment: "alias" });
    fixture.eventBus.emit(
      "selection:state-changed",
      createSelectionState({
        selectedAlias: "Engage",
        currentEnvironment: "alias",
      }),
    );
    await vi.waitFor(() => {
      expect(document.getElementById("chainTitle")?.textContent).toBe(
        "Alias chain: Engage",
      );
      expect(document.getElementById("commandList")?.textContent).toBe(
        "AliasCommand",
      );
      expect(document.body.textContent).not.toContain("G1");
    });
  });

  it("reattaches one command-chain signal listener after same-instance re-init", async () => {
    mountCommandChain();
    createUI();
    const request = rejectUnexpectedRequests();

    ui.init();

    expect(fixture.eventBus.getListenerCount("chain-data-changed")).toBe(1);
    expect(fixture.eventBus.getListenerCount("data:state-changed")).toBe(2);
    expect(fixture.eventBus.getListenerCount("selection:state-changed")).toBe(
      2,
    );
    expect(fixture.eventBus.getListenerCount("key-selected")).toBe(2);

    ui.destroy();

    expect(fixture.eventBus.getListenerCount("chain-data-changed")).toBe(0);
    expect(fixture.eventBus.getListenerCount("data:state-changed")).toBe(0);
    expect(fixture.eventBus.getListenerCount("selection:state-changed")).toBe(
      0,
    );
    expect(fixture.eventBus.getListenerCount("key-selected")).toBe(0);

    ui.init();

    expect(fixture.eventBus.getListenerCount("chain-data-changed")).toBe(1);
    expect(fixture.eventBus.getListenerCount("data:state-changed")).toBe(2);
    expect(fixture.eventBus.getListenerCount("selection:state-changed")).toBe(
      2,
    );
    expect(fixture.eventBus.getListenerCount("key-selected")).toBe(2);
    expect(ui.pendingInitialRender).toBe(true);

    const profile = createProfile();
    fixture.eventBus.emit("data:state-changed", {
      reason: "initial-load",
      state: coordinatorState(profile, { authorityEpoch: 72 }),
    });
    fixture.eventBus.emit(
      "selection:state-changed",
      createSelectionState({ currentEnvironment: "space" }),
    );

    await vi.waitFor(() => {
      expect(document.getElementById("chainTitle")?.textContent).toBe(
        "Select a key to edit",
      );
    });
    expect(ui.pendingInitialRender).toBe(false);
    expect(request).not.toHaveBeenCalled();
  });

  it("paints one coherent owner-first late-join state without a query", async () => {
    mountCommandChain();
    fixture = createEventBusFixture();
    const profile = createProfile();
    const dataState = coordinatorState(profile, {
      authorityEpoch: 80,
      revision: 4,
    });
    const selectionState = createSelectionState({
      currentEnvironment: "space",
    });

    class DataCoordinator extends ComponentBase {
      getCurrentState() {
        return dataState;
      }
    }

    class SelectionService extends ComponentBase {
      getCurrentState() {
        return selectionState;
      }
    }

    owners = [
      new DataCoordinator(fixture.eventBus),
      new SelectionService(fixture.eventBus),
    ];
    for (const owner of owners) owner.init();
    createUI();
    const request = rejectUnexpectedRequests();
    const render = vi.spyOn(ui, "render");

    ui.init();

    await vi.waitFor(() => expect(render).toHaveBeenCalledOnce());
    expect(ui.cache.dataState).toMatchObject({
      authorityEpoch: 80,
      revision: 4,
    });
    expect(document.getElementById("chainTitle")?.textContent).toBe(
      "Select a key to edit",
    );
    expect(document.querySelector("#emptyState h4")?.textContent).toBe(
      "No key selected",
    );
    expect(ui.pendingInitialRender).toBe(false);
    expect(request).not.toHaveBeenCalled();
  });

  it.each(["data-first", "selection-first"])(
    "paints one coherent UI-first state when %s owner broadcasts first",
    async (order) => {
      mountCommandChain();
      fixture = createEventBusFixture();
      createUI();
      const request = rejectUnexpectedRequests();
      const render = vi.spyOn(ui, "render");
      ui.init();

      const profile = createProfile();
      const dataState = coordinatorState(profile, {
        authorityEpoch: 81,
        revision: 1,
      });
      const selectionState = createSelectionState({
        currentEnvironment: "space",
      });

      class DataCoordinator extends ComponentBase {
        onInit() {
          this.emit("data:state-changed", {
            reason: "initial-load",
            state: dataState,
          });
        }

        getCurrentState() {
          return dataState;
        }
      }

      class SelectionService extends ComponentBase {
        onInit() {
          this.emit("selection:state-changed", selectionState);
        }

        getCurrentState() {
          return selectionState;
        }
      }

      const dataOwner = new DataCoordinator(fixture.eventBus);
      const selectionOwner = new SelectionService(fixture.eventBus);
      owners =
        order === "data-first"
          ? [dataOwner, selectionOwner]
          : [selectionOwner, dataOwner];
      for (const owner of owners) owner.init();

      await vi.waitFor(() => expect(render).toHaveBeenCalledOnce());
      expect(ui.cache.dataState).toMatchObject({
        authorityEpoch: 81,
        revision: 1,
      });
      expect(document.getElementById("chainTitle")?.textContent).toBe(
        "Select a key to edit",
      );
      expect(document.querySelector("#emptyState h4")?.textContent).toBe(
        "No key selected",
      );
      expect(ui.pendingInitialRender).toBe(false);
      expect(request).not.toHaveBeenCalled();
    },
  );
});
