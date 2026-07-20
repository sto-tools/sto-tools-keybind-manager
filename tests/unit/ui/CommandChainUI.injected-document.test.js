import { JSDOM } from "jsdom";
import { afterEach, describe, expect, it, vi } from "vitest";

import CommandChainUI from "../../../src/js/components/ui/CommandChainUI.js";
import { createRealEventBusFixture } from "../../fixtures/core/eventBus.js";

const markup = `
  <button id="stabilizeExecutionOrderBtn"><span>stabilize</span></button>
  <button id="copyAliasBtn"><span>alias</span></button>
  <button id="copyPreviewBtn"><span>preview</span></button>
  <div id="commandList"><button class="probe-row">row</button></div>
`;

describe("CommandChainUI injected document listeners", () => {
  let fixture;
  let realm;
  let ui;

  afterEach(() => {
    if (ui && !ui.destroyed) ui.destroy();
    fixture?.destroy();
    realm?.window.close();
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it("binds, tears down, and rebinds one listener set in the injected realm", async () => {
    document.body.innerHTML = markup;
    realm = new JSDOM(`<!doctype html><body>${markup}</body>`, {
      url: "https://injected.example",
    });
    fixture = await createRealEventBusFixture();
    const injectedDocument = realm.window.document;
    const onDom = vi.spyOn(fixture.eventBus, "onDom");
    const detachDragAndDrop = vi.fn();
    const initDragAndDrop = vi.fn(() => detachDragAndDrop);
    ui = new CommandChainUI({
      eventBus: fixture.eventBus,
      document: injectedDocument,
      i18n: { t: (key) => key },
      ui: { initDragAndDrop },
    });
    const toggle = vi.spyOn(ui, "toggleStabilize").mockResolvedValue();
    const copyAlias = vi.spyOn(ui, "copyAliasToClipboard").mockResolvedValue();
    const copyPreview = vi
      .spyOn(ui, "copyCommandPreviewToClipboard")
      .mockResolvedValue();
    const interaction = vi
      .spyOn(ui, "handleCommandChainInteraction")
      .mockResolvedValue();

    ui.setupEventListeners();

    const listenerTargets = onDom.mock.calls.map(([target]) => target);
    expect(
      onDom.mock.calls.every(([target]) => typeof target !== "string"),
    ).toBe(true);
    expect(new Set(listenerTargets).size).toBe(4);
    expect(listenerTargets[3]).toBe(listenerTargets[4]);
    expect(listenerTargets.every((target) => Object.isFrozen(target))).toBe(
      true,
    );
    expect(initDragAndDrop).toHaveBeenCalledExactlyOnceWith(
      injectedDocument.getElementById("commandList"),
      expect.any(Object),
    );

    document.querySelector("#stabilizeExecutionOrderBtn span").click();
    document.querySelector("#copyAliasBtn span").click();
    document.querySelector("#copyPreviewBtn span").click();
    document.querySelector("#commandList .probe-row").click();
    expect(toggle).not.toHaveBeenCalled();
    expect(copyAlias).not.toHaveBeenCalled();
    expect(copyPreview).not.toHaveBeenCalled();
    expect(interaction).not.toHaveBeenCalled();

    injectedDocument.querySelector("#stabilizeExecutionOrderBtn span").click();
    injectedDocument.querySelector("#copyAliasBtn span").click();
    injectedDocument.querySelector("#copyPreviewBtn span").click();
    injectedDocument.querySelector("#commandList .probe-row").click();
    injectedDocument
      .querySelector("#commandList .probe-row")
      .dispatchEvent(
        new realm.window.MouseEvent("dblclick", { bubbles: true }),
      );
    await vi.waitFor(() => {
      expect(toggle).toHaveBeenCalledOnce();
      expect(copyAlias).toHaveBeenCalledOnce();
      expect(copyPreview).toHaveBeenCalledOnce();
      expect(interaction).toHaveBeenCalledTimes(2);
    });

    ui.destroy();
    expect(detachDragAndDrop).toHaveBeenCalledOnce();
    toggle.mockClear();
    copyAlias.mockClear();
    copyPreview.mockClear();
    interaction.mockClear();
    injectedDocument.querySelector("#stabilizeExecutionOrderBtn span").click();
    injectedDocument.querySelector("#copyAliasBtn span").click();
    injectedDocument.querySelector("#copyPreviewBtn span").click();
    injectedDocument.querySelector("#commandList .probe-row").click();
    expect(toggle).not.toHaveBeenCalled();
    expect(copyAlias).not.toHaveBeenCalled();
    expect(copyPreview).not.toHaveBeenCalled();
    expect(interaction).not.toHaveBeenCalled();

    ui.init();
    ui.init();
    expect(onDom).toHaveBeenCalledTimes(10);
    expect(initDragAndDrop).toHaveBeenCalledTimes(2);
    injectedDocument.querySelector("#stabilizeExecutionOrderBtn span").click();
    injectedDocument.querySelector("#copyAliasBtn span").click();
    injectedDocument.querySelector("#copyPreviewBtn span").click();
    injectedDocument.querySelector("#commandList .probe-row").click();
    await vi.waitFor(() => {
      expect(toggle).toHaveBeenCalledOnce();
      expect(copyAlias).toHaveBeenCalledOnce();
      expect(copyPreview).toHaveBeenCalledOnce();
      expect(interaction).toHaveBeenCalledOnce();
    });
  });
});
