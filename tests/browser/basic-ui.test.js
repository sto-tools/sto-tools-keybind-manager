import { describe, expect, it } from "vitest";

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
    ]) {
      expect(bus.hasListeners(`rpc:${topic}`)).toBe(false);
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
});
