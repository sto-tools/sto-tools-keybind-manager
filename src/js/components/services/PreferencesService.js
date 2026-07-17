import ComponentBase from "../ComponentBase.js";
import { extensionPreferenceKey } from "./preferenceKeys.js";
import {
  hasValidKnownSettingValue,
  isDataRecord,
  isKnownSettingKey,
  isSettingsRecord,
  sanitizeStoredSettings,
  sanitizeStoredSettingsPatch,
} from "./settingsDataBoundary.js";

/** @typedef {import('../../types/events/base.js').KnownPreferenceKey} KnownPreferenceKey */
/** @typedef {import('../../types/events/base.js').KnownPreferencesSettings} KnownPreferencesSettings */
/** @typedef {import('../../types/events/base.js').PreferenceMutation} PreferenceMutation */
/** @typedef {import('../../types/events/base.js').PreferencesSettings} PreferencesSettings */
/** @typedef {import('../../types/events/base.js').SettingsRecord} SettingsRecord */

/** @param {unknown} value @returns {value is PreferenceMutation} */
function isPreferenceMutation(value) {
  if (!isDataRecord(value) || typeof value.key !== "string") return false;
  if (isKnownSettingKey(value.key)) {
    return (
      value.extension !== true &&
      hasValidKnownSettingValue(value.key, value.value)
    );
  }
  return value.extension === true;
}

/** @param {unknown} value */
function invalidMutationError(value) {
  const key =
    isDataRecord(value) && typeof value.key === "string" ? value.key : "";
  return new TypeError(
    key
      ? `Invalid value or mutation path for preference "${key}"`
      : "Invalid preference mutation payload",
  );
}

const appWindow =
  typeof window === "undefined"
    ? null
    : /** @type {import('./serviceTypes.js').AppWindow} */ (window);

/**
 * PreferencesService – persistent user settings (theme, language, etc.)
 * Pure logic / no DOM querying.  UI interactions live in PreferencesUI.
 */
export default class PreferencesService extends ComponentBase {
  /** @param {{ storage?: import('./serviceTypes.js').Storage, eventBus?: import('./serviceTypes.js').EventBus, i18n?: import('./serviceTypes.js').I18n }} [options] */
  constructor({ storage, eventBus, i18n } = {}) {
    super(eventBus);
    this.componentName = "PreferencesService";
    this.storage = storage;
    this.i18n = i18n;

    // Defaults
    /** @type {PreferencesSettings} */
    this.defaultSettings = {
      theme: "default",
      autoSave: true,
      showTooltips: true,
      confirmDeletes: true,
      maxUndoSteps: 50,
      defaultMode: "space",
      compactView: false,
      language: "en",
      syncFolderName: null,
      syncFolderPath: null,
      autoSync: false,
      autoSyncInterval: "change",
      bindToAliasMode: false,
      bindsetsEnabled: false,
      translateGeneratedMessages: false,
    };

    // Runtime copy
    /** @type {PreferencesSettings} */
    this.settings = { ...this.defaultSettings };
    /** @type {Array<() => void>} */
    this._responseDetachFunctions = [];
  }

  attachResponders() {
    if (!this.eventBus || this._responseDetachFunctions.length > 0) return;
    this._responseDetachFunctions = [
      this.respond("preferences:init", () => {
        this.loadSettings();
        this.applySettings();
        return undefined;
      }),
      this.respond("preferences:load-settings", () => {
        this.loadSettings();
        return undefined;
      }),
      this.respond("preferences:save-settings", () => this.saveSettings()),
      this.respond("preferences:set-setting", (mutation) => {
        if (!isPreferenceMutation(mutation)) {
          throw invalidMutationError(mutation);
        }
        return mutation.extension === true
          ? this.setExtensionSetting(mutation.key, mutation.value)
          : this.setSetting(mutation.key, mutation.value);
      }),
      this.respond("preferences:set-settings", (newSettings) =>
        this.setSettings(newSettings),
      ),
    ];
  }

  setupEventListeners() {
    if (!this.eventBus) return;

    // Listen for theme toggle events from HeaderMenuUI
    this.addEventListener("theme:toggle", () => {
      try {
        void this.toggleTheme().catch((error) => {
          console.error("[PreferencesService] Failed to toggle theme", error);
        });
      } catch (error) {
        console.error("[PreferencesService] Failed to toggle theme", error);
      }
    });

    // Listen for language change events from HeaderMenuUI
    this.addEventListener("language:change", ({ language }) => {
      if (language) {
        void this.changeLanguage(language).catch((error) => {
          console.error(
            "[PreferencesService] Failed to change language",
            error,
          );
        });
      }
    });
  }

  onInit() {
    this.attachResponders();
    this.setupEventListeners();
    this.loadSettings();
    this.applySettings();
  }

  // Persistence helpers
  loadSettings() {
    try {
      if (this.storage) {
        const stored = this.storage.getSettings();
        this.settings = sanitizeStoredSettings(stored, this.defaultSettings);
      }
      console.log("[PreferencesService] loadSettings", {
        settings: { ...this.settings },
      });
    } catch (err) {
      console.error("[PreferencesService] loadSettings failed", err);
      this.settings = { ...this.defaultSettings };
    }

    // Loading is also the startup publication path. Always announce the
    // complete current snapshot so consumers initialized before this service
    // receive defaults even when storage is absent or unreadable.
    this.emit("preferences:loaded", { settings: this.getSettings() });
  }

  async saveSettings() {
    if (!this.storage) return false;
    const settings = this.getSettings();
    const ok = this.persistSettings(settings);
    console.log("[PreferencesService] saveSettings", {
      ok,
      settings,
    });
    if (ok) await this.publishSavedSettings(settings);
    return Boolean(ok);
  }

  // Accessors
  getSettings() {
    return structuredClone(this.settings);
  }

  /** @param {string} key */
  getSetting(key) {
    return structuredClone(this.settings[key]);
  }

  /**
   * @template {KnownPreferenceKey} Key
   * @param {Key} key
   * @param {KnownPreferencesSettings[Key]} value
   * @returns {Promise<boolean>}
   */
  setSetting(key, value) {
    if (!isKnownSettingKey(key) || !hasValidKnownSettingValue(key, value)) {
      throw invalidMutationError({ key, value });
    }
    return this.commitSetting(key, value);
  }

  /**
   * Explicit mutation path for application-defined extension preferences.
   * @param {string} key
   * @param {unknown} value
   * @returns {Promise<boolean>}
   */
  setExtensionSetting(key, value) {
    const extensionKey = extensionPreferenceKey(key);
    return this.commitSetting(extensionKey, value);
  }

  /** @param {string} key @param {unknown} value @returns {Promise<boolean>} */
  commitSetting(key, value) {
    const candidate = this.getSettings();
    Object.defineProperty(candidate, key, {
      value,
      configurable: true,
      enumerable: true,
      writable: true,
    });
    const decoded = sanitizeStoredSettingsPatch(candidate);
    if (decoded.repaired) throw invalidMutationError({ key, value });
    const nextSettings = /** @type {PreferencesSettings} */ (decoded.value);
    console.log("[PreferencesService] setSetting", { key, value });
    if (!this.persistSettings(nextSettings)) return Promise.resolve(false);

    this.settings = nextSettings;
    const savedPublication = this.publishSavedSettings(nextSettings);
    this.applySettings();
    this.emit("preferences:changed", {
      key,
      value: structuredClone(nextSettings[key]),
      settings: this.getSettings(),
    });
    return savedPublication.then(() => true);
  }

  /** @param {SettingsRecord} [newSettings] @returns {Promise<boolean>} */
  setSettings(newSettings = {}) {
    const decoded = sanitizeStoredSettingsPatch(newSettings);
    if (!isSettingsRecord(newSettings) || decoded.repaired) {
      throw new TypeError("Invalid preferences settings payload");
    }
    const oldSettings = this.getSettings();
    const nextSettings = sanitizeStoredSettings(
      decoded.value,
      this.defaultSettings,
    );
    console.log("[PreferencesService] setSettings", {
      changed: Object.keys(newSettings),
    });
    if (!this.persistSettings(nextSettings)) return Promise.resolve(false);

    this.settings = nextSettings;
    const savedPublication = this.publishSavedSettings(nextSettings);
    this.applySettings();

    // Emit a single event with all the changes
    /** @type {Record<string, unknown>} */
    const changes = {};
    const candidateKeys = new Set([
      ...Object.keys(oldSettings),
      ...Object.keys(nextSettings),
    ]);
    for (const key of candidateKeys) {
      const existed = Object.prototype.hasOwnProperty.call(oldSettings, key);
      const exists = Object.prototype.hasOwnProperty.call(nextSettings, key);
      if (
        existed !== exists ||
        !Object.is(oldSettings[key], nextSettings[key])
      ) {
        // An absent extension setting is represented as undefined in the
        // delta. The complete settings snapshot remains authoritative.
        changes[key] = nextSettings[key];
      }
    }

    if (Object.keys(changes).length > 0) {
      this.emit("preferences:changed", {
        changes: structuredClone(changes),
        settings: this.getSettings(),
      });
    }
    return savedPublication.then(() => true);
  }

  /** @param {PreferencesSettings} settings @returns {boolean} */
  persistSettings(settings) {
    if (!this.storage) return false;
    return Boolean(
      this.storage.saveSettings(structuredClone(settings), { replace: true }),
    );
  }

  /**
   * @param {PreferencesSettings} settings
   * @returns {import('../../types/events/protocol.js').EventEmitResult}
   */
  publishSavedSettings(settings) {
    return Promise.resolve(
      this.emit(
        "preferences:saved",
        { settings: structuredClone(settings) },
        { synchronous: true },
      ),
    );
  }

  // Late-join state sharing
  // Provide current settings so late-joining components can use them without
  // making explicit RPC requests that may race the service startup.
  /** @returns {import('../../types/events/component-state.js').ComponentState<'PreferencesService'>} */
  getCurrentState() {
    return {
      settings: this.getSettings(),
    };
  }

  // Application of settings
  applySettings() {
    this.applyTheme();
    this.applyLanguage();
    this.applyOtherSettings();
  }

  applyTheme() {
    if (typeof document === "undefined") return;
    const theme = this.settings.theme || "default";

    // Use documentElement for data-theme attribute (matches CSS)
    if (theme === "dark") {
      document.documentElement.setAttribute("data-theme", "dark");
    } else {
      document.documentElement.removeAttribute("data-theme");
    }

    this.updateThemeToggleButton(theme);
  }

  async applyLanguage() {
    const lang = this.settings.language || "en";

    if (this.i18n && this.i18n.language !== lang) {
      await this.i18n.changeLanguage(lang);
    }

    // Apply translations to the document
    if (typeof appWindow?.applyTranslations === "function") {
      appWindow.applyTranslations();
    }

    this.updateLanguageFlag(lang);
  }

  applyOtherSettings() {
    // Compact view flag toggles a body class
    if (typeof document !== "undefined") {
      if (this.settings.compactView) {
        document.body.classList.add("compact-view");
      } else {
        document.body.classList.remove("compact-view");
      }
    }

    // Propagate to global app instance if present
    if (appWindow?.app) {
      const app = appWindow.app;
      if ("autoSave" in app) app.autoSave = this.settings.autoSave;
      if ("maxUndoSteps" in app) app.maxUndoSteps = this.settings.maxUndoSteps;
    }
  }

  // Theme Management
  /** @returns {Promise<boolean>} */
  toggleTheme() {
    const currentTheme = this.settings.theme || "default";
    const newTheme = currentTheme === "dark" ? "default" : "dark";

    return this.setSetting("theme", newTheme);
  }

  /** @param {string} theme */
  updateThemeToggleButton(theme) {
    if (typeof document === "undefined") return;

    const themeToggleBtn = document.getElementById("themeToggleBtn");
    const themeToggleText = document.getElementById("themeToggleText");
    const themeIcon = themeToggleBtn?.querySelector("i");

    if (themeToggleBtn && themeToggleText && themeIcon) {
      if (theme === "dark") {
        themeIcon.className = "fas fa-sun";
        themeToggleText.setAttribute("data-i18n", "light_mode");
        themeToggleText.textContent =
          this.i18n?.t("light_mode") ?? "light_mode";
      } else {
        themeIcon.className = "fas fa-moon";
        themeToggleText.setAttribute("data-i18n", "dark_mode");
        themeToggleText.textContent = this.i18n?.t("dark_mode") ?? "dark_mode";
      }
    }
  }

  // Language Management
  /** @param {string} lang */
  async changeLanguage(lang) {
    // Update settings
    const persisted = await this.setSetting("language", lang);
    if (!persisted) return false;

    // Re-localize command data with new language
    if (appWindow?.localizeCommandData) {
      appWindow.localizeCommandData();
    }

    // Emit event for other components to re-render with new language
    this.emit("language:changed", { language: lang });
    return true;
  }

  /** @param {string} lang */
  updateLanguageFlag(lang) {
    if (typeof document === "undefined") return;

    const flag = document.getElementById("languageFlag");
    /** @type {Record<string, string>} */
    const flagClasses = {
      en: "fi fi-gb",
      de: "fi fi-de",
      es: "fi fi-es",
      fr: "fi fi-fr",
    };

    if (flag) {
      flag.className = flagClasses[lang] || "fi fi-gb";
    }
  }

  onDestroy() {
    for (const detach of this._responseDetachFunctions) detach();
    this._responseDetachFunctions = [];
  }
}
