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
    ui.refreshActiveBindset = vi.fn().mockResolvedValue(undefined);
    ui.reconcileAcceptedState = vi.fn();

    ui.init();

    expect(ui.cache.selectedKey).toBe("F8");
    expect(ui.cache.cachedSelections.space).toBe("F8");
    expect(ui.request).not.toHaveBeenCalledWith("key:get-selected");
    expect(fixture.eventBus.hasListeners("rpc:key:get-selected")).toBe(false);
    ui.updateChainActions.mockClear();
    ui.refreshActiveBindset.mockClear();
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
      expect(ui.refreshActiveBindset).toHaveBeenCalledOnce();
      expect(ui.reconcileAcceptedState).toHaveBeenCalledOnce();
    });
    expect(ui.cache.selectedKey).toBe("F9");
    expect(retiredHandler).not.toHaveBeenCalled();
    detachRetired();
  });
});
