import ComponentBase from "../ComponentBase.js";
import { cloneJsonData } from "./jsonDataBoundary.js";

/** Compare JSON-like accepted project content independently of record order.
 * @param {unknown} left
 * @param {unknown} right
 * @returns {boolean}
 */
function sameProjectValue(left, right) {
  if (left === right) return true;
  if (
    !left ||
    !right ||
    typeof left !== "object" ||
    typeof right !== "object" ||
    Array.isArray(left) !== Array.isArray(right)
  )
    return false;
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key) =>
        Object.prototype.hasOwnProperty.call(right, key) &&
        sameProjectValue(Reflect.get(left, key), Reflect.get(right, key)),
    )
  );
}

/**
 * Side-effect guard, not a second owner-state decoder. ComponentBase retains
 * responsibility for adopting and ordering snapshots; only complete ready
 * project projections may become an AutoSync baseline or schedule work.
 * @param {import('../../types/events/component-state.js').DataCoordinatorStateSnapshot | null} state
 */
function isSyncProjection(state) {
  if (!state || typeof state.ready !== "boolean") return false;
  const keys = Object.keys(state);
  const record = (/** @type {unknown} */ value) =>
    value !== null && typeof value === "object" && !Array.isArray(value);
  const complete =
    keys.length === 8 &&
    keys.every((key) =>
      [
        "authorityEpoch",
        "ready",
        "revision",
        "currentProfile",
        "currentEnvironment",
        "currentProfileData",
        "profiles",
        "metadata",
      ].includes(key),
    ) &&
    (state.currentProfile === null ||
      typeof state.currentProfile === "string") &&
    typeof state.currentEnvironment === "string" &&
    (state.currentProfileData === null || record(state.currentProfileData)) &&
    record(state.profiles) &&
    Object.values(state.profiles).every(record) &&
    record(state.metadata) &&
    typeof state.metadata.version === "string" &&
    (state.metadata.lastModified == null ||
      typeof state.metadata.lastModified === "string");
  if (!complete) return false;
  try {
    // Validation-only detachment uses the existing depth-bounded JSON boundary
    // to reject cycles, unsafe keys, nonfinite numbers and non-JSON records.
    // Never replace the accepted cache/baseline with this temporary projection.
    cloneJsonData(
      {
        profiles: state.profiles,
        currentProfileData: state.currentProfileData,
        metadata: {
          ...state.metadata,
          // The snapshot contract permits undefined here, unlike nested JSON.
          lastModified: state.metadata.lastModified ?? null,
        },
      },
      "$.syncProjection",
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * AutoSync – watches accepted project changes and triggers stoSync operations.
 */
export default class AutoSync extends ComponentBase {
  /** @param {{ eventBus?: import('./serviceTypes.js').EventBus, syncManager?: import('./SyncService.js').default, ui?: import('./serviceTypes.js').ToastUI, i18n: import('./serviceTypes.js').I18n }} options */
  constructor({ eventBus, syncManager, ui, i18n }) {
    super(eventBus);
    this.componentName = "AutoSync";
    this.syncManager = syncManager; // instance of SyncService
    this.ui = ui;
    this.i18n = i18n;
    this.isEnabled = false;
    this.interval = "change"; // 'change' or seconds string
    /** @type {ReturnType<typeof setInterval> | null} */
    this._intervalId = null;
    /** @type {Date | null} */
    this.lastSync = null;

    // Debouncing for change-based sync to prevent multiple rapid syncs
    /** @type {ReturnType<typeof setTimeout> | null} */
    this._syncDebounceTimeout = null;
    this._syncDebounceDelay = 500; // 500ms debounce delay
    /** @type {ReturnType<typeof setTimeout> | null} */
    this._indicatorTimeout = null;

    /** @type {import('../../types/events/component-state.js').DataCoordinatorStateSnapshot | null} */
    this._dataBaseline = null;
  }

  onInit() {
    // Late join has already hydrated the accepted cache. Reinitialization must
    // not compare new owner state with the snapshot from a prior attachment.
    this._dataBaseline =
      isSyncProjection(this.cache.dataState) && this.cache.dataState?.ready
        ? this.cache.dataState
        : null;
    this.setupPreferencesListeners();
    this.setupFromSettings();
  }

  // Setup helpers
  setupPreferencesListeners() {
    // Listen for AutoSync settings changes from PreferencesUI
    this.addEventListener("preferences:autosync-settings-changed", () => {
      this.setupFromSettings();
    });

    // Listen for individual setting changes
    this.addEventListener(
      "preferences:changed",
      (
        /** @type {{ changes?: { autoSync?: boolean, autoSyncInterval?: string }, key?: string, value?: unknown }} */ data,
      ) => {
        // Handle both single-setting changes and bulk changes
        const changes =
          data.changes || (data.key ? { [data.key]: data.value } : {});

        if (
          changes.autoSync !== undefined ||
          changes.autoSyncInterval !== undefined
        ) {
          this.setupFromSettings();
        }

        // Trigger immediate sync for any preference change if sync is enabled
        if (this.isEnabled) {
          console.log(
            "[AutoSync] Preference setting changed, triggering immediate sync",
          );
          this.sync();
        }
      },
    );
  }

  /**
   * A consumer that starts before the owner reconfigures only when the first
   * ready canonical snapshot has passed ComponentBase validation and ordering.
   * Other owner transitions retain their existing semantic triggers below;
   * sync-folder staging alone remains inert.
   * @param {import('../../types/events/preferences.js').PreferencesStateChangedEvent} change
   */
  onPreferencesStateAccepted({ reason, state }) {
    if (reason === "startup-loaded" && state.ready) this.setupFromSettings();
  }

  /**
   * Revision is publication ordering, not evidence of a durable change: a
   * read-only reload advances it too. Compare canonical project content so a
   * committed import with the same state-reloaded reason still triggers sync.
   * An identical import suppresses the old redundant storage-notification sync
   * because it does not change the owner projection or the synced artifact.
   * @param {import('../../types/events/data.js').DataStateChangedPayload} change
   */
  onDataStateAccepted({ reason, state }) {
    if (!isSyncProjection(state)) return;
    // A pre-ready replacement cancels predecessor work without treating its
    // empty projection as a project mutation. Malformed projections are inert.
    if (state.ready === false) {
      this._dataBaseline = null;
      if (this._syncDebounceTimeout !== null) {
        clearTimeout(this._syncDebounceTimeout);
        this._syncDebounceTimeout = null;
      }
      return;
    }
    const previous = this._dataBaseline;
    this._dataBaseline = state;
    if (
      !previous ||
      previous.authorityEpoch !== state.authorityEpoch ||
      reason === "initial-load"
    ) {
      if (this._syncDebounceTimeout !== null) {
        clearTimeout(this._syncDebounceTimeout);
        this._syncDebounceTimeout = null;
      }
      return;
    }
    if (
      this.isEnabled &&
      this.interval === "change" &&
      (!sameProjectValue(previous.profiles, state.profiles) ||
        !sameProjectValue(previous.metadata, state.metadata) ||
        previous.currentProfile !== state.currentProfile ||
        previous.currentEnvironment !== state.currentEnvironment)
    )
      this.debouncedSync();
  }

  onDestroy() {
    this.disable();
    this._dataBaseline = null;
    if (this._indicatorTimeout !== null) {
      clearTimeout(this._indicatorTimeout);
      this._indicatorTimeout = null;
    }
    if (typeof document !== "undefined") {
      const indicator = document.getElementById("modifiedIndicator");
      if (indicator) {
        indicator.style.display = "none";
        indicator.classList.remove("syncing", "synced", "error");
      }
    }
  }

  setupFromSettings() {
    const settings = this.cache.preferences;
    if (settings.autoSync) {
      this.enable(settings.autoSyncInterval || "change");
    } else {
      this.disable();
    }
  }

  // Enable / disable
  enable(interval = "change") {
    this.disable();
    this.isEnabled = true;
    this.interval = interval;

    if (interval !== "change") {
      // Validate interval is a valid positive number
      const parsedInterval = parseInt(interval, 10);
      if (isNaN(parsedInterval) || parsedInterval <= 0) {
        console.warn(
          `[AutoSync] Invalid interval '${interval}', falling back to 'change' mode`,
        );
        this.interval = "change";
      } else {
        const ms = parsedInterval * 1000;
        this._intervalId = setInterval(() => this.sync(), ms);
      }
    }

    // Settings persistence is handled by PreferencesService to avoid circular updates
    // AutoSync only responds to settings changes, it doesn't persist them
    console.log(`[AutoSync] Enabled with interval: ${this.interval}`);
  }

  disable() {
    this.isEnabled = false;
    if (this._intervalId) {
      clearInterval(this._intervalId);
      this._intervalId = null;
    }

    // Clear any pending debounced sync
    if (this._syncDebounceTimeout) {
      clearTimeout(this._syncDebounceTimeout);
      this._syncDebounceTimeout = null;
    }

    console.log("[AutoSync] Disabled");
  }

  // Debounced sync for change-based mode
  debouncedSync() {
    // Clear any existing timeout
    if (this._syncDebounceTimeout) {
      clearTimeout(this._syncDebounceTimeout);
    }

    // Set a new timeout to trigger sync after debounce delay
    this._syncDebounceTimeout = setTimeout(() => {
      this._syncDebounceTimeout = null;
      this.sync();
    }, this._syncDebounceDelay);
  }

  // Sync
  async sync() {
    if (!this.isEnabled || !this.syncManager) return;
    try {
      const result = await this.syncManager.syncProject("auto");
      if (!result.success) {
        this._updateIndicator("error");
        return result;
      }
      this.lastSync = new Date();
      this._updateIndicator("synced");
      return result;
    } catch (err) {
      console.error("[AutoSync] sync failed", err);
      this._updateIndicator("error");
      return {
        success: false,
        error: "failed_to_sync_project",
        params: { error: err instanceof Error ? err.message : String(err) },
      };
    }
  }

  // UI indicator (optional)
  /** @param {'synced' | 'error'} state */
  _updateIndicator(state) {
    if (!this.ui || typeof document === "undefined") return;
    const indicator = document.getElementById("modifiedIndicator");
    if (!indicator) return;

    if (this._indicatorTimeout !== null) {
      clearTimeout(this._indicatorTimeout);
      this._indicatorTimeout = null;
    }
    indicator.classList.remove("syncing", "synced", "error");
    const icon = document.createElement("i");
    switch (state) {
      case "synced":
        indicator.style.display = "inline";
        indicator.classList.add("synced");
        icon.className = "fas fa-check";
        indicator.replaceChildren(
          icon,
          document.createTextNode(` ${this.i18n.t("sync_status_synced")}`),
        );
        this._indicatorTimeout = setTimeout(() => {
          this._indicatorTimeout = null;
          indicator.style.display = "none";
          indicator.classList.remove("synced");
        }, 2000);
        break;
      case "error":
        indicator.style.display = "inline";
        indicator.classList.add("error");
        icon.className = "fas fa-exclamation-triangle";
        indicator.replaceChildren(
          icon,
          document.createTextNode(` ${this.i18n.t("sync_status_error")}`),
        );
        this._indicatorTimeout = setTimeout(() => {
          this._indicatorTimeout = null;
          indicator.style.display = "none";
          indicator.classList.remove("error");
        }, 5000);
        break;
    }
  }
}
