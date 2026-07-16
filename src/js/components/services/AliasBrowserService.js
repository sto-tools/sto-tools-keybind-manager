import ComponentBase from "../ComponentBase.js";
import { getSnapshotUserAliases } from "./dataState.js";

/**
 * AliasBrowserService – source-of-truth for alias CRUD & selection.
 * Uses DataCoordinator broadcast/cache pattern.
 */
export default class AliasBrowserService extends ComponentBase {
  /** @param {{ ui?: unknown, eventBus?: import('./serviceTypes.js').EventBus }} [options] */
  constructor({ ui, eventBus } = {}) {
    super(eventBus);
    this.componentName = "AliasBrowserService";
    this.ui = ui;
    /** @type {Array<() => void>} */
    this._responseDetachFunctions = [];

    this.setupRequestHandlers();
  }

  setupRequestHandlers() {
    if (!this.eventBus || this._responseDetachFunctions.length > 0) return;

    this._responseDetachFunctions.push(
      this.respond(
        "alias-browser:create",
        (
          {
            name,
            description = "",
          } = /** @type {{ name?: string, description?: string }} */ ({}),
        ) => this.createAlias(name, description),
      ),
    );
  }

  /** @returns {import('./serviceTypes.js').ServiceCache} */
  get serviceCache() {
    this.initializeCache();
    if (!this.cache)
      throw new Error("AliasBrowserService cache initialization failed");
    return /** @type {import('./serviceTypes.js').ServiceCache} */ (this.cache);
  }

  onInit() {
    this.setupRequestHandlers();
    this.setupEventListeners();
  }

  onDestroy() {
    for (const detach of this._responseDetachFunctions) detach();
    this._responseDetachFunctions = [];
  }

  setupEventListeners() {
    // Listen for profile updates
    this.addEventListener("profile:updated", ({ profileId, profile }) => {
      if (typeof window !== "undefined") {
        console.log(
          `[AliasBrowserService] profile:updated received. profileId: ${profileId}, cache.currentProfile: ${this.serviceCache.currentProfile}, match: ${profileId === this.serviceCache.currentProfile}`,
        );
      }
      if (profileId === this.serviceCache.currentProfile) {
        this.updateCacheFromProfile(profile);
        this.emit("aliases-changed", { aliases: this.serviceCache.aliases });
      }
    });

    // Listen for profile switched
    this.addEventListener(
      "profile:switched",
      ({ profileId, profile, environment }) => {
        this.serviceCache.currentProfile = profileId || null;

        if (environment) {
          this.serviceCache.currentEnvironment = environment;
        }

        this.updateCacheFromProfile(profile);
        this.emit("aliases-changed", { aliases: this.serviceCache.aliases });
      },
    );

    // Listen for environment changes
    this.addEventListener("environment:changed", async (payload) => {
      const env = payload.environment;
      if (typeof window !== "undefined") {
        console.log(
          `[AliasBrowserService] environment:changed received. payload:`,
          payload,
          `parsed env: ${env}`,
        );
      }
      if (env) {
        this.serviceCache.currentEnvironment = env;
      }
    });
  }

  /** @param {import('./serviceTypes.js').ProfileData | null | undefined} profile */
  updateCacheFromProfile(profile) {
    if (!profile) {
      return;
    }

    this.serviceCache.profile = profile;
    this.serviceCache.aliases = profile.aliases || {};
  }

  getAliases() {
    return getSnapshotUserAliases(this.cache.dataState);
  }

  /** @param {string} name */
  async selectAlias(name) {
    const result = await this.request("selection:select-alias", {
      aliasName: name,
    });

    return result;
  }

  /**
   * @param {string | undefined} name
   * @param {string} description
   */
  async createAlias(name, description = "") {
    const result = await this.request("alias:add", { name, description });

    if (result?.success === true && name) {
      // Auto-select the newly created alias
      await this.selectAlias(name);
    }

    return result;
  }
}
