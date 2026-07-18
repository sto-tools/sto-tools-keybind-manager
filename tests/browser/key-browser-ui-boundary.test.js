import { describe, expect, it, vi } from "vitest";

import { request } from "../../src/js/core/requestResponse.js";

describe("KeyBrowserUI checked-bundle boundary", () => {
  it("persists category collapse through the rendered delegated path", async () => {
    const ui = window.keyBrowserUI;
    const service = window.keyBrowserService;
    const bus = window.eventBus;

    expect(ui?.isInitialized?.()).toBe(true);
    expect(service?.isInitialized?.()).toBe(true);
    expect(bus).toBeTruthy();
    if (!ui || !service || !bus) return;

    const startingMode = service.getCurrentState().mode;
    let storageKey = "";
    let beforeStored = null;
    let categoryId = "";
    let initiallyCollapsed = null;
    try {
      while (service.getCurrentState().mode !== "categorized") {
        await request(bus, "key:cycle-view-mode");
      }
      await vi.waitFor(() => {
        expect(
          document.querySelector("#keyGrid .category h4[data-category]"),
        ).toBeInstanceOf(HTMLElement);
      });
      const header = document.querySelector(
        "#keyGrid .category h4[data-category]",
      );
      expect(header).toBeInstanceOf(HTMLElement);
      if (!(header instanceof HTMLElement)) return;
      categoryId = header.dataset.category || "";
      expect(categoryId).toBeTruthy();
      if (!categoryId) return;
      const commands = header
        .closest(".category")
        ?.querySelector(".category-commands");
      storageKey = `keyCategory_${categoryId}_collapsed`;
      beforeStored = localStorage.getItem(storageKey);
      initiallyCollapsed = service
        .getCurrentState()
        .collapsedCategories.command.includes(categoryId);

      expect(header.classList.contains("collapsed")).toBe(initiallyCollapsed);
      expect(commands?.classList.contains("collapsed")).toBe(
        initiallyCollapsed,
      );

      header.click();
      await vi.waitFor(() => {
        expect(
          service
            .getCurrentState()
            .collapsedCategories.command.includes(categoryId),
        ).toBe(!initiallyCollapsed);
        expect(
          ui.cache.keyBrowserViewState?.collapsedCategories.command.includes(
            categoryId,
          ),
        ).toBe(!initiallyCollapsed);
        expect(header.classList.contains("collapsed")).toBe(
          !initiallyCollapsed,
        );
        expect(commands?.classList.contains("collapsed")).toBe(
          !initiallyCollapsed,
        );
      });

      header.click();
      await vi.waitFor(() => {
        expect(
          service
            .getCurrentState()
            .collapsedCategories.command.includes(categoryId),
        ).toBe(initiallyCollapsed);
        expect(header.classList.contains("collapsed")).toBe(initiallyCollapsed);
        expect(commands?.classList.contains("collapsed")).toBe(
          initiallyCollapsed,
        );
      });
    } finally {
      if (
        categoryId &&
        initiallyCollapsed !== null &&
        service
          .getCurrentState()
          .collapsedCategories.command.includes(categoryId) !==
          initiallyCollapsed
      ) {
        await request(bus, "key:toggle-category", {
          categoryId,
          mode: "command",
        });
      }
      for (let attempts = 0; attempts < 3; attempts += 1) {
        if (service.getCurrentState().mode === startingMode) break;
        await request(bus, "key:cycle-view-mode");
      }
      if (storageKey) {
        if (beforeStored === null) localStorage.removeItem(storageKey);
        else localStorage.setItem(storageKey, beforeStored);
      }
    }

    if (storageKey) expect(localStorage.getItem(storageKey)).toBe(beforeStored);
    if (categoryId && initiallyCollapsed !== null) {
      expect(
        service
          .getCurrentState()
          .collapsedCategories.command.includes(categoryId),
      ).toBe(initiallyCollapsed);
      expect(
        ui.cache.keyBrowserViewState?.collapsedCategories.command.includes(
          categoryId,
        ),
      ).toBe(initiallyCollapsed);
    }
    expect(service.getCurrentState().mode).toBe(startingMode);
  });

  it("selects and filters rendered keys through the delegated grid path", async () => {
    const ui = window.keyBrowserUI;
    const bus = window.eventBus;
    const filter = document.getElementById("keyFilter");

    expect(ui?.isInitialized?.()).toBe(true);
    expect(bus).toBeTruthy();
    expect(filter).toBeInstanceOf(HTMLInputElement);
    if (!ui || !bus || !(filter instanceof HTMLInputElement)) return;

    await ui.render();
    const key = document.querySelector("#keyGrid .key-item[data-key]");
    expect(key).toBeInstanceOf(HTMLElement);
    if (!(key instanceof HTMLElement)) return;
    const keyName = key.dataset.key;
    expect(keyName).toBeTruthy();
    if (!keyName) return;

    const originalSelection = ui.cache.selectedKey;
    const environment = ui.cache.currentEnvironment;
    const originalBindset = ui.cache.activeBindset;
    try {
      key.click();
      await vi.waitFor(() => {
        expect(ui.cache.selectedKey).toBe(keyName);
      });

      filter.value = "__browser_no_matching_key__";
      filter.dispatchEvent(new Event("input", { bubbles: true }));
      await vi.waitFor(() => {
        const renderedKeys = [
          ...document.querySelectorAll("#keyGrid .key-item"),
        ];
        expect(renderedKeys.length).toBeGreaterThan(0);
        expect(
          renderedKeys.every((item) => item.style.display === "none"),
        ).toBe(true);
      });

      filter.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
      await vi.waitFor(() => {
        expect(filter.value).toBe("");
        expect(
          [...document.querySelectorAll("#keyGrid .key-item")].every(
            (item) => item.style.display === "flex",
          ),
        ).toBe(true);
      });
    } finally {
      await request(bus, "selection:select-key", {
        keyName: originalSelection,
        environment,
        bindset: originalBindset === "Primary Bindset" ? null : originalBindset,
        forceEmit: true,
      });
      filter.value = "";
      ui.filterKeys("");
    }

    expect(ui.cache.selectedKey).toBe(originalSelection);
    expect(ui.cache.activeBindset).toBe(originalBindset);
  });
});
