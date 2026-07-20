import { afterEach, describe, expect, it, vi } from "vitest";

import CommandChainUI from "../../src/js/components/ui/CommandChainUI.js";
import CommandLibraryUI from "../../src/js/components/ui/CommandLibraryUI.js";
import { createServiceFixture } from "../fixtures/index.js";

describe("command-chain control ownership", () => {
  let fixture;
  let chainUI;
  let libraryUI;
  let originalCommandChainUI;

  afterEach(() => {
    if (chainUI && !chainUI.destroyed) chainUI.destroy();
    if (libraryUI && !libraryUI.destroyed) libraryUI.destroy();
    if (originalCommandChainUI === undefined) {
      delete globalThis.commandChainUI;
    } else {
      globalThis.commandChainUI = originalCommandChainUI;
    }
    fixture?.destroy();
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it("projects selection-driven action state exactly once through CommandChainUI", () => {
    fixture = createServiceFixture();
    originalCommandChainUI = globalThis.commandChainUI;
    document.body.innerHTML = `
      <button id="stabilizeExecutionOrderBtn"></button>
      <button id="importFromKeyOrAliasBtn"></button>
      <button id="deleteKeyBtn"></button>
      <button id="duplicateKeyBtn"></button>
      <button id="deleteAliasChainBtn"></button>
      <button id="duplicateAliasChainBtn"></button>
    `;
    const i18n = { t: (key) => key };
    chainUI = new CommandChainUI({
      eventBus: fixture.eventBus,
      document,
      i18n,
      ui: { initDragAndDrop: vi.fn() },
    });
    libraryUI = new CommandLibraryUI({
      eventBus: fixture.eventBus,
      document,
      i18n,
    });
    chainUI.reconcileAcceptedState = vi.fn();
    const projectActions = vi.spyOn(chainUI, "updateChainActions");

    chainUI.init();
    libraryUI.init();
    globalThis.commandChainUI = chainUI;
    projectActions.mockClear();

    fixture.eventBus.emit("key-selected", {
      key: "F1",
      environment: "space",
      source: "SelectionService",
    });

    expect(projectActions).toHaveBeenCalledOnce();
    expect(libraryUI).not.toHaveProperty("updateChainActions");
    expect(document.getElementById("deleteKeyBtn")?.disabled).toBe(false);
    expect(document.getElementById("deleteAliasChainBtn")?.disabled).toBe(true);
  });
});
