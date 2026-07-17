import UIComponentBase from "../UIComponentBase.js";
import { eventElement, resolveDocument, resolveI18n } from "./uiTypes.js";

const runtime = /** @type {import('./uiTypes.js').RuntimeGlobals} */ (
  globalThis
);

/**
 * HeaderMenuUI - Handles header dropdown menu interactions
 * Manages import, backup, language, and settings menu toggles and interactions
 */
export default class HeaderMenuUI extends UIComponentBase {
  /**
   * @param {{
   *   eventBus?: import('./uiTypes.js').EventBus,
   *   confirmDialog?: import('./uiTypes.js').ConfirmDialogLike | null,
   *   document?: Document,
   *   i18n?: import('./uiTypes.js').I18nLike
   * }} [options]
   */
  constructor({
    eventBus,
    confirmDialog = null,
    document = typeof window !== "undefined" ? window.document : undefined,
    i18n,
  } = {}) {
    super(eventBus);
    this.componentName = "HeaderMenuUI";
    this.document = resolveDocument(document);
    this.confirmDialog = confirmDialog || runtime.confirmDialog || null;
    this.i18n = resolveI18n(i18n);
  }

  onInit() {
    this.setupEventListeners();
  }

  setupEventListeners() {
    if (this.eventListenersSetup) {
      return;
    }
    this.eventListenersSetup = true;

    // Header menu toggles - using automatic cleanup pattern
    this.onDom("settingsBtn", "click", () => {
      this.toggleSettingsMenu();
    });

    this.onDom("importMenuBtn", "click", () => {
      this.toggleImportMenu();
    });

    this.onDom("backupMenuBtn", "click", () => {
      this.toggleBackupMenu();
    });

    this.onDom("languageMenuBtn", "click", () => {
      this.toggleLanguageMenu();
    });

    // VFX Button (could be moved to VFXManagerUI if preferred)
    this.onDom("vertigoBtn", "click", () => {
      this.emit("vfx:show-modal");
    });

    // File Explorer Button
    this.onDom("fileExplorerBtn", "click", () => {
      this.emit("file-explorer:open");
    });

    // Sync Now Button
    this.onDom("syncNowBtn", "click", () => {
      this.emit("sync:sync-now");
    });

    // Settings menu items
    this.onDom("preferencesBtn", "click", () => {
      this.emit("preferences:show");
    });

    this.onDom("aboutBtn", "click", () => {
      this.emit("about:show");
    });

    // Close all menus when clicking outside
    this.onDom(this.document, "click", (e) => {
      if (!eventElement(e)?.closest(".dropdown")) {
        this.document
          .querySelectorAll(".dropdown.active")
          .forEach((dropdown) => {
            dropdown.classList.remove("active");
          });
      }
    });

    // File operations
    this.onDom("openProjectBtn", "click", () => {
      this.emit("project:open");
    });

    this.onDom("saveProjectBtn", "click", () => {
      this.emit("project:save");
    });

    // Menu-specific operations
    this.onDom("importKeybindsBtn", "click", () => {
      this.emit("keybinds:import");
    });

    this.onDom("importAliasesBtn", "click", () => {
      this.emit("aliases:import");
    });

    this.onDom("importKbfBtn", "click", () => {
      this.emit("keybinds:kbf-import");
    });

    this.onDom("loadDefaultDataBtn", "click", () => {
      this.emit("data:load-default");
    });

    this.onDom("resetAppBtn", "click", () => {
      this.confirmResetApp();
    });

    // Language selection - using EventBus with built-in protection
    this.onDom("[data-lang]", "click", (e) => {
      const langButton = eventElement(e)?.closest("[data-lang]");
      const lang = langButton ? langButton.getAttribute("data-lang") : null;
      if (lang) {
        this.emit("language:change", { language: lang });
      }
    });

    // Listen for language changed events to show toast feedback
    this.addEventListener("language:changed", () => {
      this.showToast(this.i18n.t("language_updated"), "success");
    });

    // Theme toggle
    this.onDom("themeToggleBtn", "click", () => {
      this.emit("theme:toggle");
    });
  }

  // Toggle the settings menu dropdown
  toggleSettingsMenu() {
    this.toggleDropdown("settingsBtn");
  }

  // Toggle the import menu dropdown
  toggleImportMenu() {
    this.toggleDropdown("importMenuBtn");
  }

  // Toggle the backup menu dropdown
  toggleBackupMenu() {
    this.toggleDropdown("backupMenuBtn");
  }

  // Toggle the language menu dropdown
  toggleLanguageMenu() {
    this.toggleDropdown("languageMenuBtn");
  }

  // Generic dropdown toggle helper
  /** @param {string} buttonId */
  toggleDropdown(buttonId) {
    const button = this.document.getElementById(buttonId);
    if (!button) return;

    const dropdown = button.closest(".dropdown");
    if (!dropdown) return;

    // Close other dropdowns
    this.document.querySelectorAll(".dropdown.active").forEach((other) => {
      if (other !== dropdown) {
        other.classList.remove("active");
      }
    });

    // Toggle this dropdown
    dropdown.classList.toggle("active");
  }

  // Confirm app reset with user
  async confirmResetApp() {
    if (!this.confirmDialog) return;

    const message = this.i18n.t("confirm_reset_application");
    const title = this.i18n.t("confirm_reset_app");

    if (
      await this.confirmDialog.confirm(
        message,
        title,
        "danger",
        "resetApplication",
      )
    ) {
      this.emit("app:reset-confirmed");
    }
  }

  onDestroy() {
    // DOM and application listeners are cleaned up by ComponentBase. Reset the
    // installation guard so the same instance can own them again after reinit.
    this.eventListenersSetup = false;
  }
}
