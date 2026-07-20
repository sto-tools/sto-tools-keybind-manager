import { afterEach, describe, expect, it, vi } from "vitest";

import CommandChainUI from "../../../src/js/components/ui/CommandChainUI.js";
import SelectionService from "../../../src/js/components/services/SelectionService.js";
import { createEventBusFixture } from "../../fixtures/core/eventBus.js";

describe("CommandChainUI selection state cache", () => {
  const fixtures = [];
  const components = [];

  afterEach(() => {
    for (const component of components.reverse()) {
      if (!component.destroyed) component.destroy();
    }
    components.length = 0;
    for (const fixture of fixtures.splice(0)) fixture.destroy();
  });

  it("hydrates from SelectionService without querying selected state", async () => {
    const fixture = createEventBusFixture();
    fixtures.push(fixture);

    const selectionService = new SelectionService({
      eventBus: fixture.eventBus,
    });
    components.push(selectionService);
    selectionService.init();
    selectionService.cache.selectedKey = "F8";
    selectionService.cachedSelections.space = "F8";

    const ui = new CommandChainUI({
      eventBus: fixture.eventBus,
      document: {
        getElementById: vi.fn(),
        querySelector: vi.fn(),
        createElement: vi.fn(() => ({
          classList: { add: vi.fn(), remove: vi.fn(), toggle: vi.fn() },
          replaceChildren: vi.fn(),
          style: {},
        })),
      },
      i18n: { t: (key) => key },
      ui: { showToast: vi.fn() },
    });
    components.push(ui);
    ui.request = vi.fn().mockResolvedValue(null);
    ui.render = vi.fn().mockResolvedValue(undefined);
    ui.updateChainActions = vi.fn();
    ui.reconcileAcceptedState = vi.fn();

    ui.init();

    expect(ui.cache.selectedKey).toBe("F8");
    expect(ui.cache.cachedSelections.space).toBe("F8");
    expect(ui.request).not.toHaveBeenCalledWith("key:get-selected");
    expect(fixture.eventBus.hasListeners("rpc:key:get-selected")).toBe(false);
    ui.updateChainActions.mockClear();
    ui.reconcileAcceptedState.mockClear();

    const retiredHandler = vi.fn();
    const detachRetired = fixture.eventBus.on(
      "bindset-selector:set-selected-key",
      retiredHandler,
    );
    fixture.eventBus.emit("key-selected", {
      key: "F9",
      environment: "space",
      source: "SelectionService",
    });

    await vi.waitFor(() => {
      expect(ui.updateChainActions).toHaveBeenCalledOnce();
      expect(ui.reconcileAcceptedState).toHaveBeenCalledOnce();
    });
    expect(ui.cache.selectedKey).toBe("F9");
    expect(ui.request).not.toHaveBeenCalledWith(
      "bindset-selector:set-active-bindset",
      expect.anything(),
    );
    expect(retiredHandler).not.toHaveBeenCalled();
    detachRetired();
  });

  it("leaves selector visibility to BindsetSelectorUI", () => {
    const fixture = createEventBusFixture();
    fixtures.push(fixture);
    const selectorContainer = { style: { display: "owned-by-selector" } };
    const document = {
      getElementById: vi.fn((id) =>
        id === "bindsetSelectorContainer" ? selectorContainer : null,
      ),
      querySelector: vi.fn(),
      createElement: vi.fn(() => ({
        classList: { add: vi.fn(), remove: vi.fn(), toggle: vi.fn() },
        replaceChildren: vi.fn(),
        style: {},
      })),
    };
    const ui = new CommandChainUI({
      eventBus: fixture.eventBus,
      document,
      i18n: { t: (key) => key },
    });
    components.push(ui);
    ui.reconcileAcceptedState = vi.fn();
    ui.updateChainActions = vi.fn();
    ui.updatePreviewLabel = vi.fn();

    ui.init();
    document.getElementById.mockClear();
    fixture.eventBus.emit("environment:changed", { environment: "alias" });
    fixture.eventBus.emit("preferences:changed", {
      changes: { bindsetsEnabled: false, bindToAliasMode: false },
    });
    fixture.eventBus.emit("bindsets:changed", {
      names: ["Primary Bindset", "Weapons"],
    });

    expect(document.getElementById).not.toHaveBeenCalledWith(
      "bindsetSelectorContainer",
    );
    expect(selectorContainer.style.display).toBe("owned-by-selector");
  });
});
