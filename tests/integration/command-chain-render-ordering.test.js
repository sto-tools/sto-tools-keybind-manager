import { afterEach, describe, expect, it, vi } from "vitest";

import CommandChainUI from "../../src/js/components/ui/CommandChainUI.js";
import { createSelectionState } from "../fixtures/core/componentState.js";
import { createEventBusFixture } from "../fixtures/core/eventBus.js";
import {
  commandChainI18n,
  createCommandChainCoordinatorState as coordinatorState,
  createCommandChainProfile as createProfile,
  createCommandElement as commandElement,
  deferred,
  mountCommandChain,
  retiredEmptyStateTopic,
} from "../fixtures/ui/commandChain.js";

describe("CommandChainUI accepted-state render ordering", () => {
  let fixture;
  let ui;

  function createUI() {
    fixture = createEventBusFixture();
    ui = new CommandChainUI({
      eventBus: fixture.eventBus,
      document,
      i18n: commandChainI18n,
      ui: { initDragAndDrop: vi.fn() },
    });
  }

  afterEach(() => {
    if (ui && !ui.destroyed) ui.destroy();
    fixture?.destroy();
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it("prevents delayed preview work from overwriting a newer accepted render", async () => {
    mountCommandChain();
    createUI();
    const oldPreview = deferred();
    const oldProfile = createProfile({
      spaceKeys: { OldKey: ["OldOne", "OldTwo"] },
      keybindMetadata: {
        space: { OldKey: { stabilizeExecutionOrder: true } },
      },
    });
    ui._cacheDataState(coordinatorState(oldProfile, { revision: 1 }));
    ui._cacheSelectionState(
      createSelectionState({
        selectedKey: "OldKey",
        currentEnvironment: "space",
      }),
    );
    ui.createCommandElement = vi.fn(async (command) => commandElement(command));
    ui.request = vi.fn(async (topic, payload) => {
      if (
        topic === "command:generate-mirrored-commands" &&
        payload.commands[0]?.command === "OldOne"
      ) {
        return oldPreview.promise;
      }
      throw new Error(`Unexpected request: ${topic}`);
    });

    const oldRender = ui.render();
    await vi.waitFor(() => {
      expect(ui.request).toHaveBeenCalledWith(
        "command:generate-mirrored-commands",
        expect.objectContaining({
          commands: expect.arrayContaining([
            expect.objectContaining({ command: "OldOne" }),
          ]),
        }),
      );
    });

    const newProfile = createProfile({
      spaceKeys: { NewKey: ["NewCommand"] },
    });
    ui._cacheDataState(coordinatorState(newProfile, { revision: 2 }));
    ui._cacheSelectionState(
      createSelectionState({
        selectedKey: "NewKey",
        currentEnvironment: "space",
      }),
    );
    await ui.render();

    expect(document.getElementById("chainTitle")?.textContent).toBe(
      "Command chain: NewKey",
    );
    expect(document.getElementById("commandPreview")?.textContent).toBe(
      'NewKey "NewCommand"',
    );
    expect(document.getElementById("commandList")?.textContent).toBe(
      "NewCommand",
    );

    oldPreview.resolve("OldOne $$ OldTwo $$ OldOne");
    await oldRender;

    expect(document.getElementById("chainTitle")?.textContent).toBe(
      "Command chain: NewKey",
    );
    expect(document.getElementById("commandPreview")?.textContent).toBe(
      'NewKey "NewCommand"',
    );
    expect(document.getElementById("commandList")?.textContent).toBe(
      "NewCommand",
    );
    expect(ui.request).not.toHaveBeenCalledWith(retiredEmptyStateTopic);
  });

  it("prevents a delayed command element from replacing a newer accepted list", async () => {
    mountCommandChain();
    createUI();
    const oldElement = deferred();
    const oldProfile = createProfile({
      spaceKeys: { OldKey: ["OldCommand"] },
    });
    ui._cacheDataState(coordinatorState(oldProfile, { revision: 1 }));
    ui._cacheSelectionState(
      createSelectionState({
        selectedKey: "OldKey",
        currentEnvironment: "space",
      }),
    );
    ui.request = vi.fn(async (topic) => {
      throw new Error(`Unexpected request: ${topic}`);
    });
    ui.createCommandElement = vi.fn(async (command) => {
      if (command === "OldCommand") return oldElement.promise;
      return commandElement(command);
    });

    const oldRender = ui.render();
    await vi.waitFor(() => {
      expect(ui.createCommandElement).toHaveBeenCalledWith(
        "OldCommand",
        0,
        1,
        null,
        null,
        false,
      );
    });

    const newProfile = createProfile({
      spaceKeys: { NewKey: ["NewCommand"] },
    });
    ui._cacheDataState(coordinatorState(newProfile, { revision: 2 }));
    ui._cacheSelectionState(
      createSelectionState({
        selectedKey: "NewKey",
        currentEnvironment: "space",
      }),
    );
    await ui.render();

    expect(document.getElementById("commandList")?.textContent).toBe(
      "NewCommand",
    );

    oldElement.resolve(commandElement("OldCommand"));
    await oldRender;

    expect(document.getElementById("chainTitle")?.textContent).toBe(
      "Command chain: NewKey",
    );
    expect(document.getElementById("commandPreview")?.textContent).toBe(
      'NewKey "NewCommand"',
    );
    expect(document.getElementById("commandList")?.textContent).toBe(
      "NewCommand",
    );
    expect(ui.request).not.toHaveBeenCalledWith(retiredEmptyStateTopic);
  });

  it("invalidates a pending render when the UI is destroyed", async () => {
    mountCommandChain();
    createUI();
    const oldElement = deferred();
    const profile = createProfile({
      spaceKeys: { PendingKey: ["PendingCommand"] },
    });
    ui._cacheDataState(coordinatorState(profile));
    ui._cacheSelectionState(
      createSelectionState({
        selectedKey: "PendingKey",
        currentEnvironment: "space",
      }),
    );
    ui.request = vi.fn(async (topic) => {
      throw new Error(`Unexpected request: ${topic}`);
    });
    ui.createCommandElement = vi.fn(async () => oldElement.promise);

    const render = ui.render();
    await vi.waitFor(() => expect(ui.createCommandElement).toHaveBeenCalled());
    ui.destroy();
    oldElement.resolve(commandElement("PendingCommand"));
    await render;

    expect(document.getElementById("chainTitle")?.textContent).toBe(
      "Initial title",
    );
    expect(document.getElementById("initial-command-list")?.textContent).toBe(
      "Initial list",
    );
    expect(document.getElementById("commandList")?.textContent).not.toContain(
      "PendingCommand",
    );
    expect(ui.request).not.toHaveBeenCalledWith(retiredEmptyStateTopic);
  });
});
