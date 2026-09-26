import ComponentBase from "../ComponentBase.js";
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
    /** @type {Array<() => void>} */
    this._responseDetachFunctions = [];
    this._mutationGeneration = 0;
  }

  setupRequestHandlers() {
    if (!this.eventBus || this._responseDetachFunctions.length > 0) return;

    this._responseDetachFunctions.push(
      this.respond("alias:add", (payload = {}) => {
        try {
          const input = materializeMutationRequest(payload, [
            "name",
            "description",
          ]);
          return this.addAlias(
            requireMutationString(input.name, {
              optional: true,
              allowEmpty: true,
            }),
            requireMutationString(input.description, {
              optional: true,
              allowEmpty: true,
            }),
          );
        } catch {
          return { success: false, error: "invalid_alias_name" };
        }
      }),
      this.respond("alias:delete", (payload = {}) => {
        try {
          const input = materializeMutationRequest(payload, ["name"]);
          return this.deleteAlias(
            requireMutationString(input.name, {
              optional: true,
              allowEmpty: true,
            }),
          );
        } catch {
          return { success: false, error: "alias_not_found" };
        }
      }),
      this.respond("alias:duplicate-with-name", (payload = {}) => {
        try {
          const input = materializeMutationRequest(payload, [
            "sourceName",
            "newName",
          ]);
          return this.duplicateAliasWithName(
            requireMutationString(input.sourceName, {
              optional: true,
              allowEmpty: true,
            }),
            requireMutationString(input.newName, {
              optional: true,
              allowEmpty: true,
            }),
          );
        } catch {
          return { success: false, error: "invalid_alias_name" };
        }
      }),
      this.respond("alias:validate-name", (payload = {}) => {
        try {
          const input = materializeMutationRequest(payload, ["name"]);
          return this.isValidAliasName(
            requireMutationString(input.name, {
              optional: true,
              allowEmpty: true,
            }),
          );
        } catch {
          return false;
        }
      }),
    );
  }

  onDestroy() {
    this._mutationGeneration += 1;
    for (const detach of this._responseDetachFunctions) detach();
    this._responseDetachFunctions = [];
  }

  /** @returns {import('./serviceTypes.js').ServiceCache} */
  get serviceCache() {
    this.initializeCache();
    if (!this.cache)
      throw new Error("AliasService cache initialization failed");
    return /** @type {import('./serviceTypes.js').ServiceCache} */ (this.cache);
  }

  onInit() {
    this._mutationGeneration += 1;
    this.setupRequestHandlers();
  }

  // Core alias operations now use DataCoordinator
  /**
   * @param {string | undefined} name
   * @param {string | undefined} description
   * @returns {Promise<import('../../types/rpc/aliases.js').AliasAddResult>}
   */
  async addAlias(name, description = "") {
    try {
      name = requireMutationString(name, { optional: true, allowEmpty: true });
      description = requireMutationString(description, { allowEmpty: true });
    } catch {
      return { success: false, error: "invalid_alias_name" };
    }
    const generation = this._mutationGeneration;
    if (!name || !(await this.isValidAliasName(name))) {
      return { success: false, error: "invalid_alias_name", params: { name } };
    }

    let context;
    try {
      context = captureProfileMutationContext(this, generation);
      assertProfileMutationContext(this, context, this._mutationGeneration);
    } catch {
      return { success: false, error: "failed_to_add_alias" };
    }
    if (!context.profileId) {
      return { success: false, error: "no_profile_selected" };
    }

    // Check if alias already exists in cache
    if (this.cache.dataState?.profiles[context.profileId]?.aliases?.[name]) {
      return {
        success: false,
        error: "alias_already_exists",
        params: { name },
      };
    }

    try {
      // Add new alias using explicit operations API
      assertProfileMutationContext(this, context, this._mutationGeneration);
      const result = await this.request("data:update-profile", {
        profileId: context.profileId,
        precondition: context.precondition,
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
      requireProfileUpdateResult(result);

      if (canPublishProfileMutation(this, context, this._mutationGeneration)) {
        try {
          await this.request("selection:select-alias", {
            aliasName: name,
            skipPersistence: true,
          });
        } catch (error) {
          console.warn(
            "[AliasService] Alias saved but selection presentation failed:",
            error,
          );
        }
      }

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
    try {
      name = requireMutationString(name, { optional: true, allowEmpty: true });
    } catch {
      return { success: false, error: "alias_not_found" };
    }
    if (!name)
      return { success: false, error: "alias_not_found", params: { name } };
    let context;
    try {
      context = captureProfileMutationContext(this, this._mutationGeneration);
    } catch {
      return { success: false, error: "failed_to_delete_alias" };
    }
    if (!context.profileId) {
      return { success: false, error: "no_profile_selected" };
    }

    if (!this.cache.dataState?.profiles[context.profileId]?.aliases?.[name]) {
      return { success: false, error: "alias_not_found", params: { name } };
    }

    try {
      // Delete alias using explicit operations API
      assertProfileMutationContext(this, context, this._mutationGeneration);
      const result = await this.request("data:update-profile", {
        profileId: context.profileId,
        precondition: context.precondition,
        delete: {
          aliases: [name],
        },
      });
      requireProfileUpdateResult(result);
      if (canPublishProfileMutation(this, context, this._mutationGeneration))
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
    try {
      sourceName = requireMutationString(sourceName, {
        optional: true,
        allowEmpty: true,
      });
      newName = requireMutationString(newName, {
        optional: true,
        allowEmpty: true,
      });
    } catch {
      return { success: false, error: "invalid_alias_name" };
    }
    if (!sourceName || !newName) {
      return { success: false, error: "invalid_alias_name" };
    }

    const generation = this._mutationGeneration;
    // Validate new alias name and not duplicate
    if (!(await this.isValidAliasName(newName))) {
      return {
        success: false,
        error: "invalid_alias_name",
        params: { name: newName },
      };
    }
    let context;
    try {
      context = captureProfileMutationContext(this, generation);
      assertProfileMutationContext(this, context, this._mutationGeneration);
    } catch {
      return { success: false, error: "failed_to_duplicate_alias" };
    }
    const profileId = context.profileId;
    if (!profileId)
      return { success: false, error: "failed_to_duplicate_alias" };
    const aliases = this.cache.dataState?.profiles[profileId]?.aliases ?? {};
    if (!aliases[sourceName])
      return {
        success: false,
        error: "alias_not_found",
        params: { name: sourceName },
      };
    if (aliases[newName]) {
      return {
        success: false,
        error: "alias_already_exists",
        params: { name: newName },
      };
    }

    const original = structuredClone(aliases[sourceName]);

    try {
      assertProfileMutationContext(this, context, this._mutationGeneration);
      const result = await this.request("data:update-profile", {
        profileId,
        precondition: context.precondition,
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
      requireProfileUpdateResult(result);

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
