import ComponentBase from "../ComponentBase.js";

/**
 * AutoSync – watches for storage changes and triggers stoSync operations.
 */
export default class AutoSync extends ComponentBase {
  /** @param {{ eventBus?: import('./serviceTypes.js').EventBus, storage?: import('./serviceTypes.js').Storage, syncManager?: import('./SyncService.js').default, ui?: import('./serviceTypes.js').ToastUI, i18n?: import('./serviceTypes.js').I18n }} [options] */
  constructor({ eventBus, storage, syncManager, ui, i18n } = {}) {
    super(eventBus);
    this.componentName = "AutoSync";
    this.storage = storage;
    this.syncManager = syncManager; // instance of SyncService
    this.ui = ui;
    this.i18n =
      i18n ??
      /** @type {import('./serviceTypes.js').I18n} */ ({ t: (key) => key });
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

    // Bind for off()
    this._onStorageChange = () => this.debouncedSync();
  }

  onInit() {
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

  onDestroy() {
    this.disable();
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
    if (!this.storage) return;
    const settings = this.storage.getSettings();
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

    if (interval === "change") {
      this.eventBus?.on("storage:data-changed", this._onStorageChange);
    } else {
      // Validate interval is a valid positive number
      const parsedInterval = parseInt(interval, 10);
      if (isNaN(parsedInterval) || parsedInterval <= 0) {
        console.warn(
          `[AutoSync] Invalid interval '${interval}', falling back to 'change' mode`,
        );
        this.interval = "change";
        this.eventBus?.on("storage:data-changed", this._onStorageChange);
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
    this.eventBus?.off("storage:data-changed", this._onStorageChange);
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
