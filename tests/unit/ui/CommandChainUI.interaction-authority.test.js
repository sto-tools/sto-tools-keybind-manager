import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import CommandChainUI from "../../../src/js/components/ui/CommandChainUI.js";
import { createCommandChainInteractionState } from "../../../src/js/components/ui/commandChainInteractionPolicy.js";
import { createEventBusFixture } from "../../fixtures/core/eventBus.js";
import {
  commandChainI18n,
  createCommandChainCoordinatorState,
  createCommandChainProfile,
  deferred,
  mountCommandChain,
} from "../../fixtures/ui/commandChain.js";

describe("CommandChainUI interaction authority", () => {
  let fixture;
  let ui;

  beforeEach(() => {
    mountCommandChain();
    fixture = createEventBusFixture();
    ui = new CommandChainUI({
      eventBus: fixture.eventBus,
      document,
      i18n: commandChainI18n,
    });
    ui.cache.currentEnvironment = "ground";
    ui.cache.currentProfile = "profile-1";
    ui.cache.selectedKey = "F1";
    ui.cache.activeBindset = "Primary Bindset";
    ui.cache.preferences = { bindsetsEnabled: false };
    const profile = createCommandChainProfile({
      groundKeys: { F1: ["+TrayExecByTray 1 0"] },
    });
    ui._cacheDataState(
      createCommandChainCoordinatorState(profile, {
        authorityEpoch: 7,
        revision: 3,
        environment: "ground",
      }),
    );
    ui.cache.selectedKey = "F1";
    ui.render = vi.fn().mockResolvedValue(undefined);
  });

  afterEach(() => {
    if (ui && !ui.destroyed) ui.destroy();
    fixture?.destroy();
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it("does not render from a successful owner acknowledgement", async () => {
    const state = createCommandChainInteractionState({
      renderToken: 11,
      commandCount: 1,
    });
    ui._renderGeneration = 11;
    ui._committedInteractionState = state;
    const requestSettlement = deferred();
    ui.request = vi.fn(() => requestSettlement.promise);

    const update = ui.applyCommandToggle({
      type: "toggle-palindromic",
      index: 0,
      renderToken: state.renderToken,
      consumeEvent: true,
    });
    await vi.waitFor(() => expect(ui.request).toHaveBeenCalledOnce());
    requestSettlement.resolve({ success: true });
    await update;

    expect(ui.render).not.toHaveBeenCalled();
  });

  it("keeps accepted state unchanged when the owner rejects the update", async () => {
    const state = createCommandChainInteractionState({
      renderToken: 11,
      commandCount: 1,
    });
    ui._renderGeneration = 11;
    ui._committedInteractionState = state;
    const acceptedBefore = structuredClone(ui.cache.dataState);
    const rejection = new Error("durable write failed");
    ui.request = vi.fn().mockRejectedValue(rejection);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    await ui.applyCommandToggle({
      type: "toggle-palindromic",
      index: 0,
      renderToken: state.renderToken,
      consumeEvent: true,
    });

    expect(ui.request).toHaveBeenCalledOnce();
    expect(ui.cache.dataState).toEqual(acceptedBefore);
    expect(ui.render).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith(
      "[CommandChainUI] Failed to update command palindromic setting:",
      rejection,
    );
  });
});
