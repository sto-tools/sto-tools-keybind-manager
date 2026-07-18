import UIComponentBase from "../UIComponentBase.js";
import BindsetDeleteConfirmUI from "./BindsetDeleteConfirmUI.js";
import { escapeHtml } from "../../lib/htmlEscape.js";
import {
  getSnapshotPrimaryKeys,
  getSnapshotProfile,
} from "../services/dataState.js";
import {
  isKeyCategoryCollapsed,
  projectBindsetSections,
} from "../services/keyBrowserViewState.js";
import {
  acceptViewState,
  cacheViewState,
  completeInitialRender,
  projectViewModeButton,
  reconcileViewStateDom,
} from "./keyBrowserViewDom.js";
import { resolveDocument, resolveI18n } from "./uiTypes.js";

const runtime = /** @type {import('./uiTypes.js').RuntimeGlobals} */ (
  globalThis
);

/** @typedef {import('../services/serviceTypes.js').StoredCommand} KeyCommand */
/** @typedef {Record<string, KeyCommand[]>} KeyMap */
/** @typedef {{ name: string, icon: string, keys: string[], priority?: number }} KeyCategory */
/** @typedef {Record<string, KeyCategory>} KeyCategories */
/** @typedef {{ keys: string[], keyCount: number, isCollapsed: boolean }} BindsetSection */
/** @typedef {import('../services/serviceTypes.js').ProfileData} KeyProfile */
/** @typedef {import('../../types/events/component-state.js').KeyBrowserViewStateSnapshot} KeyBrowserViewStateSnapshot */
/**
 * @typedef {{
 *   selectedKey: string | null,
 *   selectedAlias: string | null,
 *   currentEnvironment: string,
 *   currentProfile: string | null,
 *   profile: KeyProfile | null,
 *   keys: KeyMap,
 *   aliases: Record<string, unknown>,
 *   builds: Record<string, unknown>,
 *   preferences: { bindsetsEnabled?: boolean, bindToAliasMode?: boolean, theme?: string },
 *   activeBindset: string,
 *   bindsetNames: string[],
 *   keyBrowserViewState: KeyBrowserViewStateSnapshot | null
 * }} KeyBrowserCache
 */
/** @typedef {{ environment?: string, newMode?: string, mode?: string }} EnvironmentChange */
/** @typedef {{ key?: string, value?: unknown, changes?: Record<string, unknown> }} PreferenceChange */

/**
 * KeyBrowserUI – responsible for rendering the key grid (#keyGrid).
 * It projects complete owner snapshots and delegates key-grid domain
 * operations through the event/RPC protocols.
 */
export default class KeyBrowserUI extends UIComponentBase {
  /**
   * @param {{
   *   eventBus?: import('./uiTypes.js').EventBus,
   *   modalManager?: import('./uiTypes.js').ModalManagerLike | null,
   *   confirmDialog?: import('./uiTypes.js').ConfirmDialogLike | null,
   *   inputDialog?: import('./uiTypes.js').InputDialogLike | null,
   *   document?: Document,
   *   i18n?: import('./uiTypes.js').I18nLike
   * }} [options]
   */
  constructor({
    eventBus,
    modalManager = null,
    confirmDialog = null,
    inputDialog = null,
    i18n,
    document,
  } = {}) {
    super(eventBus);
    this.componentName = "KeyBrowserUI";
    this.modalManager = modalManager;
    this.confirmDialog = confirmDialog || runtime.confirmDialog || null;
    this.inputDialog = inputDialog || runtime.inputDialog || null;
    this.i18n = resolveI18n(i18n);
    this.document = resolveDocument(document);

    /** @type {KeyBrowserCache} */
    this.cache = {
      ...this.cache,
      selectedKey: null,
      selectedAlias: null,
      currentEnvironment: "space",
      currentProfile: null,
      profile: null,
      keys: {},
      aliases: {},
      builds: {},
      preferences: {},
      activeBindset: "Primary Bindset",
      keyBrowserViewState: null,
    };

    /** @type {KeyMap} */
    this._currentKeyMap = {};
    this.eventListenersSetup = false;
    this._renderGeneration = 0;

    // Initialize bindset delete confirmation modal
    this.bindsetDeleteConfirm = new BindsetDeleteConfirmUI({
      eventBus: this.eventBus ?? undefined,
      modalManager: this.modalManager ?? undefined,
      i18n: this.i18n,
    });
  }

  // Lifecycle
  onInit() {
    this.setupEventListeners();
  }

  onDestroy() {
    this._renderGeneration += 1;
    this.eventListenersSetup = false;
    this.pendingInitialRender = false;
    this.cache.keyBrowserViewState = null;
  }

  setupEventListeners() {
    if (this.eventListenersSetup) {
      return;
    }
    this.eventListenersSetup = true;

    // Key management DOM events
    this.onDom("addKeyBtn", "click", () => {
      this.showKeySelectionModal();
    });

    this.onDom("deleteKeyBtn", "click", () => {
      if (this.cache.selectedKey) {
        this.confirmDeleteKey(this.cache.selectedKey);
      }
    });

    this.onDom("duplicateKeyBtn", "click", () => {
      if (this.cache.selectedKey) {
        this.duplicateKey(this.cache.selectedKey);
      }
    });

    // Debounced key search input via eventBus helper
    this.onDomDebounced(
      "keyFilter",
      "input",
      (e) => {
        if (e.target instanceof HTMLInputElement) {
          this.filterKeys(e.target.value);
        }
      },
      250,
    );

    // Escape / Enter keys within search input
    this.onDom("keyFilter", "keydown", (e) => {
      if (
        !(e.target instanceof HTMLInputElement) ||
        !("key" in e) ||
        typeof e.key !== "string"
      )
        return;
      if (e.key === "Escape") {
        e.preventDefault();
        const input = e.target;
        input.value = "";
        input.classList.remove("expanded");
        this.filterKeys("");
      } else if (e.key === "Enter") {
        const input = e.target;
        input.classList.remove("expanded");
        // keep current filter; focus out
        input.blur();
      }
    });

    this.onDom("showAllKeysBtn", "click", () => {
      this.showAllKeys();
    });

    this.onDom("toggleKeyViewBtn", "click", () => {
      this.toggleKeyView().catch((error) => {
        console.error("[KeyBrowserUI] Failed to cycle key view mode:", error);
      });
    });

    // Key search button
    this.onDom("keySearchBtn", "click", () => {
      this.toggleKeySearch();
    });

    this.addEventListener("key:list-changed", () => this.render());

    this.addEventListener("key-browser:state-changed", (state) => {
      acceptViewState(this, state);
    });

    // ComponentBase registers its data-state cache listener before onInit.
    // Release only the pending first paint after that listener accepts a ready state.
    this.addEventListener("data:state-changed", () => {
      completeInitialRender(this);
    });

    // Add environment change handler for UI visibility
    this.addEventListener(
      "environment:changed",
      /** @param {string | EnvironmentChange} d */ (d = {}) => {
        const env =
          typeof d === "string" ? d : d.environment || d.newMode || d.mode;
        if (!env) return;
        this.toggleVisibility(env);
        if (env !== "alias") {
          this.render();
        }
      },
    );

    // Add key selection handler for UI updates (single listener, not duplicate)
    this.addEventListener("key-selected", () => {
      this.render();
    });

    // Add profile switch handler for UI updates (single listener, not duplicate)
    this.addEventListener("profile:switched", () => {
      this.render();
    });

    // Listen for language changes and re-render with new translations
    this.addEventListener("language:changed", () => {
      const viewState = this.cache.keyBrowserViewState;
      if (viewState) projectViewModeButton(this, viewState.mode);
      this.render();
    });

    // Listen for preference changes that affect bindset display
    this.addEventListener(
      "preferences:changed",
      /** @param {PreferenceChange} data */ (data) => {
        // Handle both { key, value } and { changes } event formats
        const changes =
          data.changes || (data.key ? { [data.key]: data.value } : {});

        for (const key of Object.keys(changes)) {
          if (key === "theme") {
            this.render();
          } else if (key === "bindsetsEnabled" || key === "bindToAliasMode") {
            this.render();
          }
        }
      },
    );

    // Listen for bindset changes and re-render when bindsets are enabled
    this.addEventListener("bindsets:changed", () => {
      if (this.shouldShowBindsetSections()) {
        this.render();
      }
    });
  }

  /**
   * @param {KeyBrowserViewStateSnapshot} state
   * @returns {boolean}
   */
  cacheKeyBrowserViewState(state) {
    return cacheViewState(this, state);
  }

  reconcileKeyBrowserViewState() {
    reconcileViewStateDom(this);
  }

  async render() {
    const generation = ++this._renderGeneration;
    const isCurrent = () =>
      generation === this._renderGeneration && !this.destroyed;
    const grid = this.document.getElementById("keyGrid");
    if (!grid) return;

    const snapshot = this.cache.dataState;
    const environment = this.cache.currentEnvironment || "space";
    const profile = getSnapshotProfile(snapshot);
    /** @type {KeyMap} */
    const keyMap = getSnapshotPrimaryKeys(snapshot, environment);

    // Cache for child helpers, including clearing predecessor data on pre-ready state.
    this._currentKeyMap = keyMap;
    if (!profile) {
      if (!isCurrent()) return;
      grid.innerHTML = `<div class="empty-state"><i class="fas fa-folder-open"></i><h4>${this.i18n.t("no_profile_selected")}</h4></div>`;
      return;
    }

    // Build DOM atomically using DocumentFragment
    const fragment = this.document.createDocumentFragment();
    const viewMode = this.getCurrentViewMode();
    if (!viewMode) return;

    const keys = Object.keys(keyMap);
    /** @type {KeyMap} */
    const keysWithCommands = {};
    keys.forEach((k) => {
      const cmds = keyMap[k];
      if (cmds && cmds.length > 0) keysWithCommands[k] = cmds;
    });
    const allKeys = [...new Set([...keys, ...Object.keys(keysWithCommands)])];

    let categorized = false;

    // If bindsets are enabled, render bindset sections for ALL view types
    if (this.shouldShowBindsetSections()) {
      await this.renderBindsetSectionsView(
        fragment,
        viewMode,
        profile,
        keyMap,
        keysWithCommands,
        environment,
      );
      categorized = true;
    } else {
      // Original rendering for when bindsets are disabled
      if (viewMode === "key-types") {
        await this.renderKeyTypeView(fragment, profile, allKeys);
        categorized = true;
      } else if (viewMode === "grid") {
        await this.renderSimpleGridView(fragment, allKeys);
      } else {
        // command-category
        await this.renderCommandCategoryView(
          fragment,
          keysWithCommands,
          allKeys,
        );
        categorized = true;
      }
    }

    if (!isCurrent()) return;

    // Atomic DOM update - replace all content at once
    grid.classList.toggle("categorized", categorized);
    grid.replaceChildren(fragment);
    this.reconcileKeyBrowserViewState();
  }

  // View mode management helpers

  /**
   * Determines the current view mode based on user preference
   * @returns {KeyBrowserViewStateSnapshot['mode'] | null}
   */
  getCurrentViewMode() {
    return this.cache.keyBrowserViewState?.mode ?? null;
  }

  /**
   * Determines if bindset functionality should be displayed in the current view
   * @returns {boolean} True if bindset functionality should be shown
   */
  shouldShowBindsetSections() {
    const bindsetsEnabled = this.cache.preferences?.bindsetsEnabled || false;
    const bindToAliasMode = this.cache.preferences?.bindToAliasMode || false;
    const currentEnvironment = this.cache.currentEnvironment || "space";

    // Show bindset functionality when bindsets are enabled and conditions are met
    return bindsetsEnabled && bindToAliasMode && currentEnvironment !== "alias";
  }

  // Rendering helpers
  /**
   * @param {DocumentFragment} fragment
   * @param {string[]} allKeys
   */
  async renderSimpleGridView(fragment, allKeys) {
    // Sort keys using the service's sort function
    /** @type {string[]} */
    const sortedKeys = await this.request("key:sort", { keys: allKeys });

    sortedKeys.forEach((keyName) => {
      const keyElement = this.createKeyElement(keyName);
      fragment.appendChild(keyElement);
    });
  }

  /**
   * @param {DocumentFragment} fragment
   * @param {KeyMap} keysWithCommands
   * @param {string[]} allKeys
   */
  async renderCommandCategoryView(fragment, keysWithCommands, allKeys) {
    const categories = await this.categorizeKeys(keysWithCommands, allKeys);
    const sorted = Object.entries(categories).sort(([, a], [, b]) => {
      if (a.priority !== b.priority)
        return (a.priority ?? 0) - (b.priority ?? 0);
      return a.name.localeCompare(b.name);
    });
    for (const [catId, catData] of sorted) {
      const el = await this.createKeyCategoryElement(catId, catData);
      fragment.appendChild(el);
    }
  }

  /**
   * @param {DocumentFragment} fragment
   * @param {KeyProfile} profile
   * @param {string[]} allKeys
   */
  async renderKeyTypeView(fragment, profile, allKeys) {
    const cats = await this.categorizeKeysByType(this._currentKeyMap, allKeys);
    const sorted = Object.entries(cats).sort(
      ([, a], [, b]) => (a.priority ?? 0) - (b.priority ?? 0),
    );
    for (const [id, data] of sorted) {
      const el = await this.createKeyCategoryElement(id, data, "key-type");
      fragment.appendChild(el);
    }
  }

  /**
   * Renders bindset sections view that works with all view types
   * @param {DocumentFragment} fragment - The fragment to render into
   * @param {string} viewMode - The view mode ('grid', 'key-types', 'command-category')
   * @param {KeyProfile} profile
   * @param {KeyMap} keyMap
   * @param {KeyMap} keysWithCommands
   * @param {string} environment
   */
  async renderBindsetSectionsView(
    fragment,
    viewMode,
    profile,
    keyMap,
    keysWithCommands,
    environment,
  ) {
    const sectionalKeys = projectBindsetSections(
      profile,
      keyMap,
      environment,
      this.cache.keyBrowserViewState,
    );

    // Render each bindset as a section using the working implementation
    for (const [bindsetName, bindsetData] of Object.entries(sectionalKeys)) {
      const sectionElement = await this.createBindsetSectionElement(
        bindsetName,
        bindsetData,
        viewMode,
        profile,
        keyMap,
        keysWithCommands,
        environment,
      );
      fragment.appendChild(sectionElement);
    }
  }

  // View-specific rendering methods for bindset sections

  /**
   * @param {DocumentFragment | HTMLElement} fragment
   * @param {string[]} keys
   * @param {KeyMap} bindsetData
   */
  async renderSimpleGridViewForKeys(fragment, keys, bindsetData) {
    // Filter and sort keys for this bindset
    const sortedKeys = keys.sort();

    // Render grid items
    for (const key of sortedKeys) {
      const keyEl = this.createKeyElement(key, bindsetData[key]);
      if (keyEl) {
        fragment.appendChild(keyEl);
      }
    }
  }

  /**
   * @param {DocumentFragment | HTMLElement} fragment
   * @param {KeyProfile} profile
   * @param {string[]} keys
   * @param {KeyMap} bindsetData
   */
  async renderKeyTypeViewForKeys(fragment, profile, keys, bindsetData) {
    // Categorize keys for this bindset
    /** @type {KeyMap} */
    const keyMap = {};
    keys.forEach((key) => {
      keyMap[key] = bindsetData[key] || [];
    });

    /** @type {KeyCategories} */
    const categorized = await this.categorizeKeysByType(keyMap, keys);

    // Sort categories: standard, weapon, system, movement, social
    const categoryOrder = [
      "standard",
      "weapon",
      "system",
      "movement",
      "social",
    ];
    const sortedCategories = Object.keys(categorized).sort((a, b) => {
      const aIndex = categoryOrder.indexOf(a.toLowerCase());
      const bIndex = categoryOrder.indexOf(b.toLowerCase());
      if (aIndex === -1 && bIndex === -1) return a.localeCompare(b);
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      return aIndex - bIndex;
    });

    for (const category of sortedCategories) {
      const categoryData = categorized[category];
      if (categoryData.keys.length === 0) continue;

      const el = this.document.createElement("div");
      el.className = "category-group";

      // Category header
      const header = this.document.createElement("div");
      header.className = "category-header";
      header.innerHTML = `<i class="fas ${categoryData.icon}"></i> ${categoryData.name}`;
      el.appendChild(header);

      // Commands container
      const commandsContainer = this.document.createElement("div");
      commandsContainer.className = "category-commands";
      categoryData.keys.forEach((k) => {
        const keyEl = this.createKeyElement(k, bindsetData[k]);
        if (keyEl) {
          commandsContainer.appendChild(keyEl);
        }
      });

      el.appendChild(commandsContainer);
      fragment.appendChild(el);
    }
  }

  /**
   * @param {DocumentFragment | HTMLElement} fragment
   * @param {KeyMap} keysWithCommands
   * @param {string[]} allKeys
   * @param {KeyMap} bindsetData
   */
  async renderCommandCategoryViewForKeys(
    fragment,
    keysWithCommands,
    allKeys,
    bindsetData,
  ) {
    const categorized = await this.categorizeKeys(keysWithCommands, allKeys);

    // Sort categories alphabetically
    const sortedCategories = Object.keys(categorized).sort();

    for (const category of sortedCategories) {
      const categoryData = categorized[category];
      if (categoryData.keys.length === 0) continue;

      // Filter keys to only include those in this bindset
      const bindsetCategoryKeys = categoryData.keys.filter((key) =>
        allKeys.includes(key),
      );

      if (bindsetCategoryKeys.length === 0) continue;

      const el = this.document.createElement("div");
      el.className = "category-group";

      // Category header
      const header = this.document.createElement("div");
      header.className = "category-header";
      header.textContent = category;
      el.appendChild(header);

      // Commands container
      const commandsContainer = this.document.createElement("div");
      commandsContainer.className = "category-commands";
      bindsetCategoryKeys.forEach((k) => {
        const keyEl = this.createKeyElement(k, bindsetData[k]);
        if (keyEl) {
          commandsContainer.appendChild(keyEl);
        }
      });

      el.appendChild(commandsContainer);
      fragment.appendChild(el);
    }
  }

  // Categorization helpers

  /**
   * @param {KeyMap} keysWithCommands
   * @param {string[]} allKeys
   * @returns {Promise<KeyCategories>}
   */
  async categorizeKeys(keysWithCommands, allKeys) {
    return await this.request("key:categorize-by-command", {
      keysWithCommands,
      allKeys,
    });
  }

  /**
   * @param {KeyMap} keysWithCommands
   * @param {string[]} allKeys
   * @returns {Promise<KeyCategories>}
   */
  async categorizeKeysByType(keysWithCommands, allKeys) {
    return await this.request("key:categorize-by-type", {
      keysWithCommands,
      allKeys,
    });
  }

  /** @param {string} keyName */
  formatKeyName(keyName) {
    return escapeHtml(keyName).replace(/\+/g, "<br>+");
  }

  /**
   * @param {string} keyName
   * @param {unknown} [bindsetContext]
   */
  createKeyElement(keyName, bindsetContext = null) {
    const keyMap = this._currentKeyMap || {};
    const commands = keyMap && keyMap[keyName] ? keyMap[keyName] : [];

    const isSelected = this.isKeySelectedInContext(keyName, bindsetContext);

    // After canonical string refactoring, commands should be an array of strings
    // During transition, handle both legacy rich objects and canonical strings
    const nonBlank = commands.filter((cmd) => {
      if (typeof cmd === "string") return cmd.trim() !== "";
      // Legacy support: rich objects with command property
      if (cmd && typeof cmd.command === "string")
        return cmd.command.trim() !== "";
      return false;
    });

    const el = this.document.createElement("div");
    el.className = `key-item ${isSelected ? "active" : ""}`;
    el.dataset.key = keyName;
    el.title = `${keyName}: ${nonBlank.length} command${nonBlank.length !== 1 ? "s" : ""}`;

    const formatted = this.formatKeyName(keyName);
    const keyLength = keyName.length;
    const lengthClass =
      keyLength <= 3
        ? "short"
        : keyLength <= 5
          ? "medium"
          : keyLength <= 8
            ? "long"
            : "extra-long";
    el.dataset.length = lengthClass;

    el.innerHTML = `<div class="key-label">${formatted}</div>${nonBlank.length > 0 ? `<div class="activity-bar" style="width:${Math.min(nonBlank.length * 15, 100)}%"></div><div class="command-count-badge">${nonBlank.length}</div>` : ""}`;

    this.onDom(el, "click", () => {
      // Check if this key is within a bindset section
      const bindsetSection = /** @type {HTMLElement | null} */ (
        el.closest(".bindset-section")
      );
      const bindsetName = bindsetSection?.dataset.bindset;

      // Fire select request; include environment and bindset context.
      // SelectionService will synchronize the active bindset before emitting key-selected.
      console.log(
        `[KeyBrowserUI] Sending key:select with bindset context: ${bindsetName}`,
      );
      this.request("key:select", {
        keyName,
        environment: this.cache?.currentEnvironment || "space",
        bindset:
          bindsetName && bindsetName !== "Primary Bindset" ? bindsetName : null,
      });
    });
    return el;
  }

  /**
   * @param {string} keyName
   * @param {unknown} bindsetContext
   */
  isKeySelectedInContext(keyName, bindsetContext) {
    // If no bindset context, use global selection (backward compatibility)
    if (!bindsetContext) {
      return keyName === this.cache.selectedKey;
    }

    // With bindset context, check if key is selected in that specific bindset
    // Leverages existing this.cache.activeBindset tracking
    return (
      keyName === this.cache.selectedKey &&
      this.cache.activeBindset === bindsetContext
    );
  }

  /**
   * @param {string} categoryId
   * @param {KeyCategory} categoryData
   * @param {string} [mode]
   * @param {unknown} [bindsetContext]
   */
  async createKeyCategoryElement(
    categoryId,
    categoryData,
    mode = "command",
    bindsetContext = null,
  ) {
    const element = this.document.createElement("div");
    element.className = "category";
    element.dataset.category = categoryId;

    const isCollapsed = isKeyCategoryCollapsed(
      this.cache.keyBrowserViewState,
      categoryId,
      mode,
    );

    element.innerHTML = `<h4 class="${isCollapsed ? "collapsed" : ""}" data-category="${categoryId}" data-mode="${mode}"><i class="fas fa-chevron-right category-chevron"></i><i class="${categoryData.icon}"></i>${categoryData.name}<span class="key-count">(${categoryData.keys.length})</span></h4><div class="category-commands ${isCollapsed ? "collapsed" : ""}">${categoryData.keys.map((k) => this.createKeyElement(k, bindsetContext).outerHTML).join("")}</div>`;

    // Attach header click to collapse/expand using EventBus
    const header = element.querySelector("h4");
    if (header) {
      this.onDom(header, "click", () => {
        this.toggleKeyCategory(categoryId, element, mode);
      });
    }

    // Replace placeholder html strings with actual elements
    const commandsContainer = element.querySelector(".category-commands");
    if (commandsContainer) {
      commandsContainer.innerHTML = "";
      categoryData.keys.forEach((k) =>
        commandsContainer.appendChild(this.createKeyElement(k, bindsetContext)),
      );
    }

    return element;
  }

  /**
   * @param {string} bindsetName
   * @param {BindsetSection} bindsetData
   * @param {string} [viewMode]
   * @param {KeyProfile | null} [profile]
   * @param {KeyMap} [primaryKeyMap]
   * @param {KeyMap} [keysWithCommands]
   * @param {string} [environment]
   */
  async createBindsetSectionElement(
    bindsetName,
    bindsetData,
    viewMode = "grid",
    profile = null,
    primaryKeyMap = {},
    keysWithCommands = {},
    environment = "space",
  ) {
    const sectionKeyMap =
      bindsetName === "Primary Bindset"
        ? primaryKeyMap
        : profile?.bindsets?.[bindsetName]?.[environment]?.keys || {};
    const sectionKeys = bindsetData.keys;

    const element = this.document.createElement("div");
    element.className = "bindset-section";
    element.dataset.bindset = bindsetName;

    // Create section header with command group separator styling
    const header = this.document.createElement("div");
    header.className = "bindset-header command-group-separator";
    header.dataset.bindset = bindsetName;
    header.dataset.action = "bindset-section-header";

    const headerInfo = this.document.createElement("div");
    headerInfo.className = "bindset-info group-info";

    const twisty = this.document.createElement("i");
    twisty.className = `fas fa-chevron-right twisty ${bindsetData.isCollapsed ? "collapsed" : ""}`;

    const name = this.document.createElement("span");
    name.className = "bindset-name group-title";
    name.textContent = bindsetName;

    const count = this.document.createElement("span");
    count.className = "bindset-count";
    count.textContent = `(${sectionKeys.length})`;

    headerInfo.appendChild(twisty);
    headerInfo.appendChild(name);
    headerInfo.appendChild(count);
    header.appendChild(headerInfo);

    // Add bindset management menu
    const actions = this.document.createElement("div");
    actions.className = "bindset-actions";

    // Create menu button
    const menuBtn = this.document.createElement("button");
    menuBtn.className = "control-btn bindset-menu-btn";
    menuBtn.dataset.action = "bindset-menu";
    menuBtn.innerHTML = '<i class="fas fa-ellipsis-v"></i>';
    menuBtn.title = this.i18n.t("bindset_actions");
    actions.appendChild(menuBtn);

    // Create dropdown menu
    const menuDropdown = this.document.createElement("div");
    menuDropdown.className = "bindset-menu-dropdown";
    menuDropdown.dataset.bindset = bindsetName;

    // Add menu items based on bindset type
    if (bindsetName === "Primary Bindset") {
      // Primary Bindset: Create + Clone actions
      this.addMenuItem(
        menuDropdown,
        "create",
        "fas fa-plus",
        this.i18n.t("create_bindset"),
        () => this.handleCreateBindset(),
      );
      this.addMenuItem(
        menuDropdown,
        "clone",
        "fas fa-copy",
        this.i18n.t("clone_bindset"),
        () => this.handleCloneBindset(bindsetName),
      );
    } else {
      // User-Defined Bindset: Clone + Rename + Delete actions
      this.addMenuItem(
        menuDropdown,
        "clone",
        "fas fa-copy",
        this.i18n.t("clone_bindset"),
        () => this.handleCloneBindset(bindsetName),
      );
      this.addMenuItem(
        menuDropdown,
        "rename",
        "fas fa-edit",
        this.i18n.t("rename_bindset"),
        () => this.handleRenameBindset(bindsetName),
      );
      this.addMenuItem(
        menuDropdown,
        "delete",
        "fas fa-trash",
        this.i18n.t("delete_bindset"),
        () => this.handleDeleteBindset(bindsetName),
        true,
      ); // dangerous = true
    }

    actions.appendChild(menuDropdown);

    // Attach menu button handler
    this.onDom(menuBtn, "click", (e) => {
      e.stopPropagation();
      this.toggleBindsetMenu(menuDropdown);
    });

    // Close menu when clicking outside
    this.onDom(this.document, "click", (e) => {
      if (
        !(e.target instanceof Element) ||
        !e.target.closest(".bindset-actions")
      ) {
        this.closeAllBindsetMenus();
      }
    });

    header.appendChild(actions);

    element.appendChild(header);

    // Create content area for keys
    const content = this.document.createElement("div");
    content.className = `bindset-content ${bindsetData.isCollapsed ? "collapsed" : ""}`;

    if (sectionKeys.length > 0) {
      // Cache keyMap for key element creation
      this._currentKeyMap = sectionKeyMap;

      if (viewMode === "key-types") {
        // Render key-types view for this bindset
        await this.renderKeyTypeViewForBindset(
          content,
          sectionKeys,
          sectionKeyMap,
          bindsetName,
          keysWithCommands,
        );
      } else if (viewMode === "categorized") {
        // Render command-category view for this bindset
        await this.renderCommandCategoryViewForBindset(
          content,
          sectionKeys,
          sectionKeyMap,
          bindsetName,
          keysWithCommands,
        );
      } else {
        // Default: grid view
        const keyGrid = this.document.createElement("div");
        keyGrid.className = "key-grid-subsection";

        sectionKeys.forEach((keyName) => {
          const keyElement = this.createKeyElement(keyName, bindsetName);
          keyGrid.appendChild(keyElement);
        });

        content.appendChild(keyGrid);
      }
    } else {
      const emptyMessage = this.document.createElement("div");
      emptyMessage.className = "empty-section";
      emptyMessage.textContent = this.i18n.t("no_keys_in_bindset");
      content.appendChild(emptyMessage);
    }

    element.appendChild(content);

    // Attach header click handler for collapse/expand
    this.onDom(header, "click", () => {
      this.toggleBindsetSection(bindsetName, element);
    });

    return element;
  }

  // Helper methods for rendering different view types within bindset sections

  /**
   * @param {HTMLElement} content
   * @param {string[]} keys
   * @param {KeyMap} keyMap
   * @param {string} bindsetName
   * @param {KeyMap} keysWithCommands
   */
  async renderKeyTypeViewForBindset(
    content,
    keys,
    keyMap,
    bindsetName,
    keysWithCommands,
  ) {
    const categorized = await this.categorizeKeysByType(keysWithCommands, keys);

    // Sort categories: standard, weapon, system, movement, social
    const categoryOrder = [
      "standard",
      "weapon",
      "system",
      "movement",
      "social",
    ];
    const sortedCategories = Object.keys(categorized).sort((a, b) => {
      const aIndex = categoryOrder.indexOf(a.toLowerCase());
      const bIndex = categoryOrder.indexOf(b.toLowerCase());
      if (aIndex === -1 && bIndex === -1) return a.localeCompare(b);
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      return aIndex - bIndex;
    });

    for (const category of sortedCategories) {
      const categoryData = categorized[category];
      if (categoryData.keys.length === 0) continue;

      // Use the same createKeyCategoryElement method as non-bindset views
      const el = await this.createKeyCategoryElement(
        category,
        categoryData,
        "type",
        bindsetName,
      );
      content.appendChild(el);
    }
  }

  /**
   * @param {HTMLElement} content
   * @param {string[]} keys
   * @param {KeyMap} keyMap
   * @param {string} bindsetName
   * @param {KeyMap} keysWithCommands
   */
  async renderCommandCategoryViewForBindset(
    content,
    keys,
    keyMap,
    bindsetName,
    keysWithCommands,
  ) {
    const categorized = await this.categorizeKeys(keysWithCommands, keys);

    // Sort categories alphabetically
    const sortedCategories = Object.keys(categorized).sort();

    for (const category of sortedCategories) {
      const categoryData = categorized[category];
      if (categoryData.keys.length === 0) continue;

      // Transform the data to match createKeyCategoryElement expectations
      // The categorized data has a different structure, so we need to adapt it
      const adaptedCategoryData = {
        name: this.i18n.t(category),
        icon: "fas fa-folder", // Default icon for command categories
        keys: categoryData.keys,
      };

      // Use the same createKeyCategoryElement method as non-bindset views
      const el = await this.createKeyCategoryElement(
        category,
        adaptedCategoryData,
        "command",
        bindsetName,
      );
      content.appendChild(el);
    }
  }

  /**
   * @param {string} categoryId
   * @param {HTMLElement} element
   * @param {string} [mode]
   */
  async toggleKeyCategory(categoryId, element, mode = "command") {
    // Use service to handle business logic
    const isCollapsed = await this.request("key:toggle-category", {
      categoryId,
      mode,
    });

    // Update DOM to reflect new state
    const header = element.querySelector("h4");
    const commands = element.querySelector(".category-commands");

    if (isCollapsed) {
      if (!header || !commands) return;
      header.classList.add("collapsed");
      commands.classList.add("collapsed");
    } else {
      if (!header || !commands) return;
      header.classList.remove("collapsed");
      commands.classList.remove("collapsed");
    }
  }

  /**
   * @param {string} bindsetName
   * @param {HTMLElement} element
   */
  async toggleBindsetSection(bindsetName, element) {
    // Use service to handle business logic
    const isCollapsed = await this.request("bindset:toggle-collapse", {
      bindsetName,
    });

    // Update DOM to reflect new state
    const header = element.querySelector(".bindset-header");
    const content = element.querySelector(".bindset-content");
    const twisty = element.querySelector(".twisty");

    if (isCollapsed) {
      header?.classList.add("collapsed");
      content?.classList.add("collapsed");
      if (twisty) {
        twisty.classList.add("collapsed");
      }
    } else {
      header?.classList.remove("collapsed");
      content?.classList.remove("collapsed");
      if (twisty) {
        twisty.classList.remove("collapsed");
      }
    }
  }

  // Helper method to count keys in a bindset
  /** @param {string} bindsetName */
  async countBindsetKeys(bindsetName) {
    try {
      // Use the same data access pattern as BindsetService for consistency
      const profile = this.cache.profile;
      console.log(`[KeyBrowserUI] countBindsetKeys for "${bindsetName}":`, {
        profile: !!profile,
        profileBindsets: !!profile?.bindsets,
        bindsetKeys: Object.keys(profile?.bindsets || {}),
        targetBindset: profile?.bindsets?.[bindsetName],
      });

      const bindset = profile?.bindsets?.[bindsetName];
      if (!bindset) {
        console.log(
          `[KeyBrowserUI] countBindsetKeys: bindset "${bindsetName}" not found`,
        );
        return 0;
      }

      let keyCount = 0;
      /** @param {string} env */
      const hasKeys = (env) => {
        const envData = bindset?.[env]?.keys;
        const envKeyCount = Object.keys(envData ?? {}).length;
        const hasEnvKeys = envKeyCount > 0;
        console.log(
          `[KeyBrowserUI] countBindsetKeys: env "${env}" has keys: ${hasEnvKeys}, key count: ${envKeyCount}`,
        );
        return hasEnvKeys;
      };

      // Use the same logic as BindsetService.deleteBindset for consistency
      if (hasKeys("space"))
        keyCount += Object.keys(bindset.space?.keys ?? {}).length;
      if (hasKeys("ground"))
        keyCount += Object.keys(bindset.ground?.keys ?? {}).length;

      console.log(
        `[KeyBrowserUI] countBindsetKeys: final count for "${bindsetName}" = ${keyCount}`,
      );

      // Fallback validation: if cache returns 0, try service verification
      if (keyCount === 0) {
        console.log(
          `[KeyBrowserUI] countBindsetKeys: cache reports 0 keys, checking with service...`,
        );
        try {
          // Use the bindset:delete endpoint (without force) to check if bindset is truly empty
          const serviceCheck = await this.request("bindset:delete", {
            name: bindsetName,
          });
          console.log(
            `[KeyBrowserUI] countBindsetKeys: service check result:`,
            serviceCheck,
          );

          // If service says bindset is not empty, use a conservative estimate
          if (
            serviceCheck?.success === false &&
            serviceCheck?.error === "not_empty"
          ) {
            console.log(
              `[KeyBrowserUI] countBindsetKeys: service indicates bindset has keys, using fallback count`,
            );
            return 1; // Fallback count - any positive number will trigger multi-step confirmation
          }
        } catch (serviceError) {
          console.warn(
            `[KeyBrowserUI] countBindsetKeys: service check failed:`,
            serviceError,
          );
          // Stick with cache result if service check fails
        }
      }

      return keyCount;
    } catch (error) {
      console.error("Error counting bindset keys:", error);
      return 0;
    }
  }

  // Confirm deletion of a bindset
  /** @param {string} bindsetName */
  async confirmDeleteBindset(bindsetName) {
    if (!bindsetName || !this.confirmDialog) return false;

    // Check if bindset contains keys
    const keyCount = await this.countBindsetKeys(bindsetName);

    if (keyCount > 0) {
      // Use multi-step confirmation for bindsets with keys
      const confirmed = await this.bindsetDeleteConfirm.confirm(
        bindsetName,
        keyCount,
        "bindsetDelete",
      );
      if (confirmed) {
        const result = await this.request("bindset:delete-with-keys", {
          name: bindsetName,
        });
        if (result?.success) {
          const successMessage = this.i18n.t("bindset_deleted", {
            name: bindsetName,
          });
          this.showToast(successMessage, "success");
          return true;
        } else {
          const errorMessage = this.i18n.t(result?.error, result?.params);
          this.showToast(errorMessage, "error");
          return false;
        }
      }
      return false;
    } else {
      // Use simple confirmation for empty bindsets
      const message = this.i18n.t("confirm_delete_bindset", {
        name: bindsetName,
      });
      const title = this.i18n.t("confirm_delete");

      if (
        await this.confirmDialog.confirm(
          message,
          title,
          "danger",
          "bindsetDelete",
        )
      ) {
        const result = await this.request("bindset:delete", {
          name: bindsetName,
        });
        if (result?.success) {
          const successMessage = this.i18n.t("bindset_deleted", {
            name: bindsetName,
          });
          this.showToast(successMessage, "success");
          return true;
        } else {
          const errorMessage = this.i18n.t(result?.error, result?.params);
          this.showToast(errorMessage, "error");
          return false;
        }
      }

      return false;
    }
  }

  async toggleKeyView() {
    // The accepted cache is the only environment authority used by this UI.
    if (this.cache.currentEnvironment === "alias") return;

    // Persistence and mode sequencing belong to KeyBrowserService. The
    // resulting complete snapshot drives both the button and the full render.
    await this.request("key:cycle-view-mode");
  }

  /** @param {string} [filter] */
  filterKeys(filter = "") {
    const filterLower = (filter || "").toString().toLowerCase();

    const grid = this.document.getElementById("keyGrid");
    if (!grid) return;

    // Determine which rendered keys should remain visible.
    const allKeys = Array.from(grid.querySelectorAll(".key-item"))
      .map((item) => {
        const keyItem = /** @type {HTMLElement} */ (item);
        return keyItem.dataset.key;
      })
      .filter((keyName) => typeof keyName === "string");
    const visibleKeys = new Set();

    allKeys.forEach((keyName) => {
      const shouldShow =
        !filterLower || keyName.toLowerCase().includes(filterLower);
      if (shouldShow) visibleKeys.add(keyName);
    });

    // Apply visibility to DOM elements
    grid.querySelectorAll(".key-item").forEach((item) => {
      const keyItem = /** @type {HTMLElement} */ (item);
      const keyName = keyItem.dataset.key;
      const visible = typeof keyName === "string" && visibleKeys.has(keyName);
      keyItem.style.display = visible ? "flex" : "none";
    });

    grid.querySelectorAll(".command-item[data-key]").forEach((item) => {
      const commandItem = /** @type {HTMLElement} */ (item);
      const keyName = commandItem.dataset.key;
      const visible = typeof keyName === "string" && visibleKeys.has(keyName);
      commandItem.style.display = visible ? "flex" : "none";
    });

    grid.querySelectorAll(".category").forEach((category) => {
      const visibleKeys = category.querySelectorAll(
        '.command-item[data-key]:not([style*="display: none"])',
      );
      const categoryVisible = !filterLower || visibleKeys.length > 0;
      const categoryElement = /** @type {HTMLElement} */ (category);
      categoryElement.style.display = categoryVisible ? "block" : "none";
    });

    // After category display update, update search button active state
    const searchBtn = this.document.getElementById("keySearchBtn");
    if (searchBtn) {
      const active = !!filterLower;
      searchBtn.classList.toggle("active", active);
      searchBtn.setAttribute("aria-pressed", String(active));
    }
  }

  showAllKeys() {
    const grid = this.document.getElementById("keyGrid");
    if (!grid) return;

    // Show all elements (no filtering)
    grid.querySelectorAll(".key-item").forEach((item) => {
      /** @type {HTMLElement} */ (item).style.display = "flex";
    });
    grid.querySelectorAll(".command-item[data-key]").forEach((item) => {
      /** @type {HTMLElement} */ (item).style.display = "flex";
    });
    grid.querySelectorAll(".category").forEach((category) => {
      /** @type {HTMLElement} */ (category).style.display = "block";
    });

    const filterInput = /** @type {HTMLInputElement | null} */ (
      this.document.getElementById("keyFilter")
    );
    if (filterInput) filterInput.value = "";

    // Ensure search button no longer active
    const searchBtn = this.document.getElementById("keySearchBtn");
    if (searchBtn) {
      searchBtn.classList.remove("active");
      searchBtn.setAttribute("aria-pressed", "false");
    }
  }

  /** @param {string} env */
  toggleVisibility(env) {
    // Ensure DOM is ready before trying to manipulate elements
    const applyVisibility = () => {
      const container = /** @type {HTMLElement | null} */ (
        this.document.querySelector(".key-selector-container")
      );
      if (!container) {
        // Container doesn't exist yet - DOM may not be ready
        console.warn("[KeyBrowserUI] Key selector container not found in DOM");
        return;
      }

      const shouldShow = env !== "alias";
      if (shouldShow) {
        // Show the container by removing display property
        container.style.removeProperty("display");
      } else {
        // Hide the container with important flag to ensure it takes precedence
        container.style.setProperty("display", "none", "important");
      }
    };

    // Use requestAnimationFrame to ensure DOM is rendered
    requestAnimationFrame(applyVisibility);
  }

  // Late-join: sync visibility when initial state snapshot is received.
  /**
   * @param {import('../../types/events/component-state.js').ComponentStateReply} reply
   */
  handleInitialState(reply) {
    const { sender, state } = reply;
    if (sender === "KeyBrowserService") {
      acceptViewState(this, state);
    }
    super.handleInitialState(reply);

    if (sender === "KeyBrowserService") return;

    // Restore selection from SelectionService late-join
    if (sender === "SelectionService") {
      return;
    }
    // Handle environment state from various sources
    const env =
      ("environment" in state ? state.environment : undefined) ||
      ("currentEnvironment" in state ? state.currentEnvironment : undefined);
    if (env) {
      // Environment now tracked by ComponentBase in this.cache.currentEnvironment
      this.toggleVisibility(env);
    }
    // Service state is now managed internally via events - no direct access needed
  }

  // Show key selection modal for adding new keys
  showKeySelectionModal() {
    if (this.modalManager) {
      this.modalManager.show("keySelectionModal");
    }
  }

  // Confirm deletion of a key
  /** @param {string} keyName */
  async confirmDeleteKey(keyName) {
    if (!keyName || !this.confirmDialog) return false;

    const message = this.i18n.t("confirm_delete_key", { keyName: keyName });
    const title = this.i18n.t("confirm_delete");

    if (
      await this.confirmDialog.confirm(message, title, "danger", "keyDelete")
    ) {
      // Use the request/response pattern to delete key from KeyService
      const result = await this.request("key:delete", { key: keyName });
      if (result?.success) {
        const successMessage = this.i18n.t("key_deleted", { keyName });
        this.showToast(successMessage, "success");
        return true;
      } else {
        const errorMessage = this.i18n.t(result?.error, result?.params);
        this.showToast(errorMessage, "error");
        return false;
      }
    }

    return false;
  }

  // Duplicate the selected key
  /** @param {string} key */
  async duplicateKey(key) {
    if (!key) return false;

    // Defer to KeyCaptureUI so the user can choose the target key name.
    this.emit("key:duplicate", { key });
    return true;
  }

  // Toggle key search functionality
  toggleKeySearch() {
    const doc =
      this.document ||
      (typeof window !== "undefined" ? window.document : undefined);
    if (!doc) return;
    const searchInput = doc.getElementById("keyFilter");
    if (!searchInput) return;

    const expanded = searchInput.classList.toggle("expanded");
    if (expanded) {
      searchInput.focus();
    } else {
      searchInput.blur();
    }
  }

  // UIComponentBase: Check if component has required data for rendering
  // KeyBrowserUI needs profile and environment data to render the key grid
  hasRequiredData() {
    // We need both profile and environment data to render keys properly
    return Boolean(
      this.cache.currentProfile &&
        this.cache.currentEnvironment &&
        this.cache.keys !== undefined &&
        this.cache.keyBrowserViewState !== null,
    );
  }

  // UIComponentBase: Perform initial render when data dependencies are ready
  // This replaces the setTimeout retry pattern for DOM availability
  performInitialRender() {
    // Render the key grid when data is available
    this.render().catch((error) => {
      console.error("[KeyBrowserUI] Initial render failed:", error);
    });
  }

  // Bindset menu helper methods
  /**
   * @param {HTMLElement} menu
   * @param {'create' | 'clone' | 'rename' | 'delete'} action
   * @param {string} icon
   * @param {string} text
   * @param {() => void} handler
   * @param {boolean} [dangerous]
   */
  addMenuItem(menu, action, icon, text, handler, dangerous = false) {
    const item = this.document.createElement("div");
    item.className = `bindset-menu-item ${dangerous ? "dangerous" : ""}`;
    item.dataset.action = action;
    item.innerHTML = `<i class="${icon}"></i><span>${text}</span>`;

    this.onDom(item, "click", (e) => {
      e.stopPropagation();
      handler();
      this.closeAllBindsetMenus();
    });

    menu.appendChild(item);
  }

  /** @param {HTMLElement} menuDropdown */
  toggleBindsetMenu(menuDropdown) {
    const isOpen = menuDropdown.classList.contains("open");
    this.closeAllBindsetMenus();

    if (!isOpen) {
      menuDropdown.classList.add("open");
    }
  }

  closeAllBindsetMenus() {
    this.document
      .querySelectorAll(".bindset-menu-dropdown.open")
      .forEach((menu) => {
        menu.classList.remove("open");
      });
  }

  // Bindset action handlers
  /** @param {string} err */
  showError(err) {
    /** @type {Record<string, string>} */
    const errorKeys = {
      invalid_name: "invalid_name",
      name_exists: "bindset_name_in_use",
      not_found: "not_found",
      not_empty: "bindset_not_empty",
    };
    const key = errorKeys[err] || "error";
    const errorElement = this.document.getElementById("bindsetError");
    if (!errorElement) return;

    errorElement.textContent = this.i18n.t(key);
    errorElement.style.display = "";
    setTimeout(() => {
      errorElement.style.display = "none";
    }, 4000);
  }

  async handleCreateBindset() {
    if (!this.inputDialog) return;

    const title = this.i18n.t("create_bindset");
    const message = this.i18n.t("enter_bindset_name");

    const name = await this.inputDialog.prompt(message, {
      title,
      placeholder: this.i18n.t("bindset_name"),
      validate: (value) => {
        const trimmed = value.trim();
        if (!trimmed) return this.i18n.t("name_required");
        if (this.cache.bindsetNames.includes(trimmed))
          return this.i18n.t("name_exists");
        return true;
      },
    });

    if (!name?.trim()) return;
    const res = await this.request("bindset:create", { name: name.trim() });
    if (!res?.success) this.showError(res.error);
  }

  /** @param {string} bindsetName */
  async handleCloneBindset(bindsetName) {
    if (!this.inputDialog) return;

    const title = this.i18n.t("clone_bindset");
    const message = this.i18n.t("enter_bindset_name");
    const suggestedName =
      bindsetName === "Primary Bindset"
        ? this.i18n.t("primary_bindset_copy_default")
        : `${bindsetName} ${this.i18n.t("copy_suffix")}`;

    const name = await this.inputDialog.prompt(message, {
      title,
      defaultValue: suggestedName,
      placeholder: this.i18n.t("bindset_name"),
      validate: (value) => {
        const trimmed = value.trim();
        if (!trimmed) return this.i18n.t("name_required");
        if (trimmed === bindsetName) return this.i18n.t("name_unchanged");
        if (this.cache.bindsetNames.includes(trimmed))
          return this.i18n.t("name_exists");
        return true;
      },
    });

    if (!name?.trim() || name.trim() === bindsetName) return;
    const res = await this.request("bindset:clone", {
      sourceBindset: bindsetName,
      targetBindset: name.trim(),
    });
    if (!res?.success) this.showError(res.error);
  }

  /** @param {string} bindsetName */
  async handleRenameBindset(bindsetName) {
    if (!this.inputDialog) return;

    const title = this.i18n.t("rename_bindset");
    const message = this.i18n.t("enter_bindset_name");

    const name = await this.inputDialog.prompt(message, {
      title,
      defaultValue: bindsetName,
      placeholder: this.i18n.t("bindset_name"),
      validate: (value) => {
        const trimmed = value.trim();
        if (!trimmed) return this.i18n.t("name_required");
        if (trimmed === bindsetName) return this.i18n.t("name_unchanged");
        if (this.cache.bindsetNames.includes(trimmed))
          return this.i18n.t("name_exists");
        return true;
      },
    });

    if (!name?.trim() || name.trim() === bindsetName) return;
    const res = await this.request("bindset:rename", {
      oldName: bindsetName,
      newName: name.trim(),
    });
    if (!res?.success) this.showError(res.error);
  }

  /** @param {string} bindsetName */
  handleDeleteBindset(bindsetName) {
    this.confirmDeleteBindset(bindsetName);
  }
}
