import ComponentBase from "../ComponentBase.js";
import { STO_KEY_NAMES } from "../../data/stoKeyNames.js";

/**
 * KeyService – the authoritative service for creating, deleting and duplicating
 * key-bind rows in a profile. This service mirrors CommandService but focuses
 * exclusively on key level operations so other components (KeyBrowser,
 * CommandChain, etc.) can delegate all key data mutations here.
 */
export default class KeyService extends ComponentBase {
  /** @param {{ eventBus?: import('./serviceTypes.js').EventBus, i18n?: import('./serviceTypes.js').I18n, ui?: unknown }} [options] */
  constructor({ eventBus, i18n, ui } = {}) {
    super(eventBus);
    this.componentName = "KeyService";
    this.i18n = i18n;
    this.ui = ui;

    // Local cache for DataCoordinator broadcasts
    this.initializeCache();

    // Generate valid key list once
    this.validKeys = this.generateValidKeys();

    /** @type {Array<() => void>} */
    this._responseDetachFunctions = [];
  }

  setupRequestHandlers() {
    if (!this.eventBus || this._responseDetachFunctions.length > 0) return;

    this._responseDetachFunctions.push(
      this.respond(
        "key:add",
        (
          {
            key,
            bindset,
          } = /** @type {{ key?: string, bindset?: string }} */ ({}),
        ) => this.addKey(key, bindset),
      ),
      this.respond(
        "key:delete",
        ({ key } = /** @type {{ key?: string }} */ ({})) => this.deleteKey(key),
      ),
      this.respond(
        "key:duplicate-with-name",
        (
          {
            sourceKey,
            newKey,
          } = /** @type {{ sourceKey?: string, newKey?: string }} */ ({}),
        ) => this.duplicateKeyWithName(sourceKey, newKey),
      ),
    );
  }

  // Event listeners for DataCoordinator integration
  setupEventListeners() {
    if (!this.eventBus) return;

    // ComponentBase automatically handles profile, environment, and key caching
    // We only need to listen for these events to update our specific business logic
    this.addEventListener("profile:updated", ({ profileId, profile }) => {
      if (profileId === this.cache.currentProfile) {
        // ComponentBase handles the cache updates, we just need to update our specific logic
        this.updateCacheFromProfile(profile);
      }
    });

    this.addEventListener("profile:switched", ({ profile }) => {
      // ComponentBase handles currentProfile, currentEnvironment, and profile caching
      this.updateCacheFromProfile(profile);
    });

    this.addEventListener("environment:changed", () => {
      // ComponentBase handles currentEnvironment and keys caching
      // No additional logic needed here
    });
  }

  // Update local cache from profile data
  /** @param {import('./serviceTypes.js').ProfileData | null | undefined} profile */
  updateCacheFromProfile(profile) {
    if (!profile) return;

    // ComponentBase handles builds, keys, and aliases caching automatically
    // This method can be used for service-specific logic if needed
    console.log(
      `[KeyService] Profile updated - ComponentBase handles caching automatically`,
    );
  }

  // Core key operations now use DataCoordinator
  /**
   * @param {string | undefined} keyName
   * @param {string | null} [bindset]
   * @returns {Promise<import('../../types/rpc/keys.js').KeyAddResult>}
   */
  async addKey(keyName, bindset = null) {
    if (!(await this.isValidKeyName(keyName))) {
      return { success: false, error: "invalid_key_name", params: { keyName } };
    }
    if (typeof keyName !== "string") {
      return { success: false, error: "invalid_key_name", params: { keyName } };
    }

    if (!this.cache.currentProfile) {
      return { success: false, error: "no_profile_selected" };
    }

    const environment = this.cache.currentEnvironment;
    const targetBindset =
      bindset && bindset !== "Primary Bindset" ? bindset : null;
    const profile = this.cache.profile;

    if (targetBindset) {
      const targetKeys =
        profile?.bindsets?.[targetBindset]?.[environment]?.keys || {};
      if (targetKeys[keyName]) {
        return {
          success: false,
          error: "key_already_exists",
          params: { keyName },
        };
      }
    } else {
      // Check if key already exists in primary cache
      if (this.cache.keys[keyName]) {
        return {
          success: false,
          error: "key_already_exists",
          params: { keyName },
        };
      }
    }

    try {
      // CRITICAL FIX: Update selection FIRST, before modifying profile
      // This ensures when data:update-profile triggers profile:updated,
      // the selection cache already contains the new key
      // Use skipPersistence to avoid triggering a second profile:updated event
      await this.request("selection:select-key", {
        keyName,
        environment,
        ...(targetBindset ? { bindset: targetBindset } : {}),
        skipPersistence: true, // Skip persistence to avoid duplicate profile:updated events
      });

      // NOW update the profile - DataCoordinator will emit profile:updated,
      // but selection cache is already correct
      if (targetBindset) {
        // Add to a specific bindset without touching primary keys
        await this.request("data:update-profile", {
          profileId: this.cache.currentProfile,
          updates: {
            modify: {
              bindsets: {
                [targetBindset]: {
                  [environment]: {
                    keys: {
                      [keyName]: [],
                    },
                  },
                },
              },
            },
          },
        });

        // Keep local cache in sync so UI can immediately render the new bindset key
        this.cache.profile = this.cache.profile || {};
        this.cache.profile.bindsets = this.cache.profile.bindsets || {};
        const bindsetData =
          this.cache.profile.bindsets[targetBindset] ??
          (this.cache.profile.bindsets[targetBindset] = {
            space: { keys: {} },
            ground: { keys: {} },
          });
        const environmentData =
          bindsetData[environment] ??
          (bindsetData[environment] = {
            keys: {},
          });
        const targetKeys = environmentData.keys ?? (environmentData.keys = {});
        targetKeys[keyName] = [];
      } else {
        // Add to primary bindset (original path)
        await this.request("data:update-profile", {
          profileId: this.cache.currentProfile,
          add: {
            builds: {
              [environment]: {
                keys: {
                  [keyName]: [],
                },
              },
            },
          },
        });

        // Keep primary cache in sync for immediate UI updates
        this.cache.keys[keyName] = [];
        if (this.cache.profile?.builds?.[environment]?.keys) {
          this.cache.profile.builds[environment].keys[keyName] = [];
        }
      }

      // DataCoordinator already emitted profile:updated, so we only emit key-added
      this.emit("key-added", { key: keyName });

      return {
        success: true,
        key: keyName,
        environment,
        bindset: targetBindset || "Primary Bindset",
      };
    } catch (error) {
      console.error("[KeyService] Failed to add key:", error);
      return { success: false, error: "failed_to_add_key" };
    }
  }

  // Delete a key row from the current profile
  /**
   * @param {string | undefined} keyName
   * @returns {Promise<import('../../types/rpc/keys.js').KeyDeleteResult>}
   */
  async deleteKey(keyName) {
    if (!this.cache.currentProfile) {
      return { success: false, error: "no_profile_selected" };
    }

    if (!keyName || !this.cache.keys[keyName]) {
      return { success: false, error: "key_not_found", params: { keyName } };
    }

    try {
      // Delete key using explicit operations API
      await this.request("data:update-profile", {
        profileId: this.cache.currentProfile,
        delete: {
          builds: {
            [this.cache.currentEnvironment]: {
              keys: [keyName],
            },
          },
        },
      });

      // SelectionService handles selection clearing automatically via key-deleted event
      this.emit("key-deleted", { keyName });
      return {
        success: true,
        key: keyName,
        environment: this.cache.currentEnvironment,
      };
    } catch (error) {
      console.error("[KeyService] Failed to delete key:", error);
      return { success: false, error: "failed_to_delete_key" };
    }
  }

  // Duplicate an existing key row (clone commands with new ids)
  /**
   * @param {string | undefined} keyName
   * @returns {Promise<import('../../types/rpc/keys.js').KeyDuplicateResult>}
   */
  async duplicateKey(keyName) {
    if (!this.cache.currentProfile) {
      return { success: false, error: "no_profile_selected" };
    }

    if (!keyName || !this.cache.keys[keyName]) {
      return { success: false, error: "key_not_found", params: { keyName } };
    }

    const commands = this.cache.keys[keyName];
    if (!commands || commands.length === 0) {
      return { success: false, error: "failed_to_duplicate_key" };
    }

    try {
      // Generate unique new key name
      let newKeyName = `${keyName}_copy`;
      let counter = 1;
      while (this.cache.keys[newKeyName]) {
        newKeyName = `${keyName}_copy_${counter}`;
        counter++;
      }

      // Clone commands with new IDs
      const cloned = commands.map(
        /** @param {import('./serviceTypes.js').StoredCommand} cmd */ (cmd) =>
          typeof cmd === "string" ? cmd : { ...cmd, id: this.generateKeyId() },
      );

      // Add duplicated key using explicit operations API
      await this.request("data:update-profile", {
        profileId: this.cache.currentProfile,
        add: {
          builds: {
            [this.cache.currentEnvironment]: {
              keys: {
                [newKeyName]: cloned,
              },
            },
          },
        },
      });

      this.emit("key-duplicated", { from: keyName, to: newKeyName });
      return {
        success: true,
        sourceKey: keyName,
        newKey: newKeyName,
        environment: this.cache.currentEnvironment,
      };
    } catch (error) {
      console.error("[KeyService] Failed to duplicate key:", error);
      return { success: false, error: "failed_to_duplicate_key" };
    }
  }

  // Duplicate an existing key to an explicit new key name
  /**
   * @param {string | null | undefined} sourceKey
   * @param {string | undefined} newKey
   * @returns {Promise<import('../../types/rpc/keys.js').KeyDuplicateResult>}
   */
  async duplicateKeyWithName(sourceKey, newKey) {
    if (!this.cache.currentProfile) {
      return { success: false, error: "no_profile_selected" };
    }

    if (!sourceKey || typeof sourceKey !== "string") {
      return { success: false, error: "failed_to_duplicate_key" };
    }

    if (!newKey || typeof newKey !== "string") {
      return {
        success: false,
        error: "invalid_key_name",
        params: { keyName: newKey || "" },
      };
    }

    // Validate source exists
    if (!this.cache.keys[sourceKey]) {
      return {
        success: false,
        error: "key_not_found",
        params: { keyName: sourceKey },
      };
    }

    // Validate new key name and not duplicate
    if (!(await this.isValidKeyName(newKey))) {
      return {
        success: false,
        error: "invalid_key_name",
        params: { keyName: newKey },
      };
    }

    if (this.cache.keys[newKey]) {
      return {
        success: false,
        error: "key_already_exists",
        params: { keyName: newKey },
      };
    }

    const commands = this.cache.keys[sourceKey];
    if (!Array.isArray(commands) || commands.length === 0) {
      return { success: false, error: "no_commands_to_duplicate" };
    }

    try {
      const clonedCommands = JSON.parse(JSON.stringify(commands));

      await this.request("data:update-profile", {
        profileId: this.cache.currentProfile,
        add: {
          builds: {
            [this.cache.currentEnvironment]: {
              keys: {
                [newKey]: clonedCommands,
              },
            },
          },
        },
      });

      // Update local cache so dependent services remain in sync until broadcast arrives
      this.cache.keys[newKey] = JSON.parse(JSON.stringify(clonedCommands));
      this.emit("key-duplicated", { from: sourceKey, to: newKey });

      return {
        success: true,
        sourceKey,
        newKey,
        environment: this.cache.currentEnvironment,
      };
    } catch (error) {
      console.error("[KeyService] Failed to duplicate key with name:", error);
      return { success: false, error: "failed_to_duplicate_key" };
    }
  }

  // Validation helpers
  /** @param {string | undefined} keyName */
  async isValidKeyName(keyName) {
    if (!keyName || typeof keyName !== "string") return false;

    // Check for chord combinations (e.g., "ALT+`", "Control+Space")
    if (keyName.includes("+")) {
      return this.isValidChordCombination(keyName, STO_KEY_NAMES);
    }

    // Preserve the canonical list's exact single-key spelling.
    return STO_KEY_NAMES.includes(keyName) && keyName.length <= 20;
  }

  // Validate chord combinations like "ALT+`", "Control+Space", etc.
  /** @param {string} keyName @param {string[]} stoKeyNames */
  isValidChordCombination(keyName, stoKeyNames) {
    const parts = keyName.split("+");

    // Must have at least 2 parts (modifier + key)
    if (parts.length < 2) {
      return false;
    }

    // All parts must be valid STO key names (with case normalization)
    const validParts = parts.map((part) => {
      const trimmedPart = part.trim();
      const normalizedPart = this.normalizeKeyName(trimmedPart, stoKeyNames);
      return stoKeyNames.includes(normalizedPart);
    });

    return validParts.every((valid) => valid) && keyName.length <= 20;
  }

  // Normalize key names to match STO_KEY_NAMES case conventions
  /** @param {string} keyName @param {string[]} stoKeyNames */
  normalizeKeyName(keyName, stoKeyNames) {
    // Create a case-insensitive lookup map
    /** @type {Map<string, string>} */
    const lowerCaseMap = new Map();
    stoKeyNames.forEach((stoKey) => {
      lowerCaseMap.set(stoKey.toLowerCase(), stoKey);
    });

    // Try to find exact match first
    if (stoKeyNames.includes(keyName)) {
      return keyName;
    }

    // Try case-insensitive match
    const lowerKey = keyName.toLowerCase();
    if (lowerCaseMap.has(lowerKey)) {
      return lowerCaseMap.get(lowerKey) ?? keyName;
    }

    // Return original if no match found
    return keyName;
  }

  generateValidKeys() {
    /** @type {string[]} */
    const list = [];
    // Function keys F1–F12
    for (let i = 1; i <= 12; i++) {
      list.push(`F${i}`);
      list.push(`Alt+F${i}`);
    }
    // Special keys
    list.push("Space", "Tab", "Enter", "Shift+Space");

    // Letters A–Z and modifiers
    for (let i = 65; i <= 90; i++) {
      const l = String.fromCharCode(i);
      list.push(l);
      list.push(`Ctrl+${l}`);
      list.push(`Control+${l}`);
      list.push(`Alt+${l}`);
      list.push(`Shift+${l}`);
    }

    // Numbers 0–9 and modifiers
    for (let i = 0; i <= 9; i++) {
      list.push(String(i));
      list.push(`Ctrl+${i}`);
      list.push(`Alt+${i}`);
      list.push(`Shift+${i}`);
    }

    // Common mouse buttons
    list.push("Lbutton", "Rbutton", "Button4", "Wheelplus");

    return list;
  }

  // Utility helpers
  generateKeyId() {
    return `key_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  onInit() {
    this.setupRequestHandlers();
    this.setupEventListeners();
  }

  onDestroy() {
    for (const detach of this._responseDetachFunctions) detach();
    this._responseDetachFunctions = [];
  }
}
