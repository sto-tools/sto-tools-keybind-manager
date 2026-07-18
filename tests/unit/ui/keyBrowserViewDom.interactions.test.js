import { afterEach, describe, expect, it, vi } from "vitest";
import { JSDOM } from "jsdom";

import {
  closeBindsetMenus,
  filterKeyGrid,
  readKeyGridAction,
  scheduleKeyBrowserVisibility,
  showAllKeyGridItems,
  toggleBindsetMenu,
  toggleKeySearchInput,
} from "../../../src/js/components/ui/keyBrowserViewDom.js";

const mountGrid = () => {
  document.body.innerHTML = `
    <button id="keySearchBtn" aria-pressed="false"></button>
    <input id="keyFilter">
    <div id="keyGrid">
      <section class="bindset-section" data-bindset="Tactical">
        <button data-action="toggle-bindset" data-bindset="Tactical">
          <span class="toggle-child"></span>
        </button>
        <button data-action="bindset-menu"><i class="menu-child"></i></button>
        <div class="bindset-menu-dropdown"></div>
        <button data-action="select-key" data-key="F1"><span></span></button>
        <button data-action="clone" data-bindset="Tactical"><span></span></button>
      </section>
      <button data-action="toggle-category" data-category="system" data-mode="type">
        <span class="category-child"></span>
      </button>
      <button data-action="select-key" data-key="F2" class="loose-key"></button>
      <button data-action="create" data-bindset="Primary Bindset"></button>
      <button data-action="rename" data-bindset="Tactical"></button>
      <button data-action="delete" data-bindset="Tactical"></button>
    </div>
  `;
  return document.getElementById("keyGrid");
};

describe("keyBrowserViewDom interactions", () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it("decodes delegated grid actions from nested click targets", () => {
    const grid = mountGrid();
    if (!(grid instanceof HTMLElement)) throw new Error("Missing key grid");

    expect(
      readKeyGridAction(grid.querySelector("[data-key='F1'] span"), grid),
    ).toEqual({
      type: "select-key",
      keyName: "F1",
      bindsetName: "Tactical",
    });
    expect(readKeyGridAction(grid.querySelector(".loose-key"), grid)).toEqual({
      type: "select-key",
      keyName: "F2",
      bindsetName: null,
    });
    expect(
      readKeyGridAction(grid.querySelector(".category-child"), grid),
    ).toEqual({
      type: "toggle-category",
      categoryId: "system",
      mode: "type",
    });
    expect(
      readKeyGridAction(grid.querySelector(".toggle-child"), grid),
    ).toEqual({ type: "toggle-bindset", bindsetName: "Tactical" });

    const menu = grid.querySelector(".bindset-menu-dropdown");
    expect(readKeyGridAction(grid.querySelector(".menu-child"), grid)).toEqual({
      type: "toggle-bindset-menu",
      menu,
    });

    for (const [operation, bindsetName] of [
      ["create", "Primary Bindset"],
      ["clone", "Tactical"],
      ["rename", "Tactical"],
      ["delete", "Tactical"],
    ]) {
      const target = grid.querySelector(`[data-action="${operation}"]`);
      expect(readKeyGridAction(target, grid)).toEqual({
        type: "manage-bindset",
        operation,
        bindsetName,
      });
    }
  });

  it("rejects actions outside the grid or without required data", () => {
    const grid = mountGrid();
    if (!(grid instanceof HTMLElement)) throw new Error("Missing key grid");
    const outside = document.createElement("button");
    outside.dataset.action = "select-key";
    outside.dataset.key = "F9";
    document.body.appendChild(outside);
    const incomplete = document.createElement("button");
    incomplete.dataset.action = "toggle-category";
    grid.appendChild(incomplete);

    expect(readKeyGridAction(outside, grid)).toBeNull();
    expect(readKeyGridAction(incomplete, grid)).toBeNull();
    expect(readKeyGridAction(document, grid)).toBeNull();
    expect(readKeyGridAction(null, grid)).toBeNull();
  });

  it("opens one bindset menu at a time and closes the active menu", () => {
    document.body.innerHTML = `
      <div class="bindset-menu-dropdown open" id="first"></div>
      <div class="bindset-menu-dropdown" id="second"></div>
    `;
    const first = document.getElementById("first");
    const second = document.getElementById("second");
    if (!(first instanceof HTMLElement) || !(second instanceof HTMLElement)) {
      throw new Error("Missing bindset menus");
    }

    toggleBindsetMenu(document, second);
    expect(first.classList).not.toContain("open");
    expect(second.classList).toContain("open");

    toggleBindsetMenu(document, second);
    expect(second.classList).not.toContain("open");

    first.classList.add("open");
    second.classList.add("open");
    closeBindsetMenus(document);
    expect(
      document.querySelectorAll(".bindset-menu-dropdown.open"),
    ).toHaveLength(0);
  });

  it("filters categorized key items and hides categories with no matches", () => {
    document.body.innerHTML = `
      <button id="keySearchBtn" aria-pressed="false"></button>
      <div id="keyGrid">
        <section class="category" id="matching-category">
          <div class="key-item" data-key="F1"></div>
          <div class="key-item" data-key="F20"></div>
        </section>
        <section class="category" id="hidden-category">
          <div class="key-item" data-key="Space"></div>
        </section>
        <div class="command-item" data-key="F2"></div>
      </div>
    `;

    filterKeyGrid(document, "f2");

    expect(document.querySelector('[data-key="F1"]').style.display).toBe(
      "none",
    );
    expect(document.querySelector('[data-key="F20"]').style.display).toBe(
      "flex",
    );
    expect(
      document.querySelector('.command-item[data-key="F2"]').style.display,
    ).toBe("flex");
    expect(document.getElementById("matching-category").style.display).toBe(
      "block",
    );
    expect(document.getElementById("hidden-category").style.display).toBe(
      "none",
    );
    expect(document.getElementById("keySearchBtn").classList).toContain(
      "active",
    );
    expect(
      document.getElementById("keySearchBtn").getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("shows all items, clears the filter, and toggles search focus", () => {
    document.body.innerHTML = `
      <button id="keySearchBtn" class="active" aria-pressed="true"></button>
      <input id="keyFilter" class="expanded" value="F2">
      <div id="keyGrid">
        <section class="category" style="display:none">
          <div class="key-item" data-key="F1" style="display:none"></div>
        </section>
      </div>
    `;
    const input = document.getElementById("keyFilter");
    if (!(input instanceof HTMLInputElement)) throw new Error("Missing filter");
    const focus = vi.spyOn(input, "focus");
    const blur = vi.spyOn(input, "blur");

    showAllKeyGridItems(document);

    expect(input.value).toBe("");
    expect(document.querySelector(".key-item").style.display).toBe("flex");
    expect(document.querySelector(".category").style.display).toBe("block");
    expect(document.getElementById("keySearchBtn").classList).not.toContain(
      "active",
    );
    expect(
      document.getElementById("keySearchBtn").getAttribute("aria-pressed"),
    ).toBe("false");

    expect(toggleKeySearchInput(document)).toBe(false);
    expect(blur).toHaveBeenCalledOnce();
    expect(toggleKeySearchInput(document)).toBe(true);
    expect(focus).toHaveBeenCalledOnce();

    input.remove();
    expect(toggleKeySearchInput(document)).toBe(false);
  });

  it("schedules alias visibility without mutating the DOM early", () => {
    document.body.innerHTML = '<div class="key-selector-container"></div>';
    const container = document.querySelector(".key-selector-container");
    const callbacks = [];
    const schedule = vi.fn((callback) => {
      callbacks.push(callback);
      return 1;
    });

    scheduleKeyBrowserVisibility(document, "alias", schedule);
    expect(schedule).toHaveBeenCalledOnce();
    expect(container.style.display).toBe("");

    callbacks.shift()();
    expect(container.style.display).toBe("none");
    expect(container.style.getPropertyPriority("display")).toBe("important");

    scheduleKeyBrowserVisibility(document, "space", (callback) => callback());
    expect(container.style.display).toBe("");
    expect(container.style.getPropertyPriority("display")).toBe("");
  });

  it("warns from the scheduled visibility callback when the container is absent", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    scheduleKeyBrowserVisibility(document, "alias", (callback) => callback());

    expect(warn).toHaveBeenCalledWith(
      "[KeyBrowserUI] Key selector container not found in DOM",
    );
  });

  it("reconciles actions, filtering, search, and visibility in another Window realm", () => {
    const realm = new JSDOM(`<!doctype html><html><body>
      <div class="key-selector-container">
        <button id="keySearchBtn" aria-pressed="false"></button>
        <input id="keyFilter" value="F2">
        <div id="keyGrid">
          <section class="category" id="matching-category">
            <button class="key-item" data-action="select-key" data-key="F20">
              <span class="key-label">F20</span>
            </button>
          </section>
          <section class="category" id="hidden-category">
            <button class="key-item" data-key="Space"></button>
          </section>
        </div>
      </div>
    </body></html>`);
    const injectedDocument = realm.window.document;
    const grid = injectedDocument.getElementById("keyGrid");
    const label = injectedDocument.querySelector(".key-label");
    const input = injectedDocument.getElementById("keyFilter");

    try {
      expect(grid).not.toBeInstanceOf(HTMLElement);
      expect(input).not.toBeInstanceOf(HTMLInputElement);
      expect(readKeyGridAction(label, grid)).toEqual({
        type: "select-key",
        keyName: "F20",
        bindsetName: null,
      });

      filterKeyGrid(injectedDocument, "f2");
      expect(
        injectedDocument.querySelector('[data-key="F20"]').style.display,
      ).toBe("flex");
      expect(
        injectedDocument.querySelector('[data-key="Space"]').style.display,
      ).toBe("none");
      expect(
        injectedDocument.getElementById("hidden-category").style.display,
      ).toBe("none");
      expect(
        injectedDocument
          .getElementById("keySearchBtn")
          .getAttribute("aria-pressed"),
      ).toBe("true");

      expect(toggleKeySearchInput(injectedDocument)).toBe(true);
      expect(input.classList).toContain("expanded");
      showAllKeyGridItems(injectedDocument);
      expect(input.value).toBe("");
      expect(
        injectedDocument.querySelector('[data-key="Space"]').style.display,
      ).toBe("flex");

      scheduleKeyBrowserVisibility(injectedDocument, "alias", (callback) =>
        callback(0),
      );
      const container = injectedDocument.querySelector(
        ".key-selector-container",
      );
      expect(container.style.display).toBe("none");
      expect(container.style.getPropertyPriority("display")).toBe("important");

      scheduleKeyBrowserVisibility(injectedDocument, "ground", (callback) =>
        callback(0),
      );
      expect(container.style.display).toBe("");
    } finally {
      realm.window.close();
    }
  });
});
