import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import CommandChainUI from "../../../src/js/components/ui/CommandChainUI.js";
import { createCommandChainInteractionState } from "../../../src/js/components/ui/commandChainInteractionPolicy.js";
import { createEventBusFixture } from "../../fixtures/core/eventBus.js";
import {
  commandChainI18n,
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
    ui.render = vi.fn().mockResolvedValue(undefined);
  });

  afterEach(() => {
    if (ui && !ui.destroyed) ui.destroy();
    fixture?.destroy();
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it.each(["replacement", "destroy"])(
    "does not repaint after owner settlement once authority ends by %s",
    async (settlement) => {
      const commands = ["+TrayExecByTray 1 0"];
      const state = createCommandChainInteractionState({
        renderToken: 11,
        commandCount: commands.length,
      });
      ui._renderGeneration = 11;
      ui._committedInteractionState = state;
      ui.getCommandsForCurrentSelection = vi.fn().mockResolvedValue(commands);
      const requestSettlement = deferred();
      ui.request = vi.fn(() => requestSettlement.promise);

      const update = ui.updateCommandPalindromicSetting(
        0,
        "palindromicGeneration",
        false,
        state.renderToken,
      );
      await vi.waitFor(() => expect(ui.request).toHaveBeenCalledOnce());

      if (settlement === "replacement") {
        ui._renderGeneration = 12;
        ui._committedInteractionState = createCommandChainInteractionState({
          renderToken: 12,
          commandCount: commands.length,
        });
      } else {
        ui.destroy();
      }
      requestSettlement.resolve({ success: true });
      await update;

      expect(ui.render).not.toHaveBeenCalled();
    },
  );
});
