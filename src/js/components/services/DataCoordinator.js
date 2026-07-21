import ComponentBase from "../ComponentBase.js";
import { normalizeProfile } from "../../lib/profileNormalizer.js";
import persist from "./storageWrites.js";
import {
  createDataStateSnapshot,
  createVirtualProfile,
  nextDataStateAuthorityEpoch,
} from "./dataState.js";
import builtInDefaultProfiles, {
  getDefaultProfiles,
} from "../../data/defaultProfiles.js";
import { registerDataCoordinatorResponders } from "./dataCoordinatorResponders.js";
import { handleLoadDefaultDataUi } from "./dataCoordinatorDefaultUi.js";
import { loadInitialCoordinatorState } from "./dataCoordinatorInitialState.js";
import {
  createClonedProfileDraft,
  createDefaultProfileDraft,
  createEmptyProfileDraft,
  createFallbackProfileDraft,
  generateProfileId,
  planProfileBatch,
} from "./profileConstruction.js";
import { planProfileNormalizations } from "./profileNormalizationPlan.js";
import { applyProfileOperations } from "./profileOperations.js";
import {
  createDataStateChangedPayload,
  profileStateChange,
} from "./dataStateChange.js";

/** @param {unknown} error */
const errMsg = (error) =>
  error instanceof Error ? error.message : String(error);

/** @param {object} value @param {PropertyKey} key */
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

/**
 * DataCoordinator - Single source of truth for all data operations
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
      settings: {},
      metadata: { lastModified: null, version: "1.0.0" },
    };
    this._stateAuthorityEpoch = nextDataStateAuthorityEpoch();
    this._lifecycleGeneration = 0;
    this._stateReady = false;
    this._stateRevision = 0;
    /** @type {import('../../types/events/component-state.js').DataCoordinatorStateSnapshot | null} */
    this._currentStateSnapshot = null;
    this.needsDefaultProfiles = false;
    /** @type {Array<() => void>} */
    this._responseDetachFunctions = [];

    // Late-join support is handled by ComponentBase automatically

    this.setupRequestHandlers();
  }

  async onInit() {
    console.log(`[${this.componentName}] Initializing...`);
    const operation = this._captureOperationGeneration();

    this.setupRequestHandlers();

    // Set up event listeners
    this.setupEventListeners();

    // Load initial state from storage
    await this.loadInitialState();
    if (!this._isCurrentOperation(operation)) return;

    console.log(`[${this.componentName}] Initialization complete`);
  }

  setupEventListeners() {
    // Listen for storage reset events
    this.addEventListener("storage:data-reset", ({ data }) => {
      console.log("[DataCoordinator] Handling storage reset, reloading state");

      // Update our state to empty/reset state
      this.state.currentProfile = null;
      this.state.profiles = {};
      this.state.settings = structuredClone(data?.settings || {});
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
    this.addEventListener("data:load-default", () => {
      this.handleLoadDefaultData();
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
    return !this.destroyed && generation === this._lifecycleGeneration;
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

  /**
   * Load initial state from storage
   */
  async loadInitialState() {
    await loadInitialCoordinatorState(this);
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
    if (!this._stateReady || this.destroyed) return null;

    this._stateRevision += 1;
    this._currentStateSnapshot = null;
    const state = this.getCurrentState();
    this.emit(
      "data:state-changed",
      createDataStateChangedPayload(reason, state, details),
      { synchronous: true },
    );
    return state;
  }

  /**
   * Switch to a different profile
   * @param {string} profileId
   * @returns {Promise<import('../../types/rpc/index.js').RpcResult<'data:switch-profile'>>}
   */
  async switchProfile(profileId) {
    if (profileId === this.state.currentProfile) {
      // Build current profile data manually since getCurrentProfile() was removed
      let currentProfile = null;
      if (
        this.state.currentProfile &&
        hasOwn(this.state.profiles, this.state.currentProfile)
      ) {
        const profile = this.state.profiles[this.state.currentProfile];
        currentProfile = createVirtualProfile(
          this.state.currentProfile,
          profile,
          this.state.currentEnvironment,
        );
      }

      return {
        success: true,
        switched: false,
        message: this.i18n.t("already_on_profile"),
        profile: currentProfile,
      };
    }

    const profile = hasOwn(this.state.profiles, profileId)
      ? this.state.profiles[profileId]
      : null;
    if (!profile) {
      throw new Error(`Profile ${profileId} not found`);
    }

    const oldProfileId = this.state.currentProfile;
    const operation = this._captureOperationGeneration();

    // Persist current profile change
    await persist.currentProfile(this.storage, profileId, this.i18n);
    this._assertCurrentOperation(operation);

    this.state.currentProfile = profileId;
    this.state.currentEnvironment = profile.currentEnvironment || "space";

    // Update metadata
    this.state.metadata.lastModified = new Date().toISOString();

    // Build virtual profile for response
    const virtualProfile = createVirtualProfile(
      profileId,
      profile,
      this.state.currentEnvironment,
    );

    this._publishState("profile-switched");

    // Broadcast profile switch synchronously
    this.emit(
      "profile:switched",
      {
        fromProfile: oldProfileId,
        toProfile: profileId,
        profileId: profileId,
        profile: structuredClone(virtualProfile),
        environment: this.state.currentEnvironment,
        timestamp: Date.now(),
      },
      { synchronous: true },
    );

    return {
      success: true,
      switched: true,
      profile: virtualProfile,
      message: this.i18n.t("switched_to_profile", {
        name: profile.name,
        environment: this.state.currentEnvironment,
      }),
    };
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
    if (!name || !name.trim()) {
      const message = this.i18n.t("profile_name_is_required");
      throw new Error(message);
    }

    const profileId = generateProfileId(name);

    // Check if profile already exists
    if (hasOwn(this.state.profiles, profileId)) {
      const message = this.i18n.t("profile_already_exists");
      throw new Error(message);
    }

    const profile = createEmptyProfileDraft(name, description, mode, {
      created: new Date().toISOString(),
      lastModified: new Date().toISOString(),
    });
    const operation = this._captureOperationGeneration();

    try {
      // Save to storage
      const persistedProfile = await persist.profile(
        this.storage,
        profileId,
        profile,
        this.i18n,
      );
      this._assertCurrentOperation(operation);

      // Update cache
      this.state.profiles[profileId] = persistedProfile;
      this.state.metadata.lastModified = new Date().toISOString();

      this._publishState("profile-created");

      return {
        success: true,
        profileId,
        profile: structuredClone(persistedProfile),
        message: this.i18n.t("profile_created", { name }),
      };
    } catch (error) {
      const message = this.i18n.t("failed_to_create_profile", {
        error: errMsg(error),
      });
      throw new Error(message);
    }
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
    if (!sourceId || !newName || !newName.trim()) {
      const message = this.i18n.t("source_profile_and_new_name_required");
      throw new Error(message);
    }

    const sourceProfile = hasOwn(this.state.profiles, sourceId)
      ? this.state.profiles[sourceId]
      : null;
    if (!sourceProfile) {
      const message = this.i18n.t("source_profile_not_found");
      throw new Error(message);
    }

    const profileId = generateProfileId(newName);

    // Check if profile already exists
    if (hasOwn(this.state.profiles, profileId)) {
      const message = this.i18n.t("profile_already_exists");
      throw new Error(message);
    }

    const clonedProfile = createClonedProfileDraft(sourceProfile, newName, {
      created: new Date().toISOString(),
      lastModified: new Date().toISOString(),
    });
    const operation = this._captureOperationGeneration();

    try {
      // Save to storage
      const persistedProfile = await persist.profile(
        this.storage,
        profileId,
        clonedProfile,
        this.i18n,
      );
      this._assertCurrentOperation(operation);

      // Update cache
      this.state.profiles[profileId] = persistedProfile;
      this.state.metadata.lastModified = new Date().toISOString();

      this._publishState("profile-cloned");

      return {
        success: true,
        profileId,
        profile: structuredClone(persistedProfile),
        message: this.i18n.t("profile_created_from", {
          newName,
          sourceProfile: sourceProfile.name,
        }),
      };
    } catch (error) {
      const message = this.i18n.t("failed_to_clone_profile", {
        error: errMsg(error),
      });
      throw new Error(message);
    }
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
    if (!profileId || !newName || !newName.trim()) {
      const message = this.i18n.t("profile_name_is_required");
      throw new Error(message);
    }

    const profile = hasOwn(this.state.profiles, profileId)
      ? this.state.profiles[profileId]
      : null;
    if (!profile) {
      const message = this.i18n.t("profile_not_found");
      throw new Error(message);
    }

    const updatedProfile = {
      ...profile,
      name: newName.trim(),
      description: description.trim(),
      lastModified: new Date().toISOString(),
    };
    const operation = this._captureOperationGeneration();

    try {
      // Save to storage
      const persistedProfile = await persist.profile(
        this.storage,
        profileId,
        updatedProfile,
        this.i18n,
      );
      this._assertCurrentOperation(operation);

      // Update cache
      this.state.profiles[profileId] = persistedProfile;
      this.state.metadata.lastModified = new Date().toISOString();

      this._publishState("profile-renamed");

      // Broadcast profile update
      this.emit("profile:updated", {
        profileId,
        profile: structuredClone(persistedProfile),
        changes: { name: newName, description },
        timestamp: Date.now(),
      });

      return {
        success: true,
        profile: structuredClone(persistedProfile),
        message: `Profile renamed to "${newName}"`,
      };
    } catch (error) {
      const message = this.i18n.t("failed_to_rename_profile", {
        error: errMsg(error),
      });
      throw new Error(message);
    }
  }

  /**
   * Delete a profile
   * @param {string} profileId
   * @returns {Promise<import('../../types/rpc/index.js').RpcResult<'data:delete-profile'>>}
   */
  async deleteProfile(profileId) {
    if (!profileId) {
      const message = this.i18n.t("profile_id_required");
      throw new Error(message);
    }

    const profile = hasOwn(this.state.profiles, profileId)
      ? this.state.profiles[profileId]
      : null;
    if (!profile) {
      const message = this.i18n.t("profile_not_found");
      throw new Error(message);
    }

    const profileCount = Object.keys(this.state.profiles).length;
    if (profileCount <= 1) {
      const message = this.i18n.t("cannot_delete_the_last_profile");
      throw new Error(message);
    }

    try {
      const nextProfiles = structuredClone(this.state.profiles);
      delete nextProfiles[profileId];

      let nextCurrentProfile = this.state.currentProfile;
      let nextCurrentEnvironment = this.state.currentEnvironment;
      let switchedProfile = null;

      // If this was the current profile, switch to another
      if (this.state.currentProfile === profileId) {
        const remaining = Object.keys(nextProfiles);
        nextCurrentProfile = remaining[0];

        const newProfile = nextProfiles[nextCurrentProfile];
        nextCurrentEnvironment = newProfile.currentEnvironment || "space";

        switchedProfile = createVirtualProfile(
          nextCurrentProfile,
          newProfile,
          nextCurrentEnvironment,
        );
      }

      // Deletion and replacement-profile selection are one logical durable
      // commit. A single root write prevents either half from becoming visible
      // on its own.
      const nextRoot = structuredClone(this.storage.getAllData());
      nextRoot.profiles = structuredClone(nextProfiles);
      nextRoot.currentProfile = nextCurrentProfile;
      const operation = this._captureOperationGeneration();
      await persist.all(this.storage, nextRoot, this.i18n);
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
          durableRoot.version ||
          nextRoot.version ||
          this.state.metadata.version,
      };

      this._publishState("profile-deleted");

      if (switchedProfile && nextCurrentProfile) {
        // Broadcast profile switch synchronously
        this.emit(
          "profile:switched",
          {
            fromProfile: profileId,
            toProfile: nextCurrentProfile,
            profileId: nextCurrentProfile,
            profile: structuredClone(switchedProfile),
            environment: nextCurrentEnvironment,
            timestamp: Date.now(),
          },
          { synchronous: true },
        );
      }

      return {
        success: true,
        deletedProfile: structuredClone(profile),
        switchedProfile: structuredClone(switchedProfile),
        message: this.i18n.t("profile_deleted", { profileName: profile.name }),
      };
    } catch (error) {
      const message = this.i18n.t("failed_to_delete_profile", {
        error: errMsg(error),
      });
      throw new Error(message);
    }
  }

  /**
   * @param {string} profileId
   * @param {import('./serviceTypes.js').ProfileOperations | null | undefined} updates
   * @param {{ publishState?: boolean, createIfMissing?: true }} [options]
   * @returns {Promise<import('../../types/rpc/index.js').RpcResult<'data:update-profile'>>}
   */
  async updateProfile(
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

      if (touchedCollections) {
        // Notify other services when aliases / builds changed
        this.emit("profile:updated", {
          profileId,
          profile: structuredClone(persistedProfile),
          updates: structuredClone(persistableUpdates),
          updateSource,
          timestamp: Date.now(),
        });
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
    if (!environment || !["space", "ground", "alias"].includes(environment)) {
      throw new Error("Invalid environment");
    }

    const oldEnvironment = this.state.currentEnvironment;
    const operation = this._captureOperationGeneration();

    // Update profile's current environment if we have one
    if (this.state.currentProfile) {
      const updates = { properties: { currentEnvironment: environment } };
      await this.updateProfile(this.state.currentProfile, updates, {
        publishState: false,
      });
      this._assertCurrentOperation(operation);
    }

    this.state.currentEnvironment = environment;

    this._publishState("environment-changed");

    // Broadcast environment change synchronously after storage operation completes
    this.emit(
      "environment:changed",
      {
        fromEnvironment: oldEnvironment,
        toEnvironment: environment,
        environment: environment,
        timestamp: Date.now(),
      },
      { synchronous: true },
    );

    return { success: true, environment };
  }

  // Update application settings
  /**
   * @param {Record<string, unknown> | null | undefined} settings
   * @returns {Promise<import('../../types/rpc/data.js').SettingsUpdateResult>}
   */
  async updateSettings(settings) {
    if (!settings) {
      throw new Error("Settings are required");
    }

    const detachedSettings = structuredClone(settings);
    const nextSettings = structuredClone({
      ...this.state.settings,
      ...detachedSettings,
    });
    const operation = this._captureOperationGeneration();

    // Save to storage
    await persist.settings(this.storage, nextSettings, this.i18n);
    this._assertCurrentOperation(operation);

    this.state.settings = nextSettings;

    this.state.metadata.lastModified = new Date().toISOString();

    this._publishState("settings-updated");

    return { success: true, settings: structuredClone(this.state.settings) };
  }

  // Load default data (called explicitly by user via "Load Default Data" button)
  /** @returns {Promise<import('../../types/rpc/data.js').DefaultDataLoadResult>} */
  async loadDefaultData() {
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
      await this.createDefaultProfilesFromData(defaultProfilesData);
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
        await this.createDefaultProfilesFromData(defaultProfilesData);
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
    const operation = this._captureOperationGeneration();
    if (!defaultProfilesData || Object.keys(defaultProfilesData).length === 0) {
      console.warn(
        `[${this.componentName}] No default profiles data available, creating minimal fallback`,
      );
      await this.createFallbackProfiles();
      this._assertCurrentOperation(operation);
      return;
    }

    // Convert STO_DATA format to our storage format
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

    this._publishState("default-profiles-created");

    console.log(
      `[${this.componentName}] Created ${Object.keys(profiles).length} built-in default profiles`,
    );

    // CRITICAL: Only emit profile:switched when profile data is actually ready
    if (
      profileActivated &&
      this.state.currentProfile &&
      this.state.profiles[this.state.currentProfile]
    ) {
      const activatedProfile = this.state.profiles[this.state.currentProfile];
      const virtualProfile = createVirtualProfile(
        this.state.currentProfile,
        activatedProfile,
        this.state.currentEnvironment,
      );

      console.log(
        `[${this.componentName}] Emitting profile:switched for initial profile activation: ${this.state.currentProfile}`,
      );

      this.emit(
        "profile:switched",
        {
          fromProfile: null,
          toProfile: this.state.currentProfile,
          profileId: this.state.currentProfile,
          profile: virtualProfile,
          environment: this.state.currentEnvironment,
          timestamp: Date.now(),
        },
        { synchronous: true },
      );
    } else if (profileActivated) {
      // Profile activation was attempted but profile data is not ready
      console.log(
        `[${this.componentName}] Profile activation attempted but profile data not ready, delaying profile:switched broadcast`,
      );
    }
  }

  // Create minimal fallback profiles when built-in definitions are unavailable.
  async createFallbackProfiles() {
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

    this._publishState("fallback-profiles-created");

    console.log(
      `[${this.componentName}] Created ${Object.keys(fallbackProfiles).length} fallback profiles`,
    );

    // If we activated a profile for the first time, emit profile:switched event
    if (profileActivated && this.state.currentProfile) {
      const activatedProfile = this.state.profiles[this.state.currentProfile];
      const virtualProfile = createVirtualProfile(
        this.state.currentProfile,
        activatedProfile,
        this.state.currentEnvironment,
      );

      console.log(
        `[${this.componentName}] Emitting profile:switched for initial fallback profile activation: ${this.state.currentProfile}`,
      );

      this.emit(
        "profile:switched",
        {
          fromProfile: null,
          toProfile: this.state.currentProfile,
          profileId: this.state.currentProfile,
          profile: virtualProfile,
          environment: this.state.currentEnvironment,
          timestamp: Date.now(),
        },
        { synchronous: true },
      );
    }
  }

  // Normalize all profiles to use canonical string commands
  /**
   * @param {Record<string, import('./serviceTypes.js').ProfileData>} [profiles]
   * @param {{ rootData?: any }} [options]
   * @returns {Promise<number>}
   */
  async normalizeAllProfiles(
    profiles = this.state.profiles,
    { rootData } = {},
  ) {
    const operation = this._captureOperationGeneration();
    const label = `[${this.componentName}]`;
    const { profilesNormalized, normalizedProfiles } =
      planProfileNormalizations(profiles, {
        normalizeProfile,
        onProfileStart: (profileId) =>
          console.log(`${label} Migrating profile: ${profileId}`),
        onProfileComplete: (report) =>
          console.log(
            `${label} Profile ${report.profileId} migrated from ${report.originalVersion} to ${report.normalizedVersion}`,
          ),
      });
    if (profilesNormalized === 0) return 0;

    // Persist every normalization as one root replacement. Only adopt the
    // normalized drafts after that durable write succeeds.
    const nextRoot = structuredClone(rootData ?? this.storage.getAllData());
    nextRoot.profiles = structuredClone({
      ...profiles,
      ...normalizedProfiles,
    });

    try {
      await persist.all(this.storage, nextRoot, this.i18n, {
        // StorageService or the import path already captured the exact source
        // root. Keep that evidence through the follow-up normalization write.
        preserveBackup: true,
      });
    } catch (error) {
      const message = this.i18n.t("failed_to_save_profile", {
        error: errMsg(error),
      });
      throw new Error(message);
    }
    this._assertCurrentOperation(operation);

    Object.assign(profiles, normalizedProfiles);
    console.log(
      `[${this.componentName}] Migrated ${profilesNormalized} profiles`,
    );
    return profilesNormalized;
  }

  // Reload state from storage (used after data import/restore)
  /** @returns {Promise<import('../../types/rpc/index.js').RpcResult<'data:reload-state'>>} */
  async reloadState() {
    console.log(`[${this.componentName}] Reloading state from storage...`);
    const operation = this._captureOperationGeneration();

    try {
      // Get fresh data from storage
      const allData = this.storage.getAllData();

      const nextProfiles = structuredClone(allData.profiles || {});
      const nextCurrentProfile = allData.currentProfile || null;
      const nextSettings = structuredClone(allData.settings || {});

      // Normalize any newly imported profiles
      const profilesNormalized = await this.normalizeAllProfiles(nextProfiles, {
        rootData: allData,
      });
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
      this.state.settings = nextSettings;
      this.state.currentEnvironment = nextCurrentEnvironment;
      this.state.metadata = {
        lastModified: durableRoot.lastModified,
        version: durableRoot.version || "1.0.0",
      };

      this._publishState("state-reloaded");

      console.log(
        `[${this.componentName}] State reloaded. Current profile: ${this.state.currentProfile}, Environment: ${this.state.currentEnvironment}`,
      );

      // Refresh the retained compatibility projections after publishing the
      // complete authoritative state snapshot.

      // 1. If we have a current profile, emit profile:switched to refresh profile-specific UI
      if (
        this.state.currentProfile &&
        this.state.profiles[this.state.currentProfile]
      ) {
        const currentProfile = this.state.profiles[this.state.currentProfile];
        const virtualProfile = createVirtualProfile(
          this.state.currentProfile,
          currentProfile,
          this.state.currentEnvironment,
        );

        this.emit(
          "profile:switched",
          {
            fromProfile: null, // We don't know the previous profile after reload
            toProfile: this.state.currentProfile,
            profileId: this.state.currentProfile,
            profile: structuredClone(virtualProfile),
            environment: this.state.currentEnvironment,
            timestamp: Date.now(),
          },
          { synchronous: true },
        );
      }

      // 2. Emit environment change synchronously to refresh environment-specific UI
      this.emit(
        "environment:changed",
        {
          fromEnvironment: null, // We don't know the previous environment after reload
          toEnvironment: this.state.currentEnvironment,
          environment: this.state.currentEnvironment,
          timestamp: Date.now(),
        },
        { synchronous: true },
      );

      return {
        success: true,
        profiles: Object.keys(this.state.profiles).length,
        currentProfile: this.state.currentProfile,
        environment: this.state.currentEnvironment,
      };
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
    for (const detach of this._responseDetachFunctions) detach();
    this._responseDetachFunctions = [];
  }
}
