import ComponentBase from "../ComponentBase.js";
import {
  extensionPreferenceKey,
  isKnownPreferenceKey,
} from "./preferenceKeys.js";

/** @typedef {import('../../types/events/base.js').KnownPreferenceKey} KnownPreferenceKey */
/** @typedef {import('../../types/events/base.js').KnownPreferencesSettings} KnownPreferencesSettings */
/** @typedef {import('../../types/events/base.js').PreferenceMutation} PreferenceMutation */
/** @typedef {import('../../types/events/base.js').PreferencesSettings} PreferencesSettings */
/** @typedef {import('../../types/events/base.js').SettingsRecord} SettingsRecord */

/** @type {Record<KnownPreferenceKey, (value: unknown) => boolean>} */
const knownSettingValidators = {
  theme: (value) => typeof value === "string",
  autoSave: (value) => typeof value === "boolean",
  showTooltips: (value) => typeof value === "boolean",
  confirmDeletes: (value) => typeof value === "boolean",
  maxUndoSteps: (value) => typeof value === "number",
  defaultMode: (value) => typeof value === "string",
  compactView: (value) => typeof value === "boolean",
  language: (value) => typeof value === "string",
  syncFolderName: (value) => value === null || typeof value === "string",
  syncFolderPath: (value) => value === null || typeof value === "string",
  autoSync: (value) => typeof value === "boolean",
  autoSyncInterval: (value) => typeof value === "string",
  bindToAliasMode: (value) => typeof value === "boolean",
  bindsetsEnabled: (value) => typeof value === "boolean",
  translateGeneratedMessages: (value) => typeof value === "boolean",
};

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** @param {string} key @returns {key is KnownPreferenceKey} */
function isKnownSettingKey(key) {
  return isKnownPreferenceKey(key);
}

/** @param {KnownPreferenceKey} key @param {unknown} value */
function hasValidKnownSettingValue(key, value) {
  return knownSettingValidators[key](value);
}

/** @param {unknown} value @returns {value is PreferenceMutation} */
function isPreferenceMutation(value) {
  if (!isRecord(value) || typeof value.key !== "string") return false;
  if (isKnownSettingKey(value.key)) {
    return (
      value.extension !== true &&
      hasValidKnownSettingValue(value.key, value.value)
    );
  }
  return value.extension === true;
}

/** @param {unknown} value @returns {value is SettingsRecord} */
function isSettingsRecord(value) {
  if (!isRecord(value)) return false;
  return Object.entries(value).every(
    ([key, settingValue]) =>
      !isKnownSettingKey(key) || hasValidKnownSettingValue(key, settingValue),
  );
}

/**
 * Keep extension settings while replacing invalid or missing known values with
 * their defaults. Stored data is external input, so it is filtered rather than
 * trusted as a complete PreferencesSettings object.
 * @param {unknown} value
 * @param {KnownPreferencesSettings} defaults
 * @returns {PreferencesSettings}
 */
function sanitizeStoredSettings(value, defaults) {
  /** @type {Record<string, unknown>} */
  const settings = { ...defaults };
  if (!isRecord(value)) return /** @type {PreferencesSettings} */ (settings);

  for (const [key, settingValue] of Object.entries(value)) {
    if (
      !isKnownSettingKey(key) ||
      hasValidKnownSettingValue(key, settingValue)
    ) {
      Object.defineProperty(settings, key, {
        value: settingValue,
        configurable: true,
        enumerable: true,
        writable: true,
      });
    }
  }
  return /** @type {PreferencesSettings} */ (settings);
}

/** @param {unknown} value */
function invalidMutationError(value) {
  const key = isRecord(value) && typeof value.key === "string" ? value.key : "";
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

    // Register Request/Response endpoints for UI components
    if (this.eventBus) {
      this.respond("preferences:init", () => {
        this.loadSettings();
        this.applySettings();
        return undefined;
      });
      this.respond("preferences:load-settings", () => {
        this.loadSettings();
        return undefined;
      });
      this.respond("preferences:save-settings", () => this.saveSettings());
      this.respond("preferences:set-setting", (mutation) => {
        if (!isPreferenceMutation(mutation)) {
          throw invalidMutationError(mutation);
        }
        if (mutation.extension === true) {
          this.setExtensionSetting(mutation.key, mutation.value);
          return undefined;
        }
        this.setSetting(mutation.key, mutation.value);
        return undefined;
      });
      this.respond("preferences:set-settings", (newSettings) => {
        this.setSettings(newSettings);
        return undefined;
      });

      // Set up event listeners for theme and language changes
      this.setupEventListeners();
    }
  }

  // Event Listeners
  setupEventListeners() {
    if (!this.eventBus) return;

    // Listen for theme toggle events from HeaderMenuUI
    this.eventBus.on("theme:toggle", () => {
      this.toggleTheme();
    });

    // Listen for language change events from HeaderMenuUI
    this.eventBus.on("language:change", ({ language }) => {
      if (language) {
        this.changeLanguage(language);
      }
    });
  }

  onInit() {
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
    const ok = this.storage.saveSettings(this.settings, { replace: true });
    console.log("[PreferencesService] saveSettings", {
      ok,
      settings: { ...this.settings },
    });
    if (ok)
      await this.emit(
        "preferences:saved",
        { settings: this.getSettings() },
        { synchronous: true },
      );
    return ok;
  }

  // Accessors
  getSettings() {
    return { ...this.settings };
  }

  /** @param {string} key */
  getSetting(key) {
    return this.settings[key];
  }

  /**
   * @template {KnownPreferenceKey} Key
   * @param {Key} key
   * @param {KnownPreferencesSettings[Key]} value
   */
  setSetting(key, value) {
    if (!isKnownSettingKey(key) || !hasValidKnownSettingValue(key, value)) {
      throw invalidMutationError({ key, value });
    }
    this.commitSetting(key, value);
  }

  /**
   * Explicit mutation path for application-defined extension preferences.
   * @param {string} key
   * @param {unknown} value
   */
  setExtensionSetting(key, value) {
    const extensionKey = extensionPreferenceKey(key);
    this.commitSetting(extensionKey, value);
  }

  /** @param {string} key @param {unknown} value */
  commitSetting(key, value) {
    Object.defineProperty(this.settings, key, {
      value,
      configurable: true,
      enumerable: true,
      writable: true,
    });
    console.log("[PreferencesService] setSetting", { key, value });
    this.saveSettings();
    this.applySettings();
    this.emit("preferences:changed", {
      key,
      value,
      settings: this.getSettings(),
    });
  }

  /** @param {SettingsRecord} [newSettings] */
  setSettings(newSettings = {}) {
    if (!isSettingsRecord(newSettings)) {
      throw new TypeError("Invalid preferences settings payload");
    }
    const oldSettings = this.getSettings();
    const nextSettings = sanitizeStoredSettings(
      newSettings,
      this.defaultSettings,
    );
    this.settings = nextSettings;
    console.log("[PreferencesService] setSettings", {
      changed: Object.keys(newSettings),
    });
    this.saveSettings();
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
        changes,
        settings: this.getSettings(),
      });
    }
  }

  // Late-join state sharing
  // Provide current settings so late-joining components can use them without
  // making explicit RPC requests that may race the service startup.
  /** @returns {import('../../types/events/component-state.js').ComponentState<'PreferencesService'>} */
  getCurrentState() {
    return {
      settings: { ...this.settings },
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
  toggleTheme() {
    const currentTheme = this.settings.theme || "default";
    const newTheme = currentTheme === "dark" ? "default" : "dark";

    this.setSetting("theme", newTheme);
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
    this.setSetting("language", lang);

    // Re-localize command data with new language
    if (appWindow?.localizeCommandData) {
      appWindow.localizeCommandData();
    }

    // Emit event for other components to re-render with new language
    this.emit("language:changed", { language: lang });
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
}
