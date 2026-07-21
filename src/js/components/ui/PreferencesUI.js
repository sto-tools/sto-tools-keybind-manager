import UIComponentBase from "../UIComponentBase.js";
import i18next from "i18next";
import { resolveDocument } from "./uiTypes.js";

const runtime = /** @type {import('./uiTypes.js').RuntimeGlobals} */ (
  globalThis
);

/** @typedef {string | boolean | number | null | undefined} PreferenceValue */
/** @typedef {'language' | 'translateGeneratedMessages' | 'autoSave' | 'autoSync' | 'autoSyncInterval' | 'bindToAliasMode' | 'bindsetsEnabled'} SettingKey */
/** @typedef {{ type: 'boolean' | 'select', element: string }} SettingDefinition */
/** @typedef {import('../../types/events/base.js').KnownPreferenceMutation} KnownPreferenceMutation */

/**
 * @param {unknown} value
 * @returns {value is PreferenceValue}
 */
function isPreferenceValue(value) {
  return (
    value == null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    typeof value === "number"
  );
}

/**
 * @param {string} value
 * @returns {value is SettingKey}
 */
function isSettingKey(value) {
  return (
    value === "language" ||
    value === "translateGeneratedMessages" ||
    value === "autoSave" ||
    value === "autoSync" ||
    value === "autoSyncInterval" ||
    value === "bindToAliasMode" ||
    value === "bindsetsEnabled"
  );
}

/**
 * Preserve the setting-key/value correlation before entering the typed RPC.
 * @param {string} key
 * @param {PreferenceValue} value
 * @returns {KnownPreferenceMutation | null}
 */
function createKnownPreferenceMutation(key, value) {
  if (!isSettingKey(key)) return null;
  const expectsBoolean =
    key === "translateGeneratedMessages" ||
    key === "autoSave" ||
    key === "autoSync" ||
    key === "bindToAliasMode" ||
    key === "bindsetsEnabled";
  if (
    (expectsBoolean && typeof value !== "boolean") ||
    (!expectsBoolean && typeof value !== "string")
  ) {
    return null;
  }
  return /** @type {KnownPreferenceMutation} */ ({ key, value });
}

/**
 * PreferencesUI - User preferences management component
 *
 * This component manages the preferences modal and user settings through a modern
 * event bus architecture. Mutating actions are sent to PreferencesService,
 * while settings state is consumed from ComponentBase's broadcast-backed cache.
 *
 * Architecture:
 * - Settings loading: showPreferences() → preferences:load-settings → preferences:loaded → cache → updateUI()
 * - User interactions: handleSettingChange() → updateSetting() → preferences:set-setting
 * - Save action: saveAllSettings() → preferences:set-settings or preferences:save-settings
 *
 * Note: Legacy methods updatePreferencesFromStorage() and setupPreferencesEventListeners()
 * were removed during refactoring as they were redundant with the event bus approach.
 */
export default class PreferencesUI extends UIComponentBase {
  /**
   * @param {{
   *   eventBus?: import('./uiTypes.js').EventBus,
   *   ui?: import('./uiTypes.js').UIServiceLike | null,
   *   document?: Document | null
   * }} [options]
   */
  constructor({ eventBus, ui = null, document = null } = {}) {
    super(eventBus);
    this.componentName = "PreferencesUI";

    this.ui = ui;
    this.document = resolveDocument(document);

    // Adopt settingDefinitions from historical implementation
    /** @type {Record<SettingKey, SettingDefinition>} */
    this.settingDefinitions = {
      language: { type: "select", element: "languageSelect" },
      translateGeneratedMessages: {
        type: "boolean",
        element: "translateGeneratedMessagesCheckbox",
      },
      autoSave: { type: "boolean", element: "autoSaveCheckbox" },
      autoSync: { type: "boolean", element: "autoSync" },
      autoSyncInterval: { type: "select", element: "autoSyncInterval" },
      bindToAliasMode: { type: "boolean", element: "bindToAliasModeCheckbox" },
      bindsetsEnabled: { type: "boolean", element: "bindsetsEnabledCheckbox" },
    };

    // Holds settings that should only be applied when the user clicks the Save button
    /** @type {Record<string, PreferenceValue>} */
    this.pendingSettings = {};
  }

  onInit() {
    // Use request/response instead of direct service call
    void this.request("preferences:init")
      .then(() => {
        if (!this.destroyed) return this.populatePreferencesModal();
        return undefined;
      })
      .catch((error) => {
        console.error(
          "[PreferencesUI] Failed to initialize preferences",
          error,
        );
      });
    this.setupEventListeners();
  }

  // UI helpers
  setupEventListeners() {
    // Listen for preferences:show event from HeaderMenuUI
    this.addEventListener("preferences:show", () => {
      void this.showPreferences().catch((error) => {
        console.error("[PreferencesUI] Failed to show preferences", error);
      });
    });

    // Listen for sync folder changes
    this.addEventListener("sync:folder-set", () => {
      void this.updateFolderDisplay().catch((error) => {
        console.error("[PreferencesUI] Failed to update sync folder", error);
      });
    });

    // Listen for settings changes that should update AutoSync
    this.addEventListener("preferences:changed", (data) => {
      // Handle both single-setting changes and bulk changes
      const changes =
        data.changes || (data.key ? { [data.key]: data.value } : {});

      if (
        changes.autoSync !== undefined ||
        changes.autoSyncInterval !== undefined
      ) {
        this.notifyAutoSyncSettingsChanged();
      }
    });

    // Category navigation buttons
    document.querySelectorAll(".category-item").forEach((item) => {
      this.onDom(item, "click", (e) => {
        const currentTarget = e.currentTarget;
        const cat =
          currentTarget instanceof Element
            ? currentTarget.getAttribute("data-category")
            : null;
        if (cat) this.switchCategory(cat);
      });
    });

    // Save button
    this.onDom("savePreferencesBtn", "click", () => {
      void this.saveAllSettings(true).catch((error) => {
        console.error("[PreferencesUI] Failed to save preferences", error);
      });
    });

    this.setupSettingControls();

    // Set Sync Folder button – needs direct user activation
    const syncBtn = document.getElementById("setSyncFolderBtn");
    if (syncBtn) {
      this.onDom(syncBtn, "click", async () => {
        console.log("[PreferencesUI] setSyncFolderBtn clicked");
        if (runtime.stoSync?.setSyncFolder) {
          try {
            const handle = await runtime.stoSync.setSyncFolder(true);
            console.log("[PreferencesUI] setSyncFolder returned", {
              hasHandle: !!handle,
              name: handle?.name,
            });
            if (handle) {
              console.log(
                "[PreferencesUI] folder display updated from sync:folder-set",
              );
            }
          } catch (err) {
            console.error("[PreferencesUI] setSyncFolder failed", err);
          }
        }
      });
    }
  }

  setupSettingControls() {
    Object.entries(this.settingDefinitions).forEach(([key, def]) => {
      if (!isSettingKey(key)) return;
      const el = /** @type {HTMLInputElement | HTMLSelectElement | null} */ (
        document.getElementById(def.element)
      );
      if (!el) return;

      // If this is the bindsetsEnabled control, ensure it's disabled until bindToAliasMode is true
      if (key === "bindsetsEnabled") {
        // Initial state – will be updated again after load
        const checkbox = /** @type {HTMLInputElement} */ (el);
        checkbox.disabled = !(
          this.pendingSettings.bindToAliasMode || checkbox.checked
        );
      }

      switch (def.type) {
        case "boolean":
          this.onDom(el, "change", (e) => {
            const target = /** @type {HTMLInputElement} */ (e.target);
            this.handleSettingChange(key, target.checked);
          });
          break;
        case "select":
          this.onDom(el, "change", (e) => {
            const target = /** @type {HTMLSelectElement} */ (e.target);
            this.handleSettingChange(key, target.value);
          });
          break;
      }
    });
  }

  /** @param {string} cat */
  switchCategory(cat) {
    document
      .querySelectorAll(".category-item")
      .forEach((i) => i.classList.remove("active"));
    const active = document.querySelector(`[data-category="${cat}"]`);
    active && active.classList.add("active");

    document
      .querySelectorAll(".settings-panel")
      .forEach((p) => p.classList.remove("active"));
    const panel = document.getElementById(`${cat}-settings`);
    panel && panel.classList.add("active");
  }

  /**
   * @param {string} key
   * @param {PreferenceValue} value
   */
  async updateSetting(key, value) {
    // Use request/response instead of direct service call
    const updated = await this.setSetting(key, value);

    if (updated && (key === "syncFolderName" || key === "syncFolderPath")) {
      this.updateFolderDisplay();
    }

    // PreferencesService already emits 'preferences:changed' when setting is updated
    return updated;
  }

  /**
   * @param {string} key
   * @param {PreferenceValue} value
   */
  updateUI(key, value) {
    if (!isSettingKey(key)) return;
    const def = this.settingDefinitions[key];
    const el = /** @type {HTMLInputElement | HTMLSelectElement | null} */ (
      document.getElementById(def.element)
    );
    if (!el) return;

    if (def.type === "boolean") {
      /** @type {HTMLInputElement} */ (el).checked = !!value;
    } else if (def.type === "select") {
      el.value = value == null ? "" : String(value);
    }

    if (key === "bindToAliasMode") {
      this.updateBindsetsCheckboxState(Boolean(value));
    }
  }

  async saveAllSettings(manual = true) {
    console.log("[PreferencesUI] saveAllSettings called", {
      manual,
      pending: { ...this.pendingSettings },
    });
    let ok;
    // First, apply any pending settings (e.g., bindToAliasMode) in one durable
    // bulk mutation. That action already persists and publishes the accepted
    // snapshot, so it replaces the formerly redundant follow-up save.
    if (Object.keys(this.pendingSettings).length > 0) {
      // Merge pending changes with the latest published settings snapshot.
      const currentSettings = { ...this.cache.preferences };
      const newSettings = { ...currentSettings, ...this.pendingSettings };
      ok = await this.request("preferences:set-settings", newSettings, 0);

      // Keep pending UI intent when persistence rejects the mutation.
      if (!ok) return false;

      // Clear pending settings now that they have been durably applied
      this.pendingSettings = {};
      console.log("[PreferencesUI] pending settings applied");
    } else {
      // No pending mutation remains, but an explicit Save still verifies the
      // current owner snapshot and retains the established saved publication.
      ok = await this.saveSettings();
    }

    console.log("[PreferencesUI] durable preferences result", { ok });
    if (!ok) return false;
    if (manual && this.ui?.showToast) {
      this.emit("toast:show", {
        message: i18next.t("preferences_saved"),
        type: "success",
      });
    }

    // Notify AutoSync of setting changes
    this.notifyAutoSyncSettingsChanged();

    // Use event bus instead of direct modalManager call
    await this.emit(
      "modal:hide",
      { modalId: "preferencesModal" },
      { synchronous: true },
    );
    return true;
  }

  async showPreferences() {
    console.log("[PreferencesUI] showPreferences");
    // Ask the owner to reload; preferences:loaded synchronously refreshes the
    // standardized ComponentBase cache before this action reply resolves.
    await this.request("preferences:load-settings");
    // Discard any unsaved changes from previous session
    this.pendingSettings = {};
    const settings = { ...this.cache.preferences };
    Object.entries(settings).forEach(([key, value]) => {
      if (isPreferenceValue(value)) this.updateUI(key, value);
    });
    this.updateFolderDisplay();
    // Use event bus instead of direct modalManager call
    this.emit("modal:show", { modalId: "preferencesModal" });
  }

  async populatePreferencesModal() {
    // Load current settings via event bus request/response pattern
    // Settings are automatically applied to UI elements through the updateUI() method
    // Event listeners are set up in setupEventListeners() and setupSettingControls()
    await this.request("preferences:load-settings");
  }

  async updateFolderDisplay() {
    const { syncFolderName, syncFolderPath } = this.cache.preferences;
    console.log("[PreferencesUI] updateFolderDisplay", {
      syncFolderName,
      syncFolderPath,
    });

    // Update folder display UI - use correct element ID from HTML
    const folderDisplayEl = this.document.getElementById("currentSyncFolder");

    if (folderDisplayEl) {
      if (typeof syncFolderName === "string" && syncFolderName) {
        folderDisplayEl.textContent = syncFolderName;
        // Remove the data-i18n attribute when showing actual folder name
        folderDisplayEl.removeAttribute("data-i18n");
      } else {
        folderDisplayEl.textContent = i18next.t("no_folder_selected");
        folderDisplayEl.setAttribute("data-i18n", "no_folder_selected");
      }
    }
  }

  async notifyAutoSyncSettingsChanged() {
    // Emit event for AutoSync service to listen to
    this.emit("preferences:autosync-settings-changed");
  }

  /**
   * @param {string} key
   * @param {PreferenceValue} value
   */
  async setSetting(key, value) {
    const mutation = createKnownPreferenceMutation(key, value);
    if (!mutation) throw new TypeError(`Invalid preference value for "${key}"`);
    // Use request/response instead of direct service call
    let updated;
    try {
      updated = await this.request("preferences:set-setting", mutation, 0);
    } catch (error) {
      const currentValue = this.cache.preferences[key];
      if (isPreferenceValue(currentValue)) this.updateUI(key, currentValue);
      throw error;
    }
    const displayedValue = updated ? value : this.cache.preferences[key];
    if (isPreferenceValue(displayedValue)) {
      this.updateUI(key, displayedValue);
    }
    return updated;
  }

  async saveSettings() {
    // Use request/response instead of direct service call
    const ok = await this.request("preferences:save-settings", undefined, 0);
    return ok;
  }

  /**
   * @param {string} key
   * @param {PreferenceValue} value
   */
  handleSettingChange(key, value) {
    if (key === "bindToAliasMode" || key === "bindsetsEnabled") {
      // Defer applying until user presses Save
      this.pendingSettings[key] = value;

      // Reflect change in UI but do not persist yet
      this.updateUI(key, value);

      if (key === "bindToAliasMode") {
        // Update dependency for bindsets checkbox immediately for UX feedback
        this.updateBindsetsCheckboxState(Boolean(value));
        // If alias mode disabled, ensure pending bindsetsEnabled is also false
        if (!value) {
          this.pendingSettings.bindsetsEnabled = false;
        }
      }
    } else {
      // Apply other settings immediately as before
      void this.updateSetting(key, value).catch((error) => {
        console.error("[PreferencesUI] Failed to update preference", error);
      });
    }
  }

  // Enable/disable bindsetsEnabled checkbox depending on bindToAliasMode
  /** @param {boolean | null} [bindToAliasMode] */
  updateBindsetsCheckboxState(bindToAliasMode = null) {
    const checkbox = /** @type {HTMLInputElement | null} */ (
      document.getElementById("bindsetsEnabledCheckbox")
    );
    if (!checkbox) return;
    // Determine state if param not provided
    /** @type {boolean | null} */
    let enabled = bindToAliasMode;
    if (enabled === null) {
      const pending = this.pendingSettings.bindToAliasMode;
      if (typeof pending === "boolean") enabled = pending;
      else enabled = checkbox.checked; // fallback
    }
    checkbox.disabled = !enabled;
    if (!enabled) {
      checkbox.checked = false;
      // Reflect in pendingSettings so Save applies correct value
      this.pendingSettings.bindsetsEnabled = false;
    }
  }
}
