import UIComponentBase from "../UIComponentBase.js";
import { eventElement, resolveDocument, resolveI18n } from "./uiTypes.js";
import {
  getSnapshotProfile,
  getSnapshotUserAliases,
} from "../services/dataState.js";
import { projectCombinedAliases } from "../services/vfxAliasProjection.js";
import {
  acceptCommandLibraryPresentation,
  createCommandLibraryAliasCategory,
  projectCommandLibraryCategoryCollapse,
  projectCommandLibraryBindsetAliases,
} from "./commandLibraryAliasDom.js";
import { isCommandCategoryCollapsed } from "../services/commandPresentationState.js";
import { getCommandCategories } from "../../data/commandCatalog.js";

/**
 * @typedef {import('../services/serviceTypes.js').AliasDefinition & {
 *   displayName?: string,
 *   _displayName?: string,
 *   virtual?: boolean
 * }} LibraryAlias
 * @typedef {[string, LibraryAlias]} LibraryAliasEntry
 */

/**
 * CommandLibraryUI - Handles all command library UI operations
 * Manages command chain rendering, library setup, and user interactions
 */
export default class CommandLibraryUI extends UIComponentBase {
  /**
   * @param {{
   *   service?: import('../services/CommandLibraryService.js').default,
   *   eventBus: import('./uiTypes.js').EventBus,
   *   ui?: import('./uiTypes.js').UIServiceLike,
   *   modalManager?: import('./uiTypes.js').ModalManagerLike,
   *   document?: Document,
   *   i18n: import('./uiTypes.js').I18nLike
   * }} options
   */
  constructor({ service, eventBus, ui, modalManager, document, i18n }) {
    super(eventBus);
    this.componentName = "CommandLibraryUI";
    this.service = service;
    this.ui = ui;
    this.modalManager = modalManager;
    this.document = resolveDocument(document);
    this.i18n = resolveI18n(i18n);
    this.eventListenersSetup = false;

    this._rebuilding = false;
    this._rebuildQueued = false;
    this._libraryLifecycleGeneration = 0;
    this._aliasRenderGeneration = 0;
  }

  // Initialize the CommandLibraryUI component
  onInit() {
    this.setupEventListeners();
  }

  // Set up all event listeners for command library UI
  setupEventListeners() {
    if (this.eventListenersSetup) {
      return; // Prevent duplicate event listener setup
    }
    this.eventListenersSetup = true;

    // DataCoordinator profile state synchronization
    this.addEventListener("profile:updated", () => {
      this.updateCommandLibrary();
    });

    this.addEventListener("profile:switched", () => {
      this.updateCommandLibrary();
    });

    this.addEventListener("data:state-changed", () => {
      this.updateCommandLibrary();
    });

    this.addEventListener("command-presentation:state-changed", (state) => {
      acceptCommandLibraryPresentation(this, state);
    });

    // Environment and selection changes
    this.addEventListener("environment:changed", () => {
      const searchInput = /** @type {HTMLInputElement | null} */ (
        this.document.getElementById("commandSearch")
      );
      const term = searchInput ? searchInput.value : "";
      this.applySearchFilter(term);
    });

    // Listen for language changes to refresh command library with new translations
    this.addEventListener("language:changed", () => {
      this.setupCommandLibrary();
    });

    // Listen for alias changes to update command library with new aliases
    this.addEventListener("aliases-changed", () => {
      this.updateCommandLibrary();
    });

    // Listen for search filter events from CommandUI
    this.addEventListener("command:filter", ({ filter = "" }) => {
      this.applySearchFilter(filter);
    });

    // Listen for preferences saved to refresh command library (e.g., bindsets toggled)
    this.addEventListener("preferences:saved", () => {
      // Re-setup the library to reflect new preference-dependent commands
      this.setupCommandLibrary();
    });
  }

  // Setup the command library UI
  async setupCommandLibrary() {
    if (!this.cache.commandPresentationState) return;
    // Avoid concurrent rebuilds; queue the latest request.
    if (this._rebuilding) {
      this._rebuildQueued = true;
      return;
    }
    this._rebuilding = true;
    const generation = this._libraryLifecycleGeneration;
    const isCurrent = () =>
      generation === this._libraryLifecycleGeneration &&
      this.initialized &&
      !this.destroyed;

    try {
      // Build non-alias command categories into dedicated list container
      const container =
        this.document.getElementById("commandCategoriesList") ||
        this.document.getElementById("commandCategories");
      if (!container) return;

      const fragment = this.document.createDocumentFragment();

      const categories = getCommandCategories();
      if (!isCurrent()) return;
      Object.entries(categories).forEach(([categoryId, category]) => {
        const categoryElement = this.createCategoryElement(
          categoryId,
          category,
        );
        fragment.appendChild(categoryElement);
      });

      // Atomic replacement
      container.replaceChildren(fragment);

      // Apply environment filtering after replacing elements
      if (!isCurrent()) return;
      this.filterCommandLibrary();

      // Re-add aliases after rebuilding the command library
      await this.updateCommandLibrary();
    } finally {
      if (isCurrent()) {
        this._rebuilding = false;
        if (this._rebuildQueued) {
          this._rebuildQueued = false;
          // Run queued rebuild once current completes
          this.setupCommandLibrary();
        }
      }
    }
  }

  // Create a category element for the command library
  /**
   * @param {string} categoryId
   * @param {import('../services/serviceTypes.js').CommandCategory} category
   */
  createCategoryElement(categoryId, category) {
    const element = this.document.createElement("div");
    element.className = "category";
    element.dataset.category = categoryId;

    const isCollapsed = isCommandCategoryCollapsed(
      this.cache.commandPresentationState,
      categoryId,
    );

    element.innerHTML = `
      <h4 class="${isCollapsed ? "collapsed" : ""}" data-category="${categoryId}">
        <i class="fas fa-chevron-right category-chevron"></i>
        <i class="${category.icon}"></i> 
        ${category.name}
        <span class="command-count">(${Object.keys(category.commands).length})</span>
      </h4>
      <div class="category-commands ${isCollapsed ? "collapsed" : ""}">
        ${Object.entries(category.commands)
          .map(([cmdId, cmd]) => {
            // Try to get translated name from i18n, fallback to original name
            const translationKey = `command_definitions.${cmdId}.name`;
            const translatedName = this.i18n.t(translationKey);

            // Try to get translated description from i18n, fallback to original description
            const descTranslationKey = `command_definitions.${cmdId}.description`;
            const translatedDescription = this.i18n.t(descTranslationKey);

            return `
            <div class="command-item ${cmd.customizable ? "customizable" : ""}" data-command="${cmdId}" title="${translatedDescription}${cmd.customizable ? " (Customizable)" : ""}">
              ${cmd.icon} ${translatedName}${cmd.customizable ? ' <span class="param-indicator">⚙️</span>' : ""}
            </div>
          `;
          })
          .join("")}
      </div>
    `;
    projectCommandLibraryCategoryCollapse(element, isCollapsed);

    // Add click handler for category header using EventBus
    const header = element.querySelector("h4");
    if (header) {
      this.onDom(header, "click", () => {
        this.toggleCommandCategory(categoryId);
      });
    }

    // Add click handlers for commands using EventBus
    this.onDom(element, "click", (e) => {
      const target = /** @type {HTMLElement} */ (e.target);
      if (target.classList.contains("command-item")) {
        const commandId = target.dataset.command;
        const categoryNode = /** @type {HTMLElement | null} */ (
          target.closest(".category")
        );
        const categoryId = categoryNode?.dataset.category;
        if (!commandId || !categoryId) return;

        const commandDef = category.commands?.[commandId];
        if (!commandDef) return;

        if (commandDef.customizable) {
          // For customizable commands, pass category/command info
          console.log(
            "[CommandLibraryUI] emitting command-add [customizable]",
            { categoryId, commandId, commandDef },
          );
          this.emit("command-add", { categoryId, commandId, commandDef });
        } else {
          // For static commands, pass the fully-hydrated definition
          const fullyHydratedCommand = {
            command: commandDef.command,
            type: categoryId,
            icon: commandDef.icon,
            text: commandDef.name,
            id: `cmd_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
          };
          console.log("[CommandLibraryUI] emitting command-add [static]", {
            commandDef: fullyHydratedCommand,
          });
          this.emit("command-add", { commandDef: fullyHydratedCommand });
        }
      }
    });

    return element;
  }

  // Toggle command category collapse state
  /**
   * @param {string} categoryId
   */
  toggleCommandCategory(categoryId) {
    try {
      this.request("command-presentation:toggle-category", {
        categoryId,
      }).catch(() => {});
    } catch {
      // The owner publication is the only state source. An absent or failing
      // owner therefore leaves the existing projection unchanged.
    }
  }

  // Create an alias category element for the command library
  /**
   * @param {LibraryAliasEntry[]} aliases
   * @param {string} [categoryType]
   * @param {string} [titleKey]
   * @param {string} [iconClass]
   */
  createAliasCategoryElement(
    aliases,
    categoryType = "aliases",
    titleKey = "command_aliases",
    iconClass = "fas fa-mask",
  ) {
    const element = createCommandLibraryAliasCategory({
      document: this.document,
      translate: (key) => this.i18n.t(key),
      aliases,
      categoryType,
      titleKey,
      iconClass,
      collapsed: isCommandCategoryCollapsed(
        this.cache.commandPresentationState,
        categoryType,
      ),
    });
    const header = /** @type {HTMLElement | null} */ (
      element.querySelector("h4")
    );
    if (!header) return element;

    this.onDom(header, "click", () => {
      this.toggleAliasCategory(categoryType);
    });

    this.onDom(element, "click", (e) => {
      const target = eventElement(e);
      if (!(target instanceof HTMLElement)) return;
      if (
        target.classList.contains("alias-item") ||
        target.classList.contains("vertigo-alias-item") ||
        target.classList.contains("bindset-alias-item")
      ) {
        const aliasName = target.dataset.alias;
        if (!aliasName) return;

        // Look up alias object from provided aliases list
        const aliasEntry = aliases.find(([n]) => n === aliasName);
        console.log("[CommandLibraryUI] aliasEntry", aliasEntry);
        const alias = aliasEntry ? aliasEntry[1] : {};

        // Determine if this is a VFX alias or regular alias
        const isVfxAlias = alias.type === "vfx-alias";

        const fullyHydratedAlias = {
          command: aliasName,
          type: alias.type,
          icon: isVfxAlias ? "👁️" : "🎭",
          // Don't set hardcoded text for VFX aliases - let them get display text from parser
          ...(isVfxAlias ? {} : { text: `${aliasName}` }),
          description: alias.description,
          isUserAlias: true, // Flag to identify this as a user-defined alias
          isVfxAlias: isVfxAlias,
          id: `cmd_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
        };
        console.log("[CommandLibraryUI] emitting command:add [alias]", {
          commandDef: fullyHydratedAlias,
        });
        this.emit("command-add", { commandDef: fullyHydratedAlias });
      }
    });

    return element;
  }

  // Toggle alias category collapse state
  /**
   * @param {string} categoryType
   */
  toggleAliasCategory(categoryType) {
    this.toggleCommandCategory(categoryType);
  }

  // Update the command library using cached profile data
  async updateCommandLibrary() {
    if (!this.cache.commandPresentationState) return;
    const generation = ++this._aliasRenderGeneration;
    const isCurrent = () =>
      generation === this._aliasRenderGeneration && !this.destroyed;

    const aliasContainer =
      this.document.getElementById("aliasCategoriesList") ||
      this.document.getElementById("commandCategories");
    if (!aliasContainer) return;

    const snapshot = this.cache.dataState;
    const profile = getSnapshotProfile(snapshot);
    if (!profile) {
      if (isCurrent()) aliasContainer.replaceChildren();
      return;
    }

    const preferences = { ...this.cache.preferences };
    const combinedAliases = projectCombinedAliases(
      getSnapshotUserAliases(snapshot),
      profile.vertigoSettings,
      {
        translate: (key, options) => this.i18n.t(key, options),
        translateGeneratedMessages:
          preferences.translateGeneratedMessages === true,
      },
    );

    // Resolve display names for VFX aliases async
    const allAliases = await Promise.all(
      Object.entries(combinedAliases).map(async ([name, alias]) => {
        const cachedDisplayName =
          "_displayName" in alias ? alias._displayName : null;
        if (alias.type === "vfx-alias" && !cachedDisplayName) {
          return /** @type {LibraryAliasEntry} */ ([
            name,
            {
              ...alias,
              _displayName: await this._getAliasDisplayName(name, alias),
            },
          ]);
        }
        return /** @type {LibraryAliasEntry} */ ([name, alias]);
      }),
    );
    if (!isCurrent()) return;

    const regularAliases = allAliases.filter(
      ([, alias]) => alias.type !== "vfx-alias",
    );
    const vertigoAliases = allAliases.filter(
      ([, alias]) => alias.type === "vfx-alias",
    );

    const bindsetAliasItems = projectCommandLibraryBindsetAliases(
      profile,
      preferences,
      (key) => this.i18n.t(key),
    );

    // Build DOM in a detached fragment then atomically replace
    const fragment = this.document.createDocumentFragment();

    if (regularAliases.length > 0) {
      fragment.appendChild(
        this.createAliasCategoryElement(
          regularAliases,
          "aliases",
          "command_aliases",
          "fas fa-mask",
        ),
      );
    }

    if (vertigoAliases.length > 0) {
      fragment.appendChild(
        this.createAliasCategoryElement(
          vertigoAliases,
          "vertigo-aliases",
          "vfx_aliases",
          "fas fa-eye-slash",
        ),
      );
    }

    if (bindsetAliasItems.length > 0) {
      fragment.appendChild(
        this.createAliasCategoryElement(
          bindsetAliasItems,
          "bindset-aliases",
          "bindsets",
          "fas fa-tags",
        ),
      );
    }

    if (isCurrent()) aliasContainer.replaceChildren(fragment);
  }

  // Filter command library based on current environment
  filterCommandLibrary() {
    // Delegate actual filtering logic to CommandLibraryService via request-response
    this.request("command:filter-library").catch(() => {});
  }

  // Update local cache from profile data received from DataCoordinator
  /** @returns {import('../../types/events/component-state.js').ComponentState<'CommandLibraryUI'>} */
  getCurrentState() {
    return {
      aliases: this.cache.aliases,
      currentProfile: this.cache.currentProfile,
      currentEnvironment: this.cache.currentEnvironment || "space",
      selectedKey: this.cache.selectedKey,
      selectedAlias: this.cache.selectedAlias,
    };
  }

  // ComponentBase late-join support - handle initial state from other instances
  /**
   * @param {import('../../types/events/component-state.js').ComponentStateReply} reply
   */
  handleInitialState(reply) {
    const { sender, state } = reply;
    if (sender === "CommandPresentationService") {
      acceptCommandLibraryPresentation(this, state);
    }
    super.handleInitialState(reply);
    if (sender === "CommandPresentationService") return;
    if (sender === "DataCoordinator" && this.eventListenersSetup) {
      this.updateCommandLibrary();
    }
  }

  onDestroy() {
    this._libraryLifecycleGeneration += 1;
    this._aliasRenderGeneration += 1;
    this.eventListenersSetup = false;
    this._rebuilding = false;
    this._rebuildQueued = false;
    this.pendingInitialRender = false;
    this.cache.commandPresentationState = null;
  }

  hasRequiredData() {
    return this.cache.commandPresentationState !== null;
  }

  performInitialRender() {
    this.setupCommandLibrary().catch(() => {});
  }

  // Apply text search filter to command library items
  /** @param {string} filter */
  async applySearchFilter(filter) {
    // Normalize filter string
    const term = (filter || "").trim().toLowerCase();

    // Do NOT call filterCommandLibrary() here – it would reset previous search decisions.

    const doc =
      this.document ||
      (typeof window !== "undefined" ? window.document : undefined);
    if (!doc) return;

    // Restrict search filtering to the Command Library container only so alias/key browsers are untouched
    const libraryContainer =
      doc.getElementById("commandCategories") ||
      doc.querySelector(".command-categories");
    if (!libraryContainer) return;

    // Item-level filtering within library only
    libraryContainer
      .querySelectorAll(
        ".command-item, .alias-item, .vertigo-alias-item, .bindset-alias-item",
      )
      .forEach((item) => {
        const libraryItem = /** @type {HTMLElement} */ (item);
        // Skip if item already hidden by env filter
        const alreadyHiddenByEnv = libraryItem.dataset.envHidden === "true";

        if (!term) {
          // Reset visibility (if env allows)
          if (!alreadyHiddenByEnv) {
            libraryItem.style.display = "flex";
          }
          return;
        }

        const text = (libraryItem.textContent || "").toLowerCase();
        const shouldShow = text.includes(term);

        if (shouldShow && !alreadyHiddenByEnv) {
          libraryItem.style.display = "flex";
        } else {
          libraryItem.style.display = "none";
        }
      });

    // Category-level filtering
    libraryContainer.querySelectorAll(".category").forEach((category) => {
      const visibleItems = category.querySelectorAll(
        '.command-item:not([style*="display: none"]), .alias-item:not([style*="display: none"]), .vertigo-alias-item:not([style*="display: none"]), .bindset-alias-item:not([style*="display: none"])',
      );
      const categoryVisible = !term || visibleItems.length > 0;
      const categoryElement = /** @type {HTMLElement} */ (category);
      categoryElement.style.display = categoryVisible ? "block" : "none";
    });

    // Update search button active state for accessibility / UX
    const searchBtn = doc.getElementById("commandSearchBtn");
    if (searchBtn) {
      searchBtn.classList.toggle("active", !!term);
      searchBtn.setAttribute("aria-pressed", String(!!term));
    }
  }

  // Derive human-readable display text for an alias item.
  // VFX aliases get prettified ("VFX Alias: Space", etc.).
  /**
   * @param {string} name
   * @param {LibraryAlias} alias
   */
  async _getAliasDisplayName(name, alias) {
    if (alias.type === "vfx-alias") {
      try {
        const res = await this.request("parser:parse-command-string", {
          commandString: name,
          options: { generateDisplayText: true },
        });
        const displayText = res?.commands?.[0]?.displayText;
        return (typeof displayText === "string" && displayText) || name;
      } catch {
        /* ignore parse errors */
      }
    }
    return name;
  }
}
