import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import CommandChainUI from "../../../src/js/components/ui/CommandChainUI.js";
import { createCommandChainInteractionState } from "../../../src/js/components/ui/commandChainInteractionPolicy.js";
import { createEventBusFixture } from "../../fixtures/core/eventBus.js";
import { createDataCoordinatorState } from "../../fixtures/core/componentState.js";
import {
  createCommandChainCoordinatorState,
  createCommandChainProfile,
  deferred,
  mountCommandChain,
} from "../../fixtures/ui/commandChain.js";

function presentationState({
  authorityEpoch = 1,
  revision = 1,
  collapsedGroups = [],
} = {}) {
  return {
    authorityEpoch,
    revision,
    collapsedCategories: [],
    collapsedGroups,
  };
}

describe("CommandChainUI command-presentation state", () => {
  let fixture;
  let ui;

  beforeEach(() => {
    mountCommandChain();
    fixture = createEventBusFixture();
    ui = new CommandChainUI({
      eventBus: fixture.eventBus,
      document,
      i18n: { t: (key) => key },
      ui: { showToast: vi.fn() },
    });
  });

  afterEach(() => {
    if (ui && !ui.destroyed) ui.destroy();
    fixture?.destroy();
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  function satisfyOtherOwners() {
    ui._cacheDataState(createDataCoordinatorState({ authorityEpoch: 10 }));
    ui._hasSelectionState = true;
    ui.cache.currentEnvironment = "space";
  }

  function createAuthorizedHeader(groupType = "pivot") {
    const state = createCommandChainInteractionState({
      renderToken: ui._renderGeneration,
      commandCount: 1,
      groups: {
        [groupType]: { commands: [{ index: 0 }] },
      },
    });
    ui._committedInteractionState = state;
    const header = document.createElement("div");
    header.className = "group-header";
    header.dataset.group = groupType;
    header.dataset.renderToken = state.renderToken;
    return header;
  }

  it("requires a complete presentation snapshot before rendering", () => {
    satisfyOtherOwners();

    expect(ui.hasRequiredData()).toBe(false);
    ui.cache.commandPresentationState = presentationState();
    expect(ui.hasRequiredData()).toBe(true);
  });

  it("adopts late join, rejects stale state, and admits a replacement owner", () => {
    const render = vi.spyOn(ui, "render").mockResolvedValue(undefined);
    satisfyOtherOwners();
    ui.eventListenersSetup = true;

    ui.handleInitialState({
      sender: "CommandPresentationService",
      state: presentationState({ revision: 4 }),
    });
    expect(ui.cache.commandPresentationState).toMatchObject({
      authorityEpoch: 1,
      revision: 4,
    });
    expect(render).toHaveBeenCalledOnce();

    expect(
      ui.acceptCommandPresentationState(
        presentationState({ revision: 3, collapsedGroups: ["pivot"] }),
      ),
    ).toBe(false);
    expect(render).toHaveBeenCalledOnce();

    expect(
      ui.acceptCommandPresentationState(
        presentationState({
          authorityEpoch: 2,
          revision: 0,
          collapsedGroups: ["pivot"],
        }),
      ),
    ).toBe(true);
    expect(ui.cache.commandPresentationState).toMatchObject({
      authorityEpoch: 2,
      revision: 0,
      collapsedGroups: ["pivot"],
    });
    expect(render).toHaveBeenCalledTimes(2);
  });

  it("requests group ownership without painting a reply or leaking rejection", async () => {
    satisfyOtherOwners();
    ui.cache.commandPresentationState = presentationState();
    await ui.setupEventListeners();
    const render = vi.spyOn(ui, "render").mockResolvedValue(undefined);
    const request = vi
      .spyOn(ui, "request")
      .mockRejectedValue(new Error("persistence unavailable"));
    const handler = fixture.eventBus.onDom.mock.calls.find(
      ([target, event]) => target === "#commandList" && event === "click",
    )?.[2];
    const header = createAuthorizedHeader();

    handler({
      target: header,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    });
    await vi.waitFor(() => {
      expect(request).toHaveBeenCalledWith(
        "command-presentation:toggle-group",
        { groupType: "pivot" },
      );
    });

    expect(render).not.toHaveBeenCalled();

    fixture.eventBus.emit(
      "command-presentation:state-changed",
      presentationState({ revision: 2, collapsedGroups: ["pivot"] }),
    );
    expect(render).toHaveBeenCalledOnce();
  });

  it("contains a synchronous group request failure when the owner is absent", async () => {
    satisfyOtherOwners();
    ui.cache.commandPresentationState = presentationState();
    await ui.setupEventListeners();
    const request = vi.spyOn(ui, "request").mockImplementation(() => {
      throw new Error("owner unavailable");
    });
    const handler = fixture.eventBus.onDom.mock.calls.find(
      ([target, event]) => target === "#commandList" && event === "click",
    )?.[2];
    const header = createAuthorizedHeader();

    expect(() =>
      handler({
        target: header,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      }),
    ).not.toThrow();
    await Promise.resolve();
    expect(request).toHaveBeenCalledExactlyOnceWith(
      "command-presentation:toggle-group",
      { groupType: "pivot" },
    );
  });

  it("prevents delayed predecessor rendering after a newer collapse snapshot", async () => {
    const profile = createCommandChainProfile({
      spaceKeys: { F1: ["FireAll"] },
      keybindMetadata: {
        space: { F1: { stabilizeExecutionOrder: true } },
      },
    });
    ui._cacheDataState(createCommandChainCoordinatorState(profile));
    ui.cache.selectedKey = "F1";
    ui.cache.currentEnvironment = "space";
    ui.cache.activeBindset = "Primary Bindset";
    ui.cache.preferences = {
      bindsetsEnabled: false,
      bindToAliasMode: false,
    };
    ui.cache.commandPresentationState = presentationState();
    ui._hasSelectionState = true;
    ui.eventListenersSetup = true;
    ui.updateBindToAliasMode = vi.fn().mockResolvedValue(undefined);
    const pendingElement = deferred();
    ui.createCommandElement = vi.fn(() => pendingElement.promise);

    const predecessorRender = ui.render();
    await vi.waitFor(() => expect(ui.createCommandElement).toHaveBeenCalled());
    expect(
      ui.acceptCommandPresentationState(
        presentationState({
          revision: 2,
          collapsedGroups: ["non-trayexec"],
        }),
      ),
    ).toBe(true);
    await vi.waitFor(() => {
      expect(
        document.querySelector(".group-header .twisty")?.classList,
      ).toContain("collapsed");
    });

    const staleElement = document.createElement("div");
    staleElement.id = "stale-command";
    pendingElement.resolve(staleElement);
    await predecessorRender;

    expect(document.getElementById("stale-command")).toBeNull();
    expect(
      document.querySelector(".group-header .twisty")?.classList,
    ).toContain("collapsed");
  });
});
