import ComponentBase from "../ComponentBase.js";

export default class BindsetService extends ComponentBase {
  /** @param {{ eventBus?: import('./serviceTypes.js').EventBus }} [options] */
  constructor({ eventBus } = {}) {
    super(eventBus);
    this.componentName = "BindsetService";
    /** @type {Array<() => void>} */
    this._responseDetachFunctions = [];
    this._bindsetDataAuthorityEpoch = 0;

    // ComponentBase handles bindset names caching via this.cache.bindsetNames
  }

  setupRequestHandlers() {
    if (!this.eventBus || this._responseDetachFunctions.length > 0) return;

    this._responseDetachFunctions.push(
      this.respond(
        "bindset:create",
        ({ name } = /** @type {{ name?: string }} */ ({})) =>
          this.createBindset(name),
      ),
      this.respond(
        "bindset:clone",
        (
          {
            sourceBindset,
            targetBindset,
          } = /** @type {{ sourceBindset?: string, targetBindset?: string }} */ ({}),
        ) => this.cloneBindset(sourceBindset, targetBindset),
      ),
      this.respond(
        "bindset:rename",
        (
          {
            oldName,
            newName,
          } = /** @type {{ oldName?: string, newName?: string }} */ ({}),
        ) => this.renameBindset(oldName, newName),
      ),
      this.respond(
        "bindset:delete",
        ({ name } = /** @type {{ name?: string }} */ ({})) =>
          this.deleteBindset(name),
      ),
      this.respond(
        "bindset:delete-with-keys",
        ({ name } = /** @type {{ name?: string }} */ ({})) =>
          this.deleteBindset(name, true),
      ),
      this.respond(
        "bindset:get-key-commands",
        (
          {
            bindset,
            environment,
            key,
          } = /** @type {{ bindset?: string, environment?: string, key?: string }} */ ({}),
        ) => this.getKeyCommands(bindset, environment, key),
      ),
    );
  }

  /** @returns {import('./serviceTypes.js').ServiceCache} */
  get serviceCache() {
    this.initializeCache();
    if (!this.cache)
      throw new Error("BindsetService cache initialization failed");
    return /** @type {import('./serviceTypes.js').ServiceCache} */ (this.cache);
  }

  // Late-join state sharing
  /** @returns {import('../../types/events/component-state.js').ComponentState<'BindsetService'>} */
  getCurrentState() {
    return {
      bindsets: [...this.serviceCache.bindsetNames],
    };
  }

  onInit() {
    console.log("[BindsetService] Initializing...");
    this.setupRequestHandlers();
    this.setupEventListeners();
    console.log("[BindsetService] Initialized successfully");
  }

  onDestroy() {
    for (const detach of this._responseDetachFunctions) detach();
    this._responseDetachFunctions = [];
    this._listenersSetup = false;
    this._bindsetDataAuthorityEpoch = 0;
  }

  // Handle initial state from DataCoordinator
  /** @param {import('../../types/events/component-state.js').ComponentStateReply} reply */
  handleInitialState(reply) {
    const { sender, state } = reply;
    console.log("[BindsetService] handleInitialState called:", sender, !!state);

    if (sender === "DataCoordinator" && state?.currentProfileData) {
      console.log(
        "[BindsetService] Received initial profile data from DataCoordinator",
      );
      this.adoptCoordinatorBindsetState(state);
    } else if (sender === "DataCoordinator") {
      this.adoptCoordinatorBindsetState(state);
    }
  }

  // Broadcast / Cache integration
  setupEventListeners() {
    // Prevent double registration in case constructor called twice in tests
    if (this._listenersSetup) return;
    this._listenersSetup = true;

    // ComponentBase automatically handles profile and environment caching
    // We only need to listen for these events to update our specific business logic
    this.addEventListener("profile:updated", ({ profileId, profile }) => {
      if (profileId === this.serviceCache.currentProfile) {
        this.updateCacheFromProfile(profile);
      }
    });

    // When profile switch happens
    this.addEventListener("profile:switched", ({ profile }) => {
      // ComponentBase handles currentProfile and currentEnvironment caching
      this.updateCacheFromProfile(profile);
    });

    this.addEventListener("data:state-changed", ({ state }) => {
      this.adoptCoordinatorBindsetState(state);
    });
  }

  /**
   * Recompute derived bindset state only from the exact DataCoordinator snapshot
   * ComponentBase accepted. This admits the initial ready authority and a later
   * replacement authority while rejecting stale predecessor deliveries.
   *
   * @param {import('../../types/events/component-state.js').DataCoordinatorStateSnapshot} delivered
   */
  adoptCoordinatorBindsetState(delivered) {
    const accepted = this.cache.dataState;
    if (
      !accepted?.ready ||
      accepted.authorityEpoch !== delivered.authorityEpoch ||
      accepted.revision !== delivered.revision ||
      accepted.authorityEpoch === this._bindsetDataAuthorityEpoch
    ) {
      return;
    }

    this._bindsetDataAuthorityEpoch = accepted.authorityEpoch;
    this.updateCacheFromProfile(accepted.currentProfileData);
  }

  /** @param {import('./serviceTypes.js').ProfileData | null | undefined} profile */
  updateCacheFromProfile(profile) {
    console.log(
      "[BindsetService] updateCacheFromProfile: profile =",
      profile,
      "id =",
      profile && profile.id,
    );
    if (!profile) {
      this.serviceCache.bindsetNames = ["Primary Bindset"];
      this.emit("bindsets:changed", {
        names: [...this.serviceCache.bindsetNames],
      });
      return;
    }
    // ComponentBase handles profile caching automatically
    this.serviceCache.bindsetNames = [
      "Primary Bindset",
      ...Object.keys(profile.bindsets || {}),
    ];
    this.emit("bindsets:changed", {
      names: [...this.serviceCache.bindsetNames],
    });
  }

  // Return cached profile when available; fallback to request on first call
  async getProfile() {
    if (this.serviceCache.profile) return this.serviceCache.profile;
    // Fallback: ask DataCoordinator for current state (includes profile data)
    const state =
      /** @type {{ currentProfileData?: import('./serviceTypes.js').ProfileData } | null} */ (
        await this.request("data:get-current-state").catch(() => null)
      );
    const prof = state?.currentProfileData || null;
    if (prof) {
      // ComponentBase handles currentProfile caching automatically
      this.updateCacheFromProfile(prof);
    }
    return prof;
  }

  /**
   * @param {string | undefined} name
   * @returns {Promise<import('../../types/rpc/bindsets.js').BindsetUpdateResult<'invalid_name' | 'no_profile' | 'name_exists'>>}
   */
  async createBindset(name) {
    if (!name || name === "Primary Bindset")
      return { success: false, error: "invalid_name" };
    const profile = await this.getProfile();
    const profileId = profile?.id || this.serviceCache.currentProfile;
    console.log(
      "[BindsetService] createBindset: profile =",
      profile,
      "id =",
      profile && profile.id,
    );
    if (!profile || !profileId) {
      console.error(
        "[BindsetService] createBindset: no_profile error, profile:",
        profile,
      );
      return { success: false, error: "no_profile" };
    }
    if (profile.bindsets && profile.bindsets[name]) {
      return { success: false, error: "name_exists" };
    }

    const updates = {
      add: {
        bindsets: {
          [name]: {
            space: { keys: {} },
            ground: { keys: {} },
          },
        },
      },
    };
    const res = await this.request("data:update-profile", {
      profileId,
      updates,
    });
    if (res?.success) {
      // Update cached names and broadcast (cache already updated by updateCacheFromProfile)
      this.emit("bindsets:changed", {
        names: [...this.serviceCache.bindsetNames],
      });
    }
    return res;
  }

  /**
   * @param {string | undefined} sourceBindset
   * @param {string | undefined} targetBindset
   * @returns {Promise<import('../../types/rpc/bindsets.js').BindsetUpdateResult<'invalid_name' | 'no_profile' | 'name_exists' | 'source_not_found'>>}
   */
  async cloneBindset(sourceBindset, targetBindset) {
    if (!sourceBindset || !targetBindset)
      return { success: false, error: "invalid_name" };
    if (targetBindset === "Primary Bindset")
      return { success: false, error: "invalid_name" };

    const profile = await this.getProfile();
    const profileId = profile?.id || this.serviceCache.currentProfile;
    console.log(
      "[BindsetService] cloneBindset: profile =",
      profile,
      "id =",
      profile && profile.id,
    );
    if (!profile || !profileId) {
      console.error(
        "[BindsetService] cloneBindset: no_profile error, profile:",
        profile,
      );
      return { success: false, error: "no_profile" };
    }

    if (profile.bindsets && profile.bindsets[targetBindset]) {
      return { success: false, error: "name_exists" };
    }

    // Get source bindset data
    let sourceData;
    if (sourceBindset === "Primary Bindset") {
      // Clone from primary build data
      sourceData = {
        space: { keys: profile.builds?.space?.keys || {} },
        ground: { keys: profile.builds?.ground?.keys || {} },
      };
    } else {
      // Clone from existing bindset
      sourceData = profile.bindsets?.[sourceBindset];
      if (!sourceData) {
        return { success: false, error: "source_not_found" };
      }
    }

    // Create new bindset with copied data
    const updates = {
      add: {
        bindsets: {
          [targetBindset]: {
            space: { keys: { ...(sourceData.space?.keys || {}) } },
            ground: { keys: { ...(sourceData.ground?.keys || {}) } },
          },
        },
      },
    };

    const res = await this.request("data:update-profile", {
      profileId,
      updates,
    });
    if (res?.success) {
      // Update cached names and broadcast (cache already updated by updateCacheFromProfile)
      this.emit("bindsets:changed", {
        names: [...this.serviceCache.bindsetNames],
      });
    }
    return res;
  }

  /**
   * @param {string | undefined} oldName
   * @param {string | undefined} newName
   * @returns {Promise<import('../../types/rpc/bindsets.js').BindsetUpdateResult<'invalid_name' | 'no_profile' | 'not_found' | 'name_exists'>>}
   */
  async renameBindset(oldName, newName) {
    if (
      !oldName ||
      !newName ||
      oldName === "Primary Bindset" ||
      newName === "Primary Bindset"
    ) {
      return { success: false, error: "invalid_name" };
    }
    const profile = await this.getProfile();
    if (!profile || !profile.bindsets || !profile.bindsets[oldName]) {
      return { success: false, error: "not_found" };
    }
    if (profile.bindsets[newName]) {
      return { success: false, error: "name_exists" };
    }
    const profileId = profile.id || this.serviceCache.currentProfile;
    if (!profileId) {
      return { success: false, error: "no_profile" };
    }

    // Add new bindset data
    const insert = profile.bindsets[oldName];
    const updates =
      /** @type {{ add: { bindsets: Record<string, import('./serviceTypes.js').BindsetData>, bindsetMetadata?: Record<string, Record<string, Record<string, import('./serviceTypes.js').BindsetKeyMetadata>>> }, delete: { bindsets: string[], bindsetMetadata?: string[] } }} */ ({
        add: {
          bindsets: { [newName]: insert },
        },
        delete: {
          bindsets: [oldName],
        },
      });

    // Also handle bindsetMetadata if it exists
    if (profile.bindsetMetadata && profile.bindsetMetadata[oldName]) {
      updates.add.bindsetMetadata = {
        [newName]: profile.bindsetMetadata[oldName],
      };
      updates.delete.bindsetMetadata = [oldName];
    }

    const res = await this.request("data:update-profile", {
      profileId,
      updates,
    });
    if (res?.success) {
      // Update cached names and broadcast (cache already updated by updateCacheFromProfile)
      this.emit("bindsets:changed", {
        names: [...this.serviceCache.bindsetNames],
      });
    }
    return res;
  }

  /**
   * @overload
   * @param {string | undefined} name
   * @param {true} force
   * @returns {Promise<import('../../types/rpc/bindsets.js').BindsetUpdateResult<'invalid_name' | 'no_profile' | 'not_found'>>}
   */
  /**
   * @overload
   * @param {string | undefined} name
   * @param {false} [force]
   * @returns {Promise<import('../../types/rpc/bindsets.js').BindsetUpdateResult<'invalid_name' | 'no_profile' | 'not_found' | 'not_empty'>>}
   */
  /**
   * @param {string | undefined} name
   * @param {boolean} [force]
   */
  async deleteBindset(name, force = false) {
    if (!name || name === "Primary Bindset")
      return { success: false, error: "invalid_name" };
    const profile = await this.getProfile();
    if (!profile) return { success: false, error: "no_profile" };
    const profileId = profile.id || this.serviceCache.currentProfile;
    if (!profileId) return { success: false, error: "no_profile" };
    const target = profile.bindsets?.[name];
    if (!target) return { success: false, error: "not_found" };

    // Ensure bindset is empty unless force is true
    if (!force) {
      /** @param {string} env */
      const hasKeys = (env) =>
        target?.[env]?.keys && Object.keys(target[env].keys).length > 0;
      if (hasKeys("space") || hasKeys("ground")) {
        return { success: false, error: "not_empty" };
      }
    }

    const updates = {
      delete: {
        bindsets: [name],
      },
    };
    const res = await this.request("data:update-profile", {
      profileId,
      updates,
    });
    if (res?.success) {
      // Update cached names and broadcast (cache already updated by updateCacheFromProfile)
      this.emit("bindsets:changed", {
        names: [...this.serviceCache.bindsetNames],
      });
    }
    return res;
  }

  /**
   * @param {string | undefined} bindset
   * @param {string} environment
   * @param {string | undefined} key
   */
  async getKeyCommands(bindset, environment = "space", key) {
    console.log(
      `[BindsetService] *** getKeyCommands called: bindset=${bindset}, environment=${environment}, key=${key} ***`,
    );

    if (!key) {
      console.log(
        `[BindsetService] *** No key provided, returning empty array ***`,
      );
      return [];
    }

    // Always fetch the latest profile snapshot from DataCoordinator to avoid
    // stale cache issues when bindsets are modified by other services.
    console.log(`[BindsetService] *** Requesting data:get-current-state ***`);
    const state =
      /** @type {{ currentProfile?: string, profiles?: Record<string, import('./serviceTypes.js').ProfileData> } | null} */ (
        await this.request("data:get-current-state").catch((error) => {
          console.error(
            `[BindsetService] *** Failed to get current state: ***`,
            error,
          );
          return null;
        })
      );

    const profileId = state?.currentProfile;
    const profile =
      profileId && state?.profiles ? state.profiles[profileId] : null;

    console.log(
      `[BindsetService] *** Profile data retrieved: profileId=${profileId}, hasProfile=${!!profile} ***`,
    );

    if (!profile) {
      console.log(
        `[BindsetService] *** No profile data, returning empty array ***`,
      );
      return [];
    }

    if (!bindset || bindset === "Primary Bindset") {
      const cmds = profile.builds?.[environment]?.keys?.[key] || [];
      console.log(
        `[BindsetService] *** Primary bindset commands for key ${key}:`,
        cmds,
      );
      return Array.isArray(cmds) ? [...cmds] : [];
    }

    const cmds = profile.bindsets?.[bindset]?.[environment]?.keys?.[key] || [];
    console.log(
      `[BindsetService] *** Bindset "${bindset}" commands for key ${key}:`,
      cmds,
    );
    return Array.isArray(cmds) ? [...cmds] : [];
  }
}
