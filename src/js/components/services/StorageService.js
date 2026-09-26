import ComponentBase from "../ComponentBase.js";
import eventBus from "../../core/eventBus.js";
import { decodeStoredApplicationJson } from "./storedApplicationDataBoundary.js";
import {
  createDefaultPreferencesSettings,
  detectPreferencesLanguage,
} from "./preferencesDefaults.js";

/*
 * StorageService
 *
 * Manages all data storage for the application.
 *
 * This service is responsible for:
 * - Storing and retrieving data from localStorage
 * - Creating automatic backups
 * - Migrating data from old formats to new formats
 * - Ensuring storage structure is valid
 * - Detecting browser language
 *
 * Note: Advanced import/export functionality is handled by ProjectManagementService
 */
export default class StorageService extends ComponentBase {
  /** @param {{ eventBus?: import('./serviceTypes.js').EventBus, storageKey?: string, backupKey?: string, version?: string, dataService?: unknown, data?: Record<string, unknown>, i18n?: import('./serviceTypes.js').I18n | null }} [options] */
  constructor({
    eventBus: bus = eventBus,
    storageKey = "sto_keybind_manager",
    backupKey = "sto_keybind_manager_backup",
    version = "1.0.0",
    dataService = null,
    data = {},
    i18n = null,
  } = {}) {
    super(bus);
    this.componentName = "StorageService";
    this.storageKey = storageKey;
    this.backupKey = backupKey;
    this.version = version;
    this.dataService = dataService;
    this.data = data || {};
    this.i18n = i18n;
  }

  onInit() {
    // Decode, migrate, and repair the complete external root before anything
    // else can observe it. One write keeps the automatic backup pinned to the
    // exact pre-recovery string instead of overwriting it with an intermediate
    // migration result.
    const data = this.getAllData(true);
    const requiresDurableRepair =
      this._lastDataLoadRequiresPersistence === true;
    const migrated = this._lastDataLoadMigrated === true;
    const persisted = this.saveAllData(data);
    if (!persisted && requiresDurableRepair) {
      this._cachedData = null;
      // ComponentBase installs late-join listeners before onInit. Roll those
      // back so a failed required repair cannot advertise a ready service with
      // no durable/cached state, and so a later retry starts cleanly.
      this.cleanupEventListeners();
      this.initialized = false;
      this.destroyed = false;
      throw new Error("storage_write_failed");
    }
    if (migrated && persisted) {
      console.log("Data migration completed");
    }
  }

  // Get all data from storage
  // If forceFresh is true, bypass in-memory cache and reload from localStorage
  getAllData(forceFresh = false) {
    // Use cached copy unless forceFresh requested
    if (!forceFresh && this._cachedData) {
      return this._cachedData;
    }

    try {
      const data = localStorage.getItem(this.storageKey);
      const resetFlag = localStorage.getItem("sto_app_reset");

      if (!data) {
        // If reset flag exists, return empty structure instead of default data
        const recovered = resetFlag
          ? this.getEmptyData()
          : this.getDefaultData();
        if (resetFlag) {
          localStorage.removeItem("sto_app_reset");
        }
        this._cachedData = recovered;
        this._lastDataLoadRequiresPersistence = true;
        this._lastDataLoadMigrated = false;
        return recovered;
      }

      const decoded = decodeStoredApplicationJson(data, {
        defaults: this.getDefaultData(),
        version: this.version,
      });
      if (!decoded.success) {
        if (decoded.error === "invalid_json") {
          console.error("Error loading data from storage:", decoded.cause);
        }
        const defaults = this.getDefaultData();
        this._cachedData = defaults;
        this._lastDataLoadRequiresPersistence = true;
        this._lastDataLoadMigrated = false;
        return defaults;
      }

      // Cache only the detached, validated root. `changed` includes legacy
      // structural migration, recovered fields, selection repair, and version
      // mismatch, all of which must be persisted before owner adoption.
      this._cachedData = decoded.value;
      this._lastDataLoadRequiresPersistence = decoded.changed;
      this._lastDataLoadMigrated = decoded.migrated;
      return decoded.value;
    } catch (error) {
      console.error("Error loading data from storage:", error);
      const defaults = this.getDefaultData();
      this._cachedData = defaults;
      this._lastDataLoadRequiresPersistence = true;
      this._lastDataLoadMigrated = false;
      return defaults;
    }
  }

  // Save all data to storage
  /**
   * @param {any} data Persisted project data crosses a legacy JSON boundary.
   * @param {{ preserveBackup?: boolean }} [options]
   */
  saveAllData(data, { preserveBackup = false } = {}) {
    try {
      const savedAt = new Date().toISOString();
      // Create backup of current data
      if (!preserveBackup) this.createBackup(savedAt);

      // Add metadata
      const dataWithMeta = {
        ...data,
        version: this.version,
        lastModified: savedAt,
        lastBackup:
          preserveBackup && typeof data.lastBackup === "string"
            ? data.lastBackup
            : savedAt,
      };

      localStorage.setItem(this.storageKey, JSON.stringify(dataWithMeta));

      // Update cache
      this._cachedData = dataWithMeta;

      // Emit data changed event
      this.emit("storage:data-changed", { data: dataWithMeta });

      return true;
    } catch (error) {
      console.error("Error saving data to storage:", error);
      return false;
    }
  }

  // Get specific profile
  /** @param {string} profileId */
  getProfile(profileId) {
    const data = this.getAllData();
    return data.profiles[profileId] || null;
  }

  // Save specific profile
  /** @param {string} profileId @param {any} profile */
  saveProfile(profileId, profile) {
    // Always fetch fresh to avoid stale cache overwriting newer changes
    const data = structuredClone(this.getAllData(true));
    data.profiles[profileId] = {
      ...profile,
      lastModified: new Date().toISOString(),
    };
    const ok = this.saveAllData(data);
    return ok;
  }

  // Delete profile
  /** @param {string} profileId */
  deleteProfile(profileId) {
    const data = structuredClone(this.getAllData());
    if (data.profiles[profileId]) {
      delete data.profiles[profileId];

      // If this was the current profile, switch to first available
      if (data.currentProfile === profileId) {
        const remainingProfiles = Object.keys(data.profiles);
        data.currentProfile =
          remainingProfiles.length > 0 ? remainingProfiles[0] : null;
      }

      return this.saveAllData(data);
    }
    return false;
  }

  // Create backup of current data
  /** @param {string} [timestamp] */
  createBackup(timestamp = new Date().toISOString()) {
    try {
      const currentData = localStorage.getItem(this.storageKey);
      if (currentData) {
        const backup = {
          data: currentData,
          timestamp,
          version: this.version,
        };
        localStorage.setItem(this.backupKey, JSON.stringify(backup));
      }
    } catch (error) {
      console.error("Error creating backup:", error);
    }
  }

  // General coherence hook for owner-internal persistence paths that bypass the
  // legacy writer. It performs no storage mutation and exposes no reset facade.
  invalidateCache() {
    this._cachedData = null;
  }

  // Private methods

  getDefaultData() {
    // StorageService should only provide empty structure
    // DataCoordinator handles creating default profiles
    return {
      version: this.version,
      created: new Date().toISOString(),
      lastModified: new Date().toISOString(),
      currentProfile: null,
      profiles: {},
      globalAliases: {},
      settings: this.getDefaultSettings(),
    };
  }

  getEmptyData() {
    return {
      version: this.version,
      created: new Date().toISOString(),
      lastModified: new Date().toISOString(),
      currentProfile: null,
      profiles: {},
      globalAliases: {},
      settings: this.getDefaultSettings(),
    };
  }

  /** @returns {import('../../types/data-contracts.js').KnownPreferencesSettings & Record<string, unknown>} */
  getDefaultSettings() {
    return createDefaultPreferencesSettings(this.detectBrowserLanguage());
  }

  detectBrowserLanguage() {
    return detectPreferencesLanguage(
      typeof navigator === "undefined" ? undefined : navigator,
    );
  }

  /**
   * Get current state for late-join support
   * @returns {import('../../types/events/component-state.js').ComponentState<'StorageService'>}
   */
  getCurrentState() {
    return {
      service: this,
      isReady: this.isInitialized(),
    };
  }
}
