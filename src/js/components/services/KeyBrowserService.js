import ComponentBase from "../ComponentBase.js";
import { activeBindsetFromPayload } from "../../core/eventPayloads.js";

/** @typedef {{ name: string, icon: string, keys: Set<string>, priority: number }} KeyCategory */
/** @typedef {Record<string, KeyCategory>} KeyCategoryMap */
/** @typedef {import('./serviceTypes.js').StoredCommand} BrowserCommand */
/** @typedef {Record<string, BrowserCommand[]>} CommandsByKey */
/** @typedef {{ name: string, keys: string[], isCollapsed: boolean, keyCount: number }} BindsetSection */

/**
 * KeyBrowserService – source-of-truth for the key grid.
 * Keeps track of the active profile/environment and exposes
 * helpers for retrieving keybind data as well as selecting keys
 * in a decoupled, event-driven manner.
 */
export default class KeyBrowserService extends ComponentBase {
  /** @param {{ eventBus?: import('./serviceTypes.js').EventBus, i18n?: import('./serviceTypes.js').I18n }} [options] */
  constructor({ eventBus, i18n } = {}) {
    super(eventBus);
    this.componentName = "KeyBrowserService";
    this.i18n =
      i18n ??
      /** @type {import('./serviceTypes.js').I18n} */ ({
        t: (key) => key,
      });

    // Register Request/Response endpoints for external callers
    if (this.eventBus) {
      this.respond("key:get-all", () => this.getKeys());

      // Sectional bindset display endpoints
      this.respond("key:get-all-sectional", () => this.getSectionalKeys());
      this.respond("bindset:get-available", () => this.getAvailableBindsets());
      this.respond("bindset:toggle-collapse", ({ bindsetName }) =>
        this.toggleBindsetCollapse(bindsetName),
      );
      this.respond("bindset:get-collapsed-state", ({ bindsetName } = {}) =>
        this.getBindsetCollapsedState(bindsetName),
      );

      this.respond(
        "key:categorize-by-command",
        ({ keysWithCommands, allKeys }) =>
          this.categorizeKeys(keysWithCommands, allKeys),
      ),
        this.respond(
          "key:categorize-by-type",
          ({ keysWithCommands, allKeys }) =>
            this.categorizeKeysByType(keysWithCommands, allKeys),
        ),
        this.respond("key:compare", ({ keyA, keyB }) =>
          this.compareKeys(keyA, keyB),
        ),
        this.respond("key:sort", ({ keys }) => this.sortKeys(keys)),
        this.respond("key:filter", ({ keys, filter }) =>
          this.filterKeys(keys, filter),
        ),
        this.respond("key:show-all", ({ keys }) => this.showAllKeys(keys)),
        this.respond("key:toggle-category", ({ categoryId, mode }) =>
          this.toggleKeyCategory(categoryId, mode),
        ),
        this.respond("key:get-category-state", ({ categoryId, mode }) =>
          this.getCategoryState(categoryId, mode),
        );
    }
  }

  onInit() {
    this.setupEventListeners();
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

    this.addEventListener("profile-modified", () => {
      this.emit("key:list-changed", { keys: this.getKeys() });
    });

    // Command chain bindset coordination
    this.addEventListener("bindset:active-changed", (payload) => {
      const bindset = activeBindsetFromPayload(payload);
      if (!bindset) return;
      // Optionally expand the active bindset section when it changes
      // Store active bindset for potential UI coordination
      this.cache.activeCommandChainBindset = bindset;
    });

    // Maintain cache synchronization between key browser and command chain
    this.addEventListener("bindset:modified", (payload) => {
      if (typeof payload !== "object" || payload === null) return;
      const bindsetName = Reflect.get(payload, "bindsetName");
      if (typeof bindsetName !== "string") return;
      // Refresh specific bindset section when modified
      this.emit("bindset-section:refresh-needed", { bindsetName });
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

    // Get command categories from data service
    try {
      const hasCommands = await this.request("data:has-commands");
      if (hasCommands) {
        const commandCategories = await this.request("data:get-commands");
        Object.entries(
          /** @type {Record<string, { name: string, icon: string }>} */ (
            commandCategories
          ),
        ).forEach(([catId, catData]) => {
          categories[catId] = {
            name: catData.name,
            icon: catData.icon,
            keys: new Set(),
            priority: 1,
          };
        });
      }
    } catch (error) {
      console.warn(
        "KeyBrowserService: Failed to get command categories:",
        error,
      );
    }

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
    // Embedded synchronous key comparison logic (from stoFileHandler)
    const aIsF = a.match(/^F(\d+)$/);
    const bIsF = b.match(/^F(\d+)$/);
    if (aIsF && bIsF) return parseInt(aIsF[1]) - parseInt(bIsF[1]);
    if (aIsF && !bIsF) return -1;
    if (!aIsF && bIsF) return 1;
    const aIsNum = /^\d+$/.test(a);
    const bIsNum = /^\d+$/.test(b);
    if (aIsNum && bIsNum) return parseInt(a) - parseInt(b);
    if (aIsNum && !bIsNum) return -1;
    if (!aIsNum && bIsNum) return 1;
    const aIsLetter = /^[A-Z]$/.test(a);
    const bIsLetter = /^[A-Z]$/.test(b);
    if (aIsLetter && bIsLetter) return a.localeCompare(b);
    if (aIsLetter && !bIsLetter) return -1;
    if (!aIsLetter && bIsLetter) return 1;
    const specialOrder = ["Space", "Tab", "Enter", "Escape"];
    const aSpecial = specialOrder.indexOf(a);
    const bSpecial = specialOrder.indexOf(b);
    if (aSpecial !== -1 && bSpecial !== -1) return aSpecial - bSpecial;
    if (aSpecial !== -1 && bSpecial === -1) return -1;
    if (aSpecial === -1 && bSpecial !== -1) return 1;
    return a.localeCompare(b);
  }

  // Sort an array of keys using the compareKeys logic
  /** @param {string[] | unknown} keys */
  sortKeys(keys) {
    if (!Array.isArray(keys)) return [];
    return [...keys].sort((a, b) => this.compareKeys(a, b));
  }

  // Filter keys based on search criteria
  /** @param {string[] | unknown} keys @param {string} [filter] */
  filterKeys(keys, filter = "") {
    if (!Array.isArray(keys)) return [];
    if (!filter) return keys;

    const filterLower = filter.toString().toLowerCase();
    return keys.filter((key) => {
      const keyName = (key || "").toLowerCase();
      return keyName.includes(filterLower);
    });
  }

  // Show all keys (no filtering)
  /** @param {string[] | unknown} keys */
  showAllKeys(keys) {
    if (!Array.isArray(keys)) return [];
    return keys;
  }

  // Toggle category collapsed state
  /** @param {string} categoryId @param {string} [mode] */
  toggleKeyCategory(categoryId, mode = "command") {
    if (!categoryId) return false;

    const storageKey =
      mode === "key-type"
        ? `keyTypeCategory_${categoryId}_collapsed`
        : `keyCategory_${categoryId}_collapsed`;

    const currentState = localStorage.getItem(storageKey) === "true";
    const newState = !currentState;

    localStorage.setItem(storageKey, String(newState));
    return newState;
  }

  // Get category collapsed state
  /** @param {string} categoryId @param {string} [mode] */
  getCategoryState(categoryId, mode = "command") {
    if (!categoryId) return false;

    const storageKey =
      mode === "key-type"
        ? `keyTypeCategory_${categoryId}_collapsed`
        : `keyCategory_${categoryId}_collapsed`;

    return localStorage.getItem(storageKey) === "true";
  }

  // Sectional Bindset Display Methods

  // Get all bindsets available for sectional display
  async getAvailableBindsets() {
    try {
      // Get bindset names from cache (ComponentBase handles this caching)
      console.log(
        "[KeyBrowserService] Raw cache.bindsetNames:",
        this.cache.bindsetNames,
      );
      const bindsetNames = this.cache.bindsetNames || [];

      // Ensure Primary Bindset is always included and first
      const allBindsets = [
        "Primary Bindset",
        ...bindsetNames.filter((name) => name !== "Primary Bindset"),
      ];
      console.log("[KeyBrowserService] Available bindsets:", allBindsets);
      return allBindsets;
    } catch (error) {
      console.warn(
        "[KeyBrowserService] Failed to get available bindsets:",
        error,
      );
      return ["Primary Bindset"];
    }
  }

  // Get sectional keys organized by bindset
  async getSectionalKeys() {
    try {
      const bindsets = await this.getAvailableBindsets();
      console.log(
        "[KeyBrowserService] Processing bindsets for sections:",
        bindsets,
      );
      /** @type {Record<string, BindsetSection>} */
      const sectionalKeys = {};

      // Process each bindset
      for (const bindsetName of bindsets) {
        const isCollapsed = this.getBindsetCollapsedState(bindsetName);
        /** @type {string[]} */
        let keys = [];

        if (bindsetName === "Primary Bindset") {
          // Primary Bindset uses current profile's keys
          keys = Object.keys(this.getKeys() || {});
        } else {
          // User-defined bindsets - get data directly from profile
          try {
            const profile = this.cache.profile;
            const environment = this.cache.currentEnvironment || "space";

            console.log(
              `[KeyBrowserService] Getting keys for bindset "${bindsetName}" in environment "${environment}"`,
            );

            if (profile?.bindsets?.[bindsetName]?.[environment]?.keys) {
              keys = Object.keys(
                profile.bindsets[bindsetName][environment].keys,
              );
              console.log(
                `[KeyBrowserService] Found ${keys.length} keys for bindset "${bindsetName}":`,
                keys,
              );
            } else {
              console.log(
                `[KeyBrowserService] No keys found for bindset "${bindsetName}" in environment "${environment}"`,
              );
              keys = [];
            }
          } catch (error) {
            console.warn(
              `[KeyBrowserService] Failed to get keys for bindset "${bindsetName}":`,
              error,
            );
            keys = [];
          }
        }

        // Sort keys for consistent display
        const sortedKeys = this.sortKeys(keys);

        sectionalKeys[bindsetName] = {
          name: bindsetName,
          keys: sortedKeys,
          isCollapsed,
          keyCount: sortedKeys.length,
        };
      }

      return sectionalKeys;
    } catch (error) {
      console.error("[KeyBrowserService] Failed to get sectional keys:", error);
      // Fallback to Primary Bindset only
      const primaryKeys = this.sortKeys(Object.keys(this.getKeys() || {}));
      return {
        "Primary Bindset": {
          name: "Primary Bindset",
          keys: primaryKeys,
          isCollapsed: false,
          keyCount: primaryKeys.length,
        },
      };
    }
  }

  // Toggle bindset collapsed state
  /** @param {string | undefined} bindsetName */
  toggleBindsetCollapse(bindsetName) {
    if (!bindsetName) return false;

    const storageKey = `bindsetSection_${bindsetName}_collapsed`;
    const currentState = localStorage.getItem(storageKey) === "true";
    const newState = !currentState;

    localStorage.setItem(storageKey, String(newState));

    // Emit event to notify UI of state change
    this.emit("bindset-section:collapse-changed", {
      bindsetName,
      isCollapsed: newState,
    });

    return newState;
  }

  // Get bindset collapsed state
  /** @param {string | undefined} bindsetName */
  getBindsetCollapsedState(bindsetName) {
    if (!bindsetName) return false;

    const storageKey = `bindsetSection_${bindsetName}_collapsed`;
    return localStorage.getItem(storageKey) === "true";
  }
}
