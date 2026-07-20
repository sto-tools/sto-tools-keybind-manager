import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import CommandChainUI from "../../src/js/components/ui/CommandChainUI.js";
import { createEventBusFixture } from "../fixtures/core/eventBus.js";
import {
  commandChainI18n,
  createCommandChainCoordinatorState,
  createCommandChainProfile,
  deferred,
  mountCommandChain,
} from "../fixtures/ui/commandChain.js";

const presentationState = {
  authorityEpoch: 1,
  revision: 0,
  collapsedCategories: [],
  collapsedGroups: [],
};

function createRenderedRow(
  command,
  index,
  total,
  groupType,
  displayIndex,
  stabilized,
  interactionState,
) {
  const row = document.createElement("div");
  row.className = "command-item-row customizable";
  row.dataset.index = String(index);
  row.dataset.renderToken = interactionState.renderToken;
  if (groupType) row.dataset.group = groupType;
  row.textContent = typeof command === "string" ? command : command.command;

  for (const className of [
    "btn-edit",
    "btn-delete",
    "btn-up",
    "btn-down",
    "btn-palindromic-toggle",
  ]) {
    const button = document.createElement("button");
    button.className = className;
    row.append(button);
  }
  return row;
}

describe("CommandChainUI interaction lifecycle", () => {
  let fixture;
  let ui;
  let initDragAndDrop;
  let detachDragAndDrop;

  beforeEach(() => {
    mountCommandChain();
    fixture = createEventBusFixture();
    detachDragAndDrop = vi.fn();
    initDragAndDrop = vi.fn(() => detachDragAndDrop);
    ui = new CommandChainUI({
      eventBus: fixture.eventBus,
      document,
      i18n: commandChainI18n,
      ui: { initDragAndDrop },
    });
    ui.cache.commandPresentationState = presentationState;
    ui.cache.currentEnvironment = "space";
    ui.cache.selectedKey = "F1";
    ui.cache.activeBindset = "Primary Bindset";
    ui.cache.preferences = {
      bindsetsEnabled: false,
      bindToAliasMode: false,
    };
    ui._hasSelectionState = true;
    ui.updateBindToAliasMode = vi.fn().mockResolvedValue(undefined);
    ui.createCommandElement = vi.fn(createRenderedRow);
    ui.setupEventListeners();
  });

  afterEach(() => {
    if (ui && !ui.destroyed) ui.destroy();
    fixture?.destroy();
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  function acceptCommands(commands, revision) {
    const profile = createCommandChainProfile({
      spaceKeys: { F1: commands },
    });
    ui._cacheDataState(
      createCommandChainCoordinatorState(profile, { revision }),
    );
  }

  function findDomHandler(eventName) {
    return fixture.eventBus.onDom.mock.calls.find(
      ([target, event]) => target === "#commandList" && event === eventName,
    )?.[2];
  }

  function commandInteractions(emit) {
    return emit.mock.calls.filter(([topic]) =>
      topic.startsWith("commandchain:"),
    );
  }

  it("makes predecessor rows and drag state inert when a successor render starts", async () => {
    acceptCommands(["OldOne", "OldTwo"], 1);
    await ui.render();

    const click = findDomHandler("click");
    const doubleClick = findDomHandler("dblclick");
    const onDrop = initDragAndDrop.mock.calls[0][1].onDrop;
    const predecessorRows = [...document.querySelectorAll(".command-item-row")];
    const predecessorToken = predecessorRows[0].dataset.renderToken;
    const successorElement = deferred();
    let successorArguments;
    ui.createCommandElement = vi.fn((...args) => {
      if (!successorArguments) {
        successorArguments = args;
        return successorElement.promise;
      }
      return Promise.resolve(createRenderedRow(...args));
    });

    acceptCommands(["NewOne", "NewTwo"], 2);
    const successorRender = ui.render();
    await vi.waitFor(() => expect(successorArguments).toBeDefined());

    expect(predecessorRows[0].isConnected).toBe(true);
    expect(String(ui._renderGeneration)).not.toBe(predecessorToken);
    const emit = vi.spyOn(ui, "emit");
    emit.mockClear();
    const staleEvent = {
      target: predecessorRows[0].querySelector(".btn-delete"),
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    };

    click(staleEvent);
    doubleClick({ ...staleEvent, target: predecessorRows[0] });
    onDrop(staleEvent, { dragElement: predecessorRows[0] }, predecessorRows[1]);
    await Promise.resolve();

    expect(commandInteractions(emit)).toEqual([]);
    expect(staleEvent.preventDefault).not.toHaveBeenCalled();

    successorElement.resolve(createRenderedRow(...successorArguments));
    await successorRender;

    const currentRows = [...document.querySelectorAll(".command-item-row")];
    const currentEvent = {
      target: currentRows[0].querySelector(".btn-delete"),
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    };
    click(currentEvent);
    doubleClick({ ...currentEvent, target: currentRows[0] });
    onDrop(currentEvent, { dragElement: currentRows[0] }, currentRows[1]);

    expect(commandInteractions(emit)).toEqual([
      ["commandchain:delete", { index: 0 }],
      ["commandchain:edit", { index: 0 }],
      ["commandchain:move", { fromIndex: 0, toIndex: 1 }],
    ]);
    expect(currentEvent.preventDefault).toHaveBeenCalledOnce();
    expect(currentEvent.stopPropagation).toHaveBeenCalledOnce();
  });

  it.each(["replacement", "destroy"])(
    "does not continue a suspended toggle after %s",
    async (settlement) => {
      acceptCommands(["OldOne"], 1);
      await ui.render();
      const click = findDomHandler("click");
      const commandRead = deferred();
      ui.getCommandsForCurrentSelection = vi.fn(() => commandRead.promise);
      ui.updateCommandPalindromicSetting = vi.fn().mockResolvedValue(undefined);
      click({
        target: document.querySelector(".btn-palindromic-toggle"),
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      });
      await vi.waitFor(() => {
        expect(ui.getCommandsForCurrentSelection).toHaveBeenCalledOnce();
      });

      if (settlement === "replacement") {
        acceptCommands(["NewOne"], 2);
        await ui.render();
      } else {
        ui.destroy();
      }
      commandRead.resolve(["OldOne"]);
      await Promise.resolve();
      await Promise.resolve();

      expect(ui.updateCommandPalindromicSetting).not.toHaveBeenCalled();
    },
  );

  it("releases the native drag/drop delegate on destroy", () => {
    ui.destroy();

    expect(detachDragAndDrop).toHaveBeenCalledOnce();
  });
});
