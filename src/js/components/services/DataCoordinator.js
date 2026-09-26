import ComponentBase from "../ComponentBase.js";
import { normalizeProfile } from "../../lib/profileNormalizer.js";
import persist from "./storageWrites.js";
import {
  createDataStateSnapshot,
  nextDataStateAuthorityEpoch,
} from "./dataState.js";
import builtInDefaultProfiles, {
  getDefaultProfiles,
} from "../../data/defaultProfiles.js";
import { registerDataCoordinatorResponders } from "./dataCoordinatorResponders.js";
import { handleLoadDefaultDataUi } from "./dataCoordinatorDefaultUi.js";
import {
  beginInitialCoordinatorStateLoad,
  initializeDataCoordinatorState,
} from "./dataCoordinatorInitialState.js";
import {
  createDefaultProfileDraft,
  createFallbackProfileDraft,
  planProfileBatch,
} from "./profileConstruction.js";
import {
  executeProfileSwitch,
  executeProfileCreate,
  executeProfileClone,
  executeProfileRename,
  executeProfileDelete,
} from "./dataCoordinatorProfileActions.js";
import { normalizeCoordinatorProfiles } from "./dataCoordinatorProfileNormalization.js";
import { applyProfileOperations } from "./profileOperations.js";
import { profileStateChange } from "./dataStateChange.js";
import {
  activateImportedProject,
  replaceProjectFromImport as replaceImportedProject,
} from "./dataCoordinatorProjectImport.js";
import {
  materializeMutationRequest,
  requireMutationString,
} from "./mutationRequestBoundary.js";
import {
  materializeProfileUpdateRequest,
  materializeProfileMap,
  requireProfileIdentifier,
  validateProfileCreation,
  validateProfileCloneName,
  validatePlannedProfileRoot,
  validatePlannedProjectRoot,
} from "./dataCoordinatorMutationBoundary.js";
import {
  assertDataCoordinatorPrecondition,
  enqueueDataCoordinatorMutation,
  isCurrentDataCoordinatorOwner,
  recordDataCoordinatorPublication,
} from "./dataCoordinatorMutationQueue.js";
import {
  publishCurrentCoordinatorProfile,
  publishDataCoordinatorState,
  publishReloadedCoordinatorState,
} from "./dataCoordinatorPublication.js";

/** @param {unknown} error */
const errMsg = (error) =>
  error instanceof Error ? error.message : String(error);

/** @param {object} value @param {PropertyKey} key */
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

/**
 * DataCoordinator - Single source of truth for profile data operations
 *
 * Implements the broadcast/cache pattern:
 * - Services request data changes through this coordinator
 * - State changes are broadcast to all subscribers
 * - Late-join components get current state automatically
 * - No direct storage access from feature services
 *
 * Explicit Operations API
 * =======================
 *
 * Instead of requiring services to reconstruct entire objects, the DataCoordinator
 * now supports explicit add/delete/modify operations:
 *
 * Examples:
 *
 * // Add new aliases without affecting existing ones
 * await this.request('data:update-profile', {
 *   profileId: 'my_profile',
 *   add: {
 *     aliases: {
 *       'new_alias': { commands: 'say "hello"', description: 'Greeting alias' }
 *     }
 *   }
 * })
 *
 * // Delete specific aliases by name
 * await this.request('data:update-profile', {
 *   profileId: 'my_profile',
 *   delete: {
 *     aliases: ['old_alias', 'unused_alias']
 *   }
 * })
 *
 * // Modify existing alias commands without affecting others
 * await this.request('data:update-profile', {
 *   profileId: 'my_profile',
 *   modify: {
 *     aliases: {
 *       'existing_alias': { commands: 'updated_command_chain' }
 *     }
 *   }
 * })
 *
 * // Add new keybinds to specific environments
 * await this.request('data:update-profile', {
 *   profileId: 'my_profile',
 *   add: {
 *     builds: {
 *       space: {
 *         keys: {
 *           'F5': [{ command: 'new_space_command' }]
 *         }
 *       }
 *     }
 *   }
 * })
 *
 * // Delete specific keys
 * await this.request('data:update-profile', {
 *   profileId: 'my_profile',
 *   delete: {
 *     builds: {
 *       space: { keys: ['F5'] },
 *       ground: { keys: ['F6', 'F7'] }
 *     }
 *   }
 * })
 *
 * // Combined operations in a single atomic update
 * await this.request('data:update-profile', {
 *   profileId: 'my_profile',
 *   add: {
 *     aliases: { 'new_alias': { commands: 'new_command' } }
 *   },
 *   delete: {
 *     aliases: ['old_alias']
 *   },
 *   modify: {
 *     aliases: { 'existing_alias': { description: 'Updated description' } }
 *   },
 *   properties: {
 *     description: 'Profile updated via explicit operations'
 *   }
 * })
 */
export default class DataCoordinator extends ComponentBase {
  /**
   * @param {{
   *   eventBus: import('./serviceTypes.js').EventBus,
   *   storage: import('./serviceTypes.js').Storage,
   *   i18n: import('./serviceTypes.js').I18n,
   *   defaultProfiles?: Record<string, unknown>
   * }} options
   */
  constructor({
    eventBus,
    storage,
    i18n,
    defaultProfiles = builtInDefaultProfiles,
  }) {
    super(eventBus);
    this.componentName = "DataCoordinator";
    this.storage = storage;
    this.i18n = i18n;
    this.defaultProfileDefinitions = defaultProfiles;

    // Cache current state
    /** @type {import('./serviceTypes.js').CoordinatorState} */
    this.state = {
      currentProfile: null,
      currentEnvironment: "space",
      profiles: {},
      metadata: { lastModified: null, version: "1.0.0" },
    };
    this._stateAuthorityEpoch = nextDataStateAuthorityEpoch();
    this._lifecycleGeneration = 0;
    /** @type {Promise<void>} */
    this.initialStateReady = Promise.resolve();
    this._initialStateCommitted = Promise.resolve();
    this._initialStateTail = Promise.resolve();
    this.initialStateSettled = this._initialStateTail;
    this._stateReady = false;
    this._stateRevision = 0;
    /** @type {import('../../types/events/component-state.js').DataCoordinatorStateSnapshot | null} */
    this._currentStateSnapshot = null;
    this.needsDefaultProfiles = false;
    /** @type {Array<() => void>} */
    this._responseDetachFunctions = [];

    // Late-join support is handled by ComponentBase automatically
  }

  onInit() {
    initializeDataCoordinatorState(this);
  }

  setupEventListeners() {
    // Listen for storage reset events
    this.addEventListener("storage:data-reset", ({ data }) => {
      console.log("[DataCoordinator] Handling storage reset, reloading state");

      // Update our state to empty/reset state
      this.state.currentProfile = null;
      this.state.profiles = {};
      this.state.currentEnvironment = "space"; // Reset to default environment
      this.state.metadata = {
        lastModified: data?.lastModified,
        version: data?.version || "1.0.0",
      };

      this._publishState("storage-reset");

      // Broadcast the reset to all components synchronously
      this.emit(
        "profile:updated",
        {
          profileId: null,
          profile: null,
          updateSource: "DataCoordinator-Reset",
        },
        { synchronous: true },
      );

      this.emit(
        "profile:switched",
        {
          profileId: null,
          profile: null,
          environment: "space",
          updateSource: "DataCoordinator-Reset",
        },
        { synchronous: true },
      );
    });

    // Listen for load default data events
    this.addEventListener("data:load-default", (payload) => {
      if (payload !== null) throw new TypeError("invalid_mutation_request");
      return this.handleLoadDefaultData();
    });
  }

  // Handle loading default data with profile existence check
  async handleLoadDefaultData() {
    await handleLoadDefaultDataUi(this);
  }

  _captureOperationGeneration() {
    return this._lifecycleGeneration;
  }

  /** @param {number} generation */
  _isCurrentOperation(generation) {
    return (
      !this.destroyed &&
      generation === this._lifecycleGeneration &&
      isCurrentDataCoordinatorOwner(this)
    );
  }

  /** @param {number} generation */
  _assertCurrentOperation(generation) {
    if (!this._isCurrentOperation(generation)) {
      throw new Error("operation_cancelled");
    }
  }

  setupRequestHandlers() {
    if (this._responseDetachFunctions.length > 0) return;
    this._responseDetachFunctions.push(
      ...registerDataCoordinatorResponders(this),
    );
  }

  /** Queue an initial storage load through the lifecycle-owned barrier. */
  loadInitialState() {
    return beginInitialCoordinatorStateLoad(this);
  }

  /**
   * Get current complete state (ComponentBase late-join method)
   * @returns {import('../../types/events/component-state.js').ComponentState<'DataCoordinator'>}
   */
  getCurrentState() {
    if (this._stateReady && this._currentStateSnapshot) {
      return this._currentStateSnapshot;
    }

    const snapshot = createDataStateSnapshot(this.state, {
      authorityEpoch: this._stateAuthorityEpoch,
      ready: this._stateReady,
      revision: this._stateRevision,
    });

    if (this._stateReady) this._currentStateSnapshot = snapshot;
    return snapshot;
  }

  /**
   * Publish the authoritative coordinator snapshot after a durable logical
   * commit. Mutations that finish while initial storage loading is still in
   * progress are represented by the final initial-load snapshot instead.
   *
   * @param {import('../../types/events/data.js').DataStateChangeReason} reason
   * @param {{ profileId?: string }} [details]
   * @returns {import('../../types/events/component-state.js').DataCoordinatorStateSnapshot | null}
   */
  _publishState(reason, details = {}) {
    return publishDataCoordinatorState(this, reason, details).state;
  }

  /** @param {unknown} projectData @param {import('../../types/storage-contracts.js').ImportedProjectOwnerActionOptions} [options] @returns {Promise<import('../../types/storage-contracts.js').ImportedProjectOwnerResult>} */
  replaceProjectFromImport(projectData, options) {
    return replaceImportedProject(this, projectData, options);
  }

  /** @param {unknown} project @param {{fingerprint: string}} options @returns {Promise<import('../../types/storage-contracts.js').ImportedProjectActivationResult>} */
  activateProjectFromImport(project, options) {
    return activateImportedProject(this, project, options);
  }

  /**
   * Switch to a different profile
   * @param {string} profileId
   * @returns {Promise<import('../../types/rpc/index.js').RpcResult<'data:switch-profile'>>}
   */
  async switchProfile(profileId) {
    const safeId = requireProfileIdentifier(profileId);
    return enqueueDataCoordinatorMutation(this, () =>
      executeProfileSwitch(this, safeId),
    );
  }

  /**
   * Create a new profile
   */
  /**
   * @param {string} name
   * @param {string} description
   * @param {string} mode
   * @returns {Promise<import('../../types/rpc/index.js').RpcResult<'data:create-profile'>>}
   */
  async createProfile(name, description = "", mode = "space") {
    const request = materializeMutationRequest({ name, description, mode }, [
      "name",
      "description",
      "mode",
    ]);
    const safeName = requireMutationString(request.name, { allowEmpty: true });
    if (!safeName.trim())
      throw new Error(this.i18n.t("profile_name_is_required"));
    const safeDescription = requireMutationString(request.description, {
      allowEmpty: true,
    });
    const safeMode = requireMutationString(request.mode, { allowEmpty: true });
    validateProfileCreation(safeName, safeMode);
    return enqueueDataCoordinatorMutation(this, () =>
      executeProfileCreate(this, safeName, safeDescription, safeMode),
    );
  }

  /**
   * Clone an existing profile
   */
  /**
   * @param {string} sourceId
   * @param {string} newName
   * @returns {Promise<import('../../types/rpc/index.js').RpcResult<'data:clone-profile'>>}
   */
  async cloneProfile(sourceId, newName) {
    materializeMutationRequest({ sourceId, newName }, ["sourceId", "newName"]);
    const safeId = requireProfileIdentifier(sourceId);
    const safeName = requireMutationString(newName, { allowEmpty: true });
    if (!safeName.trim())
      throw new Error(this.i18n.t("source_profile_and_new_name_required"));
    validateProfileCloneName(safeName);
    return enqueueDataCoordinatorMutation(this, () =>
      executeProfileClone(this, safeId, safeName),
    );
  }

  /**
   * Rename a profile
   */
  /**
   * @param {string} profileId
   * @param {string} newName
   * @param {string} description
   * @returns {Promise<import('../../types/rpc/index.js').RpcResult<'data:rename-profile'>>}
   */
  async renameProfile(profileId, newName, description = "") {
    materializeMutationRequest({ profileId, newName, description }, [
      "profileId",
      "newName",
      "description",
    ]);
    const safeId = requireProfileIdentifier(profileId);
    const safeName = requireMutationString(newName, { allowEmpty: true });
    if (!safeName.trim())
      throw new Error(this.i18n.t("profile_name_is_required"));
    const safeDescription = requireMutationString(description, {
      allowEmpty: true,
    });
    return enqueueDataCoordinatorMutation(this, () =>
      executeProfileRename(this, safeId, safeName, safeDescription),
    );
  }

  /**
   * Delete a profile
   * @param {string} profileId
   * @returns {Promise<import('../../types/rpc/index.js').RpcResult<'data:delete-profile'>>}
   */
  async deleteProfile(profileId) {
    const safeId = requireProfileIdentifier(profileId);
    return enqueueDataCoordinatorMutation(this, () =>
      executeProfileDelete(this, safeId),
    );
  }

  /**
   * @param {string} profileId
   * @param {import('./serviceTypes.js').ProfileOperations | null | undefined} updates
   * @param {{ publishState?: boolean, createIfMissing?: true, precondition?: import('../../types/rpc/data.js').ProfileMutationPrecondition }} [options]
   * @returns {Promise<import('../../types/rpc/index.js').RpcResult<'data:update-profile'>>}
   */
  async updateProfile(profileId, updates, options = {}) {
    if (!profileId) throw new Error("Profile ID is required");
    if (updates == null) throw new Error("Updates are required");
    const safeOptions = materializeMutationRequest(options, [
      "publishState",
      "createIfMissing",
      "precondition",
    ]);
    if (
      safeOptions.publishState !== undefined &&
      typeof safeOptions.publishState !== "boolean"
    ) {
      throw new TypeError("invalid_mutation_request");
    }
    const request = materializeProfileUpdateRequest({
      profileId,
      updates,
      createIfMissing: safeOptions.createIfMissing,
      precondition: safeOptions.precondition,
    });
    return enqueueDataCoordinatorMutation(this, () => {
      assertDataCoordinatorPrecondition(this, request.precondition);
      return this._updateProfile(request.profileId, request.updates, {
        publishState: safeOptions.publishState !== false,
        createIfMissing: request.createIfMissing,
      });
    });
  }

  /** @param {string} profileId
   * @param {import('./serviceTypes.js').ProfileOperations | null | undefined} updates
   * @param {{publishState?: boolean, createIfMissing?: true}} [options]
   * @returns {Promise<import('../../types/rpc/base.js').ProfileUpdateResult>}
   */
  async _updateProfile(
    profileId,
    updates,
    { publishState = true, createIfMissing } = {},
  ) {
    if (!profileId) {
      throw new Error("Profile ID is required");
    }

    if (createIfMissing !== undefined && createIfMissing !== true) {
      throw new TypeError("createIfMissing must be true when supplied");
    }

    if (!updates || updates === null) {
      throw new Error("Updates are required");
    }

    // Detach caller-owned values before they can become part of canonical
    // owner state or be shared with a legacy event payload.
    const detachedUpdates = structuredClone(updates);

    // Extract updateSource for broadcast but don't persist it
    const { updateSource, ...persistableUpdates } = detachedUpdates;

    if (
      !(
        persistableUpdates.add ||
        persistableUpdates.delete ||
        persistableUpdates.modify ||
        persistableUpdates.properties ||
        persistableUpdates.replacement
      )
    ) {
      throw new Error(
        "Explicit operations (add/delete/modify/properties/replacement) required",
      );
    }

    const replacementOnlyCreate = !!(
      persistableUpdates.replacement &&
      !persistableUpdates.add &&
      !persistableUpdates.delete &&
      !persistableUpdates.modify &&
      !persistableUpdates.properties
    );
    if (createIfMissing && !replacementOnlyCreate) {
      throw new Error(
        "createIfMissing requires a replacement-only profile update",
      );
    }

    const currentProfile = hasOwn(this.state.profiles, profileId)
      ? this.state.profiles[profileId]
      : null;
    if (!currentProfile && !createIfMissing) {
      throw new Error(`Profile ${profileId} not found`);
    }
    const operationBase = currentProfile || persistableUpdates.replacement;
    if (!operationBase) {
      throw new Error(`Profile ${profileId} not found`);
    }

    const updatedProfile = applyProfileOperations(operationBase, {
      ...persistableUpdates,
      properties: {
        ...(persistableUpdates.properties || {}),
        lastModified: new Date().toISOString(),
      },
    });
    const operation = this._captureOperationGeneration();

    try {
      // Persist to storage first (without updateSource)
      console.log(
        `[${this.componentName}] Saving profile ${profileId} to storage:`,
        updatedProfile,
      );
      validatePlannedProfileRoot(
        profileId,
        updatedProfile,
        this.storage.getAllData(),
        { version: this.storage.version },
      );
      const persistedProfile = await persist.profile(
        this.storage,
        profileId,
        updatedProfile,
        this.i18n,
      );
      this._assertCurrentOperation(operation);

      // Update in-memory cache regardless of what changed
      this.state.profiles[profileId] = persistedProfile;
      if (
        profileId === this.state.currentProfile &&
        persistedProfile.currentEnvironment
      ) {
        this.state.currentEnvironment = persistedProfile.currentEnvironment;
      }
      this.state.metadata.lastModified = new Date().toISOString();

      if (publishState) {
        this._publishState(
          ...profileStateChange(persistableUpdates, profileId),
        );
      }

      // Determine if any structural collections were touched
      const touchedCollections = !!(
        persistableUpdates.add ||
        persistableUpdates.delete ||
        persistableUpdates.modify
      );

      if (touchedCollections && this._isCurrentOperation(operation)) {
        // Notify other services when aliases / builds changed
        recordDataCoordinatorPublication(
          this,
          this.emit("profile:updated", {
            profileId,
            profile: structuredClone(persistedProfile),
            updates: structuredClone(persistableUpdates),
            updateSource,
            timestamp: Date.now(),
          }),
        );
      }

      return { success: true, profile: structuredClone(persistedProfile) };
    } catch (error) {
      const message = this.i18n.t("failed_to_save_profile", {
        error: errMsg(error),
      });
      throw new Error(message);
    }
  }

  // Set current environment
  /**
   * @param {string} environment
   * @returns {Promise<import('../../types/rpc/data.js').EnvironmentUpdateResult>}
   */
  async setEnvironment(environment) {
    const safeEnvironment = requireMutationString(environment);
    if (!["space", "ground", "alias"].includes(safeEnvironment)) {
      throw new Error("Invalid environment");
    }
    return enqueueDataCoordinatorMutation(this, () =>
      this._setEnvironment(safeEnvironment),
    );
  }

  /** @param {string} environment @returns {Promise<import('../../types/rpc/data.js').EnvironmentUpdateResult>} */
  async _setEnvironment(environment) {
    if (!environment || !["space", "ground", "alias"].includes(environment)) {
      throw new Error("Invalid environment");
    }

    const oldEnvironment = this.state.currentEnvironment;
    const operation = this._captureOperationGeneration();

    // Update profile's current environment if we have one
    if (this.state.currentProfile) {
      const updates = { properties: { currentEnvironment: environment } };
      await this._updateProfile(this.state.currentProfile, updates, {
        publishState: false,
      });
      this._assertCurrentOperation(operation);
    }

    this.state.currentEnvironment = environment;

    this._publishState("environment-changed");

    // Broadcast environment change synchronously after storage operation completes
    if (this._isCurrentOperation(operation)) {
      recordDataCoordinatorPublication(
        this,
        this.emit(
          "environment:changed",
          {
            fromEnvironment: oldEnvironment,
            toEnvironment: environment,
            environment: environment,
            timestamp: Date.now(),
          },
          { synchronous: true },
        ),
      );
    }

    return { success: true, environment };
  }

  // Load default data (called explicitly by user via "Load Default Data" button)
  /** @returns {Promise<import('../../types/rpc/data.js').DefaultDataLoadResult>} */
  async loadDefaultData() {
    try {
      return await enqueueDataCoordinatorMutation(this, () =>
        this._loadDefaultData(),
      );
    } catch (error) {
      return { success: false, error: errMsg(error) };
    }
  }

  /** @returns {Promise<import('../../types/rpc/data.js').DefaultDataLoadResult>} */
  async _loadDefaultData() {
    console.log(`[${this.componentName}] Explicitly loading default data...`);
    const operation = this._captureOperationGeneration();

    try {
      const defaultProfilesData = getDefaultProfiles(
        this.defaultProfileDefinitions,
      );
      this._assertCurrentOperation(operation);

      if (
        !defaultProfilesData ||
        Object.keys(defaultProfilesData).length === 0
      ) {
        console.warn(
          `[${this.componentName}] No built-in default profiles available`,
        );
        return { success: false, error: "No default profiles available" };
      }

      // Create default profiles (this will overwrite existing if any)
      await this._createDefaultProfilesFromData(defaultProfilesData);
      this._assertCurrentOperation(operation);

      console.log(`[${this.componentName}] Successfully loaded default data`);

      return {
        success: true,
        profilesCreated: Object.keys(defaultProfilesData).length,
        currentProfile: this.state.currentProfile,
      };
    } catch (error) {
      if (!this._isCurrentOperation(operation)) {
        return { success: false, error: "operation_cancelled" };
      }
      console.error(
        `[${this.componentName}] Failed to load default data:`,
        error,
      );
      return { success: false, error: errMsg(error) };
    }
  }

  // Try to create profiles from the built-in static catalog.
  async tryCreateDefaultProfiles() {
    return enqueueDataCoordinatorMutation(this, () =>
      this._tryCreateDefaultProfiles(),
    );
  }

  async _tryCreateDefaultProfiles() {
    if (!this.needsDefaultProfiles) {
      return;
    }
    const operation = this._captureOperationGeneration();

    try {
      console.log(
        `[${this.componentName}] Attempting to load built-in default profiles...`,
      );

      const defaultProfilesData = getDefaultProfiles(
        this.defaultProfileDefinitions,
      );
      this._assertCurrentOperation(operation);

      if (defaultProfilesData && Object.keys(defaultProfilesData).length > 0) {
        console.log(
          `[${this.componentName}] Got built-in default profiles, creating...`,
        );
        await this._createDefaultProfilesFromData(defaultProfilesData);
        this._assertCurrentOperation(operation);
        this.needsDefaultProfiles = false;
      } else {
        console.log(
          `[${this.componentName}] No built-in default profiles available`,
        );
      }
    } catch (error) {
      if (!this._isCurrentOperation(operation)) return;
      console.error(
        `[${this.componentName}] Failed to create default profiles:`,
        errMsg(error),
      );
      // For storage failures, we should not retry indefinitely
      // The application can function without default profiles if storage is broken
    }
  }

  // Create default profiles from validated static data.
  /** @param {Record<string, import('./serviceTypes.js').ProfileData> | null | undefined} defaultProfilesData */
  async createDefaultProfilesFromData(defaultProfilesData) {
    const detached =
      defaultProfilesData == null
        ? null
        : materializeProfileMap(defaultProfilesData);
    return enqueueDataCoordinatorMutation(this, () =>
      this._createDefaultProfilesFromData(detached),
    );
  }

  /** @param {Record<string, import('./serviceTypes.js').ProfileData> | null | undefined} defaultProfilesData */
  async _createDefaultProfilesFromData(defaultProfilesData) {
    const operation = this._captureOperationGeneration();
    if (!defaultProfilesData || Object.keys(defaultProfilesData).length === 0) {
      console.warn(
        `[${this.componentName}] No default profiles data available, creating minimal fallback`,
      );
      await this._createFallbackProfiles();
      this._assertCurrentOperation(operation);
      return;
    }

    // Convert the aggregate static-data format to our storage format
    /** @type {Record<string, import('./serviceTypes.js').ProfileData>} */
    const profiles = {};
    for (const [profileId, sourceProfile] of Object.entries(
      defaultProfilesData,
    )) {
      const rawProfile = createDefaultProfileDraft(sourceProfile);
      rawProfile.created = new Date().toISOString();
      rawProfile.lastModified = new Date().toISOString();
      // Normalize to canonical command arrays (keys and aliases)
      normalizeProfile(rawProfile);
      profiles[profileId] = rawProfile;
    }

    const {
      nextProfiles,
      nextCurrentProfile,
      nextCurrentEnvironment,
      profileActivated,
    } = planProfileBatch(this.state, profiles);

    // Persist the complete profile batch and any initial activation as one root
    // write before exposing either through owner state.
    const nextRoot = structuredClone(this.storage.getAllData());
    nextRoot.profiles = structuredClone(nextProfiles);
    nextRoot.currentProfile = nextCurrentProfile;
    try {
      validatePlannedProjectRoot(nextRoot, { version: this.storage.version });
      await persist.all(this.storage, nextRoot, this.i18n);
    } catch (error) {
      const message = this.i18n.t("failed_to_save_profile", {
        error: errMsg(error),
      });
      throw new Error(message);
    }
    this._assertCurrentOperation(operation);

    const durableRoot = this.storage.getAllData();

    this.state.profiles = nextProfiles;
    this.state.currentProfile = nextCurrentProfile;
    this.state.currentEnvironment = nextCurrentEnvironment;
    this.state.metadata = {
      lastModified:
        durableRoot.lastModified ??
        nextRoot.lastModified ??
        new Date().toISOString(),
      version:
        durableRoot.version || nextRoot.version || this.state.metadata.version,
    };

    const publications = [
      publishDataCoordinatorState(this, "default-profiles-created").settled,
    ];
    this._assertCurrentOperation(operation);

    console.log(
      `[${this.componentName}] Created ${Object.keys(profiles).length} built-in default profiles`,
    );

    // CRITICAL: Only emit profile:switched when profile data is actually ready
    if (
      profileActivated &&
      this.state.currentProfile &&
      this.state.profiles[this.state.currentProfile]
    ) {
      console.log(
        `[${this.componentName}] Emitting profile:switched for initial profile activation: ${this.state.currentProfile}`,
      );

      const profilePublication = publishCurrentCoordinatorProfile(this);
      if (profilePublication) publications.push(profilePublication);
      this._assertCurrentOperation(operation);
    } else if (profileActivated) {
      // Profile activation was attempted but profile data is not ready
      console.log(
        `[${this.componentName}] Profile activation attempted but profile data not ready, delaying profile:switched broadcast`,
      );
    }

    recordDataCoordinatorPublication(this, Promise.all(publications));
    this._assertCurrentOperation(operation);
  }

  // Create minimal fallback profiles when built-in definitions are unavailable.
  async createFallbackProfiles() {
    return enqueueDataCoordinatorMutation(this, () =>
      this._createFallbackProfiles(),
    );
  }

  async _createFallbackProfiles() {
    const operation = this._captureOperationGeneration();
    const fallbackProfile = createFallbackProfileDraft();
    fallbackProfile.created = new Date().toISOString();
    fallbackProfile.lastModified = new Date().toISOString();
    normalizeProfile(fallbackProfile);
    const fallbackProfiles = { default: fallbackProfile };
    const {
      nextProfiles,
      nextCurrentProfile,
      nextCurrentEnvironment,
      profileActivated,
    } = planProfileBatch(this.state, fallbackProfiles);

    // The fallback profile and its initial activation form one durable root
    // commit, so neither can survive independently after a failed write.
    const nextRoot = structuredClone(this.storage.getAllData());
    nextRoot.profiles = structuredClone(nextProfiles);
    nextRoot.currentProfile = nextCurrentProfile;
    try {
      validatePlannedProjectRoot(nextRoot, { version: this.storage.version });
      await persist.all(this.storage, nextRoot, this.i18n);
    } catch (error) {
      const message = this.i18n.t("failed_to_save_profile", {
        error: errMsg(error),
      });
      throw new Error(message);
    }
    this._assertCurrentOperation(operation);

    const durableRoot = this.storage.getAllData();
    this.state.profiles = nextProfiles;
    this.state.currentProfile = nextCurrentProfile;
    this.state.currentEnvironment = nextCurrentEnvironment;
    this.state.metadata = {
      lastModified:
        durableRoot.lastModified ??
        nextRoot.lastModified ??
        new Date().toISOString(),
      version:
        durableRoot.version || nextRoot.version || this.state.metadata.version,
    };

    const publications = [
      publishDataCoordinatorState(this, "fallback-profiles-created").settled,
    ];
    this._assertCurrentOperation(operation);

    console.log(
      `[${this.componentName}] Created ${Object.keys(fallbackProfiles).length} fallback profiles`,
    );

    // If we activated a profile for the first time, emit profile:switched event
    if (profileActivated && this.state.currentProfile) {
      console.log(
        `[${this.componentName}] Emitting profile:switched for initial fallback profile activation: ${this.state.currentProfile}`,
      );

      const profilePublication = publishCurrentCoordinatorProfile(this);
      if (profilePublication) publications.push(profilePublication);
      this._assertCurrentOperation(operation);
    }

    recordDataCoordinatorPublication(this, Promise.all(publications));
    this._assertCurrentOperation(operation);
  }

  // Normalize all profiles to use canonical string commands
  /**
   * @param {Record<string, import('./serviceTypes.js').ProfileData>} [profiles]
   * @param {{ rootData?: any }} [options]
   * @returns {Promise<number>}
   */
  async normalizeAllProfiles(profiles, options = {}) {
    const safeOptions = materializeMutationRequest(options, ["rootData"]);
    if (safeOptions.rootData != null) {
      // Validate the supplied envelope before reading any owner/storage value.
      // The actual storage version and merged candidate are checked in-queue.
      validatePlannedProjectRoot(safeOptions.rootData, { version: "1.0.0" });
    }
    const detached =
      profiles === undefined ? undefined : materializeProfileMap(profiles);
    return enqueueDataCoordinatorMutation(this, async () => {
      const candidate =
        /** @type {Record<string, import('./serviceTypes.js').ProfileData>} */ (
          detached ?? structuredClone(this.state.profiles)
        );
      const count = await this._normalizeAllProfiles(candidate, safeOptions);
      if (profiles === undefined) this.state.profiles = candidate;
      return count;
    });
  }

  /** @param {Record<string, import('./serviceTypes.js').ProfileData>} profiles
   * @param {{rootData?: any}} [options]
   * @returns {Promise<number>}
   */
  async _normalizeAllProfiles(profiles, { rootData } = {}) {
    return normalizeCoordinatorProfiles(this, profiles, { rootData });
  }

  // Reload state from storage (used after data import/restore)
  /** @returns {Promise<import('../../types/rpc/index.js').RpcResult<'data:reload-state'>>} */
  async reloadState() {
    try {
      await this._initialStateCommitted;
      return await enqueueDataCoordinatorMutation(this, () =>
        this._reloadState(),
      );
    } catch (error) {
      return { success: false, error: errMsg(error) };
    }
  }

  /** @returns {Promise<import('../../types/rpc/index.js').RpcResult<'data:reload-state'>>} */
  async _reloadState() {
    console.log(`[${this.componentName}] Reloading state from storage...`);
    if (!this.initialized || this.destroyed) {
      return { success: false, error: "operation_cancelled" };
    }
    const operation = this._captureOperationGeneration();

    try {
      this._assertCurrentOperation(operation);

      // Get fresh data from storage
      const allData = this.storage.getAllData();

      const nextProfiles = structuredClone(allData.profiles || {});
      const nextCurrentProfile = allData.currentProfile || null;

      // Normalize any newly imported profiles
      const profilesNormalized = await this._normalizeAllProfiles(
        nextProfiles,
        {
          rootData: allData,
        },
      );
      this._assertCurrentOperation(operation);
      const durableRoot =
        profilesNormalized > 0 ? this.storage.getAllData() : allData;

      // Set current environment from current profile if available
      let nextCurrentEnvironment = "space";
      if (
        nextCurrentProfile &&
        Object.prototype.hasOwnProperty.call(nextProfiles, nextCurrentProfile)
      ) {
        const currentProfile = nextProfiles[nextCurrentProfile];
        nextCurrentEnvironment = currentProfile.currentEnvironment || "space";
      }

      // Commit the fully normalized draft as one owner-state transition.
      this.state.profiles = nextProfiles;
      this.state.currentProfile = nextCurrentProfile;
      this.state.currentEnvironment = nextCurrentEnvironment;
      this.state.metadata = {
        lastModified: durableRoot.lastModified,
        version: durableRoot.version || "1.0.0",
      };

      const publicationsSettled = publishReloadedCoordinatorState(
        this,
        operation,
      );

      const result = {
        success: /** @type {const} */ (true),
        profiles: Object.keys(this.state.profiles).length,
        currentProfile: this.state.currentProfile,
        environment: this.state.currentEnvironment,
      };

      // Invoke every compatibility publication in its historical order before
      // awaiting them together. This preserves event ordering without making
      // one topic's listener latency delay invocation of the next topic.
      recordDataCoordinatorPublication(this, publicationsSettled);
      this._assertCurrentOperation(operation);

      return result;
    } catch (error) {
      if (!this._isCurrentOperation(operation)) {
        return { success: false, error: "operation_cancelled" };
      }
      console.error(`[${this.componentName}] Failed to reload state:`, error);
      return { success: false, error: errMsg(error) };
    }
  }

  onDestroy() {
    this._lifecycleGeneration += 1;
    this._stateReady = false;
    this._currentStateSnapshot = null;
    for (const detach of this._responseDetachFunctions) detach();
    this._responseDetachFunctions = [];
  }
}
