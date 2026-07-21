import "./core/constants.js";
import eventBus from "./core/eventBus.js";
import "./data.js";
import i18next from "i18next";
import en from "../i18n/en.json";
import de from "../i18n/de.json";
import fr from "../i18n/fr.json";
import es from "../i18n/es.json";
import {
  StorageService,
  DataCoordinator,
  ToastService,
} from "./components/services/index.js";
import DataService from "./components/services/DataService.js";
// ExportService is now created and managed by app.js
import { UIUtilityService } from "./components/services/index.js";
import FileExplorerUI from "./components/ui/FileExplorerUI.js";
import { SyncService } from "./components/services/index.js";
import STOToolsKeybindManager from "./app.js";
// Version display functionality - moved inline to reduce file count
import { DISPLAY_VERSION } from "./core/constants.js";
import { CommandChainValidatorService } from "./components/services/index.js";
import devMonitor from "./dev/DevMonitor.js";

// Retain the retirement-bound DataService late-join snapshot owner.
// Runtime static-data consumers import their catalogs directly, and consumers
// discover this compatibility state through component registration.
const dataService = new DataService({
  eventBus,
  data: typeof window !== "undefined" ? window.STO_DATA : null,
});

(async () => {
  await i18next.init({
    lng: "en", // Default to English, will be updated after StorageService is created
    fallbackLng: "en",
    resources: {
      en: { translation: en },
      de: { translation: de },
      fr: { translation: fr },
      es: { translation: es },
    },
  });

  // Make i18next available globally for data.js and other modules that need it
  window.i18next = i18next;

  // Create new StorageService component with i18n support
  const storageService = new StorageService({ eventBus, i18n: i18next });
  storageService.init();

  // Initialize the compatibility late-join owner.
  dataService.init();

  // Create DataCoordinator - the single source of truth for data operations
  const dataCoordinator = new DataCoordinator({
    eventBus,
    storage: storageService,
    i18n: i18next,
  });
  dataCoordinator.init();
  try {
    await dataCoordinator.initialStateReady;
  } catch (error) {
    console.error("DataCoordinator initialization failed:", error);
    for (const component of [dataCoordinator, dataService, storageService]) {
      if (typeof component.destroy === "function") component.destroy();
    }
    return;
  }

  // Get settings from the new StorageService and update language if needed
  const settings = storageService.getSettings();
  if (settings.language && settings.language !== "en") {
    await i18next.changeLanguage(settings.language);
  }

  // Initialize DevMonitor after i18next is available
  if (devMonitor.isDevelopment) {
    console.log(
      "🔧 DevMonitor: Development mode detected, monitoring tools available",
    );
  }

  if (window.localizeCommandData) {
    window.localizeCommandData();
  }

  /** @param {Document | Element | null} [root] */
  function applyTranslations(root = document) {
    const translationRoot = root || document;
    translationRoot.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.getAttribute("data-i18n");
      const attr = el.getAttribute("data-i18n-attr");
      if (!key) return;
      const text = i18next.t(key);
      if (attr) {
        el.setAttribute(attr, text);
      } else {
        el.textContent = text;
      }
    });

    translationRoot
      .querySelectorAll("[data-i18n-placeholder]")
      .forEach((el) => {
        const key = el.getAttribute("data-i18n-placeholder");
        if (key) {
          el.setAttribute("placeholder", i18next.t(key));
        }
      });

    translationRoot.querySelectorAll("[data-i18n-title]").forEach((el) => {
      const key = el.getAttribute("data-i18n-title");
      if (key) {
        el.setAttribute("title", i18next.t(key));
      }
    });

    translationRoot.querySelectorAll("[data-i18n-alt]").forEach((el) => {
      const key = el.getAttribute("data-i18n-alt");
      if (key) {
        el.setAttribute("alt", i18next.t(key));
      }
    });
  }

  window.applyTranslations = applyTranslations;

  // Apply translations and set up version display
  function initializeUI() {
    applyTranslations();

    // Update version in header (about modal version is now handled by AboutModalUI)
    const appVersionElement = document.getElementById("appVersion");
    if (appVersionElement) {
      appVersionElement.textContent = DISPLAY_VERSION;
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeUI);
  } else {
    initializeUI();
  }

  // Create dependencies first. ExportService and KeyService are app-owned.
  // Create UI utility service
  const uiUtilityService = new UIUtilityService(eventBus);
  uiUtilityService.init();

  // Helper to bridge legacy UI components with the new utility service
  /**
   * @param {Element} container
   * @param {any} [options]
   * @returns {void | (() => void)}
   */
  const initDragAndDropBridge = (container, options = {}) => {
    if (
      container instanceof HTMLElement &&
      uiUtilityService &&
      typeof uiUtilityService.initDragAndDrop === "function"
    ) {
      return uiUtilityService.initDragAndDrop(container, options);
    } else {
      // Fallback via eventBus so a remote service instance can handle it (test env)
      eventBus.emit("ui:init-drag-drop", { container, options });
    }
  };

  // Create toast service to handle notifications
  const toastService = new ToastService({ eventBus });
  toastService.init();

  // Create UI compatibility facade for legacy components
  const stoUI = {
    showToast: (
      /** @type {string} */ message,
      /** @type {string} */ type = "info",
    ) => eventBus.emit("toast:show", { message, type }),
    showModal: (/** @type {string} */ modalId) =>
      eventBus.emit("modal:show", { modalId }),
    hideModal: (/** @type {string} */ modalId) =>
      eventBus.emit("modal:hide", { modalId }),
    copyToClipboard: (/** @type {string} */ text) =>
      eventBus.emit("ui:copy-to-clipboard", { text }),
    // New: expose drag-and-drop helper for components
    initDragAndDrop: initDragAndDropBridge,
  };

  // Initialize command chain validator service (after stoUI is defined)
  const chainValidatorService = new CommandChainValidatorService({
    eventBus,
    i18n: i18next,
    ui: stoUI,
  });
  chainValidatorService.init();

  const stoFileExplorer = new FileExplorerUI({
    eventBus,
    storage: storageService,
    ui: stoUI,
    i18n: i18next,
  });
  // Init immediately so header Explorer button works without waiting for sto-app-ready
  stoFileExplorer.init();
  const stoSync = new SyncService({
    eventBus,
    ui: stoUI,
    i18n: i18next,
  });
  stoSync.init();

  // Minimal global assignments - only what's absolutely necessary for legacy compatibility
  Object.assign(window, {
    storageService, // Required by some legacy components and tests
    dataCoordinator, // Required by other services
    // stoExport removed - now managed by app.js
    stoUI, // Required by many components for toast notifications
    stoSync, // Required by sync UI components
    eventBus, // Required for component communication debugging
  });

  // Initialize app after dependencies are available
  const app = new STOToolsKeybindManager({
    i18n: i18next,
    storageService,
    ui: stoUI,
    syncService: stoSync,
  });

  // App instance is not exposed globally; components communicate via eventBus.
  try {
    await app.init();
  } catch (error) {
    console.error("Application initialization failed:", error);
  }
})();
