import { describe, it, expect, beforeEach, vi } from "vitest";
import { JSDOM } from "jsdom";
import KeyBrowserUI from "../../../src/js/components/ui/KeyBrowserUI.js";

describe("KeyBrowserUI Bindset Header Controls Tests", () => {
  let keyBrowserUI;
  let mockEventBus;
  let mockI18n;
  let dom;

  beforeEach(() => {
    dom = new JSDOM('<!DOCTYPE html><div id="key-browser"></div>', {
      url: "http://localhost",
    });
    global.document = dom.window.document;
    global.window = dom.window;

    mockEventBus = {
      request: vi.fn(),
      respond: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
    };

    mockI18n = {
      t: vi.fn((key) => key),
    };

    keyBrowserUI = new KeyBrowserUI({
      eventBus: mockEventBus,
      container: dom.window.document.getElementById("key-browser"),
      i18n: mockI18n,
    });

    // Initialize cache with test data
    keyBrowserUI.cache = {
      selectedKey: "F1",
      activeBindset: "Primary Bindset",
      currentEnvironment: "space",
      profile: {
        bindsets: {
          "Primary Bindset": {
            space: {
              keys: {
                F1: ["attack"],
                F2: ["defend"],
              },
            },
          },
          "Custom Bindset": {
            space: {
              keys: {
                F1: ["custom_attack"],
                F3: ["custom_defend"],
              },
            },
          },
        },
      },
      preferences: {
        bindsetsEnabled: true,
        bindToAliasMode: true,
      },
    };

    // Mock methods
    keyBrowserUI.emit = vi.fn();
    keyBrowserUI.onDom = vi.fn();
    keyBrowserUI.confirmDeleteBindset = vi.fn();
    keyBrowserUI.request = vi.fn().mockResolvedValue({});
  });

  describe("createBindsetSectionElement", () => {
    it("should create a menu with Create + Clone actions for Primary Bindset (no Delete)", async () => {
      const bindsetData = {
        keys: ["F1", "F2"],
        keyCount: 2,
        isCollapsed: false,
      };

      const element = await keyBrowserUI.createBindsetSectionElement(
        "Primary Bindset",
        bindsetData,
      );
      const actionsContainer = element.querySelector(".bindset-actions");

      expect(actionsContainer).toBeTruthy();

      const menuButton = actionsContainer.querySelector(
        'button[data-action="bindset-menu"]',
      );
      const menu = actionsContainer.querySelector(".bindset-menu-dropdown");
      const menuItems = menu.querySelectorAll(".bindset-menu-item");

      expect(menuButton).toBeTruthy();
      expect(menuButton.innerHTML).toContain("fa-ellipsis-v");
      expect(menuItems).toHaveLength(2);

      const createItem = menu.querySelector('[data-action="create"]');
      const cloneItem = menu.querySelector('[data-action="clone"]');
      const deleteItem = menu.querySelector('[data-action="delete"]');

      expect(createItem).toBeTruthy();
      expect(cloneItem).toBeTruthy();
      expect(deleteItem).toBeFalsy();

      expect(createItem.innerHTML).toContain("fa-plus");
      expect(cloneItem.innerHTML).toContain("fa-copy");

      expect(keyBrowserUI.onDom).toHaveBeenCalledWith(
        expect.any(Object),
        "click",
        "bindset-menu-create",
        expect.any(Function),
      );
      expect(keyBrowserUI.onDom).toHaveBeenCalledWith(
        expect.any(Object),
        "click",
        "bindset-menu-clone",
        expect.any(Function),
      );
    });

    it("should create a menu with Clone + Rename + Delete actions for User-Defined Bindset (no Create)", async () => {
      const bindsetData = {
        keys: ["F1", "F3"],
        keyCount: 2,
        isCollapsed: false,
      };

      const element = await keyBrowserUI.createBindsetSectionElement(
        "Custom Bindset",
        bindsetData,
      );
      const actionsContainer = element.querySelector(".bindset-actions");

      expect(actionsContainer).toBeTruthy();

      const menuButton = actionsContainer.querySelector(
        'button[data-action="bindset-menu"]',
      );
      const menu = actionsContainer.querySelector(".bindset-menu-dropdown");
      const menuItems = menu.querySelectorAll(".bindset-menu-item");

      expect(menuButton).toBeTruthy();
      expect(menuItems).toHaveLength(3);

      const createItem = menu.querySelector('[data-action="create"]');
      const cloneItem = menu.querySelector('[data-action="clone"]');
      const renameItem = menu.querySelector('[data-action="rename"]');
      const deleteItem = menu.querySelector('[data-action="delete"]');

      expect(createItem).toBeFalsy();
      expect(cloneItem).toBeTruthy();
      expect(renameItem).toBeTruthy();
      expect(deleteItem).toBeTruthy();

      expect(cloneItem.innerHTML).toContain("fa-copy");
      expect(renameItem.innerHTML).toContain("fa-edit");
      expect(deleteItem.innerHTML).toContain("fa-trash");
      expect(deleteItem.className).toContain("dangerous");

      expect(keyBrowserUI.onDom).toHaveBeenCalledWith(
        expect.any(Object),
        "click",
        "bindset-menu-clone",
        expect.any(Function),
      );
      expect(keyBrowserUI.onDom).toHaveBeenCalledWith(
        expect.any(Object),
        "click",
        "bindset-menu-rename",
        expect.any(Function),
      );
      expect(keyBrowserUI.onDom).toHaveBeenCalledWith(
        expect.any(Object),
        "click",
        "bindset-menu-delete",
        expect.any(Function),
      );
    });

    it("should handle empty bindsets correctly", async () => {
      const bindsetData = {
        keys: [],
        keyCount: 0,
        isCollapsed: false,
      };

      const element = await keyBrowserUI.createBindsetSectionElement(
        "Empty Bindset",
        bindsetData,
      );
      const actionsContainer = element.querySelector(".bindset-actions");

      // Should still have controls even for empty bindsets
      expect(actionsContainer).toBeTruthy();

      const menuItems = actionsContainer.querySelectorAll(".bindset-menu-item");
      expect(menuItems).toHaveLength(3);
    });
  });

  describe("regression tests for bindset header controls bug", () => {
    it("should not show Delete button on Primary Bindset (regression: js-bindset-header-controls)", async () => {
      const bindsetData = { keys: ["F1"], keyCount: 1, isCollapsed: false };

      const element = await keyBrowserUI.createBindsetSectionElement(
        "Primary Bindset",
        bindsetData,
      );
      const deleteItem = element.querySelector(
        '.bindset-menu-dropdown [data-action="delete"]',
      );

      expect(deleteItem).toBeFalsy();
    });

    it("should not show Create button on User-Defined Bindset (regression: js-bindset-header-controls)", async () => {
      const bindsetData = { keys: ["F1"], keyCount: 1, isCollapsed: false };

      const element = await keyBrowserUI.createBindsetSectionElement(
        "Custom Bindset",
        bindsetData,
      );
      const createItem = element.querySelector(
        '.bindset-menu-dropdown [data-action="create"]',
      );

      expect(createItem).toBeFalsy();
    });

    it("should show Create and Clone menu items on Primary Bindset (regression: js-bindset-header-controls)", async () => {
      const bindsetData = { keys: ["F1"], keyCount: 1, isCollapsed: false };

      // Test createBindsetSectionElement
      const element = await keyBrowserUI.createBindsetSectionElement(
        "Primary Bindset",
        bindsetData,
      );
      const menu = element.querySelector(".bindset-menu-dropdown");

      const createItem = menu.querySelector('[data-action="create"]');
      const cloneItem = menu.querySelector('[data-action="clone"]');

      expect(createItem).toBeTruthy();
      expect(cloneItem).toBeTruthy();
    });

    it("should show Clone, Rename, and Delete menu items on User-Defined Bindset (regression: js-bindset-header-controls)", async () => {
      const bindsetData = { keys: ["F1"], keyCount: 1, isCollapsed: false };

      // Test createBindsetSectionElement
      const element = await keyBrowserUI.createBindsetSectionElement(
        "Custom Bindset",
        bindsetData,
      );
      const menu = element.querySelector(".bindset-menu-dropdown");

      const cloneItem = menu.querySelector('[data-action="clone"]');
      const renameItem = menu.querySelector('[data-action="rename"]');
      const deleteItem = menu.querySelector('[data-action="delete"]');

      expect(cloneItem).toBeTruthy();
      expect(renameItem).toBeTruthy();
      expect(deleteItem).toBeTruthy();
    });
  });

  describe("event handler verification", () => {
    it("should attach correct event handlers for Primary Bindset controls", async () => {
      const bindsetData = { keys: ["F1"], keyCount: 1, isCollapsed: false };

      await keyBrowserUI.createBindsetSectionElement(
        "Primary Bindset",
        bindsetData,
      );

      expect(keyBrowserUI.onDom).toHaveBeenCalledWith(
        expect.any(Object),
        "click",
        "bindset-menu-create",
        expect.any(Function),
      );
      expect(keyBrowserUI.onDom).toHaveBeenCalledWith(
        expect.any(Object),
        "click",
        "bindset-menu-clone",
        expect.any(Function),
      );
      expect(keyBrowserUI.onDom).not.toHaveBeenCalledWith(
        expect.any(Object),
        "click",
        "bindset-menu-delete",
        expect.any(Function),
      );

      expect(keyBrowserUI.confirmDeleteBindset).not.toHaveBeenCalled();
    });

    it("should attach correct event handlers for User-Defined Bindset controls", async () => {
      const bindsetData = { keys: ["F1"], keyCount: 1, isCollapsed: false };

      await keyBrowserUI.createBindsetSectionElement(
        "Custom Bindset",
        bindsetData,
      );

      expect(keyBrowserUI.onDom).toHaveBeenCalledWith(
        expect.any(Object),
        "click",
        "bindset-menu-clone",
        expect.any(Function),
      );
      expect(keyBrowserUI.onDom).toHaveBeenCalledWith(
        expect.any(Object),
        "click",
        "bindset-menu-rename",
        expect.any(Function),
      );
      expect(keyBrowserUI.onDom).toHaveBeenCalledWith(
        expect.any(Object),
        "click",
        "bindset-menu-delete",
        expect.any(Function),
      );
      expect(keyBrowserUI.onDom).not.toHaveBeenCalledWith(
        expect.any(Object),
        "click",
        "bindset-menu-create",
        expect.any(Function),
      );
    });
  });
});
