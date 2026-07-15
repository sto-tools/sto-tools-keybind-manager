import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import KeyBrowserUI from "../../../src/js/components/ui/KeyBrowserUI.js";
import { respond } from "../../../src/js/core/requestResponse.js";
import {
  createLocalStorageFixture,
  createServiceFixture,
} from "../../fixtures/index.js";

function createDomFixture() {
  document.body.innerHTML = `
    <div class="key-selector-container">
      <button id="toggleKeyViewBtn"><i></i></button>
      <div id="keyGrid"></div>
    </div>
  `;
  return { cleanup: () => (document.body.innerHTML = "") };
}

describe("KeyBrowserUI", () => {
  let fixture, eventBus, ui, dom, storageFixture;

  beforeEach(() => {
    dom = createDomFixture();
    fixture = createServiceFixture();
    eventBus = fixture.eventBus;
    storageFixture = createLocalStorageFixture();

    vi.stubGlobal("requestAnimationFrame", (cb) => cb());

    // Mock KeyBrowserService endpoints that the UI now delegates to
    respond(eventBus, "key:sort", ({ keys }) => {
      return keys ? keys.sort() : [];
    });

    respond(eventBus, "key:filter", ({ keys, filter }) => {
      if (!keys) return [];
      if (!filter) return keys;
      return keys.filter((key) =>
        key.toLowerCase().includes(filter.toLowerCase()),
      );
    });

    respond(eventBus, "key:categorize-by-command", ({ allKeys }) => {
      return {
        unknown: {
          name: "Unknown",
          icon: "fas fa-question-circle",
          keys: allKeys || [],
          priority: 0,
        },
      };
    });

    respond(eventBus, "key:categorize-by-type", ({ allKeys }) => {
      return {
        function: {
          name: "Function Keys",
          icon: "fas fa-keyboard",
          keys: [],
          priority: 1,
        },
        alphanumeric: {
          name: "Letters & Numbers",
          icon: "fas fa-font",
          keys: [],
          priority: 2,
        },
        other: {
          name: "Other Keys",
          icon: "fas fa-question-circle",
          keys: allKeys || [],
          priority: 9,
        },
      };
    });

    respond(eventBus, "key:compare", ({ keyA, keyB }) => {
      return keyA.localeCompare(keyB);
    });

    respond(eventBus, "key:detect-types", ({ keyName }) => {
      if (/^F\d+$/.test(keyName)) return ["function"];
      if (/^[A-Z0-9]$/.test(keyName)) return ["alphanumeric"];
      return ["other"];
    });

    respond(eventBus, "key:toggle-category", () => {
      return true;
    });

    respond(eventBus, "key:get-category-state", () => {
      return false; // Mock collapsed state
    });

    ui = new KeyBrowserUI({
      eventBus,
      document,
      i18n: { t: (key) => key },
    });
    ui.init();
  });

  afterEach(() => {
    dom.cleanup();
    fixture.destroy();
    storageFixture.destroy();
    vi.restoreAllMocks();
  });

  it("toggleKeyView should cycle view modes and store in localStorage", () => {
    const btn = document.getElementById("toggleKeyViewBtn");

    expect(localStorage.getItem("keyViewMode") || "grid").toBe("grid");

    ui.toggleKeyView(); // grid -> categorized
    expect(localStorage.getItem("keyViewMode")).toBe("categorized");
    expect(btn.querySelector("i").className).toContain("fa-sitemap");

    ui.toggleKeyView(); // categorized -> key-types
    expect(localStorage.getItem("keyViewMode")).toBe("key-types");

    ui.toggleKeyView(); // key-types -> grid
    expect(localStorage.getItem("keyViewMode")).toBe("grid");
  });

  it("toggleVisibility should hide and show container based on environment", async () => {
    const container = document.querySelector(".key-selector-container");

    ui.toggleVisibility("alias");
    // Wait for rAF
    await new Promise((r) => setTimeout(r, 0));
    expect(container.style.display).toBe("none");

    ui.toggleVisibility("space");
    await new Promise((r) => setTimeout(r, 0));
    expect(container.style.display).not.toBe("none");
  });

  it("renders bindset command categories from category objects", async () => {
    const content = document.createElement("div");
    const categoryData = {
      name: "Combat",
      icon: "fas fa-fire",
      keys: ["F1"],
      priority: 1,
    };

    vi.spyOn(ui, "categorizeKeys").mockResolvedValue({ combat: categoryData });
    vi.spyOn(ui, "createKeyElement").mockImplementation((key) => {
      const element = document.createElement("button");
      element.dataset.key = key;
      return element;
    });

    await ui.renderCommandCategoryViewForKeys(
      content,
      { F1: ["FireAll"] },
      ["F1"],
      { F1: ["FireAll"] },
    );

    expect(ui.createKeyElement).toHaveBeenCalledWith("F1", ["FireAll"]);
    expect(content.querySelector(".category-header")?.textContent).toBe(
      "combat",
    );
    expect(content.querySelector('[data-key="F1"]')).not.toBeNull();
  });
});
