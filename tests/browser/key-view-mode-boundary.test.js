import { describe, expect, it, vi } from "vitest";

import { request } from "../../src/js/core/requestResponse.js";

describe("Key view mode checked-bundle boundary", () => {
  it("cycles through every owned mode and restores the starting mode", async () => {
    const ui = window.keyBrowserUI;
    const service = window.keyBrowserService;
    const bus = window.eventBus;
    const toggle = document.getElementById("toggleKeyViewBtn");
    const storageKey = "keyViewMode";
    const beforeStored = localStorage.getItem(storageKey);

    expect(ui?.isInitialized?.()).toBe(true);
    expect(service?.isInitialized?.()).toBe(true);
    expect(bus).toBeTruthy();
    expect(toggle).toBeInstanceOf(HTMLButtonElement);
    if (!ui || !service || !bus || !(toggle instanceof HTMLButtonElement))
      return;
    expect(Object.hasOwn(ui, "app")).toBe(false);
    expect(bus.hasListeners("key-view:mode-changed")).toBe(false);
    expect(bus.hasListeners("rpc:key:cycle-view-mode")).toBe(true);

    const start = service.getCurrentState();
    const startingEnvironment = ui.cache.currentEnvironment;
    const nextMode = {
      grid: "categorized",
      categorized: "key-types",
      "key-types": "grid",
    };
    const projectionByMode = {
      grid: {
        iconClass: "fas fa-list",
        titleKey: "switch_to_categorized_view",
      },
      categorized: {
        iconClass: "fas fa-sitemap",
        titleKey: "switch_to_key_type_view",
      },
      "key-types": {
        iconClass: "fas fa-th",
        titleKey: "switch_to_grid_view",
      },
    };

    try {
      await bus.emit("environment:changed", { environment: "alias" });
      await vi.waitFor(() => {
        expect(ui.cache.currentEnvironment).toBe("alias");
      });
      toggle.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(service.getCurrentState()).toEqual(start);
      expect(localStorage.getItem(storageKey)).toBe(beforeStored);

      await bus.emit("environment:changed", {
        environment: startingEnvironment,
      });
      await vi.waitFor(() => {
        expect(ui.cache.currentEnvironment).toBe(startingEnvironment);
      });

      let expectedMode = start.mode;
      for (let offset = 1; offset <= 3; offset += 1) {
        expectedMode = nextMode[expectedMode];
        toggle.click();
        await vi.waitFor(() => {
          expect(service.getCurrentState()).toMatchObject({
            revision: start.revision + offset,
            mode: expectedMode,
          });
          expect(ui.cache.keyBrowserViewState).toEqual(
            service.getCurrentState(),
          );
        });
        expect(localStorage.getItem(storageKey)).toBe(expectedMode);
        const expectedProjection = projectionByMode[expectedMode];
        expect(toggle.querySelector("i")?.className).toBe(
          expectedProjection.iconClass,
        );
        expect(toggle.title).toBe(ui.i18n.t(expectedProjection.titleKey));
      }
      expect(service.getCurrentState().mode).toBe(start.mode);
    } finally {
      if (ui.cache.currentEnvironment !== startingEnvironment) {
        await bus.emit("environment:changed", {
          environment: startingEnvironment,
        });
      }
      for (let attempts = 0; attempts < 2; attempts += 1) {
        if (service.getCurrentState().mode === start.mode) break;
        await request(bus, "key:cycle-view-mode");
      }
      if (beforeStored === null) localStorage.removeItem(storageKey);
      else localStorage.setItem(storageKey, beforeStored);
    }

    expect(localStorage.getItem(storageKey)).toBe(beforeStored);
    expect(service.getCurrentState()).toEqual({
      ...start,
      revision: start.revision + 3,
    });
    expect(ui.cache.keyBrowserViewState).toEqual(service.getCurrentState());
  });
});
