import ComponentBase from "../ComponentBase.js";
import { STO_KEY_NAMES } from "../../data/stoKeyNames.js";
import {
  materializeMutationRequest,
  requireMutationString,
  requireProfileUpdateResult,
} from "./mutationRequestBoundary.js";
import {
  captureProfileMutationContext,
  assertProfileMutationContext,
  canPublishProfileMutation,
} from "./profileMutationContext.js";

/** @param {unknown} input @param {readonly string[]} fields */
function keyRequest(input, fields) {
  const value = materializeMutationRequest(input, fields);
  for (const field of fields) {
    requireMutationString(value[field], {
      optional: true,
      nullable: field === "sourceKey" || field === "bindset",
      allowEmpty: true,
    });
    if (
      ["__proto__", "constructor", "prototype"].includes(String(value[field]))
    )
      throw new TypeError("invalid_mutation_request");
  }
  return value;
}

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
    this._mutationGeneration = 0;
  }

  setupRequestHandlers() {
    if (!this.eventBus || this._responseDetachFunctions.length > 0) return;

    this._responseDetachFunctions.push(
      this.respond("key:add", (payload) => {
        const input = keyRequest(payload === undefined ? {} : payload, [
          "key",
          "bindset",
        ]);
        return this.addKey(input.key, input.bindset);
      }),
      this.respond("key:delete", (payload) => {
        const input = keyRequest(payload === undefined ? {} : payload, ["key"]);
        return this.deleteKey(input.key);
      }),
      this.respond("key:duplicate-with-name", (payload) => {
        const input = keyRequest(payload === undefined ? {} : payload, [
          "sourceKey",
          "newKey",
        ]);
        return this.duplicateKeyWithName(input.sourceKey, input.newKey);
      }),
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
   * @param {unknown} keyName
   * @param {unknown} [bindset]
   * @returns {Promise<import('../../types/rpc/keys.js').KeyAddResult>}
   */
  async addKey(keyName, bindset = null) {
    try {
      keyRequest({ key: keyName, bindset }, ["key", "bindset"]);
    } catch {
      return { success: false, error: "invalid_key_name" };
    }
    if (typeof keyName !== "string")
      return { success: false, error: "invalid_key_name" };
    if (!(await this.isValidKeyName(keyName))) {
      return { success: false, error: "invalid_key_name", params: { keyName } };
    }
    if (!this.cache.currentProfile) {
      return { success: false, error: "no_profile_selected" };
    }

    let context;
    try {
      context = captureProfileMutationContext(this, this._mutationGeneration);
    } catch {
      return { success: false, error: "failed_to_add_key" };
    }
    const environment = context.environment;
    if (!context.profileId)
      return { success: false, error: "no_profile_selected" };
    const targetBindset =
      typeof bindset === "string" && bindset && bindset !== "Primary Bindset"
        ? bindset
        : null;
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
      assertProfileMutationContext(this, context, this._mutationGeneration);
      if (targetBindset) {
        // Add to a specific bindset without touching primary keys
        const result = await this.request("data:update-profile", {
          profileId: context.profileId,
          precondition: context.precondition,
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

        requireProfileUpdateResult(result);
      } else {
        // Add to primary bindset (original path)
        const result = await this.request("data:update-profile", {
          profileId: context.profileId,
          precondition: context.precondition,
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

        requireProfileUpdateResult(result);
      }

      if (canPublishProfileMutation(this, context, this._mutationGeneration)) {
        try {
          await this.request("selection:select-key", {
            keyName,
            environment,
            ...(targetBindset ? { bindset: targetBindset } : {}),
            skipPersistence: true,
          });
        } catch (error) {
          console.warn(
            "[KeyService] Key saved but selection presentation failed:",
            error,
          );
        }
      }

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
   * @param {unknown} keyName
   * @returns {Promise<import('../../types/rpc/keys.js').KeyDeleteResult>}
   */
  async deleteKey(keyName) {
    try {
      keyRequest({ key: keyName }, ["key"]);
    } catch {
      return { success: false, error: "key_not_found" };
    }
    if (typeof keyName !== "string" || !keyName)
      return { success: false, error: "key_not_found" };
    if (!this.cache.currentProfile) {
      return { success: false, error: "no_profile_selected" };
    }

    if (!keyName || !this.cache.keys[keyName]) {
      return { success: false, error: "key_not_found", params: { keyName } };
    }

    try {
      const context = captureProfileMutationContext(
        this,
        this._mutationGeneration,
      );
      // Delete key using explicit operations API
      if (!context.profileId)
        return { success: false, error: "no_profile_selected" };
      const result = await this.request("data:update-profile", {
        profileId: context.profileId,
        precondition: context.precondition,
        delete: {
          builds: {
            [this.cache.currentEnvironment]: {
              keys: [keyName],
            },
          },
        },
      });
      requireProfileUpdateResult(result);

      // SelectionService handles selection clearing automatically via key-deleted event
      if (canPublishProfileMutation(this, context, this._mutationGeneration))
        this.emit("key-deleted", { keyName });
      return {
        success: true,
        key: keyName,
        environment: context.environment,
      };
    } catch (error) {
      console.error("[KeyService] Failed to delete key:", error);
      return { success: false, error: "failed_to_delete_key" };
    }
  }

  // Duplicate an existing key row (clone commands with new ids)
  /**
   * @param {unknown} keyName
   * @returns {Promise<import('../../types/rpc/keys.js').KeyDuplicateResult>}
   */
  async duplicateKey(keyName) {
    try {
      keyRequest({ key: keyName }, ["key"]);
    } catch {
      return { success: false, error: "key_not_found" };
    }
    if (typeof keyName !== "string" || !keyName)
      return { success: false, error: "key_not_found" };
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
      const context = captureProfileMutationContext(
        this,
        this._mutationGeneration,
      );
      // Generate unique new key name
      if (!context.profileId)
        return { success: false, error: "no_profile_selected" };
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
      const result = await this.request("data:update-profile", {
        profileId: context.profileId,
        precondition: context.precondition,
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
      requireProfileUpdateResult(result);

      return {
        success: true,
        sourceKey: keyName,
        newKey: newKeyName,
        environment: context.environment,
      };
    } catch (error) {
      console.error("[KeyService] Failed to duplicate key:", error);
      return { success: false, error: "failed_to_duplicate_key" };
    }
  }

  // Duplicate an existing key to an explicit new key name
  /**
   * @param {unknown} sourceKey
   * @param {unknown} newKey
   * @returns {Promise<import('../../types/rpc/keys.js').KeyDuplicateResult>}
   */
  async duplicateKeyWithName(sourceKey, newKey) {
    try {
      keyRequest({ sourceKey, newKey }, ["sourceKey", "newKey"]);
    } catch {
      return { success: false, error: "failed_to_duplicate_key" };
    }
    if (typeof sourceKey !== "string" || !sourceKey)
      return { success: false, error: "failed_to_duplicate_key" };
    if (typeof newKey !== "string" || !newKey)
      return { success: false, error: "invalid_key_name" };
    if (!(await this.isValidKeyName(newKey))) {
      return {
        success: false,
        error: "invalid_key_name",
        params: { keyName: newKey },
      };
    }
    if (!this.cache.currentProfile) {
      return { success: false, error: "no_profile_selected" };
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
    let context;
    try {
      context = captureProfileMutationContext(this, this._mutationGeneration);
    } catch {
      return { success: false, error: "failed_to_duplicate_key" };
    }

    if (!context.profileId)
      return { success: false, error: "no_profile_selected" };

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
      assertProfileMutationContext(this, context, this._mutationGeneration);
      const result = await this.request("data:update-profile", {
        profileId: context.profileId,
        precondition: context.precondition,
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
      requireProfileUpdateResult(result);
      return {
        success: true,
        sourceKey,
        newKey,
        environment: context.environment,
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
    this._mutationGeneration += 1;
    this.setupRequestHandlers();
    this.setupEventListeners();
  }

  onDestroy() {
    this._mutationGeneration += 1;
    for (const detach of this._responseDetachFunctions) detach();
    this._responseDetachFunctions = [];
  }
}
