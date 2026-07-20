import ComponentBase from "../ComponentBase.js";
import { syncSelectionBindset } from "./selectionBindset.js";
import {
  adoptCoordinatorSelectionState,
  shouldAdoptLiveCoordinatorState,
} from "./selectionCoordinatorState.js";
import {
  handleSelectedAliasDeleted,
  handleSelectedKeyDeleted,
} from "./selectionDeletion.js";
import { createSelectionIntentTracker } from "./selectionIntent.js";
import { createSelectionPersistenceController } from "./selectionPersistence.js";
import { profileUpdateChangesSelectionAuthority } from "./selectionProfileUpdate.js";
import { reconcileFailedSelection } from "./selectionReconciliation.js";
import { selectionExists } from "./selectionRestoration.js";
import {
  autoSelectFirstSelection,
  handleProfileSelectionSwitch,
  switchSelectionEnvironment,
  validateAndRestoreSelection as runSelectionRestoration,
  validateSelectionAfterProfileUpdate,
} from "./selectionRestorationWorkflow.js";
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
    /** @type {number | null} */
    this._selectionAuthorityEpoch = null;
    this._selectionAuthorityReady = false;
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
    this.addEventListener("data:state-changed", ({ state }) => {
      if (shouldAdoptLiveCoordinatorState(this, state)) {
        adoptCoordinatorSelectionState(this, state);
      }
    });

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

    this.addEventListener("profile:switched", (payload) => {
      handleProfileSelectionSwitch(this, payload);
    });

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

  /** @param {string} newEnvironment @param {string | null} [previousEnv] */
  switchEnvironment(newEnvironment, previousEnv = null) {
    return switchSelectionEnvironment(this, newEnvironment, previousEnv);
  }

  /** @param {string | null} [environment] @param {{ isCurrent?: () => boolean }} [options] */
  autoSelectFirst(environment = null, options = {}) {
    return autoSelectFirstSelection(this, environment, options);
  }

  /** @param {string | null} keyName @param {string | null} [environment] */
  validateKeyExists(keyName, environment = null) {
    return selectionExists({
      profile: this.cache.profile,
      environment: environment || this.selectionEnvironment,
      selection: keyName,
    });
  }

  /** @param {string | null} aliasName */
  validateAliasExists(aliasName) {
    return selectionExists({
      aliases: this.cache.aliases,
      environment: "alias",
      selection: aliasName,
    });
  }

  /** @param {string} environment @param {string | null | undefined} cachedSelection @param {{ skipPersistence?: boolean, isCurrent?: () => boolean }} [options] */
  validateAndRestoreSelection(environment, cachedSelection, options = {}) {
    return runSelectionRestoration(this, environment, cachedSelection, options);
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

  validateCurrentSelectionAfterUpdate() {
    return validateSelectionAfterProfileUpdate(this);
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
    if (reply.sender === "DataCoordinator") {
      adoptCoordinatorSelectionState(this, reply.state);
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
