import { afterEach, describe, expect, it, vi } from "vitest";

import ImportUI from "../../../src/js/components/ui/ImportUI.js";

describe("ImportUI extracted lifecycle facade", () => {
  let ui;

  afterEach(() => {
    if (ui && !ui.destroyed) ui.destroy();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.body.replaceChildren();
  });

  it("keeps retired modal implementation and state APIs absent", () => {
    ui = new ImportUI({ document, i18n: { t: (key) => key } });

    for (const method of [
      "showProgressModal",
      "hideProgressModal",
      "createProgressModal",
      "regenerateProgressModal",
      "promptBindsetSelection",
      "createBindsetSelectionModal",
      "regenerateBindsetSelectionModal",
      "createEnhancedBindsetSelectionModal",
      "createSingleBindsetSelectionModal",
      "setupSingleBindsetSelection",
      "updateSingleBindsetSelection",
      "setupPreviewUpdates",
      "initializeTableStructure",
      "addThirdColumnCell",
      "removeThirdColumnCell",
      "validateBindsetConfiguration",
      "validateSingleBindsetConfiguration",
      "regenerateEnhancedBindsetSelectionModal",
      "createImportModal",
      "regenerateImportModal",
      "createAliasStrategyModal",
      "regenerateAliasStrategyModal",
      "createOverwriteConfirmationModal",
      "regenerateOverwriteConfirmationModal",
    ]) {
      expect(
        /** @type {Record<string, unknown>} */ (ui)[method],
      ).toBeUndefined();
    }

    for (const field of [
      "currentImportModal",
      "currentAliasStrategyModal",
      "currentOverwriteConfirmModal",
    ]) {
      expect(ui).not.toHaveProperty(field);
    }

    expect(ui.decisionModalSession).toBeTruthy();
    expect(ui.importFileSession).toBeTruthy();
    expect(ui.kbfImportSession).toBeTruthy();
  });

  it("releases an active picker and decision prompt on facade destruction", async () => {
    vi.stubGlobal("requestAnimationFrame", (callback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    ui = new ImportUI({ document, i18n: { t: (key) => key } });
    await ui.openFileDialog("keybinds");
    const input = document.querySelector('input[type="file"]');
    const decision = ui.promptEnvironment();
    expect(input).toBeInstanceOf(HTMLInputElement);
    expect(document.getElementById("importModal")).toBeInstanceOf(
      HTMLDivElement,
    );

    ui.destroy();

    await expect(decision).resolves.toBeNull();
    expect(input?.isConnected).toBe(false);
    expect(document.getElementById("importModal")).toBeNull();
    expect(document.querySelector('input[type="file"]')).toBeNull();
  });

  it("routes file-session reader failures through the facade diagnostic sink", async () => {
    const failure = new Error("reader construction failed");
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    ui = new ImportUI({ document, i18n: { t: (key) => key } });
    ui.importFileSession.createFileReader = vi.fn(() => {
      throw failure;
    });

    await ui.openFileDialog("keybinds");
    const input = /** @type {HTMLInputElement} */ (
      document.querySelector('input[type="file"]')
    );
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [new File(["content"], "binds.txt")],
    });
    input.dispatchEvent(new Event("change"));

    expect(consoleError).toHaveBeenCalledWith(
      "[ImportUI] Failed to import file:",
      failure.message,
    );
    expect(input.isConnected).toBe(false);
    expect(ui.importFileSession.isActive).toBe(false);
  });
});
