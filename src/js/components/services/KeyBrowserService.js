import ComponentBase from "../ComponentBase.js";
import { ScalarOwnerProtocol } from "./scalarOwnerProtocol.js";
import {
  materializeBindsetCollapseRequest,
  materializeKeyCategoryRequest,
  materializeScalarEmptyRequest,
} from "./scalarMutationBoundary.js";
import commandCategories from "../../data/commandCatalog.js";
import { compareKeyNames, sortKeyNames } from "./keySorting.js";
import {
  applyBindsetCollapse,
  applyKeyCategoryCollapse,
  applyNextKeyViewMode,
  cloneKeyBrowserViewState,
  nextKeyBrowserAuthorityEpoch,
  readKeyBrowserViewState,
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
  /** @type {import('../storage/KeyBrowserPersistencePort.js').KeyBrowserPersistencePort} */
  #persistence;
  /** @type {ScalarOwnerProtocol} */
  #protocol;
  /** @type {Promise<void>} */
  initialStateReady = Promise.resolve();

  /**
   * @param {{
   *   eventBus?: import('./serviceTypes.js').EventBus,
   *   i18n?: import('./serviceTypes.js').I18n,
   *   persistence: import('../storage/KeyBrowserPersistencePort.js').KeyBrowserPersistencePort
   * }} options
   */
  constructor({ eventBus, i18n, persistence }) {
    super(eventBus);
    this.componentName = "KeyBrowserService";
    this.i18n =
      i18n ??
      /** @type {import('./serviceTypes.js').I18n} */ ({
        t: (key) => key,
      });
    this.#persistence = persistence;
    // View persistence is required for availability; bootstrap scan
    // failures intentionally abort construction and lifecycle initialization.
    this.viewState = readKeyBrowserViewState(
      {
        mode: "grid",
        collapsedCategories: { command: [], keyType: [] },
        collapsedBindsets: [],
      },
      {
        authorityEpoch: 0,
        revision: 0,
      },
    );

    /** @type {Array<() => void>} */
    this._responseDetachFunctions = [];

    this.#protocol = new ScalarOwnerProtocol(
      this,
      this.componentName,
      eventBus ?? persistence,
    );
    this.#hydrate();
  }

  setupRequestHandlers() {
    if (
      !this.eventBus ||
      !this.#protocol.ready ||
      this._responseDetachFunctions.length > 0
    )
      return;

    this._responseDetachFunctions.push(
      this.respond("bindset:toggle-collapse", (payload) => {
        const bindsetName = materializeBindsetCollapseRequest(payload);
        return this.#protocol.enqueue((assertCurrent) =>
          this.#toggleBindsetCollapse(bindsetName, assertCurrent),
        );
      }),
      this.respond(
        "key:categorize-by-command",
        ({ keysWithCommands, allKeys }) =>
          this.categorizeKeys(keysWithCommands, allKeys),
      ),
      this.respond("key:categorize-by-type", ({ keysWithCommands, allKeys }) =>
        this.categorizeKeysByType(keysWithCommands, allKeys),
      ),
      this.respond(
        "key:cycle-view-mode",
        (/** @type {unknown} */ payload = undefined) => {
          materializeScalarEmptyRequest(payload);
          return this.#protocol.enqueue((assertCurrent) =>
            this.#cycleKeyViewMode(assertCurrent),
          );
        },
      ),
      this.respond("key:sort", ({ keys }) => this.sortKeys(keys)),
      this.respond("key:toggle-category", (payload) => {
        const { categoryId, mode } = materializeKeyCategoryRequest(payload);
        return this.#protocol.enqueue((assertCurrent) =>
          this.#toggleKeyCategory(categoryId, mode, assertCurrent),
        );
      }),
    );
  }

  onInit() {
    this.#hydrate(() => {
      this.setupRequestHandlers();
      this.setupEventListeners();
      this.publishViewState();
    });
  }

  onDestroy() {
    this.#protocol.cancel();
  }

  /** @param {() => void} [afterLoad] */
  #hydrate(afterLoad) {
    const loading = this.#protocol.activate((assertCurrent) => {
      const data = this.#persistence.load();
      assertCurrent();
      const nextState = readKeyBrowserViewState(data, {
        authorityEpoch: nextKeyBrowserAuthorityEpoch(),
        revision: 0,
      });
      assertCurrent();
      this.viewState = nextState;
    }, afterLoad);
    this.initialStateReady = Promise.resolve(loading);
    void this.initialStateReady.catch(() => undefined);
  }

  /** @param {{name?: string, replyTopic?: import('../../types/events/dynamic.js').ComponentReplyTopic}} registration */
  _onComponentRegister(registration) {
    if (this.#protocol.ready) super._onComponentRegister(registration);
  }

  /** @param {import('../../types/events/component-state.js').KeyBrowserViewStateSnapshot} [state] */
  publishViewState(state = this.getCurrentState()) {
    return this.emit("key-browser:state-changed", state, { synchronous: true });
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
    const request = materializeKeyCategoryRequest({ categoryId, mode });
    return this.#protocol.runDirect((assertCurrent) =>
      this.#toggleKeyCategory(request.categoryId, request.mode, assertCurrent),
    );
  }

  /** @param {string} categoryId @param {string} mode @param {() => void} assertCurrent */
  #toggleKeyCategory(categoryId, mode, assertCurrent) {
    if (!categoryId) return { result: false, settlement: null };
    const isCollapsed = !this.#persistence.isCategoryCollapsed(
      categoryId,
      mode,
    );
    assertCurrent();
    const nextState = applyKeyCategoryCollapse(
      this.viewState,
      categoryId,
      mode,
      isCollapsed,
    );
    const publishedState = cloneKeyBrowserViewState(nextState);
    this.#persistence.replaceCategory(categoryId, mode, isCollapsed);
    assertCurrent();
    this.viewState = nextState;
    return {
      result: isCollapsed,
      settlement: this.publishViewState(publishedState),
    };
  }

  // Toggle bindset collapsed state
  /** @param {string | undefined} bindsetName */
  toggleBindsetCollapse(bindsetName) {
    const safeName = materializeBindsetCollapseRequest({ bindsetName });
    return this.#protocol.runDirect((assertCurrent) =>
      this.#toggleBindsetCollapse(safeName, assertCurrent),
    );
  }

  /** @param {string | undefined} bindsetName @param {() => void} assertCurrent */
  #toggleBindsetCollapse(bindsetName, assertCurrent) {
    if (!bindsetName) return { result: false, settlement: null };
    const isCollapsed = !this.#persistence.isBindsetCollapsed(bindsetName);
    assertCurrent();
    const nextState = applyBindsetCollapse(
      this.viewState,
      bindsetName,
      isCollapsed,
    );
    const publishedState = cloneKeyBrowserViewState(nextState);
    this.#persistence.replaceBindset(bindsetName, isCollapsed);
    assertCurrent();
    this.viewState = nextState;
    return {
      result: isCollapsed,
      settlement: this.publishViewState(publishedState),
    };
  }

  /** @returns {import('../../types/events/base.js').KeyViewMode} */
  cycleKeyViewMode() {
    return this.#protocol.runDirect((assertCurrent) =>
      this.#cycleKeyViewMode(assertCurrent),
    );
  }

  /** @param {() => void} assertCurrent */
  #cycleKeyViewMode(assertCurrent) {
    const nextState = applyNextKeyViewMode(this.viewState);
    const publishedState = cloneKeyBrowserViewState(nextState);
    this.#persistence.replaceMode(nextState.mode);
    assertCurrent();
    this.viewState = nextState;
    return {
      result: nextState.mode,
      settlement: this.publishViewState(publishedState),
    };
  }
}
