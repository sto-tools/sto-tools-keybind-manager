import ComponentBase from "../ComponentBase.js";

/**
 * Settings remain string-addressable because preference keys cross the event
 * bus, but the known application settings retain their concrete types.
 *
 * @typedef {Record<string, any> & {
 *   theme: string,
 *   autoSave: boolean,
 *   showTooltips: boolean,
 *   confirmDeletes: boolean,
 *   maxUndoSteps: number,
 *   defaultMode: string,
 *   compactView: boolean,
 *   language: string,
 *   syncFolderName: string | null,
 *   syncFolderPath: string | null,
 *   autoSync: boolean,
 *   autoSyncInterval: string,
 *   bindToAliasMode: boolean,
 *   bindsetsEnabled: boolean,
 *   translateGeneratedMessages: boolean,
 * }} PreferencesSettings
 */

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
      });
      this.respond("preferences:load-settings", () => this.loadSettings());
      this.respond("preferences:save-settings", () => this.saveSettings());
      this.respond("preferences:get-settings", () => this.getSettings());
      this.respond("preferences:set-setting", ({ key, value }) =>
        this.setSetting(key, value),
      );
      this.respond("preferences:set-settings", (newSettings) =>
        this.setSettings(newSettings),
      );
      this.respond("preferences:get-setting", ({ key }) =>
        this.getSetting(key),
      );

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
      if (!this.storage) return;
      const stored = this.storage.getSettings();
      this.settings = { ...this.defaultSettings, ...stored };
      console.log("[PreferencesService] loadSettings", {
        settings: { ...this.settings },
      });
      this.emit("preferences:loaded", { settings: this.getSettings() });
    } catch (err) {
      console.error("[PreferencesService] loadSettings failed", err);
      this.settings = { ...this.defaultSettings };
    }
  }

  async saveSettings() {
    if (!this.storage) return false;
    const ok = this.storage.saveSettings(this.settings);
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

  /** @param {string} key @param {any} value */
  setSetting(key, value) {
    this.settings[key] = value;
    console.log("[PreferencesService] setSetting", { key, value });
    this.saveSettings();
    this.applySettings();
    this.emit("preferences:changed", { key, value });
  }

  /** @param {Partial<PreferencesSettings>} [newSettings] */
  setSettings(newSettings = {}) {
    const oldSettings = { ...this.settings };
    this.settings = { ...this.defaultSettings, ...newSettings };
    console.log("[PreferencesService] setSettings", {
      changed: Object.keys(newSettings),
    });
    this.saveSettings();
    this.applySettings();

    // Emit a single event with all the changes
    /** @type {Record<string, any>} */
    const changes = {};
    for (const [key, value] of Object.entries(newSettings)) {
      if (oldSettings[key] !== value) {
        changes[key] = value;
      }
    }

    if (Object.keys(changes).length > 0) {
      this.emit("preferences:changed", { changes });
    }
  }

  // Late-join state sharing
  // Provide current settings so late-joining components can use them without
  // making explicit RPC requests that may race the service startup.
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
