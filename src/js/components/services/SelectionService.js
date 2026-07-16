import ComponentBase from "../ComponentBase.js";
import { syncSelectionBindset } from "./selectionBindset.js";
import {
  handleSelectedAliasDeleted,
  handleSelectedKeyDeleted,
} from "./selectionDeletion.js";
import { createSelectionIntentTracker } from "./selectionIntent.js";
import { createSelectionPersistenceController } from "./selectionPersistence.js";
import { profileUpdateChangesSelectionAuthority } from "./selectionProfileUpdate.js";
import {
  publishActiveSelection,
  reconcileFailedSelection,
} from "./selectionReconciliation.js";
import {
  applyActiveSelection,
  selectionCacheFromProfile,
} from "./selectionState.js";
import {
  createSelectionTransitionController,
  logSelectionTransitionError,
} from "./selectionTransition.js";

/** @typedef {import('../../types/events/base.js').SelectionCache} CachedSelections */
/** @typedef {{ skipPersistence?: boolean, isAuto?: boolean, forceEmit?: boolean, bindset?: string | null, isCurrent?: () => boolean }} SelectionOptions */
/** @typedef {import('./serviceTypes.js').ProfileData} SelectionProfile */

/**
 * SelectionService - Centralized selection state management
 *
 * Manages all selection state across the application including:
 * - Key selection (space/ground environments)
 * - Alias selection
 * - Environment-specific cached selections
 * - Parameter editing context
 * - Auto-selection logic
 * - Selection persistence to profiles
 */
export default class SelectionService extends ComponentBase {
  /** @param {{ eventBus?: import('./serviceTypes.js').EventBus }} [options] */
  constructor({ eventBus } = {}) {
    super(eventBus);
    this.componentName = "SelectionService";

    /** @type {{ isEditing?: boolean, editIndex?: number, existingCommand?: unknown } | null} */
    this.editingContext = null;

    // Environment-specific cached selections for persistence
    /** @type {CachedSelections} */
    this.cachedSelections = {
      space: null, // Last selected key in space environment
      ground: null, // Last selected key in ground environment
      alias: null, // Last selected alias
    };
    this.selectionEnvironment = "space";
    // Store detach functions for cleanup
    /** @type {Array<() => void>} */
    this._responseDetachFunctions = [];
    // Track last-deleted items to avoid re-selecting them during auto-selection
    /** @type {string | null} */
    this._lastDeletedKey = null;
    /** @type {string | null} */
    this._lastDeletedAlias = null;
    this.selectionTransitions = createSelectionTransitionController({
      getProfileId: () => this.cache.currentProfile,
      isDestroyed: () => this.destroyed,
      onError: logSelectionTransitionError,
    });
    this.selectionIntents = createSelectionIntentTracker();
    this.selectionPersistence = createSelectionPersistenceController({
      write: (profileId, selections) =>
        this.request("data:update-profile", {
          profileId,
          updates: { properties: { selections } },
          updateSource: "SelectionService",
        }),
      onCommit: (profileId, selections) => {
        if (this.destroyed || this.cache.currentProfile !== profileId) return;
        for (const [environment, selection] of Object.entries(selections)) {
          this.setCachedSelection(environment, selection);
        }
        if (this.cache.profile)
          this.cache.profile.selections = { ...selections };
      },
      onError: (error) =>
        console.warn(
          "[SelectionService] Failed to persist selection to profile:",
          error,
        ),
    });
  }

  onInit() {
    this.selectionEnvironment = this.cache.currentEnvironment || "space";
    this.setupEventListeners();
    this.setupRequestHandlers();
    this.cache.cachedSelections = { ...this.cachedSelections };
  }

  /** @param {string} environment @param {string | null} value */
  setCachedSelection(environment, value) {
    if (!environment) return;
    this.cachedSelections[environment] = value;
    this.cache.cachedSelections[environment] = value;
  }

  broadcastState() {
    if (!this.initialized || this.destroyed) return;
    this.emit("selection:state-changed", this.getCurrentState());
  }

  /** @param {SelectionProfile | null} profile */
  replaceCachedSelections(profile) {
    this.cachedSelections = selectionCacheFromProfile(profile);
    this.cache.cachedSelections = { ...this.cachedSelections };
    if (this.cache.currentProfile) {
      this.selectionPersistence.reset(
        this.cache.currentProfile,
        profile?.selections,
      );
    }
  }

  /** @param {string} environment */
  getCachedSelection(environment) {
    return this.cachedSelections[environment];
  }

  // Set up event listeners for integration with other services
  setupEventListeners() {
    // ComponentBase automatically handles profile and environment caching
    // We only need to listen for these events to update our specific business logic
    this.addEventListener("profile:updated", ({ profileId, profile }) => {
      if (profileId && profileId === this.cache.currentProfile) {
        this.updateCacheFromProfile(profile);
        if (!profileUpdateChangesSelectionAuthority(this, profile)) return;
        this.selectionTransitions.invalidate();
        this.selectionIntents.clear();
        this.replaceCachedSelections(profile);

        // After import operations (especially overwrite_all), validate current selection
        // Auto-select if current selection is no longer valid
        void this.validateCurrentSelectionAfterUpdate();
        this.broadcastState();
      }
    });

    // Listen for DataCoordinator profile switches (synchronous support)
    this.addEventListener(
      "profile:switched",
      ({ profileId, profile, environment }) => {
        this.selectionIntents.clear();
        console.log(
          `[SelectionService] profile:switched: profileId="${profileId}", env="${environment}"`,
        );

        // ComponentBase handles currentProfile, profile, and currentEnvironment caching.
        this.updateCacheFromProfile(profile);
        const targetEnvironment =
          environment ||
          profile?.environment ||
          profile?.currentEnvironment ||
          "space";
        this.selectionEnvironment = targetEnvironment;
        this.cache.currentEnvironment = targetEnvironment;

        if (!profile) {
          this.replaceCachedSelections(null);
          this.cache.selectedKey = null;
          this.cache.selectedAlias = null;
          this.selectionTransitions.defer(async (isCurrent) => {
            if (!isCurrent()) return;
            this.broadcastState();
            if (!isCurrent()) return;
            this.emit("key-selected", {
              key: null,
              source: "SelectionService",
            });
            if (!isCurrent()) return;
            this.emit("alias-selected", {
              name: null,
              source: "SelectionService",
            });
          });
          return;
        }

        this.replaceCachedSelections(profile);
        const cachedSelection =
          this.cachedSelections[targetEnvironment] ?? null;
        console.log(
          `[SelectionService] Validating and restoring selection for "${targetEnvironment}": "${cachedSelection}"`,
        );

        applyActiveSelection(this.cache, targetEnvironment, cachedSelection);

        // Publish only after every profile:switched listener has cached the new
        // profile. The epoch guard also prevents an older async restore from
        // announcing state after a newer profile transition.
        this.selectionTransitions.defer(async (isCurrent) => {
          if (!isCurrent()) return;
          this.broadcastState();
          if (!isCurrent()) return;
          if (targetEnvironment === "alias") {
            this.emit("alias-selected", {
              name: cachedSelection,
              source: "SelectionService",
            });
          } else {
            this.emit("key-selected", {
              key: cachedSelection,
              environment: targetEnvironment,
              bindset: null,
              source: "SelectionService",
            });
          }
          if (!isCurrent()) return;
          await this.validateAndRestoreSelection(
            targetEnvironment,
            cachedSelection,
            { isCurrent, skipPersistence: true },
          );
        });
      },
    );

    // Listen for environment changes
    this.addEventListener("environment:changed", async (data) => {
      const env = data.environment;
      const previousEnv = this.selectionEnvironment;

      if (env && env !== previousEnv) {
        await this.switchEnvironment(env, previousEnv);
      }
    });

    // Listen for alias deletions to handle auto-selection when selected alias is deleted
    this.addEventListener("alias-deleted", ({ name }) =>
      handleSelectedAliasDeleted(this, name),
    );

    // Listen for key deletions to handle auto-selection when selected key is deleted
    this.addEventListener("key-deleted", ({ keyName }) =>
      handleSelectedKeyDeleted(this, keyName),
    );
  }

  // Set up request/response handlers for external API
  setupRequestHandlers() {
    this._responseDetachFunctions.push(
      // Core selection operations

      this.respond(
        "selection:select-alias",
        ({ aliasName, skipPersistence, isAuto, forceEmit }) => {
          /** @type {SelectionOptions} */
          const options = {};
          if (skipPersistence === true) options.skipPersistence = true;
          if (isAuto === true) options.isAuto = true;
          if (forceEmit === true) options.forceEmit = true;
          return this.selectAlias(aliasName, options);
        },
      ),
      this.respond("selection:clear", ({ type }) => this.clearSelection(type)),
      // Auto-selection
      this.respond("selection:auto-select-first", ({ environment }) =>
        this.autoSelectFirst(environment),
      ),

      // Editing context
      this.respond("selection:set-editing-context", ({ context }) =>
        this.setEditingContext(context),
      ),

      // Legacy compatibility handlers
      this.respond("key:select", ({ keyName, environment, bindset }) =>
        this.selectKey(keyName, environment, { bindset }),
      ),
      this.respond("alias:select", ({ aliasName }) =>
        this.selectAlias(aliasName),
      ),
      this.respond(
        "selection:select-key",
        ({
          keyName,
          environment,
          bindset,
          skipPersistence,
          isAuto,
          forceEmit,
        }) => {
          /** @type {SelectionOptions} */
          const options = { bindset };
          if (skipPersistence === true) options.skipPersistence = true;
          if (isAuto === true) options.isAuto = true;
          if (forceEmit === true) options.forceEmit = true;
          return this.selectKey(keyName, environment, options);
        },
      ),
    );
  }

  // Select a key in the specified environment
  /** @param {string | null} keyName @param {string | null} [environment] @param {SelectionOptions} [options] */
  async selectKey(keyName, environment = null, options = {}) {
    const isCurrent = options.isCurrent || this.selectionTransitions.begin();
    if (!isCurrent()) return keyName;
    const env = environment || this.selectionEnvironment;
    const profileId = this.cache.currentProfile;
    const isAuto = options.isAuto === true;
    const skipPersistence = options.skipPersistence === true;

    const bindsetContext = options.bindset || null;

    const duplicateSelection =
      this.cache.selectedKey === keyName &&
      this.selectionEnvironment === env &&
      (bindsetContext
        ? this.cache.activeBindset === bindsetContext
        : this.cache.activeBindset === "Primary Bindset");
    const shouldEmitDuplicate =
      options.forceEmit === true ||
      keyName == null ||
      (!isAuto &&
        (this._lastSelectionSource === "auto" ||
          this._lastSelectionSource == null));

    if (duplicateSelection && !shouldEmitDuplicate) {
      return keyName;
    }

    // Persist selection immediately unless explicitly skipped
    if (!skipPersistence) {
      const persistence = this.persistSelectionToProfile(env, keyName);
      const intent = this.selectionIntents.track(env, keyName, persistence);
      const persisted = await persistence;
      const isLatestIntent = this.selectionIntents.finish(intent);
      if (!persisted) {
        if (isLatestIntent) reconcileFailedSelection(this, env);
        return this.cache.selectedKey;
      }
      if (!isCurrent()) {
        if (!this.destroyed && this.cache.currentProfile === profileId) {
          this.setCachedSelection(env, keyName);
          this.broadcastState();
        }
        return keyName;
      }
    }

    // Commit selection state only after persistence succeeds.
    applyActiveSelection(this.cache, env, keyName);
    this.setCachedSelection(env, keyName);
    if (environment == null) {
      this.selectionEnvironment = env;
      this.cache.currentEnvironment = env;
    }

    if (!isCurrent()) return keyName;
    await syncSelectionBindset(this, env, bindsetContext);
    if (!isCurrent()) return keyName;

    // Emit selection event for other services
    console.log(
      `[SelectionService] Emitting key-selected with: key=${keyName}, environment=${env}, bindset=${options.bindset || null}`,
    );
    this.broadcastState();
    if (!isCurrent()) return keyName;
    this.emit("key-selected", {
      key: keyName,
      environment: env,
      bindset: bindsetContext,
      source: "SelectionService",
    });

    this._lastSelectionSource = isAuto ? "auto" : "manual";

    return keyName;
  }

  // Select an alias
  /** @param {string | null} aliasName @param {SelectionOptions} [options] */
  async selectAlias(aliasName, options = {}) {
    const isCurrent = options.isCurrent || this.selectionTransitions.begin();
    if (!isCurrent()) return aliasName;
    const isAuto = options.isAuto === true;
    const skipPersistence = options.skipPersistence === true;
    const profileId = this.cache.currentProfile;
    const duplicateSelection = this.cache.selectedAlias === aliasName;
    const shouldEmitDuplicate =
      options.forceEmit === true ||
      aliasName == null ||
      (!isAuto &&
        (this._lastAliasSelectionSource === "auto" ||
          this._lastAliasSelectionSource == null));

    // Check if this is the same selection (avoid duplicate events)
    if (
      duplicateSelection &&
      !shouldEmitDuplicate &&
      this.selectionEnvironment === "alias"
    ) {
      return aliasName;
    }

    // Persist selection immediately unless explicitly skipped
    if (!skipPersistence) {
      const persistence = this.persistSelectionToProfile("alias", aliasName);
      const intent = this.selectionIntents.track(
        "alias",
        aliasName,
        persistence,
      );
      const persisted = await persistence;
      const isLatestIntent = this.selectionIntents.finish(intent);
      if (!persisted) {
        if (isLatestIntent) reconcileFailedSelection(this, "alias");
        return this.cache.selectedAlias;
      }
      if (!isCurrent()) {
        if (!this.destroyed && this.cache.currentProfile === profileId) {
          this.setCachedSelection("alias", aliasName);
          this.broadcastState();
        }
        return aliasName;
      }
    }

    // Commit selection state only after persistence succeeds.
    applyActiveSelection(this.cache, "alias", aliasName);
    this.setCachedSelection("alias", aliasName);

    // Emit selection event for other services
    this.broadcastState();
    if (!isCurrent()) return aliasName;
    this.emit("alias-selected", {
      name: aliasName,
      source: "SelectionService",
    });

    this._lastAliasSelectionSource = isAuto ? "auto" : "manual";

    return aliasName;
  }

  // Clear selection of specified type or all
  /** @param {string} [type] @returns {undefined} */
  clearSelection(type = "all") {
    this.selectionTransitions.invalidate();
    switch (type) {
      case "key":
        this.cache.selectedKey = null;
        break;
      case "alias":
        this.cache.selectedAlias = null;
        break;
      case "editing":
        this.editingContext = null;
        break;
      case "all":
      default:
        this.cache.selectedKey = null;
        this.cache.selectedAlias = null;
        this.editingContext = null;
        break;
    }

    // Emit clear events
    if (type === "all" || type === "key") {
      this.emit("key-selected", { key: null, source: "SelectionService" });
    }
    if (type === "all" || type === "alias") {
      this.emit("alias-selected", { name: null, source: "SelectionService" });
    }
    if (type === "all" || type === "editing") {
      this.emit("editing-context-changed", { context: null });
    }
    this.broadcastState();
  }

  // Set parameter editing context
  /** @param {{ isEditing?: boolean, editIndex?: number, existingCommand?: unknown } | null} context */
  setEditingContext(context) {
    this.editingContext = context;
    this.emit("editing-context-changed", { context });
    this.broadcastState();
    return context;
  }

  // Switch to a different environment
  /** @param {string} newEnvironment @param {string | null} [previousEnv] */
  async switchEnvironment(newEnvironment, previousEnv = null) {
    const isCurrent = this.selectionTransitions.begin();
    const previousEnvResolved = previousEnv ?? this.selectionEnvironment;
    const pendingIntent = this.selectionIntents.get(previousEnvResolved);
    const previousSelection =
      previousEnvResolved === "alias"
        ? this.cache.selectedAlias
        : this.cache.selectedKey;

    if (!pendingIntent && previousSelection) {
      this.setCachedSelection(previousEnvResolved, previousSelection);
    }

    const previousPersistence =
      pendingIntent?.persistence ||
      (previousSelection
        ? this.persistSelectionToProfile(previousEnvResolved, previousSelection)
        : Promise.resolve(true));
    this.selectionEnvironment = newEnvironment;
    this.cache.currentEnvironment = newEnvironment;
    this._refreshKeysForEnvironment(newEnvironment);

    // Auto-restore cached selection for the new environment with validation
    let cachedSelection = this.getCachedSelection(newEnvironment);
    if (cachedSelection === undefined) {
      const profileSelections =
        /** @type {Record<string, string | null> | undefined} */ (
          this.cache.profile?.selections
        );
      cachedSelection = profileSelections?.[newEnvironment] ?? null;
      this.setCachedSelection(newEnvironment, cachedSelection);
    }
    console.log(
      `[SelectionService] Switching to ${newEnvironment}, cached selection: "${cachedSelection}"`,
    );

    if (newEnvironment === "alias") {
      // Preserve the compatibility clear before publishing the canonical state.
      this.emit("key-selected", { key: null, source: "SelectionService" });
      if (!isCurrent()) return;
      applyActiveSelection(this.cache, newEnvironment, cachedSelection ?? null);
      this.broadcastState();
      if (!isCurrent()) return;
      this.emit("alias-selected", {
        name: cachedSelection ?? null,
        source: "SelectionService",
      });
    } else {
      this.emit("alias-selected", { name: null, source: "SelectionService" });
      if (!isCurrent()) return;
      applyActiveSelection(this.cache, newEnvironment, cachedSelection ?? null);
      this.broadcastState();
      if (!isCurrent()) return;
      this.emit("key-selected", {
        key: cachedSelection ?? null,
        environment: newEnvironment,
        bindset: null,
        source: "SelectionService",
      });
    }

    await previousPersistence;
    if (!isCurrent()) return;
    await this.validateAndRestoreSelection(newEnvironment, cachedSelection, {
      isCurrent,
      skipPersistence: true,
    });
    if (!isCurrent()) return;
    this.emit("environment:switched", {
      from: previousEnvResolved,
      to: newEnvironment,
      source: "SelectionService",
    });
  }

  /** @param {string} environment */
  _refreshKeysForEnvironment(environment) {
    if (!environment) return;
    const builds = this.cache.builds || this.cache.profile?.builds;
    if (builds && builds[environment]?.keys) {
      this.cache.keys = builds[environment].keys;
      return;
    }
    if (this.cache.profile?.keys && environment === this.selectionEnvironment) {
      this.cache.keys = this.cache.profile.keys;
      return;
    }
    this.cache.keys = {};
  }

  // Auto-select the first available item in the specified environment
  /** @param {string | null} [environment] @param {{ isCurrent?: () => boolean }} [options] */
  async autoSelectFirst(environment = null, options = {}) {
    const isCurrent = options.isCurrent || this.selectionTransitions.begin();
    if (!isCurrent()) return null;
    // CRITICAL: Add data validation to prevent auto-selection before profile data is loaded
    if (!this.cache.profile || !this.cache.currentProfile) {
      console.log(
        "[SelectionService] Profile data not loaded, skipping auto-selection",
      );
      return null;
    }

    const env = environment || this.selectionEnvironment;

    if (env === "alias") {
      // ComponentBase keeps this snapshot current through broadcasts and late join.
      const cachedAliases = this.cache.aliases || {};
      const aliases =
        Object.keys(cachedAliases).length > 0
          ? cachedAliases
          : this.cache.profile?.aliases || {};

      // Auto-select first user-created alias (filter out VFX Manager system aliases)
      let userAliases = Object.entries(aliases).filter(
        ([, value]) => value.type !== "vfx-alias",
      );
      // Exclude the last deleted alias if present
      if (this._lastDeletedAlias) {
        userAliases = userAliases.filter(
          ([aliasName]) => aliasName !== this._lastDeletedAlias,
        );
      }

      if (userAliases.length > 0) {
        const firstAlias = userAliases[0][0]; // Get the key (alias name)
        await this.selectAlias(firstAlias, { isAuto: true, isCurrent });
        if (!isCurrent()) return null;
        this._lastDeletedAlias = null;
        return firstAlias;
      }
    } else {
      // Auto-select first key for space/ground using cached data

      // Use current environment keys if available, otherwise try to get from builds
      let keys = this.cache.keys || {};

      // If we're switching environments or current keys are empty, look at builds data
      if (
        (env !== this.selectionEnvironment || Object.keys(keys).length === 0) &&
        this.cache.builds
      ) {
        keys = this.cache.builds[env]?.keys || {};
      }

      // If cache is still empty, try to get from DataCoordinator
      if (Object.keys(keys).length === 0) {
        try {
          keys =
            (await this.request("data:get-keys", { environment: env })) || {};
          if (!isCurrent()) return null;
        } catch {
          return null;
        }
      }

      // Exclude last deleted key if present
      let keyNames = Object.keys(keys);
      if (this._lastDeletedKey) {
        keyNames = keyNames.filter((k) => k !== this._lastDeletedKey);
      }

      if (keyNames.length > 0) {
        const firstKey = keyNames[0];
        await this.selectKey(firstKey, env, {
          isAuto: true,
          bindset: "Primary Bindset",
          isCurrent,
        });
        if (!isCurrent()) return null;
        this._lastDeletedKey = null;
        return firstKey;
      } else {
        // No keys available in this environment - explicitly clear selection
        // Use current environment to determine what type of selection to clear
        if (this.selectionEnvironment === "alias") {
          await this.selectAlias(null, { isAuto: true, isCurrent });
        } else {
          await this.selectKey(null, this.selectionEnvironment, {
            isAuto: true,
            isCurrent,
          });
        }
        return null;
      }
    }

    return null;
  }

  // Validate that a key still exists using cached data
  /** @param {string | null} keyName @param {string | null} [environment] */
  validateKeyExists(keyName, environment = null) {
    if (!keyName) return false;

    const env = environment || this.selectionEnvironment;

    // Use the same validation logic as BindsetService - check Primary Bindset
    // This ensures compatibility with bindset-enabled profiles
    const profile = this.cache.profile;
    if (!profile) return false;

    const keyData = profile.builds?.[env]?.keys?.[keyName];
    const exists = keyData !== undefined && Array.isArray(keyData);
    return exists;
  }

  // Validate that an alias still exists using cached data
  // Only considers user-created aliases (filters out VFX Manager system aliases)
  /** @param {string | null} aliasName */
  validateAliasExists(aliasName) {
    if (!aliasName) return false;

    // Use cached data from ComponentBase, filter out VFX aliases like AliasBrowserService does
    const aliases = this.cache.aliases || {};
    const userAliases = Object.fromEntries(
      Object.entries(aliases).filter(([, value]) => value.type !== "vfx-alias"),
    );
    return Object.prototype.hasOwnProperty.call(userAliases, aliasName);
  }

  // Validate and restore selection, with auto-selection fallback if invalid
  /** @param {string} environment @param {string | null | undefined} cachedSelection @param {{ skipPersistence?: boolean, isCurrent?: () => boolean }} [options] */
  async validateAndRestoreSelection(
    environment,
    cachedSelection,
    options = {},
  ) {
    const { skipPersistence = false } = options;
    const isCurrent = options.isCurrent || this.selectionTransitions.begin();
    if (!isCurrent()) return;
    console.log(
      `[SelectionService] validateAndRestoreSelection: env="${environment}", cached="${cachedSelection}", skipPersistence=${skipPersistence}`,
    );

    // CRITICAL: Add profile data validation to prevent errors during initialization
    if (!this.cache.profile || !this.cache.currentProfile) {
      console.log(
        "[SelectionService] Profile data not available for validation",
      );
      return;
    }

    if (!cachedSelection) {
      await this.autoSelectFirst(environment, { isCurrent });
      return;
    }

    let isValid = false;

    if (environment === "alias") {
      isValid = this.validateAliasExists(cachedSelection);
      if (isValid) {
        console.log(
          `[SelectionService] Restoring cached alias: "${cachedSelection}"`,
        );
        await this.selectAlias(cachedSelection, {
          isAuto: true,
          skipPersistence,
          isCurrent,
        });
      } else {
        console.log(
          `[SelectionService] Cached alias "${cachedSelection}" no longer exists, auto-selecting`,
        );
        if (!isCurrent()) return;
        this.setCachedSelection("alias", null);
        if (this.selectionEnvironment === "alias") {
          this.cache.selectedAlias = null;
          this.broadcastState();
          if (!isCurrent()) return;
          this.emit("alias-selected", {
            name: null,
            source: "SelectionService",
          });
        }
        await this.autoSelectFirst("alias", { isCurrent });
      }
    } else {
      isValid = this.validateKeyExists(cachedSelection, environment);
      if (isValid) {
        console.log(
          `[SelectionService] Restoring cached key: "${cachedSelection}" for env "${environment}"`,
        );
        await this.selectKey(cachedSelection, environment, {
          isAuto: true,
          skipPersistence,
          isCurrent,
        });
      } else {
        console.log(
          `[SelectionService] Cached key "${cachedSelection}" no longer exists in ${environment}, auto-selecting`,
        );
        if (!isCurrent()) return;
        this.setCachedSelection(environment, null);
        if (this.selectionEnvironment === environment) {
          this.cache.selectedKey = null;
          this.broadcastState();
          if (!isCurrent()) return;
          this.emit("key-selected", {
            key: null,
            environment,
            bindset: null,
            source: "SelectionService",
          });
        }
        await this.autoSelectFirst(environment, { isCurrent });
      }
    }
  }

  // Update cache from profile data (DataCoordinator integration)
  /** @param {SelectionProfile | null | undefined} profile */
  updateCacheFromProfile(profile) {
    if (!profile) return;

    this.cache.profile = profile;
    this.cache.builds = profile.builds || {
      space: { keys: {} },
      ground: { keys: {} },
    };
    this.cache.keys = profile.keys || {};
    this.cache.aliases = profile.aliases || {};
  }

  // Validate current selection after profile updates (e.g., import operations)
  // Auto-select if current selection is no longer valid
  async validateCurrentSelectionAfterUpdate() {
    if (!this.cache.profile || !this.cache.currentProfile) {
      return;
    }

    const environment = this.selectionEnvironment;
    const selection = this.cachedSelections[environment];
    const isValid =
      environment === "alias"
        ? this.validateAliasExists(selection)
        : this.validateKeyExists(selection, environment);
    const isCurrent = this.selectionTransitions.begin();
    if (!selection) {
      publishActiveSelection(this, environment, null);
      return;
    }
    if (isValid) {
      if (environment === "alias") {
        await this.selectAlias(selection, {
          isAuto: true,
          isCurrent,
          skipPersistence: true,
        });
      } else {
        await this.selectKey(selection, environment, {
          isAuto: true,
          isCurrent,
          skipPersistence: true,
        });
      }
      return;
    }

    await this.validateAndRestoreSelection(environment, selection, {
      isCurrent,
    });
  }

  // Persist selection to profile via DataCoordinator
  /** @param {string} environment @param {string | null} selection @returns {Promise<boolean>} */
  async persistSelectionToProfile(environment, selection) {
    const profileId = this.cache.currentProfile;
    if (!profileId) return true;
    return this.selectionPersistence.persist(profileId, environment, selection);
  }

  // Return owned state for late-join synchronization
  /** @returns {import('../../types/events/component-state.js').ComponentState<'SelectionService'>} */
  getCurrentState() {
    return {
      selectedKey: this.cache.selectedKey,
      selectedAlias: this.cache.selectedAlias,
      editingContext: this.editingContext,
      cachedSelections: { ...this.cachedSelections },
      currentEnvironment: this.selectionEnvironment,
    };
  }

  // Handle initial state from other components during late-join
  /** @param {import('../../types/events/component-state.js').ComponentStateReply} reply */
  async handleInitialState(reply) {
    // Handle state from DataCoordinator
    if (reply.sender === "DataCoordinator") {
      const coordinatorState = reply.state;
      const profile = coordinatorState.currentProfileData;

      if (!profile) {
        this.cache.currentProfile = null;
        this.selectionEnvironment =
          coordinatorState.currentEnvironment ||
          this.selectionEnvironment ||
          "space";
        this.cache.currentEnvironment = this.selectionEnvironment;
        this.replaceCachedSelections(null);
        this.cache.selectedKey = null;
        this.cache.selectedAlias = null;
        this.broadcastState();
        return;
      }

      this.cache.currentProfile =
        coordinatorState.currentProfile || profile.id || null;
      this.selectionEnvironment =
        coordinatorState.currentEnvironment ||
        profile.environment ||
        profile.currentEnvironment ||
        "space";
      this.cache.currentEnvironment = this.selectionEnvironment;

      this.updateCacheFromProfile(profile);
      this.replaceCachedSelections(profile);

      // Validate and restore selection for current environment with fallback
      const cachedSelection =
        this.getCachedSelection(this.selectionEnvironment) ?? null;

      // Set initial selection state immediately to prevent UI flicker
      applyActiveSelection(
        this.cache,
        this.selectionEnvironment,
        cachedSelection,
      );
      this.broadcastState();

      // Note: No need for delayed validation here - the profile:switched event will handle restoration
      // when DataCoordinator emits it synchronously
    }
  }

  // Cleanup method to detach all request/response handlers
  onDestroy() {
    this.selectionTransitions.invalidate();
    this.selectionIntents.clear();
    this.selectionPersistence.dispose();

    if (this._responseDetachFunctions) {
      this._responseDetachFunctions.forEach((detach) => {
        if (typeof detach === "function") {
          detach();
        }
      });
      this._responseDetachFunctions = [];
    }
  }
}
