import ComponentBase from "../ComponentBase.js";
import commandCategories from "../../data/commandCatalog.js";
import { compareKeyNames, sortKeyNames } from "./keySorting.js";
import {
  applyBindsetCollapse,
  applyKeyCategoryCollapse,
  applyNextKeyViewMode,
  cloneKeyBrowserViewState,
  nextKeyBrowserAuthorityEpoch,
  readNextBindsetCollapse,
  readNextKeyCategoryCollapse,
  readKeyBrowserViewState,
  writeBindsetCollapse,
  writeKeyCategoryCollapse,
  writeKeyViewMode,
} from "./keyBrowserViewState.js";

/** @typedef {{ name: string, icon: string, keys: Set<string>, priority: number }} KeyCategory */
/** @typedef {Record<string, KeyCategory>} KeyCategoryMap */
/** @typedef {import('./serviceTypes.js').StoredCommand} BrowserCommand */
/** @typedef {Record<string, BrowserCommand[]>} CommandsByKey */

/**
 * KeyBrowserService – source-of-truth for the key grid.
 * Keeps track of the active profile/environment and exposes
 * helpers for retrieving keybind data as well as selecting keys
 * in a decoupled, event-driven manner.
 */
export default class KeyBrowserService extends ComponentBase {
  /**
   * @param {{
   *   eventBus?: import('./serviceTypes.js').EventBus,
   *   i18n?: import('./serviceTypes.js').I18n,
   *   localStorage?: import('./keyBrowserViewState.js').KeyBrowserStorage
   * }} [options]
   */
  constructor({ eventBus, i18n, localStorage = globalThis.localStorage } = {}) {
    super(eventBus);
    this.componentName = "KeyBrowserService";
    this.i18n =
      i18n ??
      /** @type {import('./serviceTypes.js').I18n} */ ({
        t: (key) => key,
      });
    this.localStorage = localStorage;
    // View persistence is required for availability; bootstrap scan
    // failures intentionally abort construction and lifecycle initialization.
    this.viewState = readKeyBrowserViewState(this.localStorage, {
      authorityEpoch: nextKeyBrowserAuthorityEpoch(),
      revision: 0,
    });

    /** @type {Array<() => void>} */
    this._responseDetachFunctions = [];

    this.setupRequestHandlers();
  }

  setupRequestHandlers() {
    if (!this.eventBus || this._responseDetachFunctions.length > 0) return;

    this._responseDetachFunctions.push(
      this.respond("bindset:toggle-collapse", ({ bindsetName }) =>
        this.toggleBindsetCollapse(bindsetName),
      ),
      this.respond(
        "key:categorize-by-command",
        ({ keysWithCommands, allKeys }) =>
          this.categorizeKeys(keysWithCommands, allKeys),
      ),
      this.respond("key:categorize-by-type", ({ keysWithCommands, allKeys }) =>
        this.categorizeKeysByType(keysWithCommands, allKeys),
      ),
      this.respond("key:cycle-view-mode", () => this.cycleKeyViewMode()),
      this.respond("key:sort", ({ keys }) => this.sortKeys(keys)),
      this.respond("key:toggle-category", ({ categoryId, mode }) =>
        this.toggleKeyCategory(categoryId, mode),
      ),
    );
  }

  onInit() {
    this.setupRequestHandlers();
    this.viewState = readKeyBrowserViewState(this.localStorage, {
      authorityEpoch: nextKeyBrowserAuthorityEpoch(),
      revision: 0,
    });
    this.setupEventListeners();
    this.publishViewState();
  }

  onDestroy() {
    for (const detach of this._responseDetachFunctions) detach();
    this._responseDetachFunctions = [];
  }

  /** @param {import('../../types/events/component-state.js').KeyBrowserViewStateSnapshot} [state] */
  publishViewState(state = this.getCurrentState()) {
    this.emit("key-browser:state-changed", state);
  }

  /** @returns {import('../../types/events/component-state.js').ComponentState<'KeyBrowserService'>} */
  getCurrentState() {
    return cloneKeyBrowserViewState(this.viewState);
  }

  setupEventListeners() {
    // ComponentBase automatically handles profile and environment caching
    // We only need to listen for these events to update our specific business logic
    this.addEventListener("profile:updated", ({ profileId, profile }) => {
      if (profileId === this.cache.currentProfile) {
        this.updateCacheFromProfile(profile);
        this.emit("key:list-changed", { keys: this.getKeys() });
      }
    });

    this.addEventListener(
      "profile:switched",
      ({ profileId, profile, environment }) => {
        this.cache.currentProfile = profileId;

        if (environment) {
          this.cache.currentEnvironment = environment;
        }

        this.updateCacheFromProfile(profile);
        this.emit("key:list-changed", { keys: this.getKeys() });
      },
    );

    this.addEventListener("environment:changed", async (payload) => {
      const env = payload.environment;
      if (!env) return;

      // ComponentBase handles currentEnvironment and keys caching
      this.emit("key:list-changed", { keys: this.getKeys() });
    });
  }

  // Update local cache from profile data
  /** @param {import('./serviceTypes.js').ProfileData | null | undefined} profile */
  updateCacheFromProfile(profile) {
    if (!profile) return;

    // ComponentBase handles profile, builds, and keys caching automatically
    // This method can be used for service-specific logic if needed
    console.log(
      `[KeyBrowserService] Profile updated - ComponentBase handles caching automatically`,
    );
  }

  // Selection caching and auto-selection

  // Data helpers now use cached data
  getKeys() {
    // Return cached keys for current environment
    return this.cache.keys || {};
  }

  // Data Processing Methods (moved from KeyBrowserUI)
  /** @param {CommandsByKey} keysWithCommands @param {string[]} allKeys */
  async categorizeKeys(keysWithCommands, allKeys) {
    /** @type {KeyCategoryMap} */
    const categories = {
      unknown: {
        name: "Unknown",
        icon: "fas fa-question-circle",
        keys: new Set(),
        priority: 0,
      },
    };

    Object.entries(commandCategories).forEach(([categoryId, category]) => {
      categories[categoryId] = {
        name: category.name || categoryId,
        icon: category.icon || "",
        keys: new Set(),
        priority: 1,
      };
    });

    // Process each key's commands async
    await Promise.all(
      allKeys.map(async (keyName) => {
        const commands = keysWithCommands[keyName] || [];

        if (!commands || commands.length === 0) {
          categories.unknown.keys.add(keyName);
          return;
        }

        /** @type {Set<string>} */
        const keyCats = new Set();

        // Process each command async
        await Promise.all(
          commands.map(async (command) => {
            // Handle both new format (category) and legacy format (type)
            const commandCategory =
              typeof command === "string"
                ? undefined
                : command.category || command.type;
            if (commandCategory && categories[commandCategory]) {
              keyCats.add(commandCategory);
            } else {
              // Use STOCommandParser via event bus for command category detection
              try {
                const commandString =
                  typeof command === "string" ? command : command.command;
                if (!commandString) {
                  throw new Error("Command has no parsable text");
                }
                const result = await this.request(
                  "parser:parse-command-string",
                  {
                    commandString,
                    options: { generateDisplayText: false },
                  },
                );
                if (result.commands && result.commands.length > 0) {
                  const detected = result.commands[0].category;
                  if (categories[detected]) keyCats.add(detected);
                }
              } catch {
                // Fallback to custom category if parsing fails
                if (!categories.custom) {
                  categories.custom = {
                    name: this.i18n.t("custom"),
                    icon: "fas fa-cog",
                    keys: new Set(),
                    priority: 2,
                  };
                }
              }
            }
          }),
        );

        if (keyCats.size > 0) {
          keyCats.forEach((cid) => categories[cid].keys.add(keyName));
        } else {
          if (!categories.custom)
            categories.custom = {
              name: this.i18n.t("custom"),
              icon: "fas fa-cog",
              keys: new Set(),
              priority: 2,
            };
          categories.custom.keys.add(keyName);
        }
      }),
    );

    return Object.fromEntries(
      Object.entries(categories).map(([id, cat]) => [
        id,
        {
          ...cat,
          keys: Array.from(cat.keys).sort((a, b) => this.compareKeys(a, b)),
        },
      ]),
    );
  }

  // Detect key types based on name patterns
  /** @param {string} keyName */
  detectKeyTypes(keyName) {
    /** @type {string[]} */
    const types = [];
    if (/^F[0-9]+$/.test(keyName)) types.push("function");
    if (/^[A-Z0-9]$/.test(keyName)) types.push("alphanumeric");
    if (/^NUMPAD/.test(keyName)) types.push("numberpad");
    if (/(Ctrl|Alt|Shift)/.test(keyName)) types.push("modifiers");
    if (/(UP|DOWN|LEFT|RIGHT|HOME|END|PGUP|PGDN)/.test(keyName))
      types.push("navigation");
    if (/(ESC|TAB|CAPS|PRINT|SCROLL|PAUSE|Space|Enter|Escape)/.test(keyName))
      types.push("system");
    if (/MOUSE|WHEEL/.test(keyName)) types.push("mouse");
    // Only consider it a symbol if it contains actual punctuation/symbols and isn't already categorized
    if (types.length === 0 && /[^A-Za-z0-9]/.test(keyName))
      types.push("symbols");
    if (types.length === 0) types.push("other");
    return types;
  }

  // Categorize keys by physical type (function keys, letters, etc.)
  /** @param {CommandsByKey} keysWithCommands @param {string[]} allKeys */
  categorizeKeysByType(keysWithCommands, allKeys) {
    /** @type {KeyCategoryMap} */
    const categories = {
      function: {
        name: this.i18n.t("key_type.function_keys"),
        icon: "fas fa-keyboard",
        keys: new Set(),
        priority: 1,
      },
      alphanumeric: {
        name: this.i18n.t("key_type.letters_numbers"),
        icon: "fas fa-font",
        keys: new Set(),
        priority: 2,
      },
      numberpad: {
        name: this.i18n.t("key_type.numberpad"),
        icon: "fas fa-calculator",
        keys: new Set(),
        priority: 3,
      },
      modifiers: {
        name: this.i18n.t("key_type.modifier_keys"),
        icon: "fas fa-hand-paper",
        keys: new Set(),
        priority: 4,
      },
      navigation: {
        name: this.i18n.t("key_type.navigation"),
        icon: "fas fa-arrows-alt",
        keys: new Set(),
        priority: 5,
      },
      system: {
        name: this.i18n.t("key_type.system_keys"),
        icon: "fas fa-cogs",
        keys: new Set(),
        priority: 6,
      },
      mouse: {
        name: this.i18n.t("key_type.mouse_wheel"),
        icon: "fas fa-mouse",
        keys: new Set(),
        priority: 7,
      },
      symbols: {
        name: this.i18n.t("key_type.symbols_punctuation"),
        icon: "fas fa-at",
        keys: new Set(),
        priority: 8,
      },
      other: {
        name: this.i18n.t("key_type.other_keys"),
        icon: "fas fa-question-circle",
        keys: new Set(),
        priority: 9,
      },
    };

    allKeys.forEach((keyName) => {
      const types = this.detectKeyTypes(keyName);
      types.forEach((t) =>
        (categories[t] || categories.other).keys.add(keyName),
      );
    });

    return Object.fromEntries(
      Object.entries(categories).map(([id, category]) => [
        id,
        {
          ...category,
          keys: Array.from(category.keys).sort((a, b) =>
            this.compareKeys(a, b),
          ),
        },
      ]),
    );
  }

  // Compare two key names for sorting
  /** @param {string} a @param {string} b */
  compareKeys(a, b) {
    return compareKeyNames(a, b);
  }

  // Sort an array of keys using the compareKeys logic
  /** @param {string[] | unknown} keys */
  sortKeys(keys) {
    return sortKeyNames(keys);
  }

  // Toggle category collapsed state
  /** @param {string} categoryId @param {string} [mode] */
  toggleKeyCategory(categoryId, mode = "command") {
    if (!categoryId) return false;
    const isCollapsed = readNextKeyCategoryCollapse(
      this.localStorage,
      categoryId,
      mode,
    );
    const nextState = applyKeyCategoryCollapse(
      this.viewState,
      categoryId,
      mode,
      isCollapsed,
    );
    const publishedState = cloneKeyBrowserViewState(nextState);
    writeKeyCategoryCollapse(this.localStorage, categoryId, mode, isCollapsed);
    this.viewState = nextState;
    this.publishViewState(publishedState);
    return isCollapsed;
  }

  // Toggle bindset collapsed state
  /** @param {string | undefined} bindsetName */
  toggleBindsetCollapse(bindsetName) {
    if (!bindsetName) return false;
    const isCollapsed = readNextBindsetCollapse(this.localStorage, bindsetName);
    const nextState = applyBindsetCollapse(
      this.viewState,
      bindsetName,
      isCollapsed,
    );
    const publishedState = cloneKeyBrowserViewState(nextState);
    writeBindsetCollapse(this.localStorage, bindsetName, isCollapsed);
    this.viewState = nextState;
    this.publishViewState(publishedState);

    return isCollapsed;
  }

  /** @returns {import('../../types/events/base.js').KeyViewMode} */
  cycleKeyViewMode() {
    const nextState = applyNextKeyViewMode(this.viewState);
    const publishedState = cloneKeyBrowserViewState(nextState);
    writeKeyViewMode(this.localStorage, nextState.mode);
    this.viewState = nextState;
    this.publishViewState(publishedState);
    return nextState.mode;
  }
}
