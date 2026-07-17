import ComponentBase from "../ComponentBase.js";

/**
 * AliasService – the authoritative service for creating, deleting and duplicating
 * alias rows in a profile. This service mirrors KeyService but focuses
 * exclusively on alias level operations so other components (AliasBrowser,
 * UI components, etc.) can delegate all alias data mutations here.
 *
 * Uses DataCoordinator broadcast/cache pattern.
 */
export default class AliasService extends ComponentBase {
  /** @param {{ eventBus?: import('./serviceTypes.js').EventBus, i18n?: import('./serviceTypes.js').I18n, ui?: import('./serviceTypes.js').ToastUI }} [options] */
  constructor({ eventBus, i18n, ui } = {}) {
    super(eventBus);
    this.componentName = "AliasService";
    this.i18n = i18n;
    this.ui = ui;

    if (this.eventBus) {
      // Register request/response endpoints for alias operations
      this.respond(
        "alias:add",
        (
          {
            name,
            description,
          } = /** @type {{ name?: string, description?: string }} */ ({}),
        ) => this.addAlias(name, description),
      );
      this.respond(
        "alias:delete",
        ({ name } = /** @type {{ name?: string }} */ ({})) =>
          this.deleteAlias(name),
      );
      this.respond(
        "alias:duplicate-with-name",
        (
          {
            sourceName,
            newName,
          } = /** @type {{ sourceName?: string, newName?: string }} */ ({}),
        ) => this.duplicateAliasWithName(sourceName, newName),
      );
      this.respond(
        "alias:validate-name",
        ({ name } = /** @type {{ name?: string }} */ ({})) =>
          this.isValidAliasName(name),
      );
    }
  }

  /** @returns {import('./serviceTypes.js').ServiceCache} */
  get serviceCache() {
    this.initializeCache();
    if (!this.cache)
      throw new Error("AliasService cache initialization failed");
    return /** @type {import('./serviceTypes.js').ServiceCache} */ (this.cache);
  }

  onInit() {
    this.setupEventListeners();
  }

  // Event listeners for DataCoordinator integration
  setupEventListeners() {
    if (!this.eventBus) return;

    // Listen for profile updates
    this.addEventListener("profile:updated", ({ profileId, profile }) => {
      if (profileId === this.serviceCache.currentProfile) {
        this.updateCacheFromProfile(profile);
      }
    });

    this.addEventListener(
      "profile:switched",
      ({ profileId, profile, environment }) => {
        this.serviceCache.currentProfile = profileId || null;
        this.serviceCache.currentEnvironment = environment || "space";

        this.updateCacheFromProfile(profile);
      },
    );

    // Listen for environment changes
    this.addEventListener("environment:changed", ({ environment }) => {
      if (environment) {
        this.serviceCache.currentEnvironment = environment;
      }
    });
  }

  // Update local cache from profile data
  /** @param {import('./serviceTypes.js').ProfileData | null | undefined} profile */
  updateCacheFromProfile(profile) {
    if (!profile) return;

    this.serviceCache.aliases = profile.aliases || {};
    this.serviceCache.profile = profile;
  }

  // Core alias operations now use DataCoordinator
  /**
   * @param {string | undefined} name
   * @param {string | undefined} description
   * @returns {Promise<import('../../types/rpc/aliases.js').AliasAddResult>}
   */
  async addAlias(name, description = "") {
    if (!name || !(await this.isValidAliasName(name))) {
      return { success: false, error: "invalid_alias_name", params: { name } };
    }

    if (!this.serviceCache.currentProfile) {
      return { success: false, error: "no_profile_selected" };
    }

    // Check if alias already exists in cache
    if (this.serviceCache.aliases[name]) {
      return {
        success: false,
        error: "alias_already_exists",
        params: { name },
      };
    }

    try {
      // Set selection before updating profile so profile:updated refreshes with the new alias
      await this.request("selection:select-alias", {
        aliasName: name,
        skipPersistence: true,
      });

      // Add new alias using explicit operations API
      await this.request("data:update-profile", {
        profileId: this.serviceCache.currentProfile,
        add: {
          aliases: {
            [name]: {
              description,
              commands: [], // Use array format for commands
              type: "alias", // Set proper type
            },
          },
        },
      });

      this.emit("alias-created", { name });
      return { success: true, message: "alias_created", data: { name } };
    } catch (error) {
      console.error("[AliasService] Failed to add alias:", error);
      return { success: false, error: "failed_to_add_alias" };
    }
  }

  // Delete an alias from the current profile
  /**
   * @param {string | undefined} name
   * @returns {Promise<import('../../types/rpc/aliases.js').AliasDeleteResult>}
   */
  async deleteAlias(name) {
    if (!this.serviceCache.currentProfile) {
      return { success: false, error: "no_profile_selected" };
    }

    if (!name || !this.serviceCache.aliases[name]) {
      return { success: false, error: "alias_not_found", params: { name } };
    }

    try {
      // Delete alias using explicit operations API
      await this.request("data:update-profile", {
        profileId: this.serviceCache.currentProfile,
        delete: {
          aliases: [name],
        },
      });

      this.emit("alias-deleted", { name });
      return { success: true, message: "alias_deleted", data: { name } };
    } catch (error) {
      console.error("[AliasService] Failed to delete alias:", error);
      return { success: false, error: "failed_to_delete_alias" };
    }
  }

  // Duplicate an existing alias to an explicit new alias name
  /**
   * @param {string | undefined} sourceName
   * @param {string | undefined} newName
   * @returns {Promise<import('../../types/rpc/aliases.js').AliasDuplicateResult>}
   */
  async duplicateAliasWithName(sourceName, newName) {
    if (!sourceName || !newName) {
      return { success: false, error: "invalid_alias_name" };
    }

    // Validate source exists
    if (!this.serviceCache.aliases[sourceName]) {
      return {
        success: false,
        error: "alias_not_found",
        params: { name: sourceName },
      };
    }

    // Validate new alias name and not duplicate
    if (!(await this.isValidAliasName(newName))) {
      return {
        success: false,
        error: "invalid_alias_name",
        params: { name: newName },
      };
    }
    if (this.serviceCache.aliases[newName]) {
      return {
        success: false,
        error: "alias_already_exists",
        params: { name: newName },
      };
    }

    const original = this.serviceCache.aliases[sourceName];
    const profileId = this.serviceCache.currentProfile;
    if (!profileId) {
      return { success: false, error: "failed_to_duplicate_alias" };
    }

    try {
      await this.request("data:update-profile", {
        profileId,
        add: {
          aliases: {
            [newName]: {
              description: original.description,
              commands: original.commands,
              type: original.type || "alias", // Preserve type or default to 'alias'
            },
          },
        },
      });

      // Update local cache
      this.serviceCache.aliases[newName] = {
        description: original.description,
        commands: original.commands,
        type: original.type || "alias",
      };

      this.emit("alias-created", { name: newName });
      this.emit("alias-duplicated", { from: sourceName, to: newName });
      return {
        success: true,
        message: "alias_duplicated",
        data: { from: sourceName, to: newName },
      };
    } catch (error) {
      console.error(
        "[AliasService] Failed to duplicate alias with name:",
        error,
      );
      return { success: false, error: "failed_to_duplicate_alias" };
    }
  }

  // Validation helpers
  /** @param {string | undefined} name */
  async isValidAliasName(name) {
    if (!name || typeof name !== "string") return false;

    try {
      // Use the comprehensive alias validation library
      const { isAliasNameAllowed } = await import(
        "../../lib/aliasNameValidator.js"
      );
      return isAliasNameAllowed(name);
    } catch (error) {
      void error;
      // Fallback to basic pattern validation if library not available
      const pattern = /^[A-Za-z][A-Za-z0-9_]*$/;
      return pattern.test(name) && name.length <= 50;
    }
  }
}
