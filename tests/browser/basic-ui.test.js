import { describe, expect, it, vi } from "vitest";

describe("Application browser smoke", () => {
  it("boots the translated shell and handles the settings menu", () => {
    const appContainer = document.querySelector(".app-container");
    const translatedHeading = document.querySelector(
      'h1 [data-i18n="sto_tools_keybind_manager"]',
    );
    const version = document.getElementById("appVersion");
    const profileSelect = document.getElementById("profileSelect");
    const settingsButton = document.getElementById("settingsBtn");
    const settingsDropdown = settingsButton?.closest(".dropdown");
    const refineDilithium = document.querySelector(
      '[data-command="refine_dilithium"]',
    );
    const importDropdown = document
      .getElementById("importMenuBtn")
      ?.closest(".dropdown");

    expect(appContainer).toBeTruthy();
    expect(document.title.trim()).not.toBe("");
    expect(translatedHeading?.textContent.trim()).toBe(document.title.trim());
    expect(version?.textContent.trim()).not.toBe("");
    expect(settingsButton?.title.trim()).not.toBe("");
    expect(window.stoKeybinds?.isInitialized?.()).toBe(true);
    expect(refineDilithium?.closest(".category")?.dataset.category).toBe(
      "system",
    );
    expect(refineDilithium?.textContent).toContain("⛏️");
    expect(refineDilithium?.textContent).toContain("Refine Dilithium");
    expect(
      Array.from(profileSelect?.options || []).some(
        (option) => !option.disabled && Boolean(option.value),
      ),
    ).toBe(true);

    expect(settingsDropdown?.classList.contains("active")).toBe(false);

    settingsButton?.click();

    expect(settingsDropdown?.classList.contains("active")).toBe(true);
    expect(importDropdown?.classList.contains("active")).toBe(false);

    document.body.click();

    expect(settingsDropdown?.classList.contains("active")).toBe(false);
  });

  it("uses the selection broadcast cache without legacy state RPCs", () => {
    const commandChainUI = window.commandChainUI;
    const bus = commandChainUI?.eventBus;

    expect(commandChainUI?.isInitialized?.()).toBe(true);
    expect(bus).toBeTruthy();
    for (const topic of [
      "key:get-selected",
      "selection:get-cached",
      "selection:get-editing-context",
      "selection:get-selected",
      "selection:get-state",
      "data:get-current-state",
      "data:get-all-profiles",
      "data:get-keys",
      "data:get-key-commands",
      "bindset:get-key-commands",
      "key:get-all",
      "bindset:get-available",
      "bindset:get-collapsed-state",
      "key:get-all-sectional",
      "key:get-category-state",
      "alias:get-all",
      "command:get-empty-state-info",
      "command:get-for-selected-key",
      "command:get-import-sources",
      "command:is-stabilized",
      "command-chain:is-stabilized",
    ]) {
      expect(bus.hasListeners(`rpc:${topic}`), topic).toBe(false);
    }

    const originalSnapshot = {
      selectedKey: commandChainUI.cache.selectedKey,
      selectedAlias: commandChainUI.cache.selectedAlias,
      editingContext: commandChainUI.cache.editingContext ?? null,
      cachedSelections: {
        ...(commandChainUI.cache.cachedSelections || {}),
        space: commandChainUI.cache.cachedSelections?.space ?? null,
        ground: commandChainUI.cache.cachedSelections?.ground ?? null,
        alias: commandChainUI.cache.cachedSelections?.alias ?? null,
      },
      currentEnvironment: commandChainUI.cache.currentEnvironment,
    };
    const probeSnapshot = {
      selectedKey: "__selection-broadcast-probe__",
      selectedAlias: null,
      editingContext: { isEditing: true, editIndex: 9876 },
      cachedSelections: {
        ...originalSnapshot.cachedSelections,
        space: "__selection-broadcast-probe__",
      },
      currentEnvironment: "space",
    };

    bus.emit("selection:state-changed", probeSnapshot);
    expect(commandChainUI.cache).toMatchObject(probeSnapshot);

    bus.emit("selection:state-changed", originalSnapshot);
    expect(commandChainUI.cache).toMatchObject(originalSnapshot);
  });

  it("renders translated key and alias empty states from accepted caches", async () => {
    const commandChainUI = window.commandChainUI;
    const chainTitle = document.getElementById("chainTitle");
    const commandList = document.getElementById("commandList");
    const commandPreview = document.getElementById("commandPreview");
    const commandCount = document.getElementById("commandCount");

    expect(commandChainUI?.isInitialized?.()).toBe(true);
    expect(chainTitle).toBeTruthy();
    expect(commandList).toBeTruthy();
    expect(commandPreview).toBeTruthy();
    expect(commandCount).toBeTruthy();
    if (
      !commandChainUI ||
      !chainTitle ||
      !commandList ||
      !commandPreview ||
      !commandCount
    ) {
      return;
    }

    const originalSelection = {
      selectedKey: commandChainUI.cache.selectedKey,
      selectedAlias: commandChainUI.cache.selectedAlias,
      currentEnvironment: commandChainUI.cache.currentEnvironment,
    };
    const cases = [
      {
        environment: "space",
        titleKey: "select_a_key_to_edit",
        previewKey: "select_a_key_to_see_the_generated_command",
        emptyTitleKey: "no_key_selected",
        emptyDescriptionKey: "select_key_from_left_panel",
        iconClass: "fa-keyboard",
      },
      {
        environment: "ground",
        titleKey: "select_a_key_to_edit",
        previewKey: "select_a_key_to_see_the_generated_command",
        emptyTitleKey: "no_key_selected",
        emptyDescriptionKey: "select_key_from_left_panel",
        iconClass: "fa-keyboard",
      },
      {
        environment: "alias",
        titleKey: "select_an_alias_to_edit",
        previewKey: "select_an_alias_to_see_the_generated_command",
        emptyTitleKey: "no_alias_selected",
        emptyDescriptionKey: "select_alias_from_left_panel",
        iconClass: "fa-mask",
      },
    ];

    try {
      for (const testCase of cases) {
        Object.assign(commandChainUI.cache, {
          selectedKey: null,
          selectedAlias: null,
          currentEnvironment: testCase.environment,
        });

        await commandChainUI.render();

        const emptyState = commandList.querySelector("#emptyState");
        expect(chainTitle.textContent).toBe(
          commandChainUI.i18n.t(testCase.titleKey),
        );
        expect(commandPreview.textContent).toBe(
          commandChainUI.i18n.t(testCase.previewKey),
        );
        expect(commandCount.textContent).toBe("0");
        expect(emptyState?.classList).toContain("show");
        expect(emptyState?.querySelector("i")?.classList).toContain(
          testCase.iconClass,
        );
        expect(emptyState?.querySelector("h4")?.textContent).toBe(
          commandChainUI.i18n.t(testCase.emptyTitleKey),
        );
        expect(emptyState?.querySelector("p")?.textContent).toBe(
          commandChainUI.i18n.t(testCase.emptyDescriptionKey),
        );
      }
    } finally {
      Object.assign(commandChainUI.cache, originalSelection);
      await commandChainUI.render();
    }
  });

  it("hydrates one immutable DataCoordinator snapshot in consumers", () => {
    const firstState = window.commandChainUI?.cache.dataState;
    const secondState = window.keyBrowserUI?.cache.dataState;

    expect(firstState?.ready).toBe(true);
    expect(firstState?.revision).toBeGreaterThanOrEqual(1);
    expect(firstState?.currentProfile).toBeTruthy();
    expect(firstState?.currentProfileData?.id).toBe(firstState?.currentProfile);
    expect(firstState?.profiles).toBeTruthy();
    expect(firstState?.settings).toBeTruthy();
    expect(firstState?.metadata.version).toBeTruthy();

    expect(secondState?.revision).toBe(firstState?.revision);
    expect(secondState).toBe(firstState);
    expect(Object.isFrozen(firstState)).toBe(true);
    expect(Object.isFrozen(firstState?.profiles)).toBe(true);
    expect(Object.isFrozen(firstState?.settings)).toBe(true);

    if (!firstState || !secondState) return;
    expect(() => {
      firstState.settings.__browser_detachment_probe__ = true;
    }).toThrow(TypeError);
    expect(secondState.settings.__browser_detachment_probe__).toBeUndefined();
  });

  it("persists category collapse through the live UI and service", async () => {
    const ui = window.keyBrowserUI;
    const service = window.keyBrowserService;
    const categoryId = "__browser-collapse-probe__";
    const storageKey = `keyCategory_${categoryId}_collapsed`;
    const host = document.createElement("div");

    expect(ui?.isInitialized?.()).toBe(true);
    expect(service?.isInitialized?.()).toBe(true);
    if (!ui || !service) return;

    localStorage.removeItem(storageKey);
    const category = await ui.createKeyCategoryElement(
      categoryId,
      {
        name: "Browser collapse probe",
        icon: "fas fa-folder",
        keys: [],
      },
      "command",
    );
    host.appendChild(category);
    document.body.appendChild(host);
    const header = category.querySelector("h4");
    const commands = category.querySelector(".category-commands");

    try {
      expect(header?.classList).not.toContain("collapsed");
      expect(commands?.classList).not.toContain("collapsed");

      header?.click();

      await vi.waitFor(() => {
        expect(localStorage.getItem(storageKey)).toBe("true");
        expect(
          ui.cache.keyBrowserViewState?.collapsedCategories.command,
        ).toContain(categoryId);
        expect(service.getCurrentState().collapsedCategories.command).toContain(
          categoryId,
        );
        expect(header?.classList).toContain("collapsed");
        expect(commands?.classList).toContain("collapsed");
      });

      header?.click();

      await vi.waitFor(() => {
        expect(localStorage.getItem(storageKey)).toBe("false");
        expect(
          ui.cache.keyBrowserViewState?.collapsedCategories.command,
        ).not.toContain(categoryId);
        expect(
          service.getCurrentState().collapsedCategories.command,
        ).not.toContain(categoryId);
        expect(header?.classList).not.toContain("collapsed");
        expect(commands?.classList).not.toContain("collapsed");
      });
    } finally {
      localStorage.removeItem(storageKey);
      host.remove();
    }

    expect(localStorage.getItem(storageKey)).toBeNull();
  });
});
