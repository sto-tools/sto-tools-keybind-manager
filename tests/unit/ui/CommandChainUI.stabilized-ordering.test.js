import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import CommandChainUI from "../../../src/js/components/ui/CommandChainUI.js";
import { createEventBusFixture } from "../../fixtures/core/eventBus.js";
import {
  commandChainI18n,
  createCommandChainCoordinatorState,
  createCommandChainProfile,
  mountCommandChain,
} from "../../fixtures/ui/commandChain.js";

const presentationState = {
  authorityEpoch: 1,
  revision: 0,
  collapsedCategories: [],
  collapsedGroups: [],
};

describe("CommandChainUI stabilized ordering", () => {
  let fixture;
  let ui;

  beforeEach(() => {
    mountCommandChain();
    fixture = createEventBusFixture();
    fixture.eventBus.mockResponse(
      "parser:parse-command-string",
      ({ commandString }) => ({
        commands: [
          {
            command: commandString,
            displayText: commandString,
            icon: "test-icon",
            category: "test",
            parameters: {},
            signature: "",
            baseCommand: commandString,
            id: commandString,
          },
        ],
      }),
    );
    ui = new CommandChainUI({
      eventBus: fixture.eventBus,
      document,
      i18n: commandChainI18n,
      ui: { initDragAndDrop: vi.fn() },
    });
    ui.cache.commandPresentationState = presentationState;
    ui.cache.currentEnvironment = "space";
    ui.cache.selectedKey = "F1";
    ui.cache.activeBindset = "Primary Bindset";
    ui.cache.preferences = {
      bindsetsEnabled: false,
      bindToAliasMode: false,
    };
    ui.updateBindToAliasMode = vi.fn().mockResolvedValue(undefined);
  });

  afterEach(() => {
    if (ui && !ui.destroyed) ui.destroy();
    fixture?.destroy();
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  function acceptProfile({ stabilized, revision = 1 }) {
    const profile = createCommandChainProfile({
      spaceKeys: {
        F1: ["FireAll", "+TrayExecByTray 1 0", "Target_Enemy_Near"],
      },
      keybindMetadata: {
        space: { F1: { stabilizeExecutionOrder: stabilized } },
      },
    });
    ui._cacheDataState(
      createCommandChainCoordinatorState(profile, { revision }),
    );
  }

  it("materializes first-render button boundaries from the captured groups", async () => {
    acceptProfile({ stabilized: true });

    await ui.render();

    expect(ui._committedInteractionState.groupIndices).toEqual({
      "non-trayexec": [0, 2],
      palindromic: [1],
      pivot: [],
    });
    const rows = [...document.querySelectorAll(".command-item-row")];
    const first = rows.find((row) => row.dataset.index === "0");
    const palindromic = rows.find((row) => row.dataset.index === "1");
    const last = rows.find((row) => row.dataset.index === "2");

    expect(first.querySelector(".btn-up").disabled).toBe(true);
    expect(first.querySelector(".btn-down").disabled).toBe(false);
    expect(last.querySelector(".btn-up").disabled).toBe(false);
    expect(last.querySelector(".btn-down").disabled).toBe(true);
    expect(palindromic.querySelector(".btn-up").disabled).toBe(true);
    expect(palindromic.querySelector(".btn-down").disabled).toBe(true);
  });

  it("commits one shared render token to rows and group headers", async () => {
    acceptProfile({ stabilized: true });

    await ui.render();

    const state = ui._committedInteractionState;
    expect(state.renderToken).toBe(String(ui._renderGeneration));
    for (const element of document.querySelectorAll(
      ".command-item-row, .group-header",
    )) {
      expect(element.dataset.renderToken).toBe(state.renderToken);
    }
  });

  it("replaces stabilized group policy with adjacent unstabilized ordering", async () => {
    acceptProfile({ stabilized: true, revision: 1 });
    await ui.render();

    acceptProfile({ stabilized: false, revision: 2 });
    await ui.render();

    expect(ui._committedInteractionState.groupIndices).toBeNull();
    const rows = [...document.querySelectorAll(".command-item-row")];
    expect(rows.map((row) => row.dataset.group)).toEqual([
      undefined,
      undefined,
      undefined,
    ]);
    expect(rows[0].querySelector(".btn-up").disabled).toBe(true);
    expect(rows[0].querySelector(".btn-down").disabled).toBe(false);
    expect(rows[2].querySelector(".btn-up").disabled).toBe(false);
    expect(rows[2].querySelector(".btn-down").disabled).toBe(true);
  });
});
