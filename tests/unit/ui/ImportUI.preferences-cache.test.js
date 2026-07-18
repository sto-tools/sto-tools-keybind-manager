import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ImportUI from "../../../src/js/components/ui/ImportUI.js";
import { createPreferencesState } from "../../fixtures/core/componentState.js";
import { createServiceFixture } from "../../fixtures/index.js";

const parseResult = {
  valid: true,
  bindsetNames: ["Master", "Secondary"],
  bindsetKeyCounts: { Master: 3, Secondary: 2 },
};

describe("ImportUI preferences cache", () => {
  let fixture;
  let ui;

  beforeEach(() => {
    fixture = createServiceFixture();
    ui = new ImportUI({ eventBus: fixture.eventBus, document });
    ui.init();
    vi.stubGlobal("requestAnimationFrame", (callback) => callback());
  });

  afterEach(() => {
    ui?.destroy();
    fixture?.destroy();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("defaults to enabled only until a valid cached setting is available", () => {
    expect(ui.isBindsetsEnabled()).toBe(true);

    fixture.eventBus.emit(
      "preferences:loaded",
      createPreferencesState({ bindsetsEnabled: false }),
    );
    expect(ui.isBindsetsEnabled()).toBe(false);

    fixture.eventBus.emit(
      "preferences:loaded",
      createPreferencesState({ bindsetsEnabled: true }),
    );
    expect(ui.isBindsetsEnabled()).toBe(true);
  });

  it("chooses the single-bindset prompt from cache without querying settings", async () => {
    fixture.eventBus.emit(
      "preferences:loaded",
      createPreferencesState({ bindsetsEnabled: false }),
    );
    const singleModal = document.createElement("div");
    const createSingle = vi
      .spyOn(ui, "createSingleBindsetSelectionModal")
      .mockReturnValue(singleModal);
    const createEnhanced = vi.spyOn(ui, "createEnhancedBindsetSelectionModal");

    const resultPromise = ui.promptEnhancedBindsetSelection(parseResult);

    expect(createSingle).toHaveBeenCalledWith(parseResult);
    expect(createEnhanced).not.toHaveBeenCalled();
    expect(
      fixture
        .getEventHistory()
        .filter(({ event }) => event === "rpc:preferences:get-settings"),
    ).toHaveLength(0);

    // Resolve the focused modal promise without coupling this state-choice test
    // to the separate DOM-control behavior of the modal.
    ui.currentEnhancedBindsetSelectionModal.resolve(null);
    await expect(resultPromise).resolves.toBeNull();
  });

  it("uses the import's accepted bindset mode after the live cache changes", async () => {
    fixture.eventBus.emit(
      "preferences:loaded",
      createPreferencesState({ bindsetsEnabled: true }),
    );
    const singleModal = document.createElement("div");
    const createSingle = vi
      .spyOn(ui, "createSingleBindsetSelectionModal")
      .mockReturnValue(singleModal);
    const createEnhanced = vi.spyOn(ui, "createEnhancedBindsetSelectionModal");

    const resultPromise = ui.promptEnhancedBindsetSelection(parseResult, false);

    expect(createSingle).toHaveBeenCalledWith(parseResult);
    expect(createEnhanced).not.toHaveBeenCalled();
    ui.currentEnhancedBindsetSelectionModal.resolve(null);
    await expect(resultPromise).resolves.toBeNull();
  });
});
