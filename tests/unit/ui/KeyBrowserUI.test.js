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
      <button id="keySearchBtn" aria-pressed="false"></button>
      <input id="keyFilter" />
      <button id="showAllKeysBtn"></button>
      <div id="keyGrid"></div>
    </div>
  `;
  return { cleanup: () => (document.body.innerHTML = "") };
}

describe("KeyBrowserUI", () => {
  let fixture, eventBus, ui, dom, storageFixture;
  let categorizeByType;

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

    categorizeByType = vi.fn(({ allKeys }) => {
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
    respond(eventBus, "key:categorize-by-type", categorizeByType);

    respond(eventBus, "key:toggle-category", () => {
      return true;
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

  it("requests a mode cycle and waits for accepted owner snapshots to update the button", async () => {
    const btn = document.getElementById("toggleKeyViewBtn");
    const icon = btn.querySelector("i");
    const request = vi.spyOn(ui, "request").mockResolvedValue("categorized");
    const render = vi.spyOn(ui, "render").mockResolvedValue(undefined);
    localStorage.setItem("keyViewMode", "key-types");

    eventBus.emit("key-browser:state-changed", {
      authorityEpoch: 10,
      revision: 0,
      mode: "grid",
      collapsedCategories: { command: [], keyType: [] },
      collapsedBindsets: [],
    });

    expect(ui.getCurrentViewMode()).toBe("grid");
    expect(icon.className).toBe("fas fa-list");
    expect(btn.title).toBe("switch_to_categorized_view");

    await ui.toggleKeyView();
    expect(request).toHaveBeenCalledWith("key:cycle-view-mode");

    expect(ui.getCurrentViewMode()).toBe("grid");
    expect(icon.className).toBe("fas fa-list");
    expect(render).not.toHaveBeenCalled();

    eventBus.emit("key-browser:state-changed", {
      authorityEpoch: 10,
      revision: 1,
      mode: "categorized",
      collapsedCategories: { command: [], keyType: [] },
      collapsedBindsets: [],
    });
    expect(ui.getCurrentViewMode()).toBe("categorized");
    expect(icon.className).toBe("fas fa-sitemap");
    expect(btn.title).toBe("switch_to_key_type_view");

    eventBus.emit("key-browser:state-changed", {
      authorityEpoch: 10,
      revision: 2,
      mode: "key-types",
      collapsedCategories: { command: [], keyType: [] },
      collapsedBindsets: [],
    });
    expect(ui.getCurrentViewMode()).toBe("key-types");
    expect(icon.className).toBe("fas fa-th");
    expect(btn.title).toBe("switch_to_grid_view");

    eventBus.emit("key-browser:state-changed", {
      authorityEpoch: 10,
      revision: 3,
      mode: "grid",
      collapsedCategories: { command: [], keyType: [] },
      collapsedBindsets: [],
    });
    expect(icon.className).toBe("fas fa-list");
    expect(btn.title).toBe("switch_to_categorized_view");
    expect(localStorage.getItem("keyViewMode")).toBe("key-types");
    expect(render).not.toHaveBeenCalled();
  });

  it("preserves the legacy application environment guard", async () => {
    const request = vi.spyOn(ui, "request").mockResolvedValue("categorized");

    ui.app = { currentEnvironment: "alias" };
    await ui.toggleKeyView();
    expect(request).not.toHaveBeenCalled();

    ui.app.currentEnvironment = "space";
    await ui.toggleKeyView();
    expect(request).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledWith("key:cycle-view-mode");
  });

  it("handles a rejected mode-cycle request from the DOM click path", async () => {
    const failure = new Error("view mode persistence unavailable");
    vi.spyOn(ui, "request").mockRejectedValue(failure);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    const clickHandler = eventBus.onDom.mock.calls.find(
      ([target, event]) => target === "toggleKeyViewBtn" && event === "click",
    )?.[2];
    expect(clickHandler).toBeTypeOf("function");
    clickHandler();

    await vi.waitFor(() => {
      expect(error).toHaveBeenCalledWith(
        "[KeyBrowserUI] Failed to cycle key view mode:",
        failure,
      );
    });
  });

  it("reprojects the accepted mode title when the language changes", () => {
    let language = "en";
    ui.i18n = { t: (key) => `${language}:${key}` };
    const render = vi.spyOn(ui, "render").mockResolvedValue(undefined);
    const btn = document.getElementById("toggleKeyViewBtn");

    eventBus.emit("key-browser:state-changed", {
      authorityEpoch: 11,
      revision: 0,
      mode: "categorized",
      collapsedCategories: { command: [], keyType: [] },
      collapsedBindsets: [],
    });
    expect(btn.title).toBe("en:switch_to_key_type_view");

    language = "fr";
    eventBus.emit("language:changed", { language: "fr" });

    expect(btn.title).toBe("fr:switch_to_key_type_view");
    expect(btn.querySelector("i").className).toBe("fas fa-sitemap");
    expect(ui.getCurrentViewMode()).toBe("categorized");
    expect(render).toHaveBeenCalledOnce();
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

  it("filters rendered keys, commands, and empty categories case-insensitively", () => {
    const grid = document.getElementById("keyGrid");
    grid.innerHTML = `
      <section class="category" data-category="function">
        <button class="key-item" data-key="F1"></button>
        <div class="command-item" data-key="F1"></div>
      </section>
      <section class="category" data-category="letter">
        <button class="key-item" data-key="A"></button>
        <div class="command-item" data-key="A"></div>
      </section>
    `;

    ui.filterKeys("f1");

    expect(grid.querySelector('.key-item[data-key="F1"]').style.display).toBe(
      "flex",
    );
    expect(grid.querySelector('.key-item[data-key="A"]').style.display).toBe(
      "none",
    );
    expect(
      grid.querySelector('.command-item[data-key="F1"]').style.display,
    ).toBe("flex");
    expect(
      grid.querySelector('.command-item[data-key="A"]').style.display,
    ).toBe("none");
    expect(grid.querySelector('[data-category="function"]').style.display).toBe(
      "block",
    );
    expect(grid.querySelector('[data-category="letter"]').style.display).toBe(
      "none",
    );
    expect(document.getElementById("keySearchBtn").classList).toContain(
      "active",
    );
    expect(
      document.getElementById("keySearchBtn").getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("shows every rendered key and clears the active filter state", () => {
    const grid = document.getElementById("keyGrid");
    const filterInput = document.getElementById("keyFilter");
    grid.innerHTML = `
      <section class="category" data-category="function">
        <button class="key-item" data-key="F1"></button>
        <div class="command-item" data-key="F1"></div>
      </section>
      <section class="category" data-category="letter">
        <button class="key-item" data-key="A"></button>
        <div class="command-item" data-key="A"></div>
      </section>
    `;
    filterInput.value = "F1";
    ui.filterKeys(filterInput.value);

    ui.showAllKeys();

    for (const item of grid.querySelectorAll(
      ".key-item, .command-item[data-key]",
    )) {
      expect(item.style.display).toBe("flex");
    }
    for (const category of grid.querySelectorAll(".category")) {
      expect(category.style.display).toBe("block");
    }
    expect(filterInput.value).toBe("");
    expect(document.getElementById("keySearchBtn").classList).not.toContain(
      "active",
    );
    expect(
      document.getElementById("keySearchBtn").getAttribute("aria-pressed"),
    ).toBe("false");
  });

  it("clears the rendered filter directly when Escape is pressed", () => {
    const grid = document.getElementById("keyGrid");
    const filterInput = document.getElementById("keyFilter");
    grid.innerHTML = `
      <section class="category" data-category="function">
        <button class="key-item" data-key="F1"></button>
        <div class="command-item" data-key="F1"></div>
      </section>
      <section class="category" data-category="letter">
        <button class="key-item" data-key="A"></button>
        <div class="command-item" data-key="A"></div>
      </section>
    `;
    filterInput.value = "F1";
    filterInput.classList.add("expanded");
    ui.filterKeys("F1");
    const retiredHandler = vi.fn();
    const detachRetired = eventBus.on("key:filter", retiredHandler);

    const keydownRegistration = eventBus.onDom.mock.calls.find(
      ([target, event]) => target === "keyFilter" && event === "keydown",
    );
    expect(keydownRegistration).toBeTruthy();
    keydownRegistration[2]({
      target: filterInput,
      key: "Escape",
      preventDefault: vi.fn(),
    });

    expect(filterInput.value).toBe("");
    expect(filterInput.classList).not.toContain("expanded");
    for (const item of grid.querySelectorAll(
      ".key-item, .command-item[data-key]",
    )) {
      expect(item.style.display).toBe("flex");
    }
    for (const category of grid.querySelectorAll(".category")) {
      expect(category.style.display).toBe("block");
    }
    expect(document.getElementById("keySearchBtn").classList).not.toContain(
      "active",
    );
    expect(retiredHandler).not.toHaveBeenCalled();
    detachRetired();
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

  it("renders bindset key types through the batch categorization contract", async () => {
    const content = document.createElement("div");
    vi.spyOn(ui, "createKeyElement").mockImplementation((key) => {
      const element = document.createElement("button");
      element.dataset.key = key;
      return element;
    });

    await ui.renderKeyTypeViewForKeys(content, {}, ["F1"], { F1: ["FireAll"] });

    expect(categorizeByType).toHaveBeenCalledWith({
      keysWithCommands: { F1: ["FireAll"] },
      allKeys: ["F1"],
    });
    expect(ui.createKeyElement).toHaveBeenCalledWith("F1", ["FireAll"]);
    expect(content.querySelector('[data-key="F1"]')).not.toBeNull();
  });
});
