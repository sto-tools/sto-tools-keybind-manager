import ComponentBase from "../ComponentBase.js";
import { getSnapshotProfile } from "./dataState.js";

export default class BindsetService extends ComponentBase {
  /** @param {{ eventBus?: import('./serviceTypes.js').EventBus }} [options] */
  constructor({ eventBus } = {}) {
    super(eventBus);
    this.componentName = "BindsetService";
    /** @type {Array<() => void>} */
    this._responseDetachFunctions = [];
    this._bindsetDataAuthorityEpoch = 0;
    this._bindsetDataRevision = -1;

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
    this._bindsetDataRevision = -1;
  }

  // Handle initial state from DataCoordinator
  /** @param {import('../../types/events/component-state.js').ComponentStateReply} reply */
  handleInitialState(reply) {
    const { sender, state } = reply;
    console.log("[BindsetService] handleInitialState called:", sender, !!state);

    if (sender === "DataCoordinator") this.adoptCoordinatorBindsetState(state);
  }

  // Broadcast / Cache integration
  setupEventListeners() {
    // Prevent double registration in case constructor called twice in tests
    if (this._listenersSetup) return;
    this._listenersSetup = true;

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
      !accepted ||
      accepted.authorityEpoch !== delivered.authorityEpoch ||
      accepted.revision !== delivered.revision ||
      (accepted.authorityEpoch === this._bindsetDataAuthorityEpoch &&
        accepted.revision === this._bindsetDataRevision)
    ) {
      return;
    }

    this._bindsetDataAuthorityEpoch = accepted.authorityEpoch;
    this._bindsetDataRevision = accepted.revision;
    this.updateCacheFromProfile(getSnapshotProfile(accepted));
  }

  /** @param {import('./serviceTypes.js').ProfileData | null | undefined} profile */
  updateCacheFromProfile(profile) {
    console.log(
      "[BindsetService] updateCacheFromProfile: profile =",
      profile,
      "id =",
      profile && profile.id,
    );
    const nextNames = [
      "Primary Bindset",
      ...Object.keys(profile?.bindsets || {}),
    ];
    const currentNames = this.serviceCache.bindsetNames;
    const namesChanged =
      currentNames.length !== nextNames.length ||
      currentNames.some((name, index) => name !== nextNames[index]);
    if (!namesChanged) return;

    this.serviceCache.bindsetNames = nextNames;
    this.emit("bindsets:changed", {
      names: [...this.serviceCache.bindsetNames],
    });
  }

  /** @returns {import('./serviceTypes.js').ProfileData | null} */
  getProfile() {
    return getSnapshotProfile(this.cache.dataState);
  }

  /** @returns {string | null} */
  getProfileId() {
    return this.cache.dataState?.ready
      ? this.cache.dataState.currentProfile
      : null;
  }

  /**
   * @param {string | undefined} name
   * @returns {Promise<import('../../types/rpc/bindsets.js').BindsetUpdateResult<'invalid_name' | 'no_profile' | 'name_exists'>>}
   */
  async createBindset(name) {
    if (!name || name === "Primary Bindset")
      return { success: false, error: "invalid_name" };
    const profile = this.getProfile();
    const profileId = this.getProfileId();
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

    const profile = this.getProfile();
    const profileId = this.getProfileId();
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
    const profile = this.getProfile();
    if (!profile || !profile.bindsets || !profile.bindsets[oldName]) {
      return { success: false, error: "not_found" };
    }
    if (profile.bindsets[newName]) {
      return { success: false, error: "name_exists" };
    }
    const profileId = this.getProfileId();
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
    const profile = this.getProfile();
    if (!profile) return { success: false, error: "no_profile" };
    const profileId = this.getProfileId();
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
        bindsetMetadata: [name],
      },
    };
    const res = await this.request("data:update-profile", {
      profileId,
      updates,
    });
    return res;
  }
}
