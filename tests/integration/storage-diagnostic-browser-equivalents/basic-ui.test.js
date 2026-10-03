// Exact internal assertions preserved from tests/browser/basic-ui.test.js.
import { beforeEach, afterEach } from "vitest";
import {
  initializeSourceApplication,
  destroySourceApplication,
} from "../../fixtures/ui/sourceApplicationRuntime.js";
beforeEach(initializeSourceApplication);
afterEach(destroySourceApplication);

import {
  runtime,
  ambientGlobals,
} from "../../fixtures/ui/sourceApplicationRuntime.js";
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
    expect(runtime().eventBus?.hasListeners("rpc:key:add")).toBe(true);
    expect(ambientGlobals()).toEqual([]);
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

    const bus = runtime().commandChainUI?.eventBus;
    expect(bus).toBeTruthy();
    const mirroredHandler = vi.fn();
    const genericHandler = vi.fn();
    const detachMirrored = bus.on("settings-toggle", mirroredHandler);
    const detachGeneric = bus.on("click", genericHandler);

    try {
      settingsButton?.click();

      expect(settingsDropdown?.classList.contains("active")).toBe(true);
      expect(importDropdown?.classList.contains("active")).toBe(false);
      expect(mirroredHandler).not.toHaveBeenCalled();
      expect(genericHandler).not.toHaveBeenCalled();

      document.body.click();

      expect(settingsDropdown?.classList.contains("active")).toBe(false);
      expect(mirroredHandler).not.toHaveBeenCalled();
      expect(genericHandler).not.toHaveBeenCalled();
    } finally {
      detachMirrored();
      detachGeneric();
    }
  });

  it("opens the injected bindset input dialog without a browser global", async () => {
    expect("inputDialog" in window).toBe(false);
    await vi.waitFor(() => {
      expect(runtime().eventBus?.hasListeners("rpc:bindset:create")).toBe(true);
    });

    const managerButton = document.getElementById("bindsetManagerBtn");
    const createButton = document.getElementById("createBindsetBtn");
    expect(managerButton).toBeTruthy();
    expect(createButton).toBeTruthy();
    if (!managerButton || !createButton) return;

    managerButton.click();
    expect(document.getElementById("bindsetManagerModal")?.classList).toContain(
      "active",
    );
    createButton.click();

    await vi.waitFor(() => {
      expect(document.getElementById("inputModal")).toBeTruthy();
    });
    const inputModal = document.getElementById("inputModal");
    const input = inputModal?.querySelector(".input-field");
    const cancel = inputModal?.querySelector(".input-cancel");
    expect(input).toBeInstanceOf(HTMLInputElement);
    expect(cancel).toBeInstanceOf(HTMLButtonElement);
    if (!(cancel instanceof HTMLButtonElement)) return;

    cancel.click();
    await vi.waitFor(() => {
      expect(document.getElementById("inputModal")).toBeNull();
    });
  });

  it("keeps DataService module-scoped while serving late-join state", async () => {
    const bus = runtime().eventBus;
    const replyTopic = `component:registered:reply:browser-data-service:${Date.now()}-${Math.random()}`;
    let dataServiceReply;

    for (const name of [
      "dataService",
      "COMMAND_CATEGORIES",
      "KEY_LAYOUTS",
      "DEFAULT_SETTINGS",
      "SAMPLE_PROFILES",
      "SAMPLE_ALIASES",
      "TRAY_CONFIG",
      "stoCommandParser",
      "stoAliases",
      "STOError",
      "VertigoError",
      "InvalidEnvironmentError",
      "InvalidEffectError",
    ]) {
      expect(window[name]).toBeUndefined();
    }
    expect(bus).toBeTruthy();
    if (!bus) return;

    const detach = bus.on(replyTopic, (reply) => {
      if (reply.sender === "DataService") dataServiceReply = reply;
    });

    try {
      bus.emit("component:register", {
        name: "BrowserDataServiceProbe",
        replyTopic,
      });

      await vi.waitFor(() => {
        expect(dataServiceReply).toMatchObject({
          sender: "DataService",
          state: {
            dataAvailable: true,
            hasCommands: true,
          },
        });
      });
    } finally {
      detach();
    }
  });

  it("uses local projections without retired state, static-data, or computation RPCs", async () => {
    const commandChainUI = runtime().commandChainUI;
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
      "data:get-alias-name-pattern",
      "data:get-combat-category",
      "data:get-command-category",
      "data:get-command-definition",
      "data:get-communication-category",
      "data:get-default-profile",
      "data:load-default-data",
      "data:set-environment",
      "data:update-settings",
      "data:get-key-name-pattern",
      "data:get-keys",
      "data:get-key-commands",
      "data:get-tray-category",
      "data:get-validation-patterns",
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
      "command:get-combined-aliases",
      "command:find-definition",
      "command:generate-command-preview",
      "command:get-categories",
      "command:get-warning",
      "command:is-stabilized",
      "command:check-environment-compatibility",
      "command:generate-id",
      "command:validate",
      "command:add",
      "command:edit",
      "command-chain:clear",
      "command-chain:generate-alias-name",
      "command-chain:generate-alias-preview",
      "command-chain:is-stabilized",
      "bindset-selector:find-key-in-bindset",
      "bindset-selector:set-key",
      "parameter-command:find-definition",
      "parameter-command:generate-id",
      "parser:get-performance-metrics",
      "data:find-command-by-name",
      "data:get-commands",
      "data:get-default-profiles",
      "data:has-commands",
      "export:extract-keys",
      "alias:import-file",
      "export:import-from-file",
      "import:from-file",
      "import:validate-kbf-file",
      "import:validate-keybind-file",
      "key:compare",
      "key:duplicate",
      "key:filter",
      "key:show-all",
      "selection:auto-select-first",
      "selection:clear",
      "selection:set-editing-context",
      "ui:copy-to-clipboard",
      "ui:show-toast",
      "vfx:get-virtual-aliases",
    ]) {
      expect(bus.hasListeners(`rpc:${topic}`), topic).toBe(false);
    }

    expect(bus.hasListeners("ui:copy-to-clipboard")).toBe(true);
    expect(bus.hasListeners("toast:show")).toBe(true);
    expect(bus.hasListeners("command:add")).toBe(true);
    expect(bus.hasListeners("command:edit")).toBe(true);
    expect(bus.hasListeners("command-chain:clear")).toBe(true);
    expect(bus.hasListeners("key:duplicate")).toBe(true);
    expect(bus.hasListeners("rpc:utility:copy-to-clipboard")).toBe(true);
    expect(bus.hasListeners("rpc:command:import-from-source")).toBe(true);
    expect(bus.hasListeners("rpc:key:duplicate-with-name")).toBe(true);
    expect(bus.hasListeners("rpc:selection:select-key")).toBe(true);
    expect(bus.hasListeners("rpc:sync:sync-project")).toBe(true);

    for (const topic of [
      "bindset-manager:open",
      "bindset-operation:completed",
      "bindset-operation:started",
      "bindset-section:refresh-needed",
      "bindset:active-changed",
      "bindset:created",
      "bindset:deleted",
      "bindset:modified",
      "current-profile:updated",
      "key-view:toggle",
      "key-view:update-toggle",
      "key:selected",
      "keys:filter",
      "keys:show-all",
      "mode-changed",
      "parameter-edit:end",
      "parameter-edit:start",
      "profile-modified",
    ]) {
      expect(bus.hasListeners(topic), topic).toBe(false);
    }

    expect(runtime().dataCoordinator?.getCurrentState?.().ready).toBe(true);
    await vi.waitFor(() => {
      expect(document.querySelectorAll(".vertigo-alias-item")).toHaveLength(3);
    });

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
    const commandChainUI = runtime().commandChainUI;
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
    const firstState = runtime().commandChainUI?.cache.dataState;
    const secondState = runtime().keyBrowserUI?.cache.dataState;

    expect(firstState?.ready).toBe(true);
    expect(firstState?.revision).toBeGreaterThanOrEqual(1);
    expect(firstState?.currentProfile).toBeTruthy();
    expect(firstState?.currentProfileData?.id).toBe(firstState?.currentProfile);
    expect(firstState?.profiles).toBeTruthy();
    expect(firstState).not.toHaveProperty("settings");
    expect(firstState?.metadata.version).toBeTruthy();

    expect(secondState?.revision).toBe(firstState?.revision);
    expect(secondState).toBe(firstState);
    expect(Object.isFrozen(firstState)).toBe(true);
    expect(Object.isFrozen(firstState?.profiles)).toBe(true);

    if (!firstState || !secondState) return;
    const profileId = firstState.currentProfile;
    if (!profileId) return;
    expect(Object.isFrozen(firstState.profiles[profileId])).toBe(true);
    expect(() => {
      firstState.profiles[profileId].__browser_detachment_probe__ = true;
    }).toThrow(TypeError);
    expect(
      secondState.profiles[profileId].__browser_detachment_probe__,
    ).toBeUndefined();
  });
});
